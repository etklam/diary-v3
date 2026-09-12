import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPrivateSession, markSignedIn, safeReturnPath } from '../../apps/web/app/session';
import { draftValueForStorage, readDraft, type Draft } from '../../apps/web/app/quick-composer';
import { createEmptyQuickNoteTemplateData } from '@diary/domain';

function browserStorage() {
  const values: Record<string, unknown> = {
    getItem(key: string) { return typeof values[key] === 'string' ? values[key] : null; },
    setItem(key: string, value: string) { values[key] = String(value); },
    removeItem(key: string) { delete values[key]; },
    clear() { for (const key of Object.keys(values)) if (!['getItem', 'setItem', 'removeItem', 'clear'].includes(key)) delete values[key]; },
  };
  return values as unknown as Storage;
}

describe('capture session return and Quick draft lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', browserStorage());
    markSignedIn();
  });

  it('keeps canonical capture query state through the sign-in return allowlist', () => {
    expect(safeReturnPath('/diaries/quick?source=company&symbol=nvda&date=2026-09-12'))
      .toBe('/diaries/quick?symbol=NVDA&source=company&date=2026-09-12');
    expect(safeReturnPath('/diaries/new?symbol=NVDA&source=company')).toBe('/diaries/new?symbol=NVDA&source=company');
    expect(safeReturnPath('/diaries/quick?symbol=NVDA&source=company&next=https://outside.example')).toBe('/diaries/new');
  });

  it('preserves account-local Quick drafts during automatic invalidation', () => {
    localStorage.setItem('diary-quick-draft:account-a', 'draft');
    localStorage.setItem('diary-quick-reminder:account-a', 'reminder');

    clearPrivateSession();

    expect(localStorage.getItem('diary-quick-draft:account-a')).toBe('draft');
    expect(localStorage.getItem('diary-quick-reminder:account-a')).toBe('reminder');
  });

  it('clears Quick drafts for explicit and cross-tab logout', () => {
    localStorage.setItem('diary-quick-draft:account-a', 'draft');
    clearPrivateSession(true);
    expect(localStorage.getItem('diary-quick-draft:account-a')).toBeNull();

    localStorage.setItem('diary-quick-draft:account-b', 'draft');
    clearPrivateSession(false, true);
    expect(localStorage.getItem('diary-quick-draft:account-b')).toBeNull();
  });

  it('restores an uncertain append marker from the bounded local draft', () => {
    localStorage.setItem('diary-quick-draft:account-a', JSON.stringify({
      at: Date.now(),
      value: { date: '2026-09-12', title: 'Append', content: 'One copy', tags: '', kind: 'blank', data: {}, mode: 'append', uncertain: true },
    }));

    expect(readDraft('diary-quick-draft:account-a')?.uncertain).toBe(true);
  });

  it('keeps the uncertain marker when a later form update rewrites the draft', () => {
    const form: Draft = {
      date: '2026-09-12', title: 'Append', content: 'One copy', tags: '', stockSymbols: '',
      kind: 'blank', data: createEmptyQuickNoteTemplateData(), mode: 'append',
      titleTouched: true, contentTouched: true, applied: '',
    };
    const rewritten = draftValueForStorage({ ...form, title: 'Translated title' }, true);
    localStorage.setItem('diary-quick-draft:account-a', JSON.stringify({ at: Date.now(), value: rewritten }));

    expect(readDraft('diary-quick-draft:account-a')).toMatchObject({ title: 'Translated title', uncertain: true });
  });
});
