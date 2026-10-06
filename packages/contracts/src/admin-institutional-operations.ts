import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

const coverageSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const countSchema = z.number().int().nonnegative()
const bigCountSchema = z.string().regex(/^\d+$/)

export const institutionalFilingStateSchema = z.enum(['PENDING', 'DOWNLOADED', 'PARSED', 'PARTIAL', 'READY', 'ERROR', 'SUPERSEDED'])
export const institutionalDiscoveryStateSchema = z.enum(['PENDING', 'RUNNING', 'READY', 'STALE', 'ERROR'])

export const institutionalSchedulerStateSchema = z.object({
  nextAllowedAt: utcInstantSchema.nullable(),
  lastRequestAt: utcInstantSchema.nullable(),
  requestCount: bigCountSchema,
  failureCount: bigCountSchema,
}).strict()

export const institutionalQueueDepthsSchema = z.object({
  filingsPending: countSchema,
  filingsPartial: countSchema,
  filingsError: countSchema,
  snapshotRebuildsPending: countSchema,
  analyticsEventsPending: countSchema,
  analyticsEventsFailed: countSchema,
  consensusRebuildsPending: countSchema,
  mappingRefreshJobsPending: countSchema,
  unresolvedMappings: countSchema,
  ambiguousMappings: countSchema,
  partialQuarters: countSchema,
  errorQuarters: countSchema,
  analysisQueued: countSchema,
  analysisRunning: countSchema,
  analysisFailed: countSchema,
  analysisInvalidated: countSchema,
}).strict()

export const institutionalProcessingVersionsSchema = z.object({
  parser: z.string().min(1),
  resolver: z.string().min(1),
  securityMapping: z.string().min(1),
  analytics: z.string().min(1),
  consensus: z.string().min(1),
  analysisContext: z.string().min(1),
  analysisSchema: z.string().min(1),
}).strict()

export const adminInstitutionalManagerRowSchema = z.object({
  guruId: serializedIdSchema.nullable(),
  managerId: serializedIdSchema,
  slug: z.string().nullable(),
  name: z.string().nullable(),
  managerName: z.string().nullable(),
  cik: z.string().regex(/^\d{10}$/),
  active: z.boolean(),
  discovery: z.object({
    status: institutionalDiscoveryStateSchema.nullable(),
    lastCheckAt: utcInstantSchema.nullable(),
    lastSuccessAt: utcInstantSchema.nullable(),
    nextCheckAt: utcInstantSchema.nullable(),
    lastErrorCode: z.string().nullable(),
    leaseHeld: z.boolean(),
  }).strict(),
  filings: z.object({
    total: countSchema, pending: countSchema, downloaded: countSchema, parsed: countSchema,
    partial: countSchema, ready: countSchema, error: countSchema, superseded: countSchema,
  }).strict(),
  latestFiling: z.object({
    id: serializedIdSchema, accession: z.string(), form: z.string(), periodEnd: calendarDateSchema.nullable(),
    filedAt: utcInstantSchema.nullable(), status: institutionalFilingStateSchema, errorCode: z.string().nullable(),
  }).strict().nullable(),
  quarters: z.object({ ready: countSchema, partial: countSchema, error: countSchema }).strict(),
  mappingCoveragePercent: coverageSchema.nullable(),
  analysis: z.object({ queued: countSchema, running: countSchema, succeeded: countSchema, failed: countSchema, invalidated: countSchema }).strict(),
}).strict()

export const adminInstitutionalOverviewResponseSchema = z.object({
  data: z.object({
    scheduler: institutionalSchedulerStateSchema,
    queues: institutionalQueueDepthsSchema,
    versions: institutionalProcessingVersionsSchema,
    managers: z.array(adminInstitutionalManagerRowSchema),
  }).strict(),
}).strict()

export const adminInstitutionalFilingListQuerySchema = z.object({
  guruId: serializedIdSchema.optional(),
  status: institutionalFilingStateSchema.optional(),
  periodEnd: calendarDateSchema.optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
}).strict()

export const adminInstitutionalFilingRowSchema = z.object({
  id: serializedIdSchema,
  managerId: serializedIdSchema,
  guruId: serializedIdSchema.nullable(),
  guruSlug: z.string().nullable(),
  guruName: z.string().nullable(),
  cik: z.string().regex(/^\d{10}$/),
  accession: z.string(),
  form: z.string(),
  filingDate: calendarDateSchema,
  filedAt: utcInstantSchema.nullable(),
  periodEnd: calendarDateSchema.nullable(),
  status: institutionalFilingStateSchema,
  isAmendment: z.boolean(),
  amendmentNumber: z.number().int().nullable(),
  amendmentType: z.string().nullable(),
  parserVersion: z.string().nullable(),
  parsedRowCount: countSchema.nullable(),
  rejectedRowCount: countSchema,
  mappingCoverage: coverageSchema.nullable(),
  errorCode: z.string().nullable(),
  sourceUrl: z.string().url(),
  discoveredAt: utcInstantSchema,
  ingestedAt: utcInstantSchema.nullable(),
  updatedAt: utcInstantSchema,
}).strict()

export const adminInstitutionalFilingListResponseSchema = z.object({
  data: z.array(adminInstitutionalFilingRowSchema),
  pagination: z.object({ limit: z.number().int().positive(), offset: countSchema, total: countSchema }).strict(),
}).strict()

