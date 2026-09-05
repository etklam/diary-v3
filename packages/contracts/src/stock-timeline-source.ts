import { z } from 'zod'

export const STOCK_TIMELINE_SOURCE_TYPES = [
  'TRADE_BASIC_DIARY',
  'VIDEO_TRANSCRIBE_SUMMARIZE',
  'DIARY',
  'ARTICLE',
  'MANUAL',
  'SYSTEM',
  'MARKET_ROTATION',
  'SEC_FILING',
  'RELATIVE_VALUE',
  'SEASONALITY',
] as const

export type StockTimelineSourceType = typeof STOCK_TIMELINE_SOURCE_TYPES[number]

export const stockTimelineSourceTypeSchema = z.enum(STOCK_TIMELINE_SOURCE_TYPES)

/** Agent capability policy; intentionally narrower than the domain vocabulary. */
export const AGENT_ALLOWED_SOURCE_TYPES = [
  'TRADE_BASIC_DIARY',
  'VIDEO_TRANSCRIBE_SUMMARIZE',
  'DIARY',
  'ARTICLE',
  'MANUAL',
  'SYSTEM',
] as const satisfies readonly StockTimelineSourceType[]

export const agentAllowedSourceTypeSchema = z.enum(AGENT_ALLOWED_SOURCE_TYPES)
