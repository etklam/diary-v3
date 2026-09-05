import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'
export const apiKeyScopeSchema = z.enum(['DIARY_CREATE', 'AGENT_WRITE'])
export const createApiKeySchema = z.object({ label: z.string().trim().min(1).max(100), scope: apiKeyScopeSchema.default('DIARY_CREATE') }).strict()
export const apiKeySummarySchema = z.object({ id: serializedIdSchema, label: z.string(), keyPrefix: z.string().regex(/^dva_[0-9a-f]{8}$/), scope: apiKeyScopeSchema, lastUsedAt: utcInstantSchema.nullable(), revokedAt: utcInstantSchema.nullable(), createdAt: utcInstantSchema }).strict()
export const apiKeyListResponseSchema = z.object({ keys: z.array(apiKeySummarySchema) }).strict()
export const apiKeyCreateResponseSchema = z.object({ key: apiKeySummarySchema, rawKey: z.string().regex(/^dva_[0-9a-f]{48}$/) }).strict()
