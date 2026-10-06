import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

const sourceUrlSchema = z.url({ protocol: /^https$/ }).max(2048)
const decimalSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/, 'Enter a non-negative decimal')
const positiveDecimalSchema = decimalSchema.refine(value => Number(value) > 0, 'Value must be positive')

export const institutionalSecurityIdentifierTypeSchema = z.enum(['CUSIP', 'FIGI', 'TICKER'])
export const institutionalSecurityStatusSchema = z.enum(['ACTIVE', 'DELISTED'])
export const institutionalMappingStatusSchema = z.enum(['MATCHED', 'AMBIGUOUS', 'UNRESOLVED', 'MANUAL_OVERRIDE'])
export const institutionalIdentityEventKindSchema = z.enum([
  'TICKER_CHANGE', 'MERGER', 'SPIN_OFF', 'DELISTING', 'STOCK_SPLIT', 'SHARE_CLASS_CONTINUITY',
])

export const institutionalSecurityIdentifierInputSchema = z.object({
  type: institutionalSecurityIdentifierTypeSchema,
  value: z.string().trim().min(1).max(32),
  validFrom: calendarDateSchema,
  validTo: calendarDateSchema.nullable().default(null),
}).strict().superRefine((identifier, context) => {
  if (identifier.validTo && identifier.validTo < identifier.validFrom) {
    context.addIssue({ code: 'custom', path: ['validTo'], message: 'validTo must be on or after validFrom' })
  }
  if (identifier.value !== identifier.value.toUpperCase()) {
    context.addIssue({ code: 'custom', path: ['value'], message: 'Identifiers must be uppercase' })
  }
  const shape = identifier.type === 'CUSIP' ? /^[A-Z0-9*@#]{9}$/
    : identifier.type === 'FIGI' ? /^[A-Z0-9]{12}$/
      : /^[A-Z0-9][A-Z0-9.-]{0,14}$/
  if (!shape.test(identifier.value)) {
    context.addIssue({ code: 'custom', path: ['value'], message: `Invalid ${identifier.type} format` })
  }
})

export const adminInstitutionalSecurityCreateRequestSchema = z.object({
  issuer: z.string().trim().min(1).max(1000),
  titleOfClass: z.string().trim().min(1).max(160),
  exchange: z.string().trim().min(1).max(32).nullable().default(null),
  securityType: z.string().trim().min(1).max(80),
  sector: z.string().trim().min(1).max(120).nullable().default(null),
  industry: z.string().trim().min(1).max(160).nullable().default(null),
  status: z.literal('ACTIVE').default('ACTIVE'),
  sourceUrl: sourceUrlSchema,
  confirmPrimarySource: z.literal(true),
  identifiers: z.array(institutionalSecurityIdentifierInputSchema).min(1).max(20)
    .refine(rows => rows.some(row => row.type === 'CUSIP' || row.type === 'FIGI'), 'At least one CUSIP or FIGI is required')
    .refine(rows => new Set(rows.map(row => `${row.type}:${row.value}:${row.validFrom}`)).size === rows.length, 'Duplicate identifier validity start'),
}).strict()

export const institutionalSecurityIdentifierSchema = z.object({
  id: serializedIdSchema,
  supersedesIdentifierId: serializedIdSchema.nullable(),
  type: institutionalSecurityIdentifierTypeSchema,
  value: z.string(),
  validFrom: calendarDateSchema,
  validTo: calendarDateSchema.nullable(),
  sourceUrl: sourceUrlSchema,
  sourceVerifiedBy: serializedIdSchema,
  sourceVerifiedAt: utcInstantSchema,
}).strict()

export const institutionalSecuritySchema = z.object({
  id: serializedIdSchema,
  issuer: z.string(),
  titleOfClass: z.string(),
  exchange: z.string().nullable(),
  securityType: z.string(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  status: institutionalSecurityStatusSchema,
  sourceUrl: sourceUrlSchema,
  sourceVerifiedBy: serializedIdSchema,
  sourceVerifiedAt: utcInstantSchema,
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
  identifiers: z.array(institutionalSecurityIdentifierSchema),
}).strict()

export const adminInstitutionalSecurityResponseSchema = z.object({ data: institutionalSecuritySchema }).strict()
export const adminInstitutionalSecurityCreateResponseSchema = z.object({
  data: institutionalSecuritySchema,
  mappingRefreshJob: z.object({
    id: serializedIdSchema,
    securityId: serializedIdSchema,
    status: z.enum(['PENDING', 'RUNNING', 'COMPLETE']),
    lastFilingId: serializedIdSchema.nullable(),
    processedFilingCount: z.number().int().nonnegative(),
    lastBatchProcessed: z.number().int().nonnegative(),
    lastError: z.string().nullable(),
    updatedAt: utcInstantSchema,
    completedAt: utcInstantSchema.nullable(),
  }).strict(),
}).strict()
export const adminInstitutionalSecurityListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
}).strict()
export const adminInstitutionalSecurityListResponseSchema = z.object({
  data: z.array(institutionalSecuritySchema),
  pagination: z.object({ limit: z.number().int().positive(), offset: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict(),
}).strict()

export const adminInstitutionalMappingListQuerySchema = z.object({
  status: institutionalMappingStatusSchema.optional(),
  filingId: serializedIdSchema.optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
}).strict()

export const institutionalMappingOverrideSchema = z.object({
  id: serializedIdSchema,
  version: z.number().int().positive(),
  actorUserId: serializedIdSchema,
  createdAt: utcInstantSchema,
  evidenceUrl: sourceUrlSchema,
  reason: z.string().min(1),
  supersedesOverrideId: serializedIdSchema.nullable(),
}).strict()

export const adminInstitutionalMappingCandidateSchema = z.object({
  id: serializedIdSchema,
  issuer: z.string(),
  titleOfClass: z.string(),
  status: institutionalSecurityStatusSchema,
  identifiers: z.array(institutionalSecurityIdentifierSchema),
}).strict()

export const adminInstitutionalMappingRowSchema = z.object({
  holding: z.object({
    id: serializedIdSchema,
    filingId: serializedIdSchema,
    accession: z.string(),
    periodEnd: calendarDateSchema.nullable(),
    issuer: z.string(),
    titleOfClass: z.string(),
    cusip: z.string().nullable(),
    figi: z.string().nullable(),
    quantity: decimalSchema,
    quantityType: z.enum(['SH', 'PRN']),
    reportedValue: decimalSchema,
    putCall: z.enum(['PUT', 'CALL']).nullable(),
  }).strict(),
  resolution: z.object({
    status: institutionalMappingStatusSchema,
    securityId: serializedIdSchema.nullable(),
    reason: z.string(),
    candidateSecurityIds: z.array(serializedIdSchema),
    algorithmVersion: z.string(),
    resolvedAt: utcInstantSchema,
  }).strict(),
  security: institutionalSecuritySchema.nullable(),
  candidates: z.array(adminInstitutionalMappingCandidateSchema),
  override: institutionalMappingOverrideSchema.nullable(),
  overrideHistory: z.array(institutionalMappingOverrideSchema).describe('Append-only mapping overrides, ordered by version descending (newest first).'),
}).strict()

export const adminInstitutionalMappingListResponseSchema = z.object({
  data: z.array(adminInstitutionalMappingRowSchema),
  pagination: z.object({ limit: z.number().int().positive(), offset: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict(),
  filing: z.object({
    id: serializedIdSchema,
    accession: z.string(),
    periodEnd: calendarDateSchema.nullable(),
    status: z.string(),
    mappingCoverage: z.string().regex(/^\d+(?:\.\d{1,2})?$/).nullable(),
    parsedRowCount: z.number().int().nonnegative().nullable(),
  }).strict().nullable(),
}).strict()

export const adminInstitutionalMappingOverrideRequestSchema = z.object({
  securityId: serializedIdSchema,
  reason: z.string().trim().min(3).max(2000),
  evidenceUrl: sourceUrlSchema,
  confirmPrimarySource: z.literal(true),
}).strict()
export const adminInstitutionalMappingOverrideResponseSchema = z.object({
  data: z.object({
    holdingId: serializedIdSchema,
    status: z.literal('MANUAL_OVERRIDE'),
    security: institutionalSecuritySchema,
    override: institutionalMappingOverrideSchema,
  }).strict(),
}).strict()

export const adminInstitutionalMappingRefreshJobResponseSchema = z.object({
  data: z.object({
    id: serializedIdSchema,
    securityId: serializedIdSchema,
    status: z.enum(['PENDING', 'RUNNING', 'COMPLETE']),
    lastFilingId: serializedIdSchema.nullable(),
    processedFilingCount: z.number().int().nonnegative(),
    lastBatchProcessed: z.number().int().nonnegative(),
    lastError: z.string().nullable(),
    updatedAt: utcInstantSchema,
    completedAt: utcInstantSchema.nullable(),
  }).strict(),
}).strict()

const identityEventBase = {
  effectiveOn: calendarDateSchema,
  reason: z.string().trim().min(3).max(2000),
  evidenceUrl: sourceUrlSchema,
  confirmPrimarySource: z.literal(true),
  supersedesEventId: serializedIdSchema.nullable().optional(),
}

export const adminInstitutionalIdentityEventCreateRequestSchema = z.discriminatedUnion('kind', [
  z.object({ ...identityEventBase, kind: z.literal('TICKER_CHANGE'), newTicker: z.string().regex(/^[A-Z0-9][A-Z0-9.-]{0,14}$/) }).strict(),
  z.object({ ...identityEventBase, kind: z.literal('MERGER'), relatedSecurityId: serializedIdSchema }).strict(),
  z.object({ ...identityEventBase, kind: z.literal('SPIN_OFF'), relatedSecurityId: serializedIdSchema }).strict(),
  z.object({ ...identityEventBase, kind: z.literal('DELISTING') }).strict(),
  z.object({ ...identityEventBase, kind: z.literal('STOCK_SPLIT'), newSharesPerOldShare: positiveDecimalSchema }).strict(),
  z.object({ ...identityEventBase, kind: z.literal('SHARE_CLASS_CONTINUITY'), relatedSecurityId: serializedIdSchema, comparable: z.literal(true), newSharesPerOldShare: positiveDecimalSchema }).strict(),
])

export const adminInstitutionalIdentityEventSchema = z.object({
  id: serializedIdSchema,
  kind: institutionalIdentityEventKindSchema,
  fromSecurityId: serializedIdSchema,
  toSecurityId: serializedIdSchema.nullable(),
  effectiveOn: calendarDateSchema,
  newTicker: z.string().nullable(),
  newSharesPerOldShare: decimalSchema.nullable(),
  comparable: z.boolean(),
  reason: z.string(),
  evidenceUrl: sourceUrlSchema,
  actorUserId: serializedIdSchema,
  verifiedAt: utcInstantSchema,
  createdAt: utcInstantSchema,
  supersedesEventId: serializedIdSchema.nullable(),
}).strict()
export const adminInstitutionalIdentityEventResponseSchema = z.object({ data: adminInstitutionalIdentityEventSchema }).strict()
export const adminInstitutionalIdentityEventListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
}).strict()
export const adminInstitutionalIdentityEventListResponseSchema = z.object({
  data: z.array(adminInstitutionalIdentityEventSchema),
  pagination: z.object({ limit: z.number().int().positive(), offset: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict(),
}).strict()

export type InstitutionalSecurity = z.infer<typeof institutionalSecuritySchema>
export type InstitutionalSecurityInput = z.input<typeof adminInstitutionalSecurityCreateRequestSchema>
export type InstitutionalMappingRow = z.infer<typeof adminInstitutionalMappingRowSchema>
