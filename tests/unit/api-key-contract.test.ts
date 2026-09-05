import { expect, it } from 'vitest'
import { createApiKeySchema, apiKeySummarySchema } from '@diary/contracts/api-keys'
it('normalizes labels, defaults scope and rejects privilege fields or leaked secrets', () => {
 expect(createApiKeySchema.parse({ label: ' Research ' })).toEqual({ label: 'Research', scope: 'DIARY_CREATE' })
 for (const input of [{ label: ' ' }, { label: 'a'.repeat(101) }, { label: 'Agent', scope: 'ADMIN' }, { label: 'Agent', userId: '2' }]) expect(createApiKeySchema.safeParse(input).success).toBe(false)
 const summary = { id: '1', label: 'Agent', scope: 'AGENT_WRITE', keyPrefix: 'dva_12345678', createdAt: '2026-09-05T00:00:00Z', revokedAt: null, lastUsedAt: null }
 expect(apiKeySummarySchema.safeParse(summary).success).toBe(true)
 expect(apiKeySummarySchema.safeParse({ ...summary, keyHash: 'a'.repeat(64) }).success).toBe(false)
 expect(apiKeySummarySchema.safeParse({ ...summary, rawKey: 'dva_' + 'a'.repeat(48) }).success).toBe(false)
})
