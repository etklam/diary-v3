import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraftEnvelope, flushCapturedDraft, readDraftEnvelope, writeDraftEnvelope } from '../../apps/web/app/draft-lifecycle';
import { clearRecentTags, readRecentTags, rememberRecentTags } from '../../apps/web/app/recent-tags';
import { safeReturnPath } from '../../apps/web/app/session';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => { values.clear(); },
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

describe('authoring local lifecycle storage', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps recent tags account-scoped, bounded, newest first, and whole', () => {
    rememberRecentTags('account-a', ['earnings, call', '長標籤']);
    rememberRecentTags('account-a', ['new-tag', 'earnings, call']);
    rememberRecentTags('account-a', Array.from({ length: 10 }, (_, index) => `tag-${index}`));

    expect(readRecentTags('account-a')).toEqual([
      'tag-0', 'tag-1', 'tag-2', 'tag-3', 'tag-4', 'tag-5', 'tag-6', 'tag-7',
    ]);
    expect(readRecentTags('account-b')).toEqual([]);
    clearRecentTags('account-a');
    expect(readRecentTags('account-a')).toEqual([]);
  });

  it('writes and reads the shared envelope while rejecting stale entries', () => {
    expect(writeDraftEnvelope('diary-editor-draft:account-a:new', { content: 'draft' })).toBe(true);
    expect(readDraftEnvelope<{ content: string }>('diary-editor-draft:account-a:new')).toEqual({ content: 'draft' });

    const staleAt = Date.now() - 86_400_001;
    writeDraftEnvelope('review-draft:account-a:1', { content: 'old' }, staleAt);
    expect(readDraftEnvelope('review-draft:account-a:1')).toBeNull();
    clearDraftEnvelope('diary-editor-draft:account-a:new');
    expect(readDraftEnvelope('diary-editor-draft:account-a:new')).toBeNull();
  });

  it('reports unavailable storage instead of claiming a preserved draft', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(writeDraftEnvelope('diary-editor-draft:account-a:new', { content: 'draft' })).toBe(false);
    expect(readDraftEnvelope('diary-editor-draft:account-a:new')).toBeNull();
  });

  it('flushes the committed key and value captured by a lifecycle callback', () => {
    const suppressed = new Set<string>();
    const accountA = 'diary-editor-draft:account-a:new';
    const accountB = 'diary-editor-draft:account-b:new';

    expect(flushCapturedDraft({ key: accountA, value: { content: 'account A' }, dirty: true, paused: false }, suppressed)).toBe(true);
    expect(flushCapturedDraft({ key: accountB, value: { content: 'account B' }, dirty: true, paused: false }, suppressed)).toBe(true);
    expect(readDraftEnvelope<{ content: string }>(accountA)).toEqual({ content: 'account A' });
    expect(readDraftEnvelope<{ content: string }>(accountB)).toEqual({ content: 'account B' });
  });

  it('suppresses a captured callback after a confirmed save clears the draft', () => {
    const key = 'diary-editor-draft:account-a:42';
    const suppressed = new Set([key]);

    expect(flushCapturedDraft({ key, value: { content: 'stale after save' }, dirty: true, paused: false }, suppressed)).toBe(false);
    expect(readDraftEnvelope(key)).toBeNull();
  });

  it('keeps the review schedule continuation through sign-in return validation', () => {
    const target = '/diaries/42/review';
    const continuation = `/diaries/42/edit?returnTo=${encodeURIComponent(target)}#review-schedule`;
    expect(safeReturnPath(continuation)).toBe(continuation);
    expect(safeReturnPath(`${continuation.slice(0, -1)}x`)).toBe('/diaries/new');
    expect(safeReturnPath(`/diaries/42/edit?returnTo=${encodeURIComponent('/diaries/99/review')}#review-schedule`)).toBe('/diaries/new');
  });
});
