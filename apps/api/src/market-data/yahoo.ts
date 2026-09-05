import YahooFinance from 'yahoo-finance2';
import type { YahooUpstream } from './index';

/** SDK owns Yahoo's cookie/crumb protocol; our provider owns queue, cache and retries. */
export function createYahooUpstream(fetch?: typeof globalThis.fetch):YahooUpstream {
  const yahoo = new YahooFinance({ fetch, versionCheck:false, suppressNotices:['yahooSurvey'] });
  return {
    summary:(symbol,signal)=>yahoo.quoteSummary(symbol,{modules:['summaryDetail','defaultKeyStatistics','fundProfile']},{fetchOptions:{signal}}),
    quote:(symbol,signal)=>yahoo.quote(symbol,{}, {fetchOptions:{signal}}),
    chart:(symbol,options,signal)=>yahoo.chart(symbol,options,{fetchOptions:{signal}}),
  };
}
