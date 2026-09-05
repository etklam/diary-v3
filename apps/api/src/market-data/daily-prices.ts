export type DailyMarketPrice = {symbol:string;date:string;open:string;high:string;low:string;close:string;adjustedClose:string;volume:bigint};
/** Preserve valid source OHLC behavior; reject invalid dates and numeric overflow before persistence. */
export function parseDailyMarketPrices(symbol:string,quotes:unknown[]):DailyMarketPrice[]{
 const price=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0&&Number(value.toFixed(6))>0&&Number(value.toFixed(6))<1e12;
 const rows=new Map<string,DailyMarketPrice>();
 for(const raw of quotes){
  if(!raw||typeof raw!=='object')continue;
  const q=raw as Record<string,unknown>;
  if(!(q.date instanceof Date)||!Number.isFinite(q.date.getTime())||!price(q.open)||!price(q.high)||!price(q.low)||!price(q.close))continue;
  if(typeof q.volume==='number'&&q.volume>0&&!Number.isSafeInteger(Math.trunc(q.volume)))continue;
  const date=q.date.toISOString().slice(0,10);
  rows.set(date,{symbol,date,open:q.open.toFixed(6),high:q.high.toFixed(6),low:q.low.toFixed(6),close:q.close.toFixed(6),adjustedClose:(price(q.adjclose)?q.adjclose:q.close).toFixed(6),volume:typeof q.volume==='number'&&Number.isFinite(q.volume)&&q.volume>0?BigInt(Math.trunc(q.volume)):0n});
 }
 return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