export const adminInstitutionalFilingDetailResponseSchema = z.object({
  data: z.object({
    filing: adminInstitutionalFilingRowSchema,
    documents: z.array(z.object({
      id: serializedIdSchema,
      basename: z.string(),
      documentType: z.string().nullable(),
      description: z.string().nullable(),
      isPrimary: z.boolean(),
      sourceUrl: z.string().url(),
      contentLength: bigCountSchema.nullable(),
      downloadedAt: utcInstantSchema.nullable(),
      artifacts: z.array(z.object({
        id: serializedIdSchema,
        artifactRef: z.string(),
        contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
        contentLength: bigCountSchema,
        fetchedAt: utcInstantSchema,
        fetchedReason: z.string(),
        retainUntil: utcInstantSchema.nullable(),
        rawContentRetained: z.boolean(),
        supersedesArtifactId: serializedIdSchema.nullable(),
      }).strict()),
    }).strict()),
    parsedRows: z.object({
      total: countSchema,
      sample: z.array(z.object({
        id: serializedIdSchema,
        rowNumber: z.number().int().positive(),
        issuer: z.string(),
        titleOfClass: z.string(),
        cusip: z.string().nullable(),
        figi: z.string().nullable(),
        quantity: coverageSchema,
        quantityType: z.enum(['SH', 'PRN']),
        putCall: z.enum(['PUT', 'CALL']).nullable(),
        reportedValue: coverageSchema,
        reportedValueUnit: z.string(),
        valueUnitSource: z.string(),
        warnings: z.array(z.string()),
        parserVersion: z.string(),
        mappingStatus: z.enum(['MATCHED', 'AMBIGUOUS', 'UNRESOLVED', 'MANUAL_OVERRIDE']).nullable(),
        securityId: serializedIdSchema.nullable(),
      }).strict()),
    }).strict(),
    effective: z.object({
      snapshot: z.object({
        id: serializedIdSchema,
        periodEnd: calendarDateSchema,
        snapshotHash: z.string(),
        replayKey: z.string(),
        sourceManifestHash: z.string(),
        resolverVersion: z.string(),
        holdingCount: countSchema,
        createdAt: utcInstantSchema,
      }).strict().nullable(),
      publication: z.object({ status: z.string(), active: z.boolean(), updatedAt: utcInstantSchema }).strict().nullable(),
      periodState: z.object({ status: z.string(), reason: z.string().nullable(), checkedAt: utcInstantSchema }).strict().nullable(),
      sources: z.array(z.object({
        ordinal: z.number().int().nonnegative(),
        filingId: serializedIdSchema,
        accession: z.string(),
        operation: z.string(),
        amendmentNumber: z.number().int().nullable(),
        parserVersion: z.string(),
      }).strict()),
    }).strict(),
    amendments: z.array(z.object({
      id: serializedIdSchema,
      accession: z.string(),
      form: z.string(),
      isAmendment: z.boolean(),
      amendmentNumber: z.number().int().nullable(),
      amendmentType: z.string().nullable(),
      filedAt: utcInstantSchema.nullable(),
      status: institutionalFilingStateSchema,
      operation: z.string().nullable(),
      sourceUrl: z.string().url(),
    }).strict()),
    analytics: z.object({
      status: z.string(),
      analyticsVersion: z.string(),
      mappingCoveragePercent: coverageSchema,
      holdingCount: countSchema,
      comparisonStatus: z.string(),
      calculatedAt: utcInstantSchema,
    }).strict().nullable(),
  }).strict(),
}).strict()

export const adminInstitutionalRebuildRequestSchema = z.object({ periodEnd: calendarDateSchema }).strict()

export const adminInstitutionalJobResponseSchema = z.object({
  data: z.object({
    jobType: z.enum(['FILING_DISCOVERY', 'FILING_REPROCESS', 'ANALYTICS_REBUILD']),
    jobId: z.string().min(1),
    status: z.enum(['QUEUED', 'ALREADY_QUEUED', 'RUNNING']),
    managerId: serializedIdSchema,
    filingId: serializedIdSchema.nullable(),
    periodEnd: calendarDateSchema.nullable(),
    revision: bigCountSchema.nullable(),
    requestedAt: utcInstantSchema,
    detail: z.string().min(1),
  }).strict(),
}).strict()

export const adminInstitutionalDiagnosticsResponseSchema = z.object({
  generatedAt: utcInstantSchema,
  versions: institutionalProcessingVersionsSchema,
  scheduler: institutionalSchedulerStateSchema,
  queues: institutionalQueueDepthsSchema,
  managers: z.array(z.object({
    cik: z.string().regex(/^\d{10}$/),
    slug: z.string().nullable(),
    active: z.boolean(),
    discoveryStatus: institutionalDiscoveryStateSchema.nullable(),
    lastCheckAt: utcInstantSchema.nullable(),
    lastSuccessAt: utcInstantSchema.nullable(),
    lastErrorCode: z.string().nullable(),
    filings: z.object({ total: countSchema, partial: countSchema, error: countSchema }).strict(),
    quarters: z.object({ ready: countSchema, partial: countSchema, error: countSchema }).strict(),
    analysis: z.object({ queued: countSchema, running: countSchema, failed: countSchema, invalidated: countSchema }).strict(),
  }).strict()),
  redactions: z.array(z.string().min(1)),
}).strict()

export type AdminInstitutionalManagerRow = z.infer<typeof adminInstitutionalManagerRowSchema>
export type AdminInstitutionalFilingRow = z.infer<typeof adminInstitutionalFilingRowSchema>
export type AdminInstitutionalFilingListQuery = z.infer<typeof adminInstitutionalFilingListQuerySchema>
