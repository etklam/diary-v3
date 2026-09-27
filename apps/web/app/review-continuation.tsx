import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { reviewGroupsResponseSchema } from '@diary/contracts/review-queue';
import { api, useUi } from './ui';
import { useSessionState } from './session';
import { findNextReview, readReviewSession, reviewItemPath, writeReviewSession, type ReviewSession } from './review-session';
import { workflowCopy } from './review-workflow-copy';
export function useReviewContinuation(owner: string, itemKey: string) {
  const [params] = useSearchParams(), navigate = useNavigate(), session = useSessionState();
  const id = params.get('reviewSession') ?? '';
  const [value, setValue] = useState<ReviewSession | null>(null), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort(); request.current = null;
    setBusy(false); setFailed(false);
    setValue(session.authenticated === true ? readReviewSession(owner, id) : null);
    return () => { request.current?.abort(); request.current = null; };
  }, [owner, id, session.authenticated, session.revision]);
  async function advance(kind: 'completed' | 'skipped') {
    if (!value || busy || session.authenticated !== true) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setFailed(false);
    try {
      const current = readReviewSession(owner, id);
      if (!current) throw new Error('Review session unavailable');
      const completed = kind === 'completed' ? [...new Set([...current.completed, itemKey])] : current.completed;
      const skipped = (kind === 'skipped' ? [...new Set([...current.skipped, itemKey])] : current.skipped).filter(key => !completed.includes(key));
      const next = { ...current, completed, skipped };
      writeReviewSession(id, next); setValue(next);
      const item = await findNextReview(next, async query => {
        const result = await api.GET('/api/reviews', { params: { query }, signal: controller.signal });
        if (!result.response.ok) throw new Error('Queue unavailable');
        return reviewGroupsResponseSchema.parse(result.data);
      });
      if (controller.signal.aborted) return;
      navigate(item ? reviewItemPath(item, id) : `/reviews?${next.query}`, { state: item ? { queueSearch: next.query } : { reviewSessionFinished: true } });
    } catch { if (!controller.signal.aborted) setFailed(true); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return { value: value?.owner === owner && session.authenticated === true ? value : null, busy, failed, advance, retry: () => advance(value?.completed.includes(itemKey) ? 'completed' : 'skipped') };
}
export function ReviewProgress({ flow, skip, disabled = false }: { flow: ReturnType<typeof useReviewContinuation>; skip: () => void; disabled?: boolean }) {
  const { locale } = useUi(), c = workflowCopy[locale];
  if (!flow.value) return null;
  return <aside className="review-session" aria-label={c.progress}><p role="status">{c.progress}: {flow.value.completed.length} · {c.skipped}: {flow.value.skipped.length} · {c.initial}: {flow.value.initial}</p>
    {flow.failed && <><p role="alert">{c.unavailable}</p><button type="button" disabled={flow.busy} onClick={()=>void flow.retry()}>{c.retryNext}</button></>}
    <div className="actions"><button type="button" className="secondary" disabled={disabled || flow.busy} onClick={skip}>{c.skip}</button><Link to={`/reviews?${flow.value.query}`}>{c.queue}</Link></div>
  </aside>;
}
