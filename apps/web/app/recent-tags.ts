import { useEffect, useState } from 'react';
import { recentDiaryTagsResponseSchema } from '@diary/contracts/diary-tags';
import { api } from './ui';

export const RECENT_TAG_LIMIT = 8;
const PREFIX = 'diary-recent-tags:';

export function recentTagsKey(accountId: string): string {
  return `${PREFIX}${accountId}`;
}

function clean(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map(tag => tag.trim())
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, RECENT_TAG_LIMIT);
}

export function readRecentTags(accountId: string): string[] {
  if (!accountId) return [];
  try {
    return clean(JSON.parse(localStorage.getItem(recentTagsKey(accountId)) ?? '[]'));
  } catch {
    return [];
  }
}

export function rememberRecentTags(accountId: string, tags: readonly string[]): string[] {
  if (!accountId) return [];
  const next = clean([...tags, ...readRecentTags(accountId)]);
  try {
    localStorage.setItem(recentTagsKey(accountId), JSON.stringify(next));
  } catch {
    // Suggestions are optional and never block a confirmed save.
  }
  return next;
}

export function clearRecentTags(accountId: string): void {
  if (!accountId) return;
  try {
    localStorage.removeItem(recentTagsKey(accountId));
  } catch {
    // Private local data is best effort when storage is unavailable.
  }
}

/** Replace the device cache with the account's own tags, so the next cold start
 *  and any offline mount start from what the account actually tagged. */
function storeRecentTags(accountId: string, tags: readonly string[]): string[] {
  const next = clean(tags);
  try {
    localStorage.setItem(recentTagsKey(accountId), JSON.stringify(next));
  } catch {
    // Suggestions are optional and never block a confirmed save.
  }
  return next;
}

/**
 * Suggestions come from the account's saved diaries, so they appear on a device
 * that has never written one. The device cache stays as the offline fallback and
 * as the optimistic update after a save, which still surfaces its own tags
 * without waiting for a refetch. A failed read changes nothing.
 */
export function useRecentTags(accountId: string): [string[], (tags: readonly string[]) => void] {
  const [tags, setTags] = useState<string[]>(() => readRecentTags(accountId));
  useEffect(() => setTags(readRecentTags(accountId)), [accountId]);
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    api.GET('/api/diaries/recent-tags').then(result => {
      if (!active || !result.response.ok) return;
      const parsed = recentDiaryTagsResponseSchema.safeParse(result.data);
      if (parsed.success) setTags(storeRecentTags(accountId, parsed.data.tags));
    }).catch(() => { /* Suggestions never block writing. */ });
    return () => { active = false; };
  }, [accountId]);
  return [tags, values => setTags(rememberRecentTags(accountId, values))];
}

