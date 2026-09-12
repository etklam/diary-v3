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

  it('keeps the comparison selection and allowlisted limit through sign-in returns', () => {
    expect(safeReturnPath('/partners/compare')).toBe('/partners/compare');
    expect(safeReturnPath('/partners/compare?partnerId=42')).toBe('/partners/compare?partnerId=42');
    expect(safeReturnPath('/partners/compare?partnerId=42&limit=40')).toBe('/partners/compare?partnerId=42&limit=40');
    expect(safeReturnPath('/partners/compare?limit=60&partnerId=42')).toBe('/partners/compare?limit=60&partnerId=42');
    expect(safeReturnPath('/partners/compare?limit=60')).toBe('/partners/compare?limit=60');
    expect(safeReturnPath('/partners/compare?limit=99')).toBe('/diaries/new');
    expect(safeReturnPath('/partners/compare?partnerId=42&tab=all')).toBe('/diaries/new');
    expect(safeReturnPath('/partners/compare?partnerId=0&limit=40')).toBe('/diaries/new');
    expect(safeReturnPath('/admin/blog/42/edit')).toBe('/admin/blog/42/edit');
    expect(safeReturnPath('/admin/blog/9223372036854775807/edit')).toBe('/admin/blog/9223372036854775807/edit');
    expect(safeReturnPath('/admin/blog/9223372036854775808/edit')).toBe('/diaries/new');
    expect(safeReturnPath('/admin/blog/42/edit?publish=true')).toBe('/diaries/new');
    expect(safeReturnPath('//outside.example/admin/blog/42/edit')).toBe('/diaries/new');
  });

  it('preserves account-local Quick drafts during automatic invalidation', () => {
    localStorage.setItem('diary-quick-draft:account-a', 'draft');
    localStorage.setItem('diary-quick-reminder:account-a', 'reminder');
    localStorage.setItem('post-editor-draft:account-a:new', 'article');

    clearPrivateSession();

    expect(localStorage.getItem('diary-quick-draft:account-a')).toBe('draft');
    expect(localStorage.getItem('diary-quick-reminder:account-a')).toBe('reminder');
    expect(localStorage.getItem('post-editor-draft:account-a:new')).toBe('article');
  });

  it('clears Quick drafts for explicit and cross-tab logout', () => {
    localStorage.setItem('diary-quick-draft:account-a', 'draft');
    localStorage.setItem('post-editor-draft:account-a:42', 'article');
    clearPrivateSession(true);
    expect(localStorage.getItem('diary-quick-draft:account-a')).toBeNull();
    expect(localStorage.getItem('post-editor-draft:account-a:42')).toBeNull();

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
