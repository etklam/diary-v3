export interface RateLimitPolicy {
  readonly name: string
  readonly limit: number
  readonly windowMs: number
}

export interface RateLimitOptions {
  limit: number
  windowMs: number
  /** Used by the process-local store and deterministic tests. Redis uses server time. */
  now?: number
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterMs: number
}

export interface RateLimitStore {
  readonly ready: boolean
  consume(key: string, options: RateLimitOptions): Promise<RateLimitResult>
  close(): Promise<void>
}

export type RateLimitBackend = 'memory' | 'redis' | 'auto'
export type ActiveRateLimitBackend = Exclude<RateLimitBackend, 'auto'>

export interface RateLimitConfig {
  backend: RateLimitBackend
  redisUrl?: string
}

export interface RateLimitRuntime extends RateLimitStore {
  readonly mode: RateLimitBackend
  readonly backend: ActiveRateLimitBackend
  readonly degraded: boolean
}

export interface RateLimitLogger {
  info?(message: string, context?: Record<string, unknown>): void
}

export class RateLimitStoreUnavailableError extends Error {
  constructor() {
    super('Rate limit store unavailable')
    this.name = 'RateLimitStoreUnavailableError'
  }
}
