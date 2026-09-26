import { MemoryRateLimitStore } from './memory-store.js'
import { RedisRateLimitStore } from './redis-store.js'
import type {
  ActiveRateLimitBackend,
  RateLimitConfig,
  RateLimitLogger,
  RateLimitRuntime,
  RateLimitStore,
} from './types.js'
import type { RateLimitOptions, RateLimitResult } from './types.js'

const RECOVERY_COOLDOWN_MS = 15_000

export { MemoryRateLimitStore } from './memory-store.js'
export { RedisRateLimitStore, redisRateLimitKey, redisRateLimitScript } from './redis-store.js'
export { RATE_LIMIT_POLICIES, rateLimitKey } from './policies.js'
export type {
  RateLimitBackend,
  RateLimitConfig,
  RateLimitLogger,
  RateLimitOptions,
  RateLimitPolicy,
  RateLimitResult,
  RateLimitRuntime,
  RateLimitStore,
} from './types.js'
export { RateLimitStoreUnavailableError } from './types.js'

export function parseRateLimitConfig(env: Record<string, string | undefined>): RateLimitConfig {
  const backend = env.RATE_LIMIT_BACKEND?.trim() || 'memory'
  if (backend !== 'memory' && backend !== 'redis' && backend !== 'auto') {
    throw new Error('RATE_LIMIT_BACKEND must be memory, redis, or auto')
  }
  const redisUrl = env.REDIS_URL?.trim() || undefined
  if (backend === 'redis' && !redisUrl) throw new Error('REDIS_URL is required when RATE_LIMIT_BACKEND=redis')
  return { backend, ...(redisUrl ? { redisUrl } : {}) }
}

export function createMemoryRateLimitRuntime(): RateLimitRuntime {
  const store = new MemoryRateLimitStore()
  return {
    mode: 'memory', backend: 'memory', degraded: false,
    get ready() { return true },
    consume: (key, options) => store.consume(key, options),
    close: () => store.close(),
  }
}

export async function createRateLimitRuntime(
  config: RateLimitConfig,
  options: {
    logger?: RateLimitLogger
    now?: () => number
    redisFactory?: (url: string) => Promise<RateLimitStore>
    recoveryCooldownMs?: number
  } = {},
): Promise<RateLimitRuntime> {
  const logger = options.logger
  const now = options.now ?? Date.now
  const redisFactory = options.redisFactory ?? (url => RedisRateLimitStore.connect(url))
  const memory = new MemoryRateLimitStore()
  const log = (operation: string, context: Record<string, unknown>) => {
    logger?.info?.(JSON.stringify({ operation, ...context }))
  }

  if (config.backend === 'memory') {
    log('rate_limit_backend_selected', { mode: 'memory', backend: 'memory' })
    return runtime('memory', memory)
  }
  if (!config.redisUrl) {
    if (config.backend === 'redis') throw new Error('REDIS_URL is required when RATE_LIMIT_BACKEND=redis')
    log('rate_limit_backend_selected', { mode: 'auto', backend: 'memory' })
    log('redis_rate_limit_degraded', { reason: 'not_configured' })
    log('redis_rate_limit_fallback_memory', { reason: 'not_configured' })
    return autoRuntime(null, true)
  }

  let initial: RateLimitStore | null = null
  try { initial = await redisFactory(config.redisUrl) } catch {
    if (config.backend === 'redis') throw new Error('Redis rate-limit backend unavailable')
  }
  if (config.backend === 'redis') {
    if (!initial) throw new Error('Redis rate-limit backend unavailable')
    log('redis_rate_limit_connected', { mode: 'redis' })
    log('rate_limit_backend_selected', { mode: 'redis', backend: 'redis' })
    return runtime('redis', initial)
  }

  if (initial) {
    log('redis_rate_limit_connected', { mode: 'auto' })
    log('rate_limit_backend_selected', { mode: 'auto', backend: 'redis' })
    return autoRuntime(initial, false)
  }
  log('rate_limit_backend_selected', { mode: 'auto', backend: 'memory' })
  log('redis_rate_limit_degraded', { reason: 'unavailable' })
  log('redis_rate_limit_fallback_memory', { reason: 'unavailable' })
  return autoRuntime(null, true)

  function runtime(mode: ActiveRateLimitBackend, store: RateLimitStore): RateLimitRuntime {
    let failureLogged = false
    return {
      mode, backend: mode,
      get degraded() { return mode === 'redis' && !store.ready },
      get ready() { return store.ready },
      async consume(key, limitOptions) {
        try { return await store.consume(key, limitOptions) } catch (error) {
          if (mode === 'redis' && !failureLogged) {
            failureLogged = true
            log('redis_rate_limit_degraded', { mode: 'redis', reason: 'command_failed' })
          }
          throw error
        }
      },
      close: () => store.close(),
    }
  }

  function autoRuntime(initialStore: RateLimitStore | null, degraded: boolean): RateLimitRuntime {
    let redisStore = initialStore
    let nextProbeAt = degraded ? now() + (options.recoveryCooldownMs ?? RECOVERY_COOLDOWN_MS) : Infinity
    let probing: Promise<void> | null = null
    let closed = false
    const cooldown = options.recoveryCooldownMs ?? RECOVERY_COOLDOWN_MS

    const probe = () => {
      if (closed || redisStore || !config.redisUrl || probing || now() < nextProbeAt) return
      nextProbeAt = now() + cooldown
      probing = Promise.resolve().then(() => redisFactory(config.redisUrl!)).then(async recovered => {
        if (closed || redisStore) return recovered.close()
        redisStore = recovered
        log('redis_rate_limit_recovered', { backend: 'redis' })
      }).catch(() => {}).finally(() => { probing = null })
    }

    return {
      mode: 'auto',
      get backend(): ActiveRateLimitBackend { return redisStore ? 'redis' : 'memory' },
      get degraded() { return !redisStore },
      get ready() { return true },
      async consume(key: string, limitOptions: RateLimitOptions): Promise<RateLimitResult> {
        const current = redisStore
        if (current) {
          try { return await current.consume(key, limitOptions) } catch {
            if (redisStore === current) {
              redisStore = null
              nextProbeAt = now() + cooldown
              log('redis_rate_limit_degraded', { reason: 'command_failed' })
              log('redis_rate_limit_fallback_memory', { reason: 'command_failed' })
              void current.close()
            }
          }
        }
        probe()
        return memory.consume(key, limitOptions)
      },
      async close() {
        closed = true
        const current = redisStore
        redisStore = null
        await Promise.all([memory.close(), current?.close() ?? Promise.resolve(), probing ?? Promise.resolve()])
      },
    }
  }
}
