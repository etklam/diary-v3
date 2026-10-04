import { ACTIVITY_KIND_RANK, type ActivityEvent } from '@diary/contracts/activity-timeline'

type Groupable = { id: string; date: string; kind: ActivityEvent['kind'] }

/**
 * Keep the first received record. Event ids are `<KIND>:<row id>`, unique
 * across kinds, so an overlapping page cannot replace content already read —
 * the same guarantee mergeTimelineEntries gives the diary-only feed, without
 * assuming the id is a bare integer.
 */
export function mergeActivityEvents<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const seen = new Set<string>()
  return [...existing, ...incoming].filter(event => {
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  })
}

/** Numeric suffix of an event id, compared as BigInt so large ids stay exact. */
function sourceId(id: string): bigint {
  const digits = id.slice(id.indexOf(':') + 1)
  return /^\d+$/.test(digits) ? BigInt(digits) : 0n
}

/**
 * Month buckets, newest first. Inside a date the kind rank decides the order —
 * diary, trades, then reviews — and the source id breaks the final tie
 * descending, matching the server's ordering exactly so a page boundary never
 * reshuffles a day the reader has already seen.
 */
export function groupActivityEvents<T extends Groupable>(events: readonly T[]): Array<{ period: string; entries: T[] }> {
  return groupBy(sortActivityEvents(events), event => event.date.slice(0, 7)).map(([period, entries]) => ({ period, entries }))
}

/**
 * Days inside one month bucket, in the order the month already reads. A day is
 * the feed's unit of meaning — the diary that framed it, the trades it produced
 * and the reviews that closed earlier judgments — so the records of one date
 * stay one block instead of each repeating the date.
 *
 * Input must already be sorted, which is what groupActivityEvents returns.
 */
export function groupActivityDays<T extends { date: string }>(entries: readonly T[]): Array<{ date: string; entries: T[] }> {
  return groupBy(entries, entry => entry.date).map(([date, group]) => ({ date, entries: group }))
}

/** Buckets by key, each bucket and the bucket order following arrival order. */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const found = groups.get(key(item))
    if (found) found.push(item)
    else groups.set(key(item), [item])
  }
  return [...groups]
}

function sortActivityEvents<T extends Groupable>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    const rank = ACTIVITY_KIND_RANK[a.kind] - ACTIVITY_KIND_RANK[b.kind]
    if (rank !== 0) return rank
    const left = sourceId(a.id), right = sourceId(b.id)
    return left > right ? -1 : left < right ? 1 : 0
  })
}
