import { useEffect, useState } from 'react'
import { reviewGroupsResponseSchema } from '@diary/contracts/review-queue'
import { api } from './ui'
import { useSessionState } from './session'

/**
 * How many reviews need attention now — overdue plus due today. Upcoming and
 * unscheduled items are deliberately excluded: a navigation badge is a count of
 * work waiting, not a backlog total.
 *
 * The queue endpoint computes every bucket in one snapshot, so this asks for the
 * smallest possible page and keeps the counts. One shared in-flight request and
 * a short cache keep a count that appears on every route from turning into a
 * request per navigation.
 */
const TTL_MS = 60_000
const REFRESH_EVENTS = ['diary-quick-saved', 'diary-reminders-changed'] as const
let cache: { revision: number; expires: number; count: number } | undefined
let pending: { revision: number; promise: Promise<number> } | undefined

export function invalidateReviewCount() {
  cache = undefined
  pending = undefined
}

async function fetchCount(revision: number): Promise<number> {
  if (cache?.revision === revision && cache.expires > Date.now()) return cache.count
  if (!pending || pending.revision !== revision) {
    const work = {
      revision,
      promise: api.GET('/api/reviews', { params: { query: { limit: 1 } } }).then(result => {
        if (!result.response.ok || !result.data) throw new Error('Review count unavailable')
        const { counts } = reviewGroupsResponseSchema.parse(result.data)
        const count = counts.overdue + counts.today
        cache = { revision, expires: Date.now() + TTL_MS, count }
        return count
      }).finally(() => { if (pending?.revision === revision) pending = undefined }),
    }
    pending = work
  }
  return pending.promise
}

/** Null until known, and null whenever the count cannot be read — a badge never
 * guesses, and a failed read leaves the navigation item unannotated. */
export function useReviewCount(): number | null {
  const session = useSessionState()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (session.authenticated !== true) { setCount(null); return }
    let active = true
    const load = () => {
      fetchCount(session.revision)
        .then(value => { if (active) setCount(value) })
        .catch(() => { if (active) setCount(null) })
    }
    const refresh = () => { invalidateReviewCount(); load() }
    load()
    // A quick capture can schedule a review, and completing or rescheduling one
    // changes what is still waiting.
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refresh)
    return () => {
      active = false
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refresh)
    }
  }, [session.authenticated, session.revision])

  return count
}
