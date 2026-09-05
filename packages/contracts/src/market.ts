import { z } from 'zod';

const aliases: Record<string, string> = { SPX:'^GSPC', DJI:'^DJI', IXIC:'^IXIC', NDX:'^NDX', RUT:'^RUT' };
export function normalizeMarketSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  return aliases[normalized] ?? normalized;
}
export const marketSymbolSchema = z.string().trim().min(1).max(32)
  .regex(/^[A-Za-z0-9^][A-Za-z0-9.^=-]*$/, 'Invalid market symbol')
  .transform(normalizeMarketSymbol);
export const marketRangeSchema = z.enum(['1mo','3mo','6mo','1y','5y','max']);
export const marketQuoteSchema = z.object({
  symbol: z.string(),
  regularMarketPrice: z.number().finite(),
  previousClose: z.number().finite().nullable(),
  change: z.number().finite().nullable(),
  changePercent: z.number().finite().nullable(),
  currency: z.string().nullable(),
  marketState: z.string().nullable(),
  lastUpdateTime: z.iso.datetime().nullable(),
}).strict();
export const marketHistoricalSchema = z.array(z.object({ timestamp:z.number().int(),close:z.number().finite() }).strict());
export const marketHistoricalQuerySchema = z.object({
  symbol:marketSymbolSchema,range:marketRangeSchema.default('1y'),nocache:z.enum(['1','true','0','false']).optional(),
});
export const marketQuoteQuerySchema = z.object({nocache:z.enum(['1','true','0','false']).optional()});
export type MarketQuote = z.infer<typeof marketQuoteSchema>;
export type MarketHistorical = z.infer<typeof marketHistoricalSchema>;
export type MarketRange = z.infer<typeof marketRangeSchema>;

export const spxSessionSummarySchema = z.object({
  symbol:z.literal('SPX'),sourceSymbol:z.string(),
  condition:z.enum(['gapDownRecovery','gapDownAndGo','gapUpAndGo','gapUpFade','choppySession','strongUp','slightUp','strongDown','slightDown','rangeBound']),
  price:z.number().finite(),previousClose:z.number().finite(),open:z.number().finite(),
  high:z.number().finite().nullable(),low:z.number().finite().nullable(),
  change:z.number().finite(),changePercent:z.number().finite(),
  intradayMovePercent:z.number().finite(),openGapPercent:z.number().finite(),asOf:z.iso.datetime(),
}).strict();
export type SpxSessionSummary=z.infer<typeof spxSessionSummarySchema>;
