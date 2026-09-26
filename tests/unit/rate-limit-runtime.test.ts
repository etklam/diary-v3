import { describe, expect, it, vi } from 'vitest'
import { resolveClientIp } from '../../apps/api/src/app.js'
import {
  createRateLimitRuntime,
  parseRateLimitConfig,
  redisRateLimitKey,
  MemoryRateLimitStore,
  RateLimitStoreUnavailableError,
} from '../../apps/api/src/rate-limit/index.js'
import type { RateLimitOptions, RateLimitResult, RateLimitStore } from '../../apps/api/src/rate-limit/index.js'

function memoryStore(): RateLimitStore {
  const store = new MemoryRateLimitStore()
  return {
    get ready() { return true },
    consume: (key, options) => store.consume(key, options),
    close: () => store.close(),
  }
}

describe('rate-limit backend selection', () => {
  it('defaults to memory, validates configured modes, and requires a Redis URL only in redis mode', () => {
    expect(parseRateLimitConfig({})).toEqual({ backend: 'memory' })
    expect(parseRateLimitConfig({ RATE_LIMIT_BACKEND: 'auto' })).toEqual({ backend: 'auto' })
    expect(parseRateLimitConfig({ RATE_LIMIT_BACKEND: 'redis', REDIS_URL: 'redis://localhost:6379' })).toEqual({ backend: 'redis', redisUrl: 'redis://localhost:6379' })
    expect(() => parseRateLimitConfig({ RATE_LIMIT_BACKEND: 'invalid' })).toThrow('RATE_LIMIT_BACKEND')
    expect(() => parseRateLimitConfig({ RATE_LIMIT_BACKEND: 'redis' })).toThrow('REDIS_URL')
  })

  it('never contacts Redis in memory mode', async () => {
    const redisFactory = vi.fn(async () => { throw new Error('must not connect') })
    const runtime = await createRateLimitRuntime({ backend: 'memory', redisUrl: 'redis://unused' }, { redisFactory })
    expect(redisFactory).not.toHaveBeenCalled()
    expect(runtime).toMatchObject({ mode: 'memory', backend: 'memory', degraded: false, ready: true })
    await runtime.close()
  })

  it('fails closed at startup when redis mode cannot connect', async () => {
    await expect(createRateLimitRuntime({ backend: 'redis', redisUrl: 'redis://unavailable' }, {
      redisFactory: async () => { throw new RateLimitStoreUnavailableError() },
    })).rejects.toThrow('Redis rate-limit backend unavailable')
  })

  it('falls back to bounded memory limits and recovers after a cooldown', async () => {
    let now = 0
    let redisAvailable = false
    const logs: string[] = []
    const redisFactory = vi.fn(async () => {
      if (!redisAvailable) throw new RateLimitStoreUnavailableError()
      return memoryStore()
    })
    const runtime = await createRateLimitRuntime({ backend: 'auto', redisUrl: 'redis://fixture' }, {
      now: () => now,
      recoveryCooldownMs: 10,
      logger: { info: message => logs.push(message) },
      redisFactory,
    })
    expect(runtime).toMatchObject({ backend: 'memory', degraded: true, ready: true })
    const policy = { limit: 1, windowMs: 100 }
    await expect(runtime.consume('same-client', { ...policy, now })).resolves.toMatchObject({ allowed: true })
    now = 1
    await expect(runtime.consume('same-client', { ...policy, now })).resolves.toMatchObject({ allowed: false })

    redisAvailable = true
    now = 10
    await runtime.consume('recovery-probe', { ...policy, now })
    await vi.waitFor(() => expect(runtime.backend).toBe('redis'))
    expect(runtime.degraded).toBe(false)
    expect(logs.some(log => log.includes('redis_rate_limit_recovered'))).toBe(true)
    await runtime.close()
  })

  it('degrades after a Redis command failure, keeps limiting locally, then restores Redis', async () => {
    let now = 0
    let redisAvailable = true
    const remote = new MemoryRateLimitStore()
    const redisFactory = vi.fn(async () => ({
      get ready() { return redisAvailable },
      async consume(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
        if (!redisAvailable) throw new RateLimitStoreUnavailableError()
        return remote.consume(key, options)
      },
      async close() {},
    }))
    const runtime = await createRateLimitRuntime({ backend: 'auto', redisUrl: 'redis://fixture' }, {
      now: () => now,
      recoveryCooldownMs: 10,
      redisFactory,
    })
    const policy = { limit: 1, windowMs: 100 }
    await expect(runtime.consume('redis-client', { ...policy, now })).resolves.toMatchObject({ allowed: true })
    redisAvailable = false
    now = 1
    await expect(runtime.consume('local-client', { ...policy, now })).resolves.toMatchObject({ allowed: true })
    expect(runtime).toMatchObject({ backend: 'memory', degraded: true, ready: true })
    now = 2
    await expect(runtime.consume('local-client', { ...policy, now })).resolves.toMatchObject({ allowed: false })

    redisAvailable = true
    now = 11
    await runtime.consume('recovery-probe', { ...policy, now })
    await vi.waitFor(() => expect(runtime.backend).toBe('redis'))
    expect(redisFactory).toHaveBeenCalledTimes(2)
    await runtime.close()
  })
})

describe('Redis rate-limit key privacy', () => {
  it('hashes account identifiers and keeps only the namespace and digest', () => {
    const key = redisRateLimitKey('login:account:private@example.test')
    expect(key).toMatch(/^diary-v3:ratelimit:v1:[a-f0-9]{64}$/)
    expect(key).not.toContain('private@example.test')
  })
})

describe('trusted client IP resolution', () => {
  it('ignores forwarded headers unless proxy trust is enabled and falls back on invalid hops', () => {
    expect(resolveClientIp(false, '198.51.100.99', '127.0.0.1')).toBe('127.0.0.1')
    expect(resolveClientIp(true, '198.51.100.99, 203.0.113.8', '127.0.0.1')).toBe('203.0.113.8')
    expect(resolveClientIp(true, 'attacker-controlled', '127.0.0.1')).toBe('127.0.0.1')
  })
})
