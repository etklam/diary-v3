import type { SecCacheStatus } from '@diary/contracts/sec-filings'

/**
 * Default ceiling on everything the SEC metadata caches retain, in bytes.
 *
 * The caches previously capped entry *counts* only — 250 submissions, 500
 * historical segments, 500 filing indexes — which multiplies by an unbounded
 * entry size. The 2026-09-27 audit did the arithmetic: 500 filing indexes
 * retaining both JSON and rendered HTML, each bounded only by the 5 MiB
 * response ceiling, exceeds the 768 MiB pod limit on its own. No failure was
 * ever observed, so this is a bound the process could not previously make
 * rather than an incident.
 *
 * 64 MiB is deliberately well under the pod limit: the API also holds the
 * market cache, the rate limiter and the usual heap, and the SEC *download*
 * path's large buffers are bounded separately against ephemeral storage, not
 * memory.
 */
export const SEC_CACHE_DEFAULT_MAX_BYTES = 64 * 1024 * 1024

/**
 * Retained bytes across every SEC metadata cache.
 *
 * Shared rather than per-cache because the audit's budget was the sum: four
 * caches each under its own generous ceiling can still exceed the pod together.
 * A cache that inserts is the one that evicts, from its own LRU end, until the
 * shared total fits. That keeps the accounting trivial and bounds the total at
 * the ceiling plus one entry — a single entry is itself bounded by the 5 MiB
 * response ceiling in the client.
 */
export class SecCacheBudget {
  private retained = 0

  constructor(readonly maxBytes: number = SEC_CACHE_DEFAULT_MAX_BYTES) {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('SEC cache budget must be a positive byte count')
  }

  get retainedBytes(): number {
    return this.retained
  }

  get exceeded(): boolean {
    return this.retained > this.maxBytes
  }

  add(bytes: number) {
    this.retained += bytes
  }

  release(bytes: number) {
    this.retained -= bytes
    // Defensive: an accounting slip must not make the budget permanently
    // negative and so permanently unenforceable.
    if (this.retained < 0) this.retained = 0
  }
}

/**
 * Retained size of a parsed JSON payload, as the bytes it took on the wire.
 *
 * This is an approximation of heap cost, not a measurement of it: V8 object
 * overhead and UTF-16 string storage both exceed it. It is the right
 * approximation for this budget because it is proportional to what the cache
 * chose to keep and is directly comparable to the 5 MiB response ceiling the
 * client enforces on the way in.
 */
export function approximateRetainedBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? 0 : Buffer.byteLength(serialized, 'utf8')
  } catch {
    // A value that cannot be serialized (a cycle) is still retained, so charge
    // something rather than nothing.
    return 1024
  }
}

interface CacheOptions<V> {
  freshMs: number
  staleMs: number
  maxEntries: number
  budget: SecCacheBudget
  sizeOf?: (value: V) => number
  now?: () => number
}

interface CacheEntry<V> {
  value: V
  loadedAt: number
  bytes: number
}

export interface SecCacheResult<V> {
  value: V
  stale: boolean
  cacheStatus: SecCacheStatus
  fetchedAt: string
}

export class SecMemoryCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>()
  private readonly inflight = new Map<K, Promise<SecCacheResult<V>>>()
  private readonly now: () => number
  private readonly sizeOf: (value: V) => number

  constructor(private readonly options: CacheOptions<V>) {
    this.now = options.now ?? Date.now
    this.sizeOf = options.sizeOf ?? approximateRetainedBytes
  }

  has(key: K): boolean {
    return this.entries.has(key)
  }

  /** Bytes this cache alone retains. Exposed for capacity evidence. */
  get retainedBytes(): number {
    let total = 0
    for (const entry of this.entries.values()) total += entry.bytes
    return total
  }

  get size(): number {
    return this.entries.size
  }

  async getOrLoad(key: K, loader: () => Promise<V>): Promise<SecCacheResult<V>> {
    const timestamp = this.now()
    const existing = this.entries.get(key)
    if (existing && timestamp - existing.loadedAt <= this.options.freshMs) {
      this.touch(key, existing)
      return this.result(existing, 'hit', false)
    }

    const pending = this.inflight.get(key)
    if (pending) return pending

    const promise = (async () => {
      try {
        const value = await loader()
        const entry = { value, loadedAt: this.now(), bytes: this.sizeOf(value) }
        this.store(key, entry)
        this.evict()
        return this.result(entry, 'miss', false)
      } catch (error) {
        const retryable = Boolean(error && typeof error === 'object' && 'retryable' in error && error.retryable)
        if (existing && retryable && timestamp - existing.loadedAt <= this.options.freshMs + this.options.staleMs) {
          // A served-stale entry must still be present: a budget eviction
          // between the read and the failed refresh removed its accounting.
          if (!this.entries.has(key)) {
            this.store(key, existing)
            this.evict()
          }
          this.touch(key, existing)
          return this.result(existing, 'stale', true)
        }
        throw error
      } finally {
        this.inflight.delete(key)
      }
    })()
    this.inflight.set(key, promise)
    return promise
  }

  private store(key: K, entry: CacheEntry<V>) {
    const replaced = this.entries.get(key)
    if (replaced) this.options.budget.release(replaced.bytes)
    this.entries.set(key, entry)
    this.options.budget.add(entry.bytes)
  }

  private remove(key: K): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false
    this.entries.delete(key)
    this.options.budget.release(entry.bytes)
    return true
  }

  private result(entry: CacheEntry<V>, cacheStatus: SecCacheStatus, stale: boolean): SecCacheResult<V> {
    return { value: entry.value, stale, cacheStatus, fetchedAt: new Date(entry.loadedAt).toISOString() }
  }

  private touch(key: K, entry: CacheEntry<V>) {
    this.entries.delete(key)
    this.entries.set(key, entry)
  }

  /**
   * Entry count stays a ceiling, and the shared byte budget is the one that
   * actually bounds memory. Eviction walks this cache's LRU end for both.
   *
   * The byte rule stops at one entry rather than emptying the cache: when
   * another cache holds most of the bytes, evicting everything here would
   * thrash without fixing the total, and that other cache will shrink on its
   * own next insert. The worst case is therefore the ceiling plus one entry per
   * cache, and a single entry is bounded by the client's 5 MiB response limit.
   */
  private evict() {
    while (this.entries.size > this.options.maxEntries || (this.options.budget.exceeded && this.entries.size > 1)) {
      const oldest = this.entries.keys().next().value as K | undefined
      if (oldest === undefined) break
      if (!this.remove(oldest)) break
    }
  }
}
