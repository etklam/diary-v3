import { expect,it } from 'vitest'
import { computeEtfRisk,computeEtfRelativeStrength } from '@diary/domain/etf-risk'
it('uses log-return sample volatility, sufficient windows and prior-volume baseline',()=>{
 const bars=Array.from({length:253},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),close:100,high:110,low:90,volume:i===252?200:100}));
 expect(computeEtfRisk(bars)).toMatchObject({high52w:110,low52w:90,volatility20d:0,volatility60d:0,volatility252d:0,maxDrawdown1y:0,volumeSpikeRatio:2,observations:253});
 bars[252]!.close=50;expect(computeEtfRisk(bars).maxDrawdown1y).toBe(-50);expect(computeEtfRisk(bars).volatility20d).toBeGreaterThan(0);
 expect(computeEtfRisk(bars.slice(0,20))).toMatchObject({volatility20d:null,high52w:null,maxDrawdown1y:null,volumeSpikeRatio:null});
 expect(computeEtfRisk([])).toMatchObject({asOf:null,volatility252d:null,volumeSpikeRatio:null});
})
it('aligns relative returns by common dates and excludes missing endpoints',()=>{
 const target=[{date:'2026-01-01',close:100},{date:'2026-02-01',close:120},{date:'2026-03-01',close:150}];
 const benchmark=[{date:'2026-01-01',close:100},{date:'2026-02-01',close:110}];
 const result=computeEtfRelativeStrength(target,benchmark,'2026-01-01');expect(result.relativeReturnPct).toBeCloseTo(10);expect(result).toMatchObject({from:'2026-01-01',to:'2026-02-01',trend:'outperforming'});
 expect(computeEtfRelativeStrength(target,benchmark,'2026-02-01').relativeReturnPct).toBeNull();
 expect(computeEtfRelativeStrength(target,target,'2026-01-01').trend).toBe('in_line');
})
