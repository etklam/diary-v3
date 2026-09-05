import { calendarDateInTimezone } from '@diary/domain';
import type { MarketQuote, SpxSessionSummary } from '../../../../packages/contracts/src/market';
import { MarketDataError } from './queue';
import type { IntradayQuote } from './index';

export interface MarketSessionInput {
  previousClose: number
  open: number
  close: number
  high?: number | null
  low?: number | null
}

const STRONG_MOVE_PCT = 1.2
const SMALL_MOVE_PCT = 0.25
const GAP_PCT = 0.35
const INTRADAY_TREND_PCT = 0.35
const CHOPPY_RANGE_PCT = 1.2

function percentChange(current: number, base: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return 0
  return ((current - base) / base) * 100
}

export function classifyMarketSession(input: MarketSessionInput): SpxSessionSummary['condition'] {
  const changePercent = percentChange(input.close, input.previousClose)
  const openGapPercent = percentChange(input.open, input.previousClose)
  const intradayMovePercent = percentChange(input.close, input.open)
  const high = input.high ?? Math.max(input.open, input.close)
  const low = input.low ?? Math.min(input.open, input.close)
  const rangePercent = percentChange(high, low)
  const lowVsPreviousClosePercent = percentChange(low, input.previousClose)
  const highVsPreviousClosePercent = percentChange(high, input.previousClose)

  if (openGapPercent <= -GAP_PCT && intradayMovePercent >= INTRADAY_TREND_PCT) {
    return 'gapDownRecovery'
  }
  if (openGapPercent <= -GAP_PCT && intradayMovePercent <= -INTRADAY_TREND_PCT) {
    return 'gapDownAndGo'
  }
  if (openGapPercent >= GAP_PCT && intradayMovePercent >= INTRADAY_TREND_PCT) {
    return 'gapUpAndGo'
  }
  if (openGapPercent >= GAP_PCT && intradayMovePercent <= -INTRADAY_TREND_PCT) {
    return 'gapUpFade'
  }
  if (lowVsPreviousClosePercent <= -GAP_PCT && changePercent >= SMALL_MOVE_PCT) {
    return 'gapDownRecovery'
  }
  if (highVsPreviousClosePercent >= GAP_PCT && changePercent <= -SMALL_MOVE_PCT) {
    return 'gapUpFade'
  }
  if (rangePercent >= CHOPPY_RANGE_PCT && Math.abs(changePercent) < GAP_PCT) {
    return 'choppySession'
  }
  if (changePercent >= STRONG_MOVE_PCT) return 'strongUp'
  if (changePercent >= SMALL_MOVE_PCT) return 'slightUp'
  if (changePercent <= -STRONG_MOVE_PCT) return 'strongDown'
  if (changePercent <= -SMALL_MOVE_PCT) return 'slightDown'
  return 'rangeBound'
}

export function buildSpxSessionSummary(quote:MarketQuote,quotes:IntradayQuote[]):SpxSessionSummary {
  if(quote.previousClose===null||quote.previousClose<=0||quote.regularMarketPrice<=0||!quote.lastUpdateTime)
    throw new MarketDataError('SPX session lacks a valid prior close or quote timestamp');
  const sorted=quotes.filter(bar=>Number.isFinite(bar.timestamp)&&Number.isFinite(bar.close)).sort((a,b)=>a.timestamp-b.timestamp);
  const latest=sorted.at(-1);
  if(!latest)throw new MarketDataError('SPX intraday session unavailable');
  const day=(timestamp:number)=>calendarDateInTimezone(new Date(timestamp*1000),'America/New_York');
  const latestDay=day(latest.timestamp);
  if(latestDay!==calendarDateInTimezone(new Date(quote.lastUpdateTime),'America/New_York'))
    throw new MarketDataError('SPX quote and intraday prices describe different sessions');
  const session=sorted.filter(bar=>day(bar.timestamp)===latestDay);
  const first=session[0]!;const open=first.open??first.close;
  if(open<=0)throw new MarketDataError('SPX opening price unavailable');
  const high=Math.max(...session.map(bar=>bar.high??bar.close));
  const low=Math.min(...session.map(bar=>bar.low??bar.close));
  return {symbol:'SPX',sourceSymbol:quote.symbol,
    condition:classifyMarketSession({previousClose:quote.previousClose,open,close:quote.regularMarketPrice,high,low}),
    price:quote.regularMarketPrice,previousClose:quote.previousClose,open,high,low,
    change:quote.regularMarketPrice-quote.previousClose,changePercent:percentChange(quote.regularMarketPrice,quote.previousClose),
    intradayMovePercent:percentChange(quote.regularMarketPrice,open),openGapPercent:percentChange(open,quote.previousClose),
    asOf:new Date(latest.timestamp*1000).toISOString()};
}
