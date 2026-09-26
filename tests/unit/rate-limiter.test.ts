import { describe, expect, it } from 'vitest'
import { MemoryRateLimitStore } from '../../apps/api/src/rate-limit/index.js'

describe('memory rate-limit store', () => {
  it('clears expired identities without weakening an active identity limit', async () => {
    const store = new MemoryRateLimitStore({ maxBuckets: 3 })
    const policy = { limit: 1, windowMs: 100 }
    await store.consume('expired', { ...policy, now: 0 })
    await store.consume('active', { ...policy, now: 75 })
    expect(store.size).toBe(2)
    await store.consume('new', { ...policy, now: 101 })
    expect(store.size).toBe(2)
    await expect(store.consume('active', { ...policy, now: 101 })).resolves.toMatchObject({ allowed: false, retryAfterMs: 74 })
    await expect(store.consume('expired', { ...policy, now: 101 })).resolves.toMatchObject({ allowed: true })
  })

  it('reports the exact remaining sliding-window delay and restores capacity at the boundary', async () => {
    const store = new MemoryRateLimitStore()
    const policy = { limit: 1, windowMs: 100 }
    await expect(store.consume('identity', { ...policy, now: 0 })).resolves.toMatchObject({ allowed: true, remaining: 0, resetAt: 100 })
    await expect(store.consume('identity', { ...policy, now: 40 })).resolves.toMatchObject({ allowed: false, retryAfterMs: 60 })
    await expect(store.consume('identity', { ...policy, now: 100 })).resolves.toMatchObject({ allowed: true })
  })

  it('fails closed at capacity rather than evicting active limits', async () => {
    const store = new MemoryRateLimitStore({ maxBuckets: 2 })
    const policy = { limit: 1, windowMs: 100 }
    await store.consume('first', { ...policy, now: 0 })
    await store.consume('second', { ...policy, now: 1 })
    await expect(store.consume('third', { ...policy, now: 2 })).resolves.toMatchObject({ allowed: false, retryAfterMs: 100 })
    await expect(store.consume('first', { ...policy, now: 2 })).resolves.toMatchObject({ allowed: false })
    expect(store.size).toBe(2)
    await expect(store.consume('third', { ...policy, now: 102 })).resolves.toMatchObject({ allowed: true })
    expect(store.size).toBe(1)
  })
})
