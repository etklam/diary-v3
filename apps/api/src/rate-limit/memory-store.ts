import type { RateLimitOptions, RateLimitResult, RateLimitStore } from './types.js'

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly attempts = new Map<string, number[]>()
  private nextCleanupAt = 0

  constructor(
    private readonly options: { maxBuckets?: number; now?: () => number } = {},
  ) {}

  get ready() { return true }
  get size() { return this.attempts.size }

  async consume(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const { limit, windowMs } = options
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
      throw new TypeError('Rate-limit policy must use a positive limit and window')
    }
    const now = options.now ?? this.options.now?.() ?? Date.now()
    if (now >= this.nextCleanupAt) this.cleanup(now, windowMs)
    const cutoff = now - windowMs
    const recent = (this.attempts.get(key) ?? []).filter(time => time > cutoff)

    if (recent.length >= limit) {
      const resetAt = recent[0]! + windowMs
      return { allowed: false, limit, remaining: 0, resetAt, retryAfterMs: Math.max(1, resetAt - now) }
    }

    if (!this.attempts.has(key) && this.attempts.size >= (this.options.maxBuckets ?? 10_000)) {
      return { allowed: false, limit, remaining: 0, resetAt: now + windowMs, retryAfterMs: windowMs }
    }

    recent.push(now)
    this.attempts.set(key, recent)
    return {
      allowed: true,
      limit,
      remaining: limit - recent.length,
      resetAt: recent[0]! + windowMs,
      retryAfterMs: 0,
    }
  }

  async close() {}

  private cleanup(now: number, windowMs: number) {
    const cutoff = now - windowMs
    for (const [key, timestamps] of this.attempts) {
      const recent = timestamps.filter(time => time > cutoff)
      if (recent.length === 0) this.attempts.delete(key)
      else if (recent.length !== timestamps.length) this.attempts.set(key, recent)
    }
    this.nextCleanupAt = now + windowMs
  }
}
