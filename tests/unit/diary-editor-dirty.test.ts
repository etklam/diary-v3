import { describe,expect,it } from 'vitest';
import { canonicalState,sameEditable,type EditorSources } from '../../apps/web/app/diary-editor';
import type { BuyDraft } from '../../apps/web/app/buy-transaction-fields';

const draft=(overrides:Partial<BuyDraft>={}):BuyDraft=>({key:'k1',type:'BUY',symbol:'NVDA',quantity:'1.5',price:'180.25',tradeDate:'2026-01-02T10:30',instant:'',notes:'',strategy:'',emotion:'',...overrides});
const sources=(transactions:BuyDraft[]):EditorSources=>({form:{date:'2026-01-02',title:'Title',content:'Content',tags:['tag'],thesis:null,risk:null,execution:null},stockSymbols:'',transactions,reviewTime:'',reviewInstant:'',reminders:[]});
const same=(raw:Partial<BuyDraft>,saved:Partial<BuyDraft>)=>sameEditable(canonicalState(sources([draft(raw)])),canonicalState(sources([draft(saved)])));

describe('diary editor transaction dirty comparison',()=>{
 it('treats equivalent decimal notations as clean',()=>{
  expect(same({quantity:'01.5000'},{quantity:'1.5'})).toBe(true);
  expect(same({quantity:'2'},{quantity:'2.0000'})).toBe(true);
  expect(same({price:'180.2500'},{price:'180.25'})).toBe(true);
  expect(same({price:'050'},{price:'50'})).toBe(true);
 });
 it('treats symbol case and surrounding whitespace as clean',()=>{
  expect(same({symbol:'nvda'},{symbol:'NVDA'})).toBe(true);
  expect(same({symbol:' nvda '},{symbol:'NVDA'})).toBe(true);
 });
 it('keeps empty or invalid values dirty against a saved baseline',()=>{
  for(const value of ['12.3.4','','abc','0','0.000'])expect(same({quantity:value},{quantity:'1.5'})).toBe(false);
  expect(same({price:'0'},{price:'180.25'})).toBe(false);
  expect(same({symbol:''},{symbol:'NVDA'})).toBe(false);
 });
 it('compares whole editor sources end to end',()=>{
  const saved=canonicalState(sources([draft({})]));
  const raw=canonicalState(sources([draft({symbol:'nvda',quantity:'01.5000',price:'180.2500'})]));
  expect(sameEditable(raw,saved)).toBe(true);
  expect(sameEditable(canonicalState(sources([draft({quantity:'2'})])),saved)).toBe(false);
 expect(sameEditable(canonicalState(sources([draft({price:'180.26'})])),saved)).toBe(false);
 });
});

describe('diary editor reminder dirty comparison',()=>{
 it('tracks reminder changes against the confirmed baseline',()=>{
  const saved=sources([]);
  saved.reminders=[{key:'1',message:'Review fill',time:'2026-01-03T09:00',instant:'2026-01-03T01:00:00.000Z',mode:''}];
  const changed=structuredClone(saved);
  changed.reminders[0]!.message='Review fill again';
  expect(sameEditable(canonicalState(changed),canonicalState(saved))).toBe(false);
  changed.reminders[0]!.message='Review fill';
  expect(sameEditable(canonicalState(changed),canonicalState(saved))).toBe(true);
 });

 it('treats deleting every reminder as a change',()=>{
  const saved=sources([]);
  saved.reminders=[{key:'1',message:'Review fill',time:'2026-01-03T09:00',instant:'2026-01-03T01:00:00.000Z',mode:''}];
  const cleared=structuredClone(saved);
  cleared.reminders=[];
  expect(sameEditable(canonicalState(cleared),canonicalState(saved))).toBe(false);
 });
});
