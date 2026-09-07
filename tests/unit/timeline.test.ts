import { describe,it,expect } from 'vitest';
import { mergeTimelineEntries,groupTimelineEntries,projectTimelineEntry,diaryExcerpt } from '@diary/domain';
describe('Timeline projection',()=>{
 it('deduplicates repeated IDs inside one page and overlapping pages without replacing earlier content',()=>{expect(mergeTimelineEntries([{id:'1',title:'Original'}],[{id:'1',title:'Overlap'},{id:'2',title:'New'},{id:'2',title:'Duplicate'}])).toEqual([{id:'1',title:'Original'},{id:'2',title:'New'}]);});
 it('orders civil dates and decimal IDs without lexical or floating-point corruption',()=>{expect(groupTimelineEntries([{id:'2',date:'2026-09-01'},{id:'10',date:'2026-09-01'},{id:'9007199254740993',date:'2026-09-01'},{id:'1',date:'2026-08-31'}])).toEqual([{period:'2026-09',entries:[{id:'9007199254740993',date:'2026-09-01'},{id:'10',date:'2026-09-01'},{id:'2',date:'2026-09-01'}]},{period:'2026-08',entries:[{id:'1',date:'2026-08-31'}]}]);});
 it('omits private Review text while retaining allowed outcome/count signals and original diary writing',()=>{const source={id:'1',date:'2026-09-05',title:'Before',content:'Original Markdown',tags:['one','two','three'],stockSymbols:['NVDA','AAPL'],reviewStatus:'reviewed',reviewOutcome:'PARTIAL',reviewSummary:'Private review',reviewLearning:'Private lesson',reviewAdjustment:'Private change',transactions:[{}],alerts:[{isDismissed:false},{isDismissed:true}]};const projection=projectTimelineEntry(source);expect(projection).toEqual({id:'1',date:'2026-09-05',title:'Before',content:'Original Markdown',tags:['one','two'],stockSymbols:['NVDA','AAPL'],reviewed:true,reviewOutcome:'PARTIAL',transactionCount:1,alertCount:1});expect(JSON.stringify(projection)).not.toContain('Private');});
 it('keeps source-compatible compact Markdown summary without modifying the original content',()=>{expect(diaryExcerpt('## Heading\n\n**Evidence**\n- Wait')).toBe('Heading Evidence Wait');});
 it('strips fences, link targets and bare URLs while keeping link labels and words intact',()=>{
  expect(diaryExcerpt('```js\nconst x = 1;\n```\nRead [the report](https://example.test/very/long/path) at https://cdn.example.test/a/very/long/image.png now')).toBe('Read the report at now');
  expect(diaryExcerpt('Well-known hyphens stay')).toBe('Well-known hyphens stay');
  expect(diaryExcerpt(null)).toBe('');
 });
 it('truncates on a word boundary and never returns a dangling partial word',()=>{
  const long='word '.repeat(80);
  const excerpt=diaryExcerpt(long,40);
  expect(excerpt.length).toBeLessThanOrEqual(41);
  expect(excerpt.endsWith('…')).toBe(true);
  expect(excerpt.endsWith('word…')).toBe(true);
  const cjk=diaryExcerpt('判'.repeat(120),40);
  expect(cjk.length).toBe(41);
  expect(cjk.endsWith('…')).toBe(true);
 });
});
