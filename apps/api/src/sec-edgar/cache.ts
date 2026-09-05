import type { SecCacheStatus } from '@diary/contracts/sec-filings'

interface CacheOptions {
  freshMs: number
  staleMs: number
  maxEntries: number
  now?: () => number
}

interface CacheEntry<V> {
  value: V
  loadedAt: number
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

  constructor(private readonly options: CacheOptions) {
    this.now = options.now ?? Date.now
  }

  has(key: K): boolean { return this.entries.has(key) }

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
        const entry = { value, loadedAt: this.now() }
        this.entries.set(key, entry)
        this.evict()
        return this.result(entry, 'miss', false)
      } catch (error) {
        const retryable = Boolean(error && typeof error === 'object' && 'retryable' in error && error.retryable)
        if (existing && retryable && timestamp - existing.loadedAt <= this.options.freshMs + this.options.staleMs) {
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

  private result(entry: CacheEntry<V>, cacheStatus: SecCacheStatus, stale: boolean): SecCacheResult<V> {
    return { value: entry.value, stale, cacheStatus, fetchedAt: new Date(entry.loadedAt).toISOString() }
  }

  private touch(key: K, entry: CacheEntry<V>) {
    this.entries.delete(key)
    this.entries.set(key, entry)
  }

  private evict() {
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value as K | undefined
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }
}
