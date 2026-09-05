/** Daily trading observations. Calendar dates remain YYYY-MM-DD throughout. */
export type EtfDailyBar = { date: string; close: number; high?: number | null; low?: number | null; volume?: number | null }
export function canonicalEtfBars(input: readonly EtfDailyBar[]) {
 const days=new Map<string,EtfDailyBar>();
 for(const bar of input)if(/^\d{4}-\d{2}-\d{2}$/.test(bar.date)&&Number.isFinite(bar.close)&&bar.close>0)days.set(bar.date,{...bar});
 return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function volatility(bars: readonly EtfDailyBar[], days: number) {
 if(bars.length<days+1)return null;
 const window=bars.slice(-days-1),returns=window.slice(1).map((bar,i)=>Math.log(bar.close/window[i]!.close));
 const mean=returns.reduce((sum,value)=>sum+value,0)/days;
 return Math.sqrt(returns.reduce((sum,value)=>sum+(value-mean)**2,0)/(days-1))*Math.sqrt(252)*100;
}
export function computeEtfRisk(input: readonly EtfDailyBar[]) {
 const bars=canonicalEtfBars(input),year=bars.slice(-252),last=bars.at(-1);
 const fullYear=year.length===252;
 const highs=year.map(row=>row.high??null),lows=year.map(row=>row.low??null);
 const high52w=fullYear&&highs.every(value=>value!==null&&Number.isFinite(value)&&value>0)?Math.max(...highs as number[]):null;
 const low52w=fullYear&&lows.every(value=>value!==null&&Number.isFinite(value)&&value>0)?Math.min(...lows as number[]):null;
 let maxDrawdown1y:number|null=null;
 if(fullYear){let peak=year[0]!.close;maxDrawdown1y=0;for(const row of year){peak=Math.max(peak,row.close);maxDrawdown1y=Math.min(maxDrawdown1y,(row.close/peak-1)*100);}}
 const priorVolumes=bars.slice(-21,-1).map(row=>row.volume??null);
 const average=priorVolumes.length===20&&priorVolumes.every(value=>value!==null&&Number.isFinite(value)&&value>=0)?(priorVolumes as number[]).reduce((sum,value)=>sum+value,0)/20:null;
 return { high52w,low52w,distanceToHighPct:last&&high52w!==null?(last.close/high52w-1)*100:null,distanceToLowPct:last&&low52w!==null?(last.close/low52w-1)*100:null,
  volatility20d:volatility(bars,20),volatility60d:volatility(bars,60),volatility252d:volatility(bars,252),maxDrawdown1y,
  volumeSpikeRatio:average!==null&&average>0&&last?.volume!==null&&last?.volume!==undefined&&Number.isFinite(last.volume)&&last.volume>=0?last.volume/average:null,
  observations:bars.length,asOf:last?.date??null };
}
export function computeEtfRelativeStrength(input:readonly EtfDailyBar[],benchmark:readonly EtfDailyBar[],from:string) {
 const target=canonicalEtfBars(input),other=new Map(canonicalEtfBars(benchmark).map(row=>[row.date,row.close]));
 const aligned=target.filter(row=>row.date>=from&&other.has(row.date)),first=aligned[0],last=aligned.at(-1);
 if(!first||!last||aligned.length<2)return {symbolReturnPct:null,benchmarkReturnPct:null,relativeReturnPct:null,trend:null,from:null,to:null};
 const symbolReturnPct=(last.close/first.close-1)*100,benchmarkReturnPct=(other.get(last.date)!/other.get(first.date)!-1)*100,relativeReturnPct=symbolReturnPct-benchmarkReturnPct;
 return {symbolReturnPct,benchmarkReturnPct,relativeReturnPct,trend:Math.abs(relativeReturnPct)<1e-10?'in_line' as const:relativeReturnPct>0?'outperforming' as const:'underperforming' as const,from:first.date,to:last.date};
}
