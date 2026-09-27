import { z } from 'zod';
import { reviewQueueQuerySchema, type ReviewGroups, type ReviewItem } from '@diary/contracts/review-queue';
export const reviewBuckets = ['overdue', 'today', 'upcoming', 'unscheduled'] as const;
const sessionSchema = z.object({
  owner: z.string().regex(/^[1-9]\d*$/), query: z.string().max(1000), created: z.number(),
  initial: z.number().int().nonnegative(), completed: z.array(z.string().max(80)).max(10000), skipped: z.array(z.string().max(80)).max(10000),
}).strict();
export type ReviewSession = z.infer<typeof sessionSchema>;
export function canonicalQueueSearch(value: string) {
  const parsed = reviewQueueQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(value)));
  if (!parsed.success) return '';
  const query = new URLSearchParams();
  for (const [key, item] of Object.entries(parsed.data)) if (item !== undefined) query.set(key, String(item));
  return query.toString();
}
export function reviewItemKey(item: ReviewItem) { return item.targetType === 'diary' ? `diary:${item.id}` : `thesis:${item.thesisId}`; }
export function reviewItemPath(item: ReviewItem, sessionId: string) {
  return `${item.targetType === 'diary' ? `/diaries/${item.id}/review` : `/stocks/${encodeURIComponent(item.symbol ?? '')}/thesis`}?reviewSession=${sessionId}`;
}
const key = (owner: string, id: string) => `review-session:${owner}:${id}`;
export function readReviewSession(owner: string, id: string): ReviewSession | null {
  if (!/^[a-f0-9-]{36}$/.test(id) || !owner) return null;
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(sessionStorage.getItem(key(owner, id)) ?? 'null'));
    if (!parsed.success || parsed.data.owner !== owner || Date.now() - parsed.data.created > 86_400_000 || parsed.data.created > Date.now()) return null;
    return { ...parsed.data, query: canonicalQueueSearch(parsed.data.query) };
  } catch { return null; }
}
export function writeReviewSession(id: string, value: ReviewSession) { sessionStorage.setItem(key(value.owner, id), JSON.stringify(sessionSchema.parse(value))); }
export function createReviewSession(owner: string, query: string, groups: ReviewGroups) {
  const id = crypto.randomUUID();
  const value: ReviewSession = { owner, query: canonicalQueueSearch(query), created: Date.now(), initial: reviewBuckets.reduce((total, bucket) => total + groups.counts[bucket], 0), completed: [], skipped: [] };
  writeReviewSession(id, value);
  return id;
}
/** Re-read from page one after every completion: offset pages compact when reviewed items leave. */
export async function findNextReview(value: ReviewSession, read: (query: z.output<typeof reviewQueueQuerySchema>) => Promise<ReviewGroups>) {
  const parsed = reviewQueueQuerySchema.parse(Object.fromEntries(new URLSearchParams(value.query)));
  const handled = new Set([...value.completed, ...value.skipped]);
  const pages = new Map<number, ReviewGroups>();
  for (const bucket of reviewBuckets) {
    for (let page = 1; ; page++) {
      let groups = pages.get(page);
      if (!groups) {
        groups = await read({ page, limit: 20, ...(parsed.target ? { target: parsed.target } : {}) });
        pages.set(page, groups);
      }
      const found = groups[bucket].find(item => !handled.has(reviewItemKey(item)) && (item.targetType === 'diary' || item.symbol));
      if (found) return found;
      if (page * 20 >= groups.counts[bucket]) break;
    }
  }
  return null;
}
