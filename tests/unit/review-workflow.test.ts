import { describe, it, expect } from 'vitest';
import { accountReviewPreset, accountTimeChoices } from '../../apps/web/app/review-time';
import { canonicalQueueSearch, findNextReview } from '../../apps/web/app/review-session';
import type { ReviewGroups } from '@diary/contracts/review-queue';
describe('review workflow', () => {
  it('resolves account-local tomorrow through DST and rejects gaps', () => {
    expect(accountReviewPreset(new Date('2026-03-08T04:00:00Z'), 'America/New_York', 1)).toBe('2026-03-08T09:00');
    expect(accountTimeChoices('2026-03-08T09:00', 'America/New_York')).toEqual(['2026-03-08T13:00:00.000Z']);
    expect(accountTimeChoices('2026-03-08T02:30', 'America/New_York')).toEqual([]);
    expect(accountTimeChoices('2026-11-01T01:30', 'America/New_York')).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  });
  it('allows only schema-validated queue context', () => {
    expect(canonicalQueueSearch('target=diary&todayPage=2')).toContain('todayPage=2');
    expect(canonicalQueueSearch('returnTo=https://evil.test')).toBe('');
  });
  it('continues beyond a skipped first page and preserves mixed targets', async () => {
    const pages: number[] = [];
    const item = { targetType: 'diary' as const, id: '21', title: 'Next', date: '2026-09-01', thesis: null, risk: null, reviewDueAt: null, reviewStatus: 'none' as const, reviewedAt: null, reviewOutcome: null, stockSymbols: [] };
    const result = await findNextReview({ owner:'1',query:'',created:Date.now(),initial:21,completed:[],skipped:Array.from({length:20},(_,i)=>`diary:${i+1}`) }, async query => {
      pages.push(query.page);
      return { counts: { overdue:0,today:0,upcoming:0,unscheduled:21,completed:0 },overdue:[],today:[],upcoming:[],completed:[],unscheduled:query.page===1?Array.from({length:20},(_,i)=>({...item,id:String(i+1)})):[item] } satisfies ReviewGroups;
    });
    expect(result?.id).toBe('21'); expect(pages).toEqual([1,2]);
  });
  it('exhausts overdue pages before advancing to today', async () => {
    const item = { targetType: 'diary' as const, id: '21', title: 'Overdue', date: '2026-09-01', thesis: null, risk: null, reviewDueAt: null, reviewStatus: 'pending' as const, reviewedAt: null, reviewOutcome: null, stockSymbols: [] };
    const result = await findNextReview({ owner:'1',query:'',created:Date.now(),initial:22,completed:[],skipped:Array.from({length:20},(_,i)=>`diary:${i+1}`) }, async query => ({
      counts:{overdue:21,today:1,upcoming:0,unscheduled:0,completed:0},
      overdue:query.page===1?Array.from({length:20},(_,i)=>({...item,id:String(i+1)})):[item],
      today:query.page===1?[{...item,id:'22'}]:[],upcoming:[],unscheduled:[],completed:[],
    }));
    expect(result?.id).toBe('21');
  });
});
