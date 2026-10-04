import { createHash, randomUUID } from 'node:crypto'
import { createClient, type RedisClientType } from 'redis'
import type { RateLimitOptions, RateLimitResult, RateLimitStore } from './types.js'
import { RateLimitStoreUnavailableError } from './types.js'

const consumeScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local member = ARGV[3]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local count = redis.call('ZCARD', key)
if count >= limit then
  local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = tonumber(first[2]) + windowMs
  return { 0, 0, math.max(1, resetAt - now), resetAt }
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
count = count + 1
local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local resetAt = tonumber(first[2]) + windowMs
return { 1, limit - count, 0, resetAt }
`

const DEFAULT_TIMEOUT_MS = 300
// Remote test stores (e.g. an SSH-tunneled VPS Postgres/Redis) need a looser
// bound than the local default; production keeps the fast-fail 300ms.
const REMOTE_TIMEOUT_MS = 5000

function resolveTimeoutMs(redisUrl: string, options: { timeoutMs?: number }): number {
  if (options.timeoutMs !== undefined) return options.timeoutMs
  const host = new URL(redisUrl).hostname
  return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)
    ? DEFAULT_TIMEOUT_MS
    : REMOTE_TIMEOUT_MS
}

export function redisRateLimitKey(key: string): string {
  const digest = createHash('sha256').update(key).digest('hex')
  return `diary-v3:ratelimit:v1:${digest}`
}

function bounded<T>(operation: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout()
      reject(new RateLimitStoreUnavailableError())
    }, timeoutMs)
    timer.unref()
  })
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer))
}

function destroyClient(client: RedisClientType) {
  if (client.isOpen) {
    try { client.destroy() } catch { /* A concurrent close already destroyed it. */ }
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  private closed = false

  private constructor(
    private readonly client: RedisClientType,
    private readonly timeoutMs: number,
  ) {}

  static async connect(redisUrl: string, options: { timeoutMs?: number } = {}): Promise<RedisRateLimitStore> {
    let parsed: URL
    try { parsed = new URL(redisUrl) } catch { throw new RateLimitStoreUnavailableError() }
    if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) throw new RateLimitStoreUnavailableError()

    const timeoutMs = resolveTimeoutMs(redisUrl, options)
    // `connectTimeout` bounds the initial connection. Per-command bounds are
    // enforced by the `bounded()` wrapper, so the socket itself must stay idle:
    // a `socketTimeout` here would destroy the connection whenever Redis goes
    // quiet between requests, and with `reconnectStrategy: false` the client
    // could then never recover until the next cooldown-gated reconnect.
    const client = createClient({
      url: redisUrl,
      socket: { connectTimeout: timeoutMs, reconnectStrategy: false },
    })
    client.on('error', () => {})
    const closeOnTimeout = () => destroyClient(client)
    try {
      await bounded(client.connect(), timeoutMs, closeOnTimeout)
      await bounded(client.ping(), timeoutMs, closeOnTimeout)
      if (!client.isReady) throw new RateLimitStoreUnavailableError()
      return new RedisRateLimitStore(client, timeoutMs)
    } catch {
      closeOnTimeout()
      throw new RateLimitStoreUnavailableError()
    }
  }

  get ready() { return !this.closed && this.client.isReady }

  async consume(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
    if (!this.ready) throw new RateLimitStoreUnavailableError()
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || !Number.isSafeInteger(options.windowMs) || options.windowMs < 1) {
      throw new TypeError('Rate-limit policy must use a positive limit and window')
    }
    try {
      const result = await bounded(this.client.eval(consumeScript, {
        keys: [redisRateLimitKey(key)],
        arguments: [String(options.limit), String(options.windowMs), randomUUID()],
      }), this.timeoutMs, () => this.invalidate())
      if (!Array.isArray(result) || result.length !== 4) throw new RateLimitStoreUnavailableError()
      const allowedValue = Number(result[0])
      const remainingValue = Number(result[1])
      const retryAfterValue = Number(result[2])
      const resetAtValue = Number(result[3])
      if (![allowedValue, remainingValue, retryAfterValue, resetAtValue].every(Number.isFinite)) throw new RateLimitStoreUnavailableError()
      return {
        allowed: allowedValue === 1,
        limit: options.limit,
        remaining: remainingValue,
        retryAfterMs: retryAfterValue,
        resetAt: resetAtValue,
      }
    } catch {
      this.invalidate()
      throw new RateLimitStoreUnavailableError()
    }
  }

  async close() {
    this.invalidate()
  }

  private invalidate() {
    if (this.closed) return
    this.closed = true
    destroyClient(this.client)
  }
}

export { consumeScript as redisRateLimitScript }
