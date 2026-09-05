import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

export const TRADE_PLAN_STATUSES = ['draft', 'active', 'closed', 'cancelled'] as const
export const tradePlanStatusSchema = z.enum(TRADE_PLAN_STATUSES)

function canonicalDecimal(value: string): string {
  const [integer, fraction = ''] = value.split('.')
  const normalizedInteger = integer!.replace(/^0+(?=\d)/, '')
  const normalizedFraction = fraction.replace(/0+$/, '')
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger
}

function optionalDecimal(precision: number, scale: number) {
  const integerDigits = precision - scale
  const pattern = new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,${scale}})?$`)
  return z.preprocess(
    value => value === '' ? undefined : value,
    z.union([z.string().trim().regex(/^\d+(?:\.\d+)?$/), z.number().finite().nonnegative()])
      .transform(value => canonicalDecimal(String(value).trim()))
      .pipe(z.string().regex(pattern, `Value must fit numeric(${precision},${scale}) without rounding`))
      .optional().nullable(),
  )
}

const optionalText = (max: number) => z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(max).nullable().optional(),
)

const diaryIdInput = z.preprocess(
  value => value === '' ? null : value,
  serializedIdSchema.nullable().optional(),
)

const tradePlanWriteFields = {
  diaryId: diaryIdInput,
  symbol: z.string().trim().min(1).max(32)
    .regex(/^[A-Za-z0-9.]+$/, 'Symbol contains unsupported characters')
    .transform(value => value.toUpperCase()),
  setupType: optionalText(100),
  entryPrice: optionalDecimal(18, 6),
  entryZoneLow: optionalDecimal(18, 6),
  entryZoneHigh: optionalDecimal(18, 6),
  stopLoss: optionalDecimal(18, 6),
  targetPrice: optionalDecimal(18, 6),
  maxPositionSize: optionalDecimal(18, 2),
  invalidationCondition: optionalText(5_000),
  notes: optionalText(10_000),
  status: tradePlanStatusSchema,
}

function compareUnsignedDecimals(left: string, right: string): number {
  const [leftInteger, leftFraction = ''] = left.split('.')
  const [rightInteger, rightFraction = ''] = right.split('.')
  if (leftInteger!.length !== rightInteger!.length) return leftInteger!.length - rightInteger!.length
  if (leftInteger !== rightInteger) return leftInteger! < rightInteger! ? -1 : 1
  const width = Math.max(leftFraction.length, rightFraction.length)
  return leftFraction.padEnd(width, '0').localeCompare(rightFraction.padEnd(width, '0'))
}

function validateZone(value: { entryZoneLow?: string | null; entryZoneHigh?: string | null }, context: z.RefinementCtx) {
  if (value.entryZoneLow && value.entryZoneHigh && compareUnsignedDecimals(value.entryZoneLow, value.entryZoneHigh) > 0) {
    context.addIssue({
      code: 'custom', path: ['entryZoneHigh'],
      message: 'entryZoneHigh must be greater than or equal to entryZoneLow',
    })
  }
}

export const tradePlanInputSchema = z.object({
  ...tradePlanWriteFields,
  status: tradePlanStatusSchema.default('draft'),
}).strict().superRefine(validateZone)
export const tradePlanUpdateSchema = z.object(tradePlanWriteFields).partial().strict()
  .refine(value => Object.keys(value).length > 0, { message: 'At least one field is required' })
  .superRefine(validateZone)

export const tradePlanSortSchema = z.enum(['updatedAt-desc', 'createdAt-desc', 'symbol-asc']).default('updatedAt-desc')
export const tradePlanStatusQuerySchema = tradePlanStatusSchema.optional()
export const tradePlanListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: tradePlanStatusSchema.optional(),
  symbol: tradePlanWriteFields.symbol.optional(),
  sortBy: tradePlanSortSchema,
}).strict()
export const tradePlanListParamsSchema = tradePlanListQuerySchema

const responseDecimalSchema = z.string().regex(/^\d+(?:\.\d+)?$/).transform(canonicalDecimal)

export const linkedTradePlanResponseSchema = z.object({
  id: serializedIdSchema,
  symbol: tradePlanWriteFields.symbol,
  setupType: z.string().nullable(),
  entryPrice: responseDecimalSchema.nullable(),
  entryZoneLow: responseDecimalSchema.nullable(),
  entryZoneHigh: responseDecimalSchema.nullable(),
  stopLoss: responseDecimalSchema.nullable(),
  targetPrice: responseDecimalSchema.nullable(),
  maxPositionSize: responseDecimalSchema.nullable(),
  invalidationCondition: z.string().nullable(),
  notes: z.string().nullable(),
  status: tradePlanStatusSchema,
}).strict()

export const tradePlanDiaryLinkSchema = z.object({
  id: serializedIdSchema,
  title: z.string(),
  date: calendarDateSchema,
  reviewStatus: z.enum(['none', 'pending', 'reviewed']).nullable(),
  reviewOutcome: z.enum(['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR']).nullable(),
  transactionCount: z.number().int().nonnegative(),
}).strict()

export const tradePlanResponseSchema = linkedTradePlanResponseSchema.extend({
  userId: serializedIdSchema,
  diaryId: serializedIdSchema.nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
  diary: tradePlanDiaryLinkSchema.nullable(),
}).strict()

export const tradePlanListResponseSchema = z.object({
  data: z.array(tradePlanResponseSchema),
  pagination: z.object({
    page: z.number().int().min(1), limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export const deleteTradePlanResponseSchema = z.object({ success: z.literal(true) }).strict()

export type TradePlanStatus = z.infer<typeof tradePlanStatusSchema>
export type TradePlanInput = z.infer<typeof tradePlanInputSchema>
export type TradePlanUpdate = z.infer<typeof tradePlanUpdateSchema>
export type TradePlanListQuery = z.output<typeof tradePlanListQuerySchema>
export type TradePlanListParams = TradePlanListQuery
export type TradePlanResponse = z.infer<typeof tradePlanResponseSchema>
export type LinkedTradePlanResponse = z.infer<typeof linkedTradePlanResponseSchema>
