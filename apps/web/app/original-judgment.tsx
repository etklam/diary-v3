import type { ReactNode } from 'react';
import './original-judgment.css';

export type OriginalJudgmentValues = Partial<Record<'thesis' | 'risk' | 'execution', string | null>>;
export type OriginalJudgmentLabels = Record<keyof OriginalJudgmentValues, string>;

type Props = {
  values: OriginalJudgmentValues;
  labels: OriginalJudgmentLabels;
  heading: string;
  emptyText: string;
  hint?: string;
  headingId?: string;
  children?: ReactNode;
};

const fields = ['thesis', 'risk', 'execution'] as const;

export function OriginalJudgment({ values, labels, heading, emptyText, hint, headingId, children }: Props) {
  const populated = fields.filter(field => values[field]?.trim());
  return <>
    <h2 id={headingId}>{heading}</h2>
    {hint && <p className="muted">{hint}</p>}
    {populated.length > 0 ? <dl>{populated.map(field => <div key={field}><dt>{labels[field]}</dt><dd>{values[field]}</dd></div>)}</dl> : <p className="original-judgment-empty">{emptyText}</p>}
    {children}
  </>;
}
