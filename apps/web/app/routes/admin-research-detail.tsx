import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import {
  researchApproveRequestSchema,
  researchGenerateResponseSchema,
  researchHandoffRequestSchema,
  researchHandoffResponseSchema,
  researchQaGateSchema,
  researchRevisionRequestSchema,
  researchRevisionSchema,
  researchRunDetailSchema,
  postAdminDetailSchema,
} from '@diary/contracts'
import { type Failure } from '../api-error'
import {
  ActivityPanel,
  DetailHeader,
  DetailTabs,
  EvidencePanel,
  Limitations,
  NextAction,
  QAPanel,
  ResearchFailure,
  RunMeta,
  researchRequest,
  useResearchRun,
} from '../research-studio'
import { randomIdempotencyKey, researchConfigurationCopy, researchCopy, statusLabel, type Locale } from '../research-studio-copy'
import { Markdown } from '../markdown'
import { useUi } from '../ui'
import './admin-research.css'

const actionResponseSchema = z.union([researchRunDetailSchema, researchGenerateResponseSchema, researchRevisionSchema, researchHandoffResponseSchema])

type Tab = 'preview' | 'evidence' | 'qa' | 'activity'
type ManualQaGateId = 'G07' | 'G08' | 'G09' | 'G10'
type ManualQaStatus = 'NOT_CHECKED' | 'PASS' | 'FAIL' | 'N_A'
type ManualQaReview = Record<ManualQaGateId, { status: ManualQaStatus; evidence: string; reason: string; remediation: string }>

const manualQaGateIds: ManualQaGateId[] = ['G07', 'G08', 'G09', 'G10']

function emptyManualQaReview(): ManualQaReview {
  return Object.fromEntries(manualQaGateIds.map(gateId => [gateId, { status: 'NOT_CHECKED', evidence: '', reason: '', remediation: '' }])) as ManualQaReview
}

