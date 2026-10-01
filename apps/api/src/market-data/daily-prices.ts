export type DailyMarketPrice = {symbol:string;date:string;open:string;high:string;low:string;close:string;adjustedClose:string;volume:bigint};

/**
 * These rows are keyed by the UTC calendar date of the provider's session
 * instant, which matches the exchange session date only while every symbol
 * trades on a US exchange: a 09:30 New York open is 13:30 or 14:30 UTC, the
 * same civil day. An exchange east of UTC breaks that — a 09:00 Tokyo open is
 * 00:00 UTC the same day, and a Sydney open is the previous UTC day — so the
 * stored date would silently shift by one session.
 *
 * `marketSymbolSchema` accepts suffixed symbols such as `0700.HK`, so the
 * constraint is enforced rather than assumed. The complete research bars in
 * `dailyResearchBars` resolve their date in `America/New_York` instead; the
 * two must not be mixed for the same instrument until this path takes an
 * explicit exchange timezone.
 */
export function assertUsSessionSymbol(symbol:string){
 if(/\.[A-Za-z]{1,4}$/.test(symbol))throw new RangeError(`Daily session dates are only defined for US-listed symbols; ${symbol} names a foreign exchange`);
}

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
