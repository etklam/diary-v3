import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'
import { stockSymbolSchema } from './watchlist.js'
const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/)
export const PRICE_ALERT_TYPES = ['PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PERCENT', 'MOVING_AVG'] as const
export const priceAlertTypeSchema = z.enum(PRICE_ALERT_TYPES)
export const PRICE_ALERT_MOVING_AVG_PERIODS = ['20', '50', '200'] as const
export const priceAlertMovingAverageDirectionSchema = z.enum(['above', 'below'])

// price_alerts.threshold is DECIMAL(10,4): at most six integer digits and
// four fractional digits. Reject exponent notation before it reaches Prisma;
// otherwise MariaDB accepts it but the response Decimal mapper cannot emit a
// canonical decimal string.
const PRICE_ALERT_THRESHOLD_RE = /^-?\d{1,6}(?:\.\d{1,4})?$/

const priceAlertThresholdInputSchema = z.preprocess(
  value => value === '' ? undefined : value,
  z.union([
    z.string().trim().regex(PRICE_ALERT_THRESHOLD_RE, 'Threshold must fit DECIMAL(10,4)'),
    z.number().finite().refine(value => PRICE_ALERT_THRESHOLD_RE.test(String(value)), 'Threshold must fit DECIMAL(10,4)'),
  ]).transform(value => String(value).trim()),
)

export const createPriceAlertRequestSchema = z.object({
  symbol: stockSymbolSchema,
  type: priceAlertTypeSchema,
  threshold: priceAlertThresholdInputSchema,
  movingAverageDirection: priceAlertMovingAverageDirectionSchema.optional(),
  message: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.type !== 'CHANGE_PERCENT' && value.threshold.startsWith('-')) {
    context.addIssue({
      code: 'custom',
      path: ['threshold'],
      message: 'Threshold must be non-negative for this alert type',
    })
  }
  if (value.type === 'MOVING_AVG' && !(PRICE_ALERT_MOVING_AVG_PERIODS as readonly string[]).includes(value.threshold)) {
    context.addIssue({ code: 'custom', path: ['threshold'], message: 'Moving average period must be 20, 50 or 200' })
  }
  if (value.type !== 'MOVING_AVG' && value.movingAverageDirection !== undefined) {
    context.addIssue({ code: 'custom', path: ['movingAverageDirection'], message: 'Moving average direction is only valid for MOVING_AVG alerts' })
  }
})

export const updatePriceAlertRequestSchema = z.object({
  threshold: priceAlertThresholdInputSchema.optional(),
  movingAverageDirection: priceAlertMovingAverageDirectionSchema.optional(),
  message: z.string().trim().max(500).optional(),
  isTriggered: z.boolean().optional(),
  triggeredAt: utcInstantSchema.nullable().optional(),
}).strict()
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  })
  .superRefine((value, context) => {
    const hasTriggeredState = value.isTriggered !== undefined || value.triggeredAt !== undefined
    if (!hasTriggeredState) return

    if (value.isTriggered === undefined || value.triggeredAt === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['isTriggered'],
        message: 'isTriggered and triggeredAt must be updated together',
      })
      return
    }

    if (value.isTriggered !== (value.triggeredAt !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['triggeredAt'],
        message: 'triggeredAt must be set exactly when isTriggered is true',
      })
    }
  })

export const priceAlertResponseSchema = z.object({
  id: serializedIdSchema,
  symbol: stockSymbolSchema,
  type: priceAlertTypeSchema,
  threshold: decimalStringSchema,
  movingAverageDirection: priceAlertMovingAverageDirectionSchema.nullable(),
  message: z.string(),
  isTriggered: z.boolean(),
  triggeredAt: utcInstantSchema.nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()

export const PRICE_ALERT_MAX_ITEMS = 100
export const priceAlertListResponseSchema = z.array(priceAlertResponseSchema).max(PRICE_ALERT_MAX_ITEMS)


export type CreatePriceAlertRequest = z.infer<typeof createPriceAlertRequestSchema>
export type UpdatePriceAlertRequest = z.infer<typeof updatePriceAlertRequestSchema>
export type PriceAlertResponse = z.infer<typeof priceAlertResponseSchema>
function iso(value: Date | string) { return new Date(value).toISOString() }
function decimal(value: unknown) { return String(value) }
export function toPriceAlertResponse(row: {
  id: bigint
  userId?: bigint
  symbol: string
  type: string
  threshold: unknown
  movingAverageDirection?: 'above' | 'below' | null
  message: string
  isTriggered: boolean
  triggeredAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}): PriceAlertResponse {
  return priceAlertResponseSchema.parse({
    id: String(row.id),
    symbol: row.symbol,
    type: row.type,
    threshold: decimal(row.threshold),
    movingAverageDirection: row.type === 'MOVING_AVG' ? row.movingAverageDirection ?? 'above' : null,
    message: row.message,
    isTriggered: row.isTriggered,
    triggeredAt: row.triggeredAt === null ? null : iso(row.triggeredAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  })
}
