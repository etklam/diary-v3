import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from 'redis'
import { redisRateLimitKey, RedisRateLimitStore } from '../../apps/api/src/rate-limit/index.js'

const redisUrl = process.env.RATE_LIMIT_TEST_REDIS_URL
const redisDescribe = describe.skipIf(!redisUrl)

redisDescribe('Redis distributed rate-limit store', () => {
  let store: RedisRateLimitStore | undefined
  let inspector: ReturnType<typeof createClient> | undefined

  beforeAll(async () => {
    store = await RedisRateLimitStore.connect(redisUrl!)
    inspector = createClient({ url: redisUrl })
    inspector.on('error', () => {})
    await inspector.connect()
  })

  afterAll(async () => {
    await Promise.all([store?.close(), inspector?.close()])
  })

  it('atomically admits only the configured number of concurrent requests', async () => {
    const key = `concurrency:${randomUUID()}`
    const results = await Promise.all(Array.from({ length: 50 }, () => store!.consume(key, { limit: 10, windowMs: 5_000 })))
    expect(results.filter(result => result.allowed)).toHaveLength(10)
    expect(results.filter(result => !result.allowed)).toHaveLength(40)
  })

  it('sets a finite TTL and allows a fresh window after expiration', async () => {
    const key = `expiry:${randomUUID()}`
    const redisKey = redisRateLimitKey(key)
    await expect(store!.consume(key, { limit: 1, windowMs: 120 })).resolves.toMatchObject({ allowed: true })
    const ttl = Number(await inspector!.sendCommand(['PTTL', redisKey]))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(120)
    await new Promise(resolve => setTimeout(resolve, 180))
    await expect(store!.consume(key, { limit: 1, windowMs: 120 })).resolves.toMatchObject({ allowed: true })
  })
})
