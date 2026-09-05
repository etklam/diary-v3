import { z } from 'zod'
import { serializedIdSchema, calendarDateSchema, utcInstantSchema } from './common.js'
export const etfSymbolSchema = z.string().trim().min(1).max(20).transform(value => value.toUpperCase())
export const adminEtfCreateSchema = z.object({ symbol: etfSymbolSchema, name: z.string().trim().max(255).nullish().transform(value => value || null), skipValidation: z.boolean().default(false) }).strict()
export const adminEtfCreatedSchema = z.object({ id: serializedIdSchema, symbol: etfSymbolSchema, name: z.string().nullable(), createdAt: utcInstantSchema }).strict()
export const adminEtfListSchema = z.array(adminEtfCreatedSchema.extend({ updatedAt: utcInstantSchema, priceCount: z.number().int().nonnegative(), watchlistCount: z.number().int().nonnegative() }).strict())
export const adminEtfSeedSchema = z.object({ success: z.literal(true), added: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict()
export const adminEtfDeleteSchema = z.object({ success: z.literal(true), deletedPrices: z.number().int().nonnegative(), deletedWatchlists: z.number().int().nonnegative() }).strict()
export const adminEtfInitializeSchema = z.object({ success: z.literal(true), added: z.number().int().nonnegative(), total: z.number().int().nonnegative(), symbol: etfSymbolSchema, dateRange: z.object({ from: calendarDateSchema, to: calendarDateSchema }).strict() }).strict()

export const etfWatchlistCreateSchema = z.object({ symbol: etfSymbolSchema }).strict()
export const etfWatchlistItemSchema = z.object({ id: serializedIdSchema, symbol: etfSymbolSchema, name: z.string().nullable(), sortOrder: z.number().int() }).strict()
export const etfWatchlistListSchema = z.array(etfWatchlistItemSchema.extend({ latestPrice: z.number().finite().nullable(), latestDate: calendarDateSchema.nullable() }).strict())
