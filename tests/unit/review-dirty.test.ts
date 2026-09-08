import { describe,expect,it } from 'vitest';
import { normalizeReview,sameReview } from '../../apps/web/app/routes/diary-review';

type Form=Parameters<typeof normalizeReview>[0];
const form=(overrides:Partial<Form>={}):Form=>({reviewOutcome:'PARTIAL',reviewSummary:'Saved summary',reviewLearning:'Saved learning',reviewAdjustment:'',...overrides});
const clean=(raw:Partial<Form>,saved:Partial<Form>)=>sameReview(normalizeReview(form(raw)),normalizeReview(form(saved)));

describe('diary review dirty comparison',()=>{
 it('treats surrounding whitespace as clean',()=>{
  expect(clean({reviewSummary:'  x  '},{reviewSummary:'x'})).toBe(true);
  expect(clean({reviewLearning:'\tx\n'},{reviewLearning:'x'})).toBe(true);
 });
 it('treats empty and whitespace-only reflections as equal to null',()=>{
  expect(clean({reviewSummary:''},{reviewSummary:''})).toBe(true);
  expect(clean({reviewAdjustment:'   '},{reviewAdjustment:''})).toBe(true);
 });
 it('marks real reflection edits as dirty',()=>{
  expect(clean({reviewLearning:'A new lesson'},{reviewLearning:'Saved learning'})).toBe(false);
  expect(clean({reviewAdjustment:'Cut losses sooner'},{reviewAdjustment:''})).toBe(false);
 });
 it('marks an outcome-only change as dirty until the original returns',()=>{
  expect(clean({reviewOutcome:'INTACT'},{reviewOutcome:'PARTIAL'})).toBe(false);
  expect(clean({reviewOutcome:'INTACT'},{reviewOutcome:'INTACT'})).toBe(true);
  expect(sameReview(normalizeReview(form({reviewOutcome:'INTACT',reviewLearning:'Saved learning'})),normalizeReview(form({reviewOutcome:'PARTIAL',reviewLearning:'Saved learning'})))).toBe(false);
 });
 it('reads an unselected outcome as still unsaved against a completed baseline',()=>{
  expect(sameReview(normalizeReview(form({reviewOutcome:''})),normalizeReview(form({reviewOutcome:'PARTIAL'})))).toBe(false);
 });
});