export default function AdminResearchDetail() {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const configCopy = researchConfigurationCopy(locale as Locale)
  const { id } = useParams()
  const [attempt, setAttempt] = useState(0)
  const { run, failure: loadFailure, loading } = useResearchRun(id, attempt)
  const [tab, setTab] = useState<Tab>('preview')
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState('')
  const [editorMode, setEditorMode] = useState<'editor' | 'preview'>('editor')
  const [content, setContent] = useState('')
  const [structured, setStructured] = useState('{}')
  const [manualQaReview, setManualQaReview] = useState<ManualQaReview>(emptyManualQaReview)
  const [category, setCategory] = useState('technical')
  const [tags, setTags] = useState('research')
  const [linkedArticle, setLinkedArticle] = useState<z.infer<typeof postAdminDetailSchema> | null>(null)

  const latestRevision = useMemo(() => run?.revisions.slice().sort((a, b) => b.revision - a.revision)[0] ?? null, [run])
  const latestTitle = typeof latestRevision?.structured.title === 'string' ? latestRevision.structured.title : null
  const linkedDraftNeedsReview = Boolean(linkedArticle?.status === 'DRAFT' && (!latestRevision || linkedArticle.content !== latestRevision.content || linkedArticle.title !== latestTitle))
  useEffect(() => {
    if (!latestRevision) { setContent(''); setStructured('{}'); return }
    setContent(latestRevision.content)
    setStructured(JSON.stringify(latestRevision.structured, null, 2))
  }, [latestRevision?.id])

  useEffect(() => {
    const qaResult = researchQaGateSchema.array().length(10).safeParse(latestRevision?.structured.qa ?? run?.latestQa ?? run?.evidence?.qa ?? [])
    const next = emptyManualQaReview()
    if (qaResult.success) {
      for (const gateId of manualQaGateIds) {
        const gate = qaResult.data.find(item => item.gateId === gateId)
        if (!gate) continue
        const reviewed = Boolean(gate.reviewerId && gate.reviewedAt)
        const allowedStatuses: ManualQaStatus[] = gateId === 'G07' || gateId === 'G08'
          ? ['NOT_CHECKED', 'PASS', 'FAIL', 'N_A']
          : ['NOT_CHECKED', 'PASS', 'FAIL']
        next[gateId] = {
          status: reviewed && allowedStatuses.includes(gate.status as ManualQaStatus) ? gate.status as ManualQaStatus : 'NOT_CHECKED',
          evidence: reviewed ? gate.evidence.join('\n') : '',
          reason: reviewed ? gate.reason ?? '' : '',
          remediation: reviewed ? gate.remediation ?? '' : '',
        }
      }
    }
    setManualQaReview(next)
  }, [latestRevision?.id, run?.id, attempt])

  useEffect(() => {
    setLinkedArticle(null)
    if (!run?.linkedPostId) return
    const controller = new AbortController()
    void researchRequest(`/api/blog/admin/${encodeURIComponent(run.linkedPostId)}`, postAdminDetailSchema, c.actionFailed, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted && result.data) setLinkedArticle(result.data) })
      .catch(() => {})
    return () => controller.abort()
  }, [run?.linkedPostId, attempt, c.actionFailed])

  async function importLinkedDraftForReview() {
    if (!run?.linkedPostId || !linkedDraftNeedsReview || actionPending) return
    setActionPending('import-article'); setFailure(null); setNotice('')
    try {
      const result = await researchRequest(`/api/admin/research/runs/${encodeURIComponent(run.id)}/import-article-revision`, researchRevisionSchema, c.actionFailed, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: run.version }),
      })
      if (!result.response.ok || !result.data) { setFailure(result.failure); return }
      setNotice(configCopy.linkedDraftImported)
      setTab('qa')
      setAttempt(value => value + 1)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setActionPending(null) }
  }

  async function saveQaReview() {
    if (!run || !latestRevision || actionPending) return
    const sourceQa = researchQaGateSchema.array().length(10).safeParse(latestRevision.structured.qa ?? run.latestQa)
    if (!sourceQa.success) { setFailure({ message: c.actionFailed, fields: ['qa'] }); return }
    const reviewReady = manualQaGateIds.every(gateId => {
      const review = manualQaReview[gateId]
      return review.status !== 'NOT_CHECKED'
        && review.evidence.trim().length > 0
        && (review.status !== 'N_A' || review.reason.trim().length > 0)
        && (review.status !== 'FAIL' || review.reason.trim().length > 0)
    })
    if (!reviewReady) { setFailure({ message: c.qaReviewIncomplete, fields: [] }); return }

    const reviewedQa = sourceQa.data.map(gate => {
      if (!manualQaGateIds.includes(gate.gateId as ManualQaGateId)) return { ...gate, reviewerId: null, reviewedAt: null }
      const gateId = gate.gateId as ManualQaGateId
      const review = manualQaReview[gateId]
      return {
        ...gate,
        status: review.status,
        evidence: [review.evidence.trim()],
        reason: review.reason.trim() || null,
        remediation: review.remediation.trim() || null,
        reviewerId: null,
        reviewedAt: null,
      }
    })
    const revisionStructured = { ...latestRevision.structured }
    delete revisionStructured.qa
    const request = researchRevisionRequestSchema.safeParse({
      expectedVersion: run.version,
      expectedRevision: latestRevision.revision,
      structured: revisionStructured,
      content: latestRevision.content,
      qa: reviewedQa,
    })
    if (!request.success) { setFailure({ message: c.actionFailed, fields: request.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []) }); return }

    setActionPending('qa-review'); setFailure(null); setNotice('')
    try {
      const response = await researchRequest(`/api/admin/research/runs/${encodeURIComponent(run.id)}/revisions`, researchRevisionSchema, c.actionFailed, { method: 'POST', body: JSON.stringify(request.data) })
      if (!response.response.ok || !response.data) { setFailure(response.failure); return }
      setNotice(c.qaReviewSaved)
      setAttempt(value => value + 1)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setActionPending(null) }
  }

  async function perform(action: 'generate' | 'revise' | 'approve' | 'handoff') {
    if (!run || actionPending) return
    setActionPending(action); setFailure(null); setNotice('')
    try {
      let path = `/api/admin/research/runs/${encodeURIComponent(run.id)}`
      let body: unknown = undefined
      let success: string = c.actionFailed
      if (action === 'generate') {
        path += '/generate'; body = { expectedVersion: run.version, idempotencyKey: randomIdempotencyKey() }; success = c.generating
      } else if (action === 'revise') {
        let parsedStructured: Record<string, unknown> = {}
        try {
          const parsed = JSON.parse(structured)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) parsedStructured = parsed as Record<string, unknown>
        } catch {
          setFailure({ message: c.actionFailed, fields: ['structured'] }); return
        }
        const qaInput = researchQaGateSchema.array().length(10).safeParse(parsedStructured.qa ?? run.latestQa)
        if (!qaInput.success) { setFailure({ message: c.actionFailed, fields: ['qa'] }); return }
        const revisionStructured = { ...parsedStructured }
        delete revisionStructured.qa
        const submittedQa = qaInput.data.map(gate => {
          if (!manualQaGateIds.includes(gate.gateId as ManualQaGateId)) return { ...gate, reviewerId: null, reviewedAt: null }
          if (gate.status === 'FAIL') return { ...gate, reviewerId: null, reviewedAt: null }
          return { ...gate, status: 'NOT_CHECKED' as const, evidence: [], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
        })
        const request = researchRevisionRequestSchema.safeParse({ expectedVersion: run.version, ...(latestRevision ? { expectedRevision: latestRevision.revision } : {}), structured: revisionStructured, content, qa: submittedQa })
        if (!request.success) { setFailure({ message: c.actionFailed, fields: request.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []) }); return }
        path += '/revisions'; body = request.data; success = c.revisionSaved
      } else if (action === 'approve') {
        if (!latestRevision) return
        const request = researchApproveRequestSchema.safeParse({ expectedVersion: run.version, revision: latestRevision.revision, bodyHash: latestRevision.bodyHash })
        if (!request.success) { setFailure({ message: c.actionFailed, fields: [] }); return }
        path += '/approve'; body = request.data; success = c.approvedNotice
      } else {
        if (!latestRevision) return
        const request = researchHandoffRequestSchema.safeParse({ expectedVersion: run.version, revision: latestRevision.revision, bodyHash: latestRevision.bodyHash, access: 'MEMBER', category, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean) })
        if (!request.success) { setFailure({ message: c.actionFailed, fields: request.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []) }); return }
        path += '/handoff'; body = request.data; success = c.handoffComplete
      }
      const result = await researchRequest(path, actionResponseSchema, c.actionFailed, { method: 'POST', body: JSON.stringify(body) })
      if (!result.response.ok || !result.data) { setFailure(result.failure); return }
      const responseData = result.data
      if (action === 'handoff' && 'postId' in responseData) setLinkedArticle(current => current && current.id === responseData.postId ? { ...current, status: responseData.status, access: responseData.access } : current)
      setNotice(success); setAttempt(value => value + 1)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setActionPending(null) }
  }

  if (loading) return <section className="research-page" data-testid="research-detail"><p className="research-loading" role="status">{c.loading}</p></section>
  if (!run) return <section className="research-page" data-testid="research-detail"><ResearchFailure failure={loadFailure} onRetry={() => setAttempt(value => value + 1)} /></section>

  const hasDraft = Boolean(latestRevision)
  const syntheticLimitedRun = run.evidence?.manifest.synthetic === true && run.quality === 'LIMITED' && run.executionStatus === 'BLOCKED'
  const attemptAlreadyUsed = run.attempts.length > 0 || run.dispatchStatus !== 'NOT_SENT'
  const revisionAlreadyApproved = latestRevision?.reviewStatus === 'APPROVED'
  const canGenerate = !attemptAlreadyUsed && run.method.status === 'COMPLETE' && (run.executionStatus === 'DATA_READY' && run.quality === 'FULL' || syntheticLimitedRun)
  const qaResult = researchQaGateSchema.array().length(10).safeParse(latestRevision?.structured.qa ?? run.latestQa)
  const coreGates = qaResult.success ? qaResult.data.filter(gate => gate.severity === 'CORE') : []
  const qaFailed = coreGates.some(gate => gate.status === 'FAIL')
  const qaUnchecked = coreGates.some(gate => gate.status === 'NOT_CHECKED')
  const manualGatesReviewed = qaResult.success && manualQaGateIds.every(gateId => {
    const gate = qaResult.data.find(item => item.gateId === gateId)
    return Boolean(gate && gate.status !== 'NOT_CHECKED' && gate.reviewerId && gate.reviewedAt)
  })
  const canApprove = hasDraft && latestRevision?.reviewStatus !== 'APPROVED' && !qaFailed && !qaUnchecked && manualGatesReviewed && run.reviewStatus !== 'APPROVED'
  const linkedArticleCanUpdate = !run.linkedPostId || linkedArticle?.status === 'DRAFT'
  const canHandoff = hasDraft && run.reviewStatus === 'APPROVED' && latestRevision?.reviewStatus === 'APPROVED' && linkedArticleCanUpdate
  const actionBlockedReason = run.dispatchStatus === 'OUTCOME_UNKNOWN' ? configCopy.unknownOutcomeRetryBlocked : attemptAlreadyUsed ? configCopy.attemptAlreadyUsed : run.method.status === 'INCOMPLETE' ? c.incompleteMethod : run.quality !== 'FULL' ? c.sourceUnavailable : c.blockedHint
  const approvalBlockedReason = qaFailed ? configCopy.qaFailed : qaUnchecked || !manualGatesReviewed ? configCopy.qaUnchecked : c.blockedHint
  const currentStructured = latestRevision ? JSON.stringify(latestRevision.structured, null, 2) : '{}'
  const revisionEditorDirty = Boolean(latestRevision && (content !== latestRevision.content || structured !== currentStructured))
  const qaReviewReady = manualQaGateIds.every(gateId => {
    const review = manualQaReview[gateId]
    return review.status !== 'NOT_CHECKED'
      && review.evidence.trim().length > 0
      && (review.status !== 'N_A' || review.reason.trim().length > 0)
      && (review.status !== 'FAIL' || review.reason.trim().length > 0)
  })
  const previewContent = latestRevision?.content ?? ''

  return <section className="research-page research-detail-page" data-testid="research-detail">
    <DetailHeader run={run} />
    <ResearchFailure failure={failure} />
    {notice && <p className="research-notice" role="status" aria-live="polite">{notice}</p>}
    <div className="research-detail-layout">
      <div className="research-detail-main">
        <RunMeta run={run} />
        <DetailTabs active={tab} onChange={setTab} />
        {tab === 'preview' && <>
          <section className="research-panel research-preview-panel" aria-labelledby="research-preview-title">
            <h2 id="research-preview-title">{c.reportPreview}</h2>
            {previewContent ? <div className="research-reading"><Markdown allowImages={false}>{previewContent}</Markdown></div> : <div className="research-empty-panel"><p>{c.noDraft}</p></div>}
          </section>
          {hasDraft && <section className="research-panel research-editor-panel" aria-labelledby="research-editor-title">
            <div className="research-panel-heading">
              <div><h2 id="research-editor-title">{c.revisionEditor}</h2><p className="muted">{c.revisionHint}</p></div>
              <div className="research-editor-tabs"><button type="button" className={editorMode === 'editor' ? '' : 'secondary'} onClick={() => setEditorMode('editor')}>{c.showEditor}</button><button type="button" className={editorMode === 'preview' ? '' : 'secondary'} onClick={() => setEditorMode('preview')}>{c.showPreview}</button></div>
            </div>
            {editorMode === 'editor' ? <div className="research-editor-fields">
              <label>{c.revisionEditor}<textarea value={content} onChange={event => setContent(event.target.value)} rows={18} /></label>
              <label>{configCopy.structuredReport}<textarea value={structured} onChange={event => setStructured(event.target.value)} rows={12} spellCheck={false} /></label>
              <button type="button" disabled={actionPending !== null} onClick={() => void perform('revise')}>{actionPending === 'revise' ? c.saving : c.saveRevision}</button>
            </div> : <div className="research-reading"><Markdown allowImages={false}>{content}</Markdown></div>}
          </section>}
        </>}
        {tab === 'evidence' && <EvidencePanel evidence={run.evidence} />}
        {tab === 'qa' && <>
          <QAPanel run={run} qa={qaResult.success ? qaResult.data : run.latestQa} />
          {hasDraft && <section className="research-panel research-qa-review-panel" aria-labelledby="research-qa-review-title">
            <h2 id="research-qa-review-title">{c.qaReviewTitle}</h2>
            <p className="field-hint">{c.qaReviewHint}</p>
            {revisionEditorDirty && <p className="research-blocking-reason" role="status">{c.qaReviewCurrent}</p>}
            <div className="research-qa-review-list">
              {manualQaGateIds.map(gateId => {
                const review = manualQaReview[gateId]
                const gateLabel = gateId === 'G07' ? c.qaGateG07 : gateId === 'G08' ? c.qaGateG08 : gateId === 'G09' ? c.qaGateG09 : c.qaGateG10
                const allowsNotApplicable = gateId === 'G07' || gateId === 'G08'
                return <fieldset className="research-qa-review-row" key={gateId}>
                  <legend><strong>{gateId}</strong> · {gateLabel}</legend>
                  <label>{c.qaReviewStatus}<select aria-label={`${gateId} ${c.qaReviewStatus}`} value={review.status} onChange={event => setManualQaReview(current => ({ ...current, [gateId]: { ...current[gateId], status: event.target.value as ManualQaStatus } }))}>
                    <option value="NOT_CHECKED">{c.qaReviewChoose}</option>
                    <option value="PASS">{c.pass}</option>
                    <option value="FAIL">{c.fail}</option>
                    {allowsNotApplicable && <option value="N_A">{c.notApplicable}</option>}
                  </select></label>
                  <label>{c.qaReviewEvidence}<textarea aria-label={`${gateId} ${c.qaReviewEvidence}`} value={review.evidence} maxLength={1_000} rows={3} onChange={event => setManualQaReview(current => ({ ...current, [gateId]: { ...current[gateId], evidence: event.target.value } }))} /></label>
                  {(review.status === 'FAIL' || review.status === 'N_A') && <label>{c.qaReviewReason}<textarea aria-label={`${gateId} ${c.qaReviewReason}`} value={review.reason} maxLength={2_000} rows={2} onChange={event => setManualQaReview(current => ({ ...current, [gateId]: { ...current[gateId], reason: event.target.value } }))} /></label>}
                  {review.status === 'FAIL' && <label>{c.qaReviewRemediation}<textarea aria-label={`${gateId} ${c.qaReviewRemediation}`} value={review.remediation} maxLength={2_000} rows={2} onChange={event => setManualQaReview(current => ({ ...current, [gateId]: { ...current[gateId], remediation: event.target.value } }))} /></label>}
                </fieldset>
              })}
            </div>
            <button type="button" disabled={actionPending !== null || !qaReviewReady || revisionEditorDirty} onClick={() => void saveQaReview()}>{actionPending === 'qa-review' ? c.saving : c.saveQaReview}</button>
          </section>}
        </>}
        {tab === 'activity' && <ActivityPanel attempts={run.attempts} />}
      </div>
      <div className="research-detail-side">
      <NextAction run={run} linkedPost={Boolean(run.linkedPostId)} />
        <Limitations run={run} />
        <section className="research-panel research-actions-panel" aria-labelledby="research-actions-title">
          <h2 id="research-actions-title">{c.nextAction}</h2>
          {!canGenerate && (!attemptAlreadyUsed || run.dispatchStatus === 'OUTCOME_UNKNOWN') && <p className="research-blocking-reason" id="research-generate-reason">{actionBlockedReason}</p>}
          {!attemptAlreadyUsed && <button type="button" aria-describedby={!canGenerate ? 'research-generate-reason' : undefined} disabled={!canGenerate || actionPending !== null} onClick={() => void perform('generate')}>{actionPending === 'generate' ? c.generating : c.generate}</button>}
          {hasDraft && <>
            {!canApprove && !revisionAlreadyApproved && <p className="research-blocking-reason" id="research-approve-reason">{approvalBlockedReason}</p>}
            {!revisionAlreadyApproved && <button type="button" className="secondary" aria-describedby={!canApprove ? 'research-approve-reason' : undefined} disabled={!canApprove || actionPending !== null} onClick={() => void perform('approve')}>{actionPending === 'approve' ? c.approving : c.approve}</button>}
            <div className="research-handoff-form">
              <h3>{run.linkedPostId ? configCopy.updateArticleDraft : c.handoff}</h3>
              <p className="field-hint">{c.handoffHint}</p>
              <p><strong>{c.access}:</strong> {c.member}</p>
              <label>{c.category}<input value={category} onChange={event => setCategory(event.target.value)} /></label>
              <label>{c.tags}<input value={tags} onChange={event => setTags(event.target.value)} /></label>
              {!linkedArticleCanUpdate && <p className="research-blocking-reason" id="research-handoff-reason">{configCopy.linkedArticleUnavailable}</p>}
              <button type="button" className="secondary" aria-describedby={!linkedArticleCanUpdate ? 'research-handoff-reason' : undefined} disabled={!canHandoff || actionPending !== null} onClick={() => void perform('handoff')}>{actionPending === 'handoff' ? c.handingOff : run.linkedPostId ? configCopy.updateArticleDraft : c.handoff}</button>
            </div>
          </>}
          {run.linkedPostId && <>
            {linkedArticle && <p className="research-linked-status"><strong>{c.linkedArticle}:</strong> {statusLabel(linkedArticle.status, c)} · {linkedArticle.access === 'MEMBER' ? c.member : c.public}</p>}
            {linkedDraftNeedsReview && <div className="research-linked-review-action">
              <p className="field-hint">{configCopy.importLinkedDraftHint}</p>
              <button type="button" className="secondary" disabled={actionPending !== null} onClick={() => void importLinkedDraftForReview()}>{actionPending === 'import-article' ? c.saving : configCopy.importLinkedDraft}</button>
            </div>}
            <Link className="button secondary" to={`/admin/blog/${encodeURIComponent(run.linkedPostId)}/edit`}>{c.openArticle}</Link>
          </>}
          <button type="button" className="secondary" disabled={actionPending !== null} onClick={() => { setFailure(null); setNotice(c.refreshed); setAttempt(value => value + 1) }}>{c.refresh}</button>
        </section>
      </div>
    </div>
  </section>
}
