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
  const sorted = [...events].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    const rank = ACTIVITY_KIND_RANK[a.kind] - ACTIVITY_KIND_RANK[b.kind]
    if (rank !== 0) return rank
    const left = sourceId(a.id), right = sourceId(b.id)
    return left > right ? -1 : left < right ? 1 : 0
  })
  const groups = new Map<string, T[]>()
  for (const event of sorted) {
    const month = event.date.slice(0, 7)
    const group = groups.get(month)
    if (group) group.push(event)
    else groups.set(month, [event])
  }
  return [...groups].map(([period, entries]) => ({ period, entries }))
}
