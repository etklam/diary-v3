import { useEffect, useState } from 'react';

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

export function useRecentTags(accountId: string): [string[], (tags: readonly string[]) => void] {
  const [tags, setTags] = useState<string[]>(() => readRecentTags(accountId));
  useEffect(() => setTags(readRecentTags(accountId)), [accountId]);
  return [tags, values => setTags(rememberRecentTags(accountId, values))];
}

