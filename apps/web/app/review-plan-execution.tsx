import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { tradePlanExecutionComparisonSchema, type TradePlanExecutionComparison } from '@diary/contracts/trade-plan-execution';
import { api, useUi } from './ui';
import { useSessionState } from './session';
import { apiFailure, FailureNotice, type Failure } from './api-error';
import { planCopy } from './trade-plan-copy';
import { ExecutionEvidence } from './trade-plan-execution-evidence';

/** Fetch only when a reviewer opens the comparison; the server owns all arithmetic. */
export function ReviewPlanExecution({ id }: { id: string }) {
  const { locale, t } = useUi(), c = planCopy[locale], session = useSessionState();
  const [open, setOpen] = useState(false), [attempt, retry] = useState(0);
  const [confirmed, setData] = useState<{revision:number; data:TradePlanExecutionComparison} | null>(null), [error, setError] = useState<Failure | null>(null);
  useEffect(() => {
    if (!open || session.authenticated !== true) { setData(null); return; }
    const controller = new AbortController(); setData(null); setError(null);
    api.GET('/api/trade-plans/{id}/execution', { params: { path: { id } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = tradePlanExecutionComparisonSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setData({revision:session.revision,data:parsed.data});
      else setError(apiFailure(result.error, c.executionLoadFailed));
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, c.executionLoadFailed)); });
    return () => controller.abort();
  }, [id, open, attempt, session.authenticated, session.revision]);
  const data = confirmed?.revision === session.revision ? confirmed.data : null;
  return <details className="review-plan-execution" onToggle={event => setOpen(event.currentTarget.open)}><summary>{c.executionTitle}</summary>
    {session.authenticated === true && open && <>{error ? <><FailureNotice failure={error}/><button type="button" onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>
      <ExecutionEvidence data={data} c={c} locale={locale} planId={id} retryText={t('retry')}/>
    </>}<Link to={`/trade-plans/${id}`}>{c.edit}</Link></>}
  </details>;
}
