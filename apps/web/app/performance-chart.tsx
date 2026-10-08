import { useId } from 'react';
import { useUi } from './ui';
import { formatMarketValue, marketClass } from './market-display';
import { performanceCopy } from './performance-copy';

/**
 * Below this many points a chart is not drawn and the table beneath it carries
 * the data.
 *
 * One point has nothing to compare and no trend to show. Two assert a shape the
 * data does not support: a pair of bars is a comparison the table states
 * exactly, and a two-point line reads as a trajectory drawn from two samples,
 * which is precisely the over-reading this product exists to discourage. Three
 * is the smallest count where the plot shows something the table does not.
 */
export const MIN_CHART_POINTS = 3;

/**
 * A bar never widens past this, however few categories there are. At one
 * category `step` was the full 640px plot width and the bar rendered 448px wide
 * against a 160px plot height — a solid slab carrying no information.
 */
const MAX_BAR_WIDTH = 48;

/** Width of one bar when `count` categories share the 640px plot. */
export function chartBarWidth(count: number) {
  return Math.min(640 / count * 0.7, MAX_BAR_WIDTH);
}

/**
 * The labels the category axis prints. Two ticks describe a range, so a series
 * whose first and last labels are the same value gets one centred label —
 * printing `AAPL … AAPL` claimed a range that did not exist.
 */
export function chartAxisLabels(points: { label: string }[]): string[] {
  const first = points[0]?.label, last = points.at(-1)?.label;
  if (first === undefined || last === undefined) return [];
  return first === last ? [first] : [first, last];
}

export function PerformanceChart({ title, points, bars = false }: { title: string; points: { label: string; value: number }[]; bars?: boolean }) {
  const id = useId(), { locale } = useUi(), c = performanceCopy[locale];
  if (!points.length) return null;
  if (points.length < MIN_CHART_POINTS) return <p className="performance-chart-note">{c.chartTooFew}</p>;
  const low = points.reduce((value, point) => Math.min(value, point.value), 0), high = points.reduce((value, point) => Math.max(value, point.value), 0), span = high - low || 1;
  const y = (value: number) => 180 - (value - low) / span * 160, step = 640 / points.length;
  const x = (index: number) => 60 + step * (index + 0.5);
  const barWidth = chartBarWidth(points.length);
  const axis = chartAxisLabels(points);
  return <svg className="performance-chart" viewBox="0 0 740 220" role="img" aria-labelledby={id}><title id={id}>{title}</title><line x1={60} x2={700} y1={y(0)} y2={y(0)} className="chart-axis"/><text x={4} y={20}>{high.toLocaleString(locale, { notation: 'compact', maximumFractionDigits: 1 })}</text><text x={4} y={180}>{low.toLocaleString(locale, { notation: 'compact', maximumFractionDigits: 1 })}</text>{bars ? points.map((point, index) => <rect key={index} x={x(index) - barWidth / 2} y={Math.min(y(0), y(point.value))} width={barWidth} height={Math.max(1, Math.abs(y(point.value) - y(0)))} className={marketClass(point.value)}><title>{point.label}: {formatMarketValue(locale, point.value)}</title></rect>) : <polyline fill="none" className="chart-line" points={points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')}/>}
    {/* Every point in one period or one symbol: printing the label at both
        ticks claimed a range where there is a single value. */}
    {axis.length === 1
      ? <text x={380} y={212} textAnchor="middle">{axis[0]}</text>
      : <><text x={60} y={212}>{axis[0]}</text><text x={700} y={212} textAnchor="end">{axis[1]}</text></>}
  </svg>;
}
