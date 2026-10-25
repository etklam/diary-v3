/**
 * SEC 13F ingestion: managers, filings, artifacts and raw holdings.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// SEC manager identity is independent of the user-facing editorial profile.
export const institutionalManagers = pgTable(
  'institutional_managers',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    cik: varchar('cik', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('institutional_managers_cik_unique').on(table.cik),
    check('institutional_managers_cik_canonical', sql`${table.cik} ~ '^[0-9]{10}$' and ${table.cik} <> '0000000000'`),
  ],
)
export const institutionalFilingStatus = pgEnum('institutional_filing_status', [
  'PENDING',
  'DOWNLOADED',
  'PARSED',
  'PARTIAL',
  'READY',
  'ERROR',
  'SUPERSEDED',
])
export const institutionalManagerDiscovery = pgTable(
  'institutional_manager_discovery',
  {
    managerId: bigint('manager_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => institutionalManagers.id, { onDelete: 'cascade' }),
    lastCheckAt: timestamp('last_check_at', { withTimezone: true, mode: 'date' }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }),
    nextCheckAt: timestamp('next_check_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    status: varchar('status', { length: 16 }).default('PENDING').notNull(),
    lastErrorCode: varchar('last_error_code', { length: 80 }),
    leaseToken: varchar('lease_token', { length: 128 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
    workerId: varchar('worker_id', { length: 128 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('institutional_manager_discovery_due_idx').on(table.nextCheckAt, table.managerId),
    check(
      'institutional_manager_discovery_status_valid',
      sql`${table.status} in ('PENDING', 'RUNNING', 'READY', 'STALE', 'ERROR')`,
    ),
    check(
      'institutional_manager_discovery_lease_consistent',
      sql`(${table.leaseToken} is null and ${table.leaseExpiresAt} is null and ${table.workerId} is null) or (${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null and ${table.workerId} is not null)`,
    ),
  ],
)
export const institutionalFilings = pgTable(
  'institutional_filings',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    managerId: bigint('manager_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalManagers.id, { onDelete: 'restrict' }),
    accession: varchar('accession', { length: 20 }).notNull(),
    form: varchar('form', { length: 16 }).notNull(),
    filingDate: date('filing_date', { mode: 'string' }).notNull(),
    filedAt: timestamp('filed_at', { withTimezone: true, mode: 'date' }),
    periodEnd: date('period_end', { mode: 'string' }),
    isAmendment: boolean('is_amendment').default(false).notNull(),
    amendmentNumber: integer('amendment_number'),
    amendmentType: varchar('amendment_type', { length: 32 }),
    sourceUrl: varchar('source_url', { length: 2048 }).notNull(),
    rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>().default({}).notNull(),
    status: institutionalFilingStatus('status').default('PENDING').notNull(),
    parserVersion: varchar('parser_version', { length: 32 }),
    discoveredAt: timestamp('discovered_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true, mode: 'date' }),
    parsedRowCount: integer('parsed_row_count'),
    rejectedRowCount: integer('rejected_row_count').default(0).notNull(),
    mappingCoverage: numeric('mapping_coverage', { precision: 5, scale: 2 }),
    errorCode: varchar('error_code', { length: 80 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('institutional_filings_manager_accession_unique').on(table.managerId, table.accession),
    index('institutional_filings_period_idx').on(table.managerId, table.periodEnd, table.filingDate),
    index('institutional_filings_status_idx').on(table.status, table.updatedAt),
    check('institutional_filings_accession_valid', sql`${table.accession} ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'`),
    check('institutional_filings_form_valid', sql`${table.form} in ('13F-HR', '13F-HR/A')`),
    check(
      'institutional_filings_counts_nonnegative',
      sql`${table.rejectedRowCount} >= 0 and (${table.parsedRowCount} is null or ${table.parsedRowCount} >= 0)`,
    ),
    check(
      'institutional_filings_mapping_coverage_valid',
      sql`${table.mappingCoverage} is null or ${table.mappingCoverage} between 0 and 100`,
    ),
  ],
)
export const institutionalFilingDocuments = pgTable(
  'institutional_filing_documents',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    filingId: bigint('filing_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilings.id, { onDelete: 'cascade' }),
    basename: varchar('basename', { length: 255 }).notNull(),
    documentType: varchar('document_type', { length: 80 }),
    description: text('description'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    sourceUrl: varchar('source_url', { length: 2048 }).notNull(),
    contentLength: bigint('content_length', { mode: 'bigint' }),
    downloadedAt: timestamp('downloaded_at', { withTimezone: true, mode: 'date' }),
  },
  table => [
    unique('institutional_filing_documents_filing_basename_unique').on(table.filingId, table.basename),
    check(
      'institutional_filing_documents_length_nonnegative',
      sql`${table.contentLength} is null or ${table.contentLength} >= 0`,
    ),
  ],
)
export const institutionalFilingArtifacts = pgTable(
  'institutional_filing_artifacts',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    documentId: bigint('document_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilingDocuments.id, { onDelete: 'cascade' }),
    artifactRef: varchar('artifact_ref', { length: 600 }).notNull(),
    contentSha256: varchar('content_sha256', { length: 64 }).notNull(),
    rawContent: text('raw_content'),
    contentLength: bigint('content_length', { mode: 'bigint' }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }).notNull(),
    fetchedReason: varchar('fetched_reason', { length: 24 }).default('initial').notNull(),
    retainUntil: timestamp('retain_until', { withTimezone: true, mode: 'date' }),
    supersedesArtifactId: bigint('supersedes_artifact_id', { mode: 'bigint' }).references(
      (): AnyPgColumn => institutionalFilingArtifacts.id,
      { onDelete: 'restrict' },
    ),
  },
  table => [
    unique('institutional_filing_artifacts_document_digest_unique').on(table.documentId, table.contentSha256),
    unique('institutional_filing_artifacts_ref_unique').on(table.artifactRef),
    unique('institutional_filing_artifacts_id_document_unique').on(table.id, table.documentId),
    index('institutional_filing_artifacts_document_time_idx').on(table.documentId, table.fetchedAt.desc()),
    check('institutional_filing_artifacts_digest_valid', sql`${table.contentSha256} ~ '^[a-f0-9]{64}$'`),
    check(
      'institutional_filing_artifacts_refetch_reason_valid',
      sql`${table.fetchedReason} in ('initial', 'reprocess-refetch')`,
    ),
    check(
      'institutional_filing_artifacts_content_retention',
      sql`${table.rawContent} is not null or ${table.retainUntil} is not null`,
    ),
    check('institutional_filing_artifacts_length_nonnegative', sql`${table.contentLength} >= 0`),
  ],
)
export const institutionalFilingArtifactFetches = pgTable(
  'institutional_filing_artifact_fetches',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    documentId: bigint('document_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilingDocuments.id, { onDelete: 'cascade' }),
    sourceArtifactId: bigint('source_artifact_id', { mode: 'bigint' }).notNull(),
    artifactId: bigint('artifact_id', { mode: 'bigint' }).notNull(),
    operationKey: varchar('operation_key', { length: 128 }).notNull(),
    contentSha256: varchar('content_sha256', { length: 64 }).notNull(),
    sourceUrl: varchar('source_url', { length: 2048 }).notNull(),
    contentLength: bigint('content_length', { mode: 'bigint' }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }).notNull(),
    fetchedReason: varchar('fetched_reason', { length: 24 }).default('reprocess-refetch').notNull(),
  },
  table => [
    unique('institutional_filing_artifact_fetches_operation_key_unique').on(table.operationKey),
    index('institutional_filing_artifact_fetches_document_time_idx').on(
      table.documentId,
      table.fetchedAt.desc(),
      table.id.desc(),
    ),
    foreignKey({
      name: 'institutional_filing_artifact_fetches_source_document_fk',
      columns: [table.sourceArtifactId, table.documentId],
      foreignColumns: [institutionalFilingArtifacts.id, institutionalFilingArtifacts.documentId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'institutional_filing_artifact_fetches_result_document_fk',
      columns: [table.artifactId, table.documentId],
      foreignColumns: [institutionalFilingArtifacts.id, institutionalFilingArtifacts.documentId],
    }).onDelete('restrict'),
    check('institutional_filing_artifact_fetches_digest_valid', sql`${table.contentSha256} ~ '^[a-f0-9]{64}$'`),
    check('institutional_filing_artifact_fetches_source_https', sql`${table.sourceUrl} like 'https://%'`),
    check('institutional_filing_artifact_fetches_length_nonnegative', sql`${table.contentLength} >= 0`),
    check('institutional_filing_artifact_fetches_reason_valid', sql`${table.fetchedReason} = 'reprocess-refetch'`),
    check(
      'institutional_filing_artifact_fetches_operation_key_nonempty',
      sql`length(btrim(${table.operationKey})) > 0`,
    ),
  ],
)
export const institutional13fHoldings = pgTable(
  'institutional_13f_holdings',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    filingId: bigint('filing_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilings.id, { onDelete: 'cascade' }),
    documentId: bigint('document_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilingDocuments.id, { onDelete: 'cascade' }),
    artifactId: bigint('artifact_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilingArtifacts.id, { onDelete: 'restrict' }),
    rowNumber: integer('row_number').notNull(),
    issuer: text('issuer').notNull(),
    titleOfClass: varchar('title_of_class', { length: 160 }).notNull(),
    cusip: varchar('cusip', { length: 32 }),
    figi: varchar('figi', { length: 32 }),
    reportedValue: numeric('reported_value', { precision: 32, scale: 8 }).notNull(),
    reportedValueUnit: varchar('reported_value_unit', { length: 32 }).notNull(),
    valueUnitSource: varchar('value_unit_source', { length: 120 }).notNull(),
    quantity: numeric('quantity', { precision: 32, scale: 8 }).notNull(),
    quantityType: varchar('quantity_type', { length: 8 }).notNull(),
    putCall: varchar('put_call', { length: 8 }),
    investmentDiscretion: varchar('investment_discretion', { length: 32 }),
    otherManagers: text('other_managers')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    votingAuthority: jsonb('voting_authority').$type<Record<string, string | null>>().default({}).notNull(),
    sourceUrl: varchar('source_url', { length: 2048 }).notNull(),
    rawRow: text('raw_row').notNull(),
    warnings: text('warnings')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    parserVersion: varchar('parser_version', { length: 32 }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    unique('institutional_13f_holdings_document_row_unique').on(table.documentId, table.rowNumber),
    index('institutional_13f_holdings_filing_idx').on(table.filingId, table.rowNumber),
    index('institutional_13f_holdings_cusip_idx').on(table.cusip),
    check('institutional_13f_holdings_row_positive', sql`${table.rowNumber} > 0`),
    check('institutional_13f_holdings_quantity_type_valid', sql`${table.quantityType} in ('SH', 'PRN')`),
    check(
      'institutional_13f_holdings_put_call_valid',
      sql`${table.putCall} is null or ${table.putCall} in ('PUT', 'CALL')`,
    ),
    check(
      'institutional_13f_holdings_numeric_nonnegative',
      sql`${table.reportedValue} >= 0 and ${table.quantity} >= 0`,
    ),
  ],
)
