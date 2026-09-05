import { useId } from 'react';
import { useUi } from './ui';
export function PerformanceChart({ title, points, bars = false }: { title: string; points: { label: string; value: number }[]; bars?: boolean }) {
  const id = useId(), { locale } = useUi(); if (!points.length) return null;
  const low = points.reduce((value, point) => Math.min(value, point.value), 0), high = points.reduce((value, point) => Math.max(value, point.value), 0), span = high - low || 1;
  const y = (value: number) => 180 - (value - low) / span * 160, step = 640 / points.length;
  const x = (index: number) => 60 + step * (index + 0.5);
  return <svg className="performance-chart" viewBox="0 0 740 220" role="img" aria-labelledby={id}><title id={id}>{title}</title><line x1={60} x2={700} y1={y(0)} y2={y(0)} className="chart-axis"/><text x={4} y={20}>{high.toLocaleString(locale, { notation: 'compact', maximumFractionDigits: 1 })}</text><text x={4} y={180}>{low.toLocaleString(locale, { notation: 'compact', maximumFractionDigits: 1 })}</text>{bars ? points.map((point, index) => <rect key={index} x={x(index) - step * 0.35} y={Math.min(y(0), y(point.value))} width={step * 0.7} height={Math.max(1, Math.abs(y(point.value) - y(0)))} className={point.value < 0 ? 'chart-negative' : 'chart-positive'}><title>{point.label}: {point.value}</title></rect>) : <><polyline fill="none" className="chart-line" points={points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')}/>{points.length === 1 && <circle cx={x(0)} cy={y(points[0]!.value)} r={3} className="chart-positive"/>}</>}<text x={60} y={212}>{points[0]!.label}</text><text x={700} y={212} textAnchor="end">{points.at(-1)!.label}</text></svg>;
}
