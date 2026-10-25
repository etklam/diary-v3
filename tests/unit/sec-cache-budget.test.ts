import { describe, expect, it } from 'vitest'
import {
  SEC_CACHE_DEFAULT_MAX_BYTES,
  SecCacheBudget,
  SecMemoryCache,
  approximateRetainedBytes,
} from '../../apps/api/src/sec-edgar/cache.js'

// The entry-count caps bound how many payloads are kept, never how large they
// are: 500 filing indexes retaining JSON and HTML, each bounded only by the
// 5 MiB response ceiling, exceeds the 768 MiB pod limit by itself. These tests
// pin the byte budget that closes that arithmetic.

/** A payload of a known serialized size, so the budget arithmetic is checkable. */
function payload(bytes: number) {
  // `{"body":"…"}` costs 11 bytes of envelope around the filler.
  return { body: 'x'.repeat(Math.max(0, bytes - 11)) }
}

const KIB = 1024

describe('SEC metadata cache byte budget', () => {
  it('measures a payload as the bytes it took on the wire', () => {
    expect(approximateRetainedBytes(payload(4 * KIB))).toBe(4 * KIB)
    expect(approximateRetainedBytes(undefined)).toBe(0)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    // A value that cannot be serialized is still retained, so it is charged.
    expect(approximateRetainedBytes(cyclic)).toBeGreaterThan(0)
  })

  it('refuses a budget that could not bound anything', () => {
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new SecCacheBudget(invalid)).toThrow(/positive byte count/)
    }
    expect(new SecCacheBudget().maxBytes).toBe(SEC_CACHE_DEFAULT_MAX_BYTES)
  })

  it('keeps retained bytes bounded while the entry count cap is nowhere near reached', async () => {
    const budget = new SecCacheBudget(16 * KIB)
    const cache = new SecMemoryCache<string, { body: string }>({
      freshMs: 60_000,
      staleMs: 60_000,
      maxEntries: 500,
      budget,
    })

    for (let index = 0; index < 40; index += 1) {
      await cache.getOrLoad(`key-${index}`, async () => payload(4 * KIB))
    }

    // 40 × 4 KiB = 160 KiB offered against a 16 KiB ceiling. The count cap of
    // 500 would have admitted every one of them.
    expect(cache.size).toBeLessThan(40)
    expect(budget.retainedBytes).toBeLessThanOrEqual(budget.maxBytes + 4 * KIB)
    expect(cache.retainedBytes).toBe(budget.retainedBytes)
  })

  it('re-fetches an evicted entry rather than serving it stale', async () => {
    const budget = new SecCacheBudget(8 * KIB)
    const cache = new SecMemoryCache<string, { body: string }>({
      freshMs: 60_000,
      staleMs: 60_000,
      maxEntries: 500,
      budget,
    })
    let loads = 0
    const load = async () => {
      loads += 1
      return payload(5 * KIB)
    }

    const first = await cache.getOrLoad('a', load)
    expect(first.cacheStatus).toBe('miss')
    // Pushes the total past the ceiling, evicting 'a' as the LRU end.
    await cache.getOrLoad('b', load)
    expect(cache.has('a')).toBe(false)

    const again = await cache.getOrLoad('a', load)
    expect(again.cacheStatus).toBe('miss')
    expect(again.stale).toBe(false)
    expect(loads).toBe(3)
  })

  it('still serves a fresh entry from memory without reloading', async () => {
    const budget = new SecCacheBudget(1024 * KIB)
    const cache = new SecMemoryCache<string, { body: string }>({
      freshMs: 60_000,
      staleMs: 60_000,
      maxEntries: 500,
      budget,
    })
    let loads = 0
    const load = async () => {
      loads += 1
      return payload(2 * KIB)
    }

    await cache.getOrLoad('a', load)
    const hit = await cache.getOrLoad('a', load)
    expect(hit.cacheStatus).toBe('hit')
    expect(loads).toBe(1)
    expect(budget.retainedBytes).toBe(2 * KIB)
  })

  it('keeps the entry-count cap as a secondary ceiling', async () => {
    const budget = new SecCacheBudget(1024 * KIB)
    const cache = new SecMemoryCache<string, { body: string }>({
      freshMs: 60_000,
      staleMs: 60_000,
      maxEntries: 3,
      budget,
    })
    for (let index = 0; index < 10; index += 1) {
      await cache.getOrLoad(`key-${index}`, async () => payload(1 * KIB))
    }
    expect(cache.size).toBe(3)
    expect(budget.retainedBytes).toBe(3 * KIB)
  })

  it('accounts one budget across caches, so their sum is what is bounded', async () => {
    const budget = new SecCacheBudget(20 * KIB)
    const options = { freshMs: 60_000, staleMs: 60_000, maxEntries: 500, budget }
    const submissions = new SecMemoryCache<string, { body: string }>(options)
    const indexes = new SecMemoryCache<string, { body: string }>(options)

    for (let index = 0; index < 5; index += 1) {
      await submissions.getOrLoad(`s-${index}`, async () => payload(4 * KIB))
    }
    expect(budget.retainedBytes).toBe(20 * KIB)

    // The inserting cache pays: it evicts its own LRU end until the shared
    // total fits, and the other cache is untouched until it next inserts.
    await indexes.getOrLoad('i-0', async () => payload(8 * KIB))
    expect(submissions.retainedBytes + indexes.retainedBytes).toBe(budget.retainedBytes)
    expect(budget.retainedBytes).toBeLessThanOrEqual(budget.maxBytes + 8 * KIB)
    expect(indexes.size).toBe(1)
  })

  it('releases bytes when an entry is replaced, not just when it is evicted', async () => {
    const budget = new SecCacheBudget(1024 * KIB)
    const cache = new SecMemoryCache<string, { body: string }>({
      freshMs: -1,
      staleMs: 0,
      maxEntries: 500,
      budget,
    })
    await cache.getOrLoad('a', async () => payload(6 * KIB))
    // freshMs of -1 makes every read a refresh, so this replaces the entry.
    await cache.getOrLoad('a', async () => payload(2 * KIB))
    expect(cache.size).toBe(1)
    expect(budget.retainedBytes).toBe(2 * KIB)
  })
})
