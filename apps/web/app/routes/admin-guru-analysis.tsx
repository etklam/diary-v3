import { useEffect, useState } from 'react'
import { adminGuruAnalysisListResponseSchema, adminGuruAnalysisResponseSchema } from '@diary/contracts'
import { apiFailure } from '../api-error'
import { api, useUi } from '../ui'
import { guruAdminCopy, type GuruAdminCopy } from './admin-gurus-copy'

type Run = ReturnType<typeof adminGuruAnalysisListResponseSchema.parse>['data'][number]

function noticeFor(code: string | undefined, copy: GuruAdminCopy) {
  if (code === 'GURU_ANALYSIS_UNAVAILABLE') return copy.analysisBlocked
  if (code === 'AI_REPORTS_DISABLED' || code === 'AI_NOT_CONFIGURED') return copy.analysisDisabled
  if (code === 'AI_QUOTA_EXCEEDED' || code === 'AI_REPORT_ALREADY_RUNNING') return copy.analysisBudget
  return copy.failed
}

export function AdminGuruAnalysis({ id }: { id: string }) {
  const { locale } = useUi()
  const c = guruAdminCopy[locale]
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [period, setPeriod] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setRuns(null)
    void api.GET('/api/admin/gurus/{id}/analysis', { params: { path: { id } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = adminGuruAnalysisListResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setRuns(parsed.data.data)
        setPeriod(current => current || parsed.data.data[0]?.periodEnd || '')
      } else setFailure(c.failed)
    }).catch(() => { if (!controller.signal.aborted) setFailure(c.failed) })
    return () => controller.abort()
  }, [id, attempt, c.failed])

  async function request(mode: 'generate' | 'regenerate') {
    if (pending) return
    setNotice(''); setFailure('')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) { setFailure(c.analysisPeriodRequired); return }
    setPending(true)
    try {
      const result = await api.POST('/api/admin/gurus/{id}/analysis', { params: { path: { id } }, body: { periodEnd: period, mode } })
      const parsed = adminGuruAnalysisResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(noticeFor(apiFailure(result.error, c.failed).code, c)); return }
      setNotice(parsed.data.data.reused ? c.analysisReused : c.analysisQueued)
      setAttempt(value => value + 1)
    } catch { setFailure(c.failed) }
    finally { setPending(false) }
  }

  return <section className="admin-guru-analysis" aria-labelledby="admin-guru-analysis-title">
    <h2 id="admin-guru-analysis-title">{c.analysisSection}</h2>
    <p className="lede">{c.analysisIntro}</p>
    <div className="admin-guru-analysis-controls">
      <label>{c.analysisPeriod}<input type="date" value={period} onChange={event => setPeriod(event.currentTarget.value)} /></label>
      <button type="button" disabled={pending} onClick={() => void request('generate')}>{c.analysisGenerate}</button>
      <button type="button" className="secondary" disabled={pending} onClick={() => void request('regenerate')}>{c.analysisRegenerate}</button>
    </div>
    {notice && <p className="admin-gurus-notice" role="status">{notice}</p>}
    {failure && <p className="admin-gurus-error" role="alert">{failure}</p>}
    <h3>{c.analysisRuns}</h3>
    {runs === null ? <p role="status">{c.analysisLoading}</p>
      : runs.length === 0 ? <p className="admin-gurus-empty">{c.analysisEmpty}</p>
        : <div className="admin-guru-analysis-table-scroll"><table className="admin-guru-analysis-table">
          <thead><tr><th scope="col">{c.analysisPeriod}</th><th scope="col">{c.status}</th><th scope="col">Source</th><th scope="col">Reason</th><th scope="col">Prompt</th><th scope="col">Model</th><th scope="col">Tokens</th><th scope="col">Input hash</th></tr></thead>
          <tbody>{runs.map(run => <tr key={run.runId}>
            <th scope="row">{run.periodEnd}</th><td>{run.status}{run.errorCode ? ` · ${run.errorCode}` : ''}</td>
            <td>{run.sourceState}{run.invalidationReason ? ` · ${run.invalidationReason}` : ''}</td><td>{run.reason}</td>
            <td>{run.promptSource === 'override' ? `${run.promptKey} #${run.promptOverrideVersionId}` : `${run.promptKey} (${run.promptSystemVersion})`}</td>
            <td>{run.model ?? '—'}</td><td>{run.inputTokens ?? '—'} / {run.outputTokens ?? '—'}</td>
            <td><code>{run.inputHash.slice(0, 12)}…</code></td>
          </tr>)}</tbody>
        </table></div>}
  </section>
}
