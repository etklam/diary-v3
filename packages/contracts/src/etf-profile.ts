import { z } from 'zod'
import { marketSymbolSchema, marketQuoteSchema } from './market.js'
import { calendarDateSchema, utcInstantSchema } from './common.js'
const metric=z.number().finite().nullable()
export const etfProfileQuerySchema=z.object({benchmark:z.enum(['SPY','QQQ']).default('SPY'),period:z.enum(['1m','3m','6m','1y']).default('3m')}).strict()
export const etfRiskSchema=z.object({high52w:metric,low52w:metric,distanceToHighPct:metric,distanceToLowPct:metric,volatility20d:metric,volatility60d:metric,volatility252d:metric,maxDrawdown1y:metric,volumeSpikeRatio:metric,observations:z.number().int().nonnegative(),asOf:calendarDateSchema.nullable()}).strict()
export const etfValuationSchema=z.object({aum:metric,expenseRatioPct:metric,pe:metric,pb:metric,dividendYieldPct:metric,currency:z.string().nullable()}).strict()
export const etfRsSchema=z.object({symbolReturnPct:metric,benchmarkReturnPct:metric,relativeReturnPct:metric,trend:z.enum(['in_line','outperforming','underperforming']).nullable(),from:calendarDateSchema.nullable(),to:calendarDateSchema.nullable()}).strict()
export const etfProfileMetaSchema=z.object({fetchedAt:utcInstantSchema,asOf:utcInstantSchema.nullable(),isStale:z.boolean(),status:z.enum(['complete','partial','unavailable']),sources:z.record(z.string(),z.object({source:z.literal('yahoo'),fetchedAt:utcInstantSchema,isStale:z.boolean()}).strict())}).strict()
export const etfProfileSchema=z.object({symbol:marketSymbolSchema,benchmark:z.enum(['SPY','QQQ']),period:z.enum(['1m','3m','6m','1y']),quote:marketQuoteSchema.nullable(),risk:etfRiskSchema,valuation:etfValuationSchema,rs:etfRsSchema,meta:etfProfileMetaSchema}).strict()
