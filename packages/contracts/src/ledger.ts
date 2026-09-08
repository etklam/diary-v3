import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'

const DECIMAL_15_4 = /^\d{1,11}(?:\.\d{1,4})?$/
const DECIMAL_STRING = /^\d+(?:\.\d+)?$/

export function canonicalDecimal(value: string): string {
  const [integer, fraction = ''] = value.split('.')
  const normalizedInteger = integer!.replace(/^0+(?=\d)/, '')
  const normalizedFraction = fraction.replace(/0+$/, '')
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger
}

/** PostgreSQL numeric(15,4), normalized before persistence to avoid silent rounding. */
export const ledgerDecimalInputSchema = z.union([
  z.number().positive().finite().transform(String),
  z.string().regex(/^\d+(?:\.\d+)?$/).refine(value => /[1-9]/.test(value), 'Value must be greater than 0'),
]).transform(canonicalDecimal)
  .pipe(z.string().regex(DECIMAL_15_4, 'Value must fit numeric(15,4) without rounding'))

const nullableLedgerTextSchema = z.string().max(10_000).nullable().optional()

const ledgerTransactionFields = {
  symbol: z.string().trim().min(1).max(20).transform(value => value.toUpperCase()),
  quantity: ledgerDecimalInputSchema,
  price: ledgerDecimalInputSchema,
  tradeDate: utcInstantSchema,
  notes: nullableLedgerTextSchema,
  strategy: z.string().max(100).nullable().optional(),
  emotion: z.string().max(20).nullable().optional(),
}

export const ledgerTransactionInputSchema = z.object({
  ...ledgerTransactionFields,
  type: z.enum(['BUY', 'SELL']),
}).strict()

export const ledgerTransactionUpdateInputSchema = z.object({
  ...ledgerTransactionFields,
  id: serializedIdSchema.optional(),
  type: z.enum(['BUY', 'SELL']),
}).strict()

export const buyTransactionInputSchema = z.object({
  ...ledgerTransactionFields,
  type: z.literal('BUY'),
}).strict()

export const ledgerTransactionResponseSchema = z.object({
  id: serializedIdSchema,
  diaryId: serializedIdSchema.optional(),
  userId: serializedIdSchema.optional(),
  symbol: z.string(),
  type: z.enum(['BUY', 'SELL']),
  quantity: z.string().regex(DECIMAL_STRING).transform(canonicalDecimal),
  price: z.string().regex(DECIMAL_STRING).transform(canonicalDecimal),
  tradeDate: utcInstantSchema,
  notes: z.string().nullable().optional(),
  strategy: z.string().nullable().optional(),
  emotion: z.string().nullable().optional(),
  createdAt: utcInstantSchema.optional(),
}).strict()

export const holdingSchema = z.object({
  symbol: z.string().min(1).max(20),
  quantity: z.string().regex(DECIMAL_STRING),
  avgCost: z.string().regex(DECIMAL_STRING),
  totalCost: z.string().regex(DECIMAL_STRING),
}).strict()

export const holdingsResponseSchema = z.array(holdingSchema)

const signedDecimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/)
export const recentClosedTradesQuerySchema = z.object({
  days: z.string().optional().transform(value => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 90) : 30
  }),
  limit: z.string().optional().transform(value => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50
  }),
}).strict()

export const recentClosedTradeSchema = z.object({
  id: serializedIdSchema,
  symbol: z.string().min(1).max(20),
  sellDate: utcInstantSchema,
  sellQuantity: z.string().regex(DECIMAL_STRING),
  realizedPnL: signedDecimalStringSchema,
  realizedPnLPct: signedDecimalStringSchema,
}).strict()

export const recentClosedTradesResponseSchema = z.object({
  trades: z.array(recentClosedTradeSchema).max(100),
}).strict()

export type BuyTransactionInput = z.infer<typeof buyTransactionInputSchema>
export type LedgerTransactionInput = z.infer<typeof ledgerTransactionInputSchema>
export type LedgerTransactionUpdateInput = z.infer<typeof ledgerTransactionUpdateInputSchema>
export type LedgerTransactionResponse = z.infer<typeof ledgerTransactionResponseSchema>
export type Holding = z.infer<typeof holdingSchema>
export type RecentClosedTradesQuery = z.output<typeof recentClosedTradesQuerySchema>
