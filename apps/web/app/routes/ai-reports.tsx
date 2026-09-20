import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useOutletContext } from 'react-router'
import type { ShellOutletContext } from '../root'
import {
  aiCapabilitiesSchema,
  aiConsentSchema,
  aiReportCancelResponseSchema,
  aiReportDetailSchema,
  aiReportGenerateRequestSchema,
  aiReportListResponseSchema,
  aiReportMutationResponseSchema,
  aiReportPreviewSchema,
  type AiCapabilities,
  type AiReportDetail,
  type AiReportMetric,
  type AiReportStatus,
  type AiReportSummary,
} from '@diary/contracts/ai-reports'
import { z } from 'zod'
import { api, useUi } from '../ui'
import { useSessionState } from '../session'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { aiCopy, aiFailureText, aiMetricText, type AiCopy as AiCopyTable } from '../ai-copy'
import './ai-reports.css'

type AiConsent = z.infer<typeof aiConsentSchema>
type AiReportPreview = z.infer<typeof aiReportPreviewSchema>
type AiReportGenerateBody = z.infer<typeof aiReportGenerateRequestSchema>
type AiReportPeriod = AiReportSummary['period']
type AiReportSource = AiReportDetail['sources'][number]
type AiAnalysisItemView = AiReportDetail['analysis'] extends null ? never : NonNullable<AiReportDetail['analysis']>['summary'][number]
type EvidenceLevel = AiAnalysisItemView['evidenceLevel']
type PeriodType = 'weekly' | 'monthly'

// Civil date helpers: period arithmetic happens on calendar dates in the
// account timezone, never by shifting UTC instants by a fixed offset.
const civilToday = (timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const shiftDays = (iso: string, days: number) => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10)
}
const previousMonthStart = (ym: string) => {
  const [year, month] = ym.split('-').map(Number)
  return month === 1 ? `${year! - 1}-12` : `${year}-${String(month! - 1).padStart(2, '0')}`
}
const mondayOf = (iso: string) => shiftDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7))
/** Descending period starts: index 0 is the current (partial) period, index 1 the last finished one. */
function periodStarts(type: PeriodType, timezone: string): string[] {
  const today = civilToday(timezone)
  const starts: string[] = []
  if (type === 'weekly') {
    const monday = mondayOf(today)
    for (let index = 0; index < 13; index += 1) starts.push(shiftDays(monday, -7 * index))
  } else {
    let month = today.slice(0, 7)
    for (let index = 0; index < 13; index += 1) { starts.push(`${month}-01`); month = previousMonthStart(month) }
  }
  return starts
}
// periodEndExclusive is not part of the period; the label shows the last included day.
const periodLabel = (period: AiReportPeriod) => period.periodType === 'weekly' ? `${period.periodStart} – ${shiftDays(period.periodEndExclusive, -1)}` : period.periodStart.slice(0, 7)
const jobSettled = (status: AiReportStatus) => status === 'succeeded' || status === 'failed' || status === 'cancelled'

// Server-validated source targets point at /api resources; the readable web
// route is the same path without the /api prefix. Null href stays a plain chip.
const sourceWebHref = (source: AiReportSource) => source.href?.startsWith('/api/') ? source.href.slice(4) : null

const evidenceLabels = (c: AiCopyTable): { recorded: string; interpretation: string; insufficient: string } => ({ recorded: c.evidenceRecorded, interpretation: c.evidenceInterpretation, insufficient: c.evidenceInsufficient })

export default function AiReports() {
  const { locale, t } = useUi()
  const c = aiCopy[locale]
  const session = useSessionState()
  const { authenticated } = useOutletContext<ShellOutletContext>()
  // Guards for async completions: the outlet remounts on session change, and
  // unmounted surfaces must never write back late responses.
  const mountedRef = useRef(true)
  const sessionRevRef = useRef(session.revision)
  sessionRevRef.current = session.revision
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; previewAbort.current?.abort() }
  }, [])
  const alive = (revision: number) => mountedRef.current && sessionRevRef.current === revision
  const [attempt, setAttempt] = useState(0)
  const [listAttempt, setListAttempt] = useState(0)
  const [pageFailure, setPageFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<'consent' | 'withdraw' | 'generate' | 'cancel' | 'delete' | null>(null)

  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null)
  const [denied, setDenied] = useState(false)
  const [consent, setConsent] = useState<AiConsent | null>(null)
  const [timezone, setTimezone] = useState<string | null>(null)

  const [periodType, setPeriodType] = useState<PeriodType>('weekly')
  const [startChoice, setStartChoice] = useState<string | null>(null)
  const [preview, setPreview] = useState<AiReportPreview | null>(null)
  const [previewPending, setPreviewPending] = useState(false)
  const [previewFailure, setPreviewFailure] = useState<Failure | null>(null)
  // A network failure leaves the exact submitted request ambiguous; the same
  // idempotency key and body are retained for a retry of that one logical
  // submission, never for a new explicit request.
  const [retained, setRetained] = useState<{ id: string | null; body: AiReportGenerateBody; key: string; fingerprint: string } | null>(null)

  const [list, setList] = useState<{ items: AiReportSummary[]; nextCursor: string | null } | null>(null)
  const [listDenied, setListDenied] = useState(false)
  const [listFailure, setListFailure] = useState<Failure | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AiReportDetail | null>(null)
  const [detailPending, setDetailPending] = useState(false)
  const [detailDenied, setDetailDenied] = useState(false)

  const translate = useRef(t); translate.current = t
  const previewAbort = useRef<AbortController | null>(null)
  const accessDeniedRef = useRef(false)
  const activeIdRef = useRef<string | null>(null)
  const capabilityRequestRef = useRef(0)
  // Deduplicates the capability refresh triggered when a polled job first settles.
  const settledRefreshRef = useRef<string | null>(null)
  const starts = useMemo(() => timezone ? periodStarts(periodType, timezone) : [], [periodType, timezone])
  // Default target is the last finished period (index 1); index 0 is the partial current one.
  const effectiveStart = startChoice ?? starts[1] ?? starts[0] ?? null
  const detailStatus: AiReportStatus | null = detail && detail.id === selectedId ? detail.status : null
  const consentCurrent = !!(capabilities?.recipientRevision && consent?.acceptedAt && !consent.revokedAt && consent.recipientRevision === capabilities.recipientRevision)
  // Any unrevoked acceptance stays withdrawable, even when the recipient revision has moved on.
  const consentAccepted = !!(consent?.acceptedAt && !consent.revokedAt)
  // Active-job state merges the selected detail (freshest, from polling) with its history summary,
  // so a stale running badge can never keep locking Generate after the job settles.
  const selectedSummary = list?.items.find(item => item.id === selectedId) ?? null
  const selectedStatus = detailStatus ?? selectedSummary?.status ?? null
  const activeJob = selectedStatus === 'queued' || selectedStatus === 'running'
  // Cancel targets the report actually in flight, even when a finished one is selected.
  const listedActiveId = activeJob && selectedId !== null ? selectedId : list?.items.find(item => !jobSettled(item.status))?.id ?? null
  if (listedActiveId) activeIdRef.current = listedActiveId
  else if (detail && jobSettled(detail.status) && detail.id === activeIdRef.current) activeIdRef.current = null
  const activeJobId = listedActiveId ?? activeIdRef.current

  const clearRevokedContent = useCallback(() => {
    accessDeniedRef.current = true
    previewAbort.current?.abort()
    setList(null); setDetail(null); setPreview(null); setRetained(null)
    setListDenied(true); setDetailDenied(true); setPreviewPending(false); setDetailPending(false)
  }, [])

  /** Refresh capability/quota without clearing preview or selection; never writes back across a session epoch. */
  const refreshCapabilities = useCallback(() => {
    const revision = sessionRevRef.current
    const request = ++capabilityRequestRef.current
    api.GET('/api/ai/capabilities').then(result => {
      if (!mountedRef.current || sessionRevRef.current !== revision || capabilityRequestRef.current !== request) return
      const parsed = aiCapabilitiesSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setCapabilities(parsed.data)
        if (parsed.data.reason === 'AI_ACCESS_DENIED') clearRevokedContent()
      }
    }).catch(() => undefined)
    api.GET('/api/ai/consent').then(result => {
      if (!mountedRef.current || sessionRevRef.current !== revision || capabilityRequestRef.current !== request) return
      const parsed = aiConsentSchema.nullable().safeParse(result.data)
      if (result.response.ok && parsed.success) setConsent(parsed.data)
    }).catch(() => undefined)
  }, [clearRevokedContent])


  // Bootstrap: capabilities, consent and display timezone, re-read per session epoch.
  // Private endpoints are only queried once the outlet confirms an authenticated session;
  // querying earlier fires a spurious 401 that would flag the page as denied.
  useEffect(() => {
    if (authenticated !== true) return
    const controller = new AbortController()
    const capabilityRequest = ++capabilityRequestRef.current
    accessDeniedRef.current = false; activeIdRef.current = null
    previewAbort.current?.abort()
    setCapabilities(null); setDenied(false); setConsent(null); setTimezone(null)
    setPageFailure(null); setNotice(null); setPreview(null); setPreviewPending(false); setPreviewFailure(null); setRetained(null)
    setSelectedId(null); setDetail(null); setDetailDenied(false); setStartChoice(null); setPeriodType('weekly')
    setList(null); setListDenied(false)
    api.GET('/api/ai/capabilities', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || accessDeniedRef.current || capabilityRequest !== capabilityRequestRef.current) return
      const parsed = aiCapabilitiesSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setCapabilities(parsed.data)
      else if (result.response.status === 403) setDenied(true)
      else setPageFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setPageFailure({ message: translate.current('connection'), fields: [] }) })
    api.GET('/api/ai/consent', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || capabilityRequest !== capabilityRequestRef.current) return
      const parsed = aiConsentSchema.nullable().safeParse(result.data)
      if (result.response.ok && parsed.success) setConsent(parsed.data)
    }).catch(() => undefined)
    api.GET('/api/auth/me', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || !result.response.ok || !result.data) return
      const me = result.data as { data?: { timezone?: string } }
      if (me.data?.timezone) setTimezone(me.data.timezone)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [attempt, session.revision, authenticated])

  // History list; kept separate so generating never resets the whole page.
  useEffect(() => {
    if (authenticated !== true) return
    const controller = new AbortController()
    setList(null); setListFailure(null); setListDenied(false)
    api.GET('/api/ai/reports', { params: { query: { limit: 20 } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted || accessDeniedRef.current) return
      const parsed = aiReportListResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setList({ items: parsed.data.data, nextCursor: parsed.data.nextCursor })
      else if (result.response.status === 403) clearRevokedContent()
      else setListFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setListFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
  }, [listAttempt, session.revision, authenticated, clearRevokedContent])

  // A stored preview encodes the request locale; switching languages invalidates it
  // and any in-flight preview answer would install a stale scope.
  useEffect(() => {
    previewAbort.current?.abort()
    setPreview(null); setPreviewPending(false); setPreviewFailure(null)
    // Ambiguous submissions retain their original locale and body for exact replay.
    setNotice(null)
  }, [locale])

  // Selected report; polls only while the job is non-terminal, the tab is
  // visible and this session epoch is still current.
  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailDenied(false); return }
    if (listDenied || detailDenied) return
    const controller = new AbortController()
    setDetailPending(true); setDetailDenied(false)
    const load = () => {
      api.GET('/api/ai/reports/{id}', { params: { path: { id: selectedId } }, signal: controller.signal }).then(result => {
        if (controller.signal.aborted || accessDeniedRef.current) return
        setDetailPending(false)
        const parsed = aiReportDetailSchema.safeParse(result.data)
        if (result.response.ok && parsed.success) {
          setDetail(parsed.data)
          if (jobSettled(parsed.data.status)) {
            setNotice(null)
            // Fold the terminal outcome into the history summary so a stale running badge
            // (here or in derived active-job state) never keeps Generate locked.
            setList(current => current && current.items.some(item => item.id === parsed.data!.id && item.status !== parsed.data!.status)
              ? { ...current, items: current.items.map(item => item.id === parsed.data!.id ? parsed.data! : item) }
              : current)
            const stamp = `${parsed.data.id}:${parsed.data.status}`
            if (settledRefreshRef.current !== stamp) { settledRefreshRef.current = stamp; refreshCapabilities() }
          }
        }
        // Revoked access: drop private content, stop polling indicators, keep only the safe id.
        else if (result.response.status === 403) clearRevokedContent()
        else {
          if (result.response.status === 404) {
            if (activeIdRef.current === selectedId) activeIdRef.current = null
            setList(current => current ? { ...current, items: current.items.filter(item => item.id !== selectedId) } : current)
          }
          setDetail(null); setPageFailure(apiFailure(result.error, translate.current('failed')))
        }
      }).catch(() => { if (!controller.signal.aborted) { setDetailPending(false); setPageFailure({ message: translate.current('connection'), fields: [] }) } })
    }
    load()
    let timer: number | undefined
    if (detailStatus === 'queued' || detailStatus === 'running') {
      timer = window.setInterval(() => { if (document.visibilityState === 'visible') load() }, 5000)
    }
    return () => { controller.abort(); if (timer !== undefined) window.clearInterval(timer) }
  }, [selectedId, detailStatus, session.revision, refreshCapabilities, listDenied, detailDenied, clearRevokedContent])

  // Keep the outstanding job current even while the owner reads another revision.
  useEffect(() => {
    if (!activeJobId || activeJobId === selectedId || listDenied || detailDenied) return
    const controller = new AbortController()
    const load = async () => {
      try {
        const result = await api.GET('/api/ai/reports/{id}', { params: { path: { id: activeJobId } }, signal: controller.signal })
        if (controller.signal.aborted || accessDeniedRef.current) return
        if (result.response.status === 403) { clearRevokedContent(); return }
        if (result.response.status === 404) {
          activeIdRef.current = null
          setList(current => current ? { ...current, items: current.items.filter(item => item.id !== activeJobId) } : current)
          refreshCapabilities(); return
        }
        const parsed = aiReportDetailSchema.safeParse(result.data)
        if (!result.response.ok || !parsed.success) return
        setList(current => current ? { ...current, items: current.items.map(item => item.id === activeJobId ? parsed.data : item) } : current)
        if (jobSettled(parsed.data.status)) { activeIdRef.current = null; refreshCapabilities() }
      } catch { /* The next visible poll can recover a transient read failure. */ }
    }
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [activeJobId, selectedId, listDenied, detailDenied, clearRevokedContent, refreshCapabilities])

  function choosePeriodType(next: PeriodType) {
    previewAbort.current?.abort()
    setPeriodType(next); setStartChoice(null)
    setPreview(null); setPreviewPending(false); setPreviewFailure(null)
  }
  function chooseStart(next: string) {
    previewAbort.current?.abort()
    setStartChoice(next)
    setPreview(null); setPreviewPending(false); setPreviewFailure(null)
  }

  async function runPreview() {
    if (!effectiveStart || retained) return
    const controller = new AbortController()
    previewAbort.current?.abort()
    previewAbort.current = controller
    setPreviewPending(true); setPreviewFailure(null); setNotice(null)
    // A fresh scope check supersedes any ambiguous generate attempt tied to the old one.
    const revision = sessionRevRef.current
    try {
      const result = await api.POST('/api/ai/reports/preview', { body: { periodType, periodStart: effectiveStart, locale }, signal: controller.signal })
      if (!alive(revision) || controller.signal.aborted) return
      const parsed = aiReportPreviewSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPreview(null); setPreviewFailure(apiFailure(result.error, t('failed'))); return }
      setPreview(parsed.data)
      refreshCapabilities()
    } catch {
      if (!controller.signal.aborted && alive(revision)) { setPreview(null); setPreviewFailure({ message: t('connection'), fields: [] }) }
    } finally {
      if (!controller.signal.aborted && alive(revision)) setPreviewPending(false)
    }
  }


  async function acceptConsent() {
    if (!capabilities?.recipientRevision || !capabilities.disclosureVersion) return
    setPending('consent'); setPageFailure(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.PUT('/api/ai/consent', { body: { recipientRevision: capabilities.recipientRevision, disclosureVersion: capabilities.disclosureVersion } })
      if (!alive(revision)) return
      const parsed = aiConsentSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) setPageFailure(apiFailure(result.error, t('failed')))
      else {
        setConsent(parsed.data)
        refreshCapabilities()
      }
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  async function withdrawConsent() {
    if (!window.confirm(c.consentWithdrawConfirm)) return
    setPending('withdraw'); setPageFailure(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.DELETE('/api/ai/consent')
      if (!alive(revision)) return
      if (!result.response.ok) { setPageFailure(apiFailure(result.error, t('failed'))); return }
      const parsed = aiConsentSchema.nullable().safeParse(result.data)
      setConsent(parsed.success ? parsed.data : null)
      setNotice(c.consentWithdrawn)
      setPreview(null)
      refreshCapabilities()
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  async function generate() {
    if (retained && retained.id !== null) return
    // An ambiguous attempt (network loss, 5xx, unreadable success) is replayed verbatim:
    // same body, same idempotency key — the server deduplicates it without charging quota again.
    const retry = retained?.id === null ? retained : null
    if (!retry && !preview) return
    // The contract is authoritative: the submitted period and locale come from the confirmed
    // preview, never from form controls the user may have changed since.
    const body: AiReportGenerateBody = retry?.body ?? {
      periodType: preview!.period.periodType,
      periodStart: preview!.period.periodStart,
      locale: preview!.locale,
      confirmedRecipientRevision: preview!.recipientRevision,
      previewFingerprint: preview!.previewFingerprint,
    }
    const fingerprint = retry?.fingerprint ?? JSON.stringify(body)
    const key = retry?.key ?? crypto.randomUUID()
    setPending('generate'); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.POST('/api/ai/reports', { params: { header: { 'Idempotency-Key': key } }, body })
      if (!alive(revision)) return
      const parsed = aiReportMutationResponseSchema.safeParse(result.data)
      if (!result.response.ok) {
        // A 5xx leaves the outcome unknown: keep body+key so a retry replays the same job.
        if (result.response.status >= 500) setRetained({ id: null, body, key, fingerprint })
        else setRetained(null)
        setPageFailure(apiFailure(result.error, t('failed'))); return
      }
      if (!parsed.success) { setRetained({ id: null, body, key, fingerprint }); setPageFailure(apiFailure(result.error, t('failed'))); return }
      setRetained(null)
      setNotice(parsed.data.reused ? c.generateReused : c.generateQueued)
      if (!jobSettled(parsed.data.data.status)) activeIdRef.current = parsed.data.data.id
      setSelectedId(parsed.data.data.id)
      setListAttempt(value => value + 1)
      refreshCapabilities()
    } catch {
      if (alive(revision)) { setRetained({ id: null, body, key, fingerprint }); setPageFailure({ message: t('connection'), fields: [] }) }
    } finally { if (alive(revision)) setPending(null) }
  }

  /** Regeneration re-previews the selected report's own period and locale; never the top form controls. */
  async function regenerateSelected() {
    if (retained?.id === null) return
    const report = detail
    const prior = retained?.id ? retained : null
    const reportId = prior?.id ?? report?.id
    if (!reportId || (!prior && !report)) return
    if (!prior && !window.confirm(c.regenerateConfirm)) return
    setPending('generate'); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    let body: AiReportGenerateBody | undefined
    let fingerprint: string | undefined
    let key: string | undefined
    try {
      if (prior) {
        ({ body, key, fingerprint } = prior)
      } else {
        const scope = { periodType: report!.period.periodType, periodStart: report!.period.periodStart, locale: report!.locale }
        const previewResult = await api.POST('/api/ai/reports/preview', { body: scope })
        if (!alive(revision)) return
        const previewParsed = aiReportPreviewSchema.safeParse(previewResult.data)
        if (!previewResult.response.ok || !previewParsed.success) { setPageFailure(apiFailure(previewResult.error, t('failed'))); return }
        body = {
          ...scope,
          confirmedRecipientRevision: previewParsed.data.recipientRevision,
          previewFingerprint: previewParsed.data.previewFingerprint,
        }
        fingerprint = JSON.stringify(body)
        key = crypto.randomUUID()
      }
      if (body === undefined || key === undefined || fingerprint === undefined) return
      const result = await api.POST('/api/ai/reports/{id}/regenerate', { params: { path: { id: reportId }, header: { 'Idempotency-Key': key } }, body })
      if (!alive(revision)) return
      const parsed = aiReportMutationResponseSchema.safeParse(result.data)
      if (!result.response.ok) {
        if (result.response.status >= 500) setRetained({ id: reportId, body, key, fingerprint })
        else setRetained(null)
        setPageFailure(apiFailure(result.error, t('failed'))); return
      }
      if (!parsed.success) { setRetained({ id: reportId, body, key, fingerprint }); setPageFailure(apiFailure(result.error, t('failed'))); return }
      setRetained(null)
      if (!jobSettled(parsed.data.data.status)) activeIdRef.current = parsed.data.data.id
      setNotice(parsed.data.reused ? c.generateReused : c.generateQueued)
      setSelectedId(parsed.data.data.id)
      setListAttempt(value => value + 1)
      refreshCapabilities()
    } catch {
      if (alive(revision) && body && key && fingerprint) { setRetained({ id: reportId, body, key, fingerprint }); setPageFailure({ message: t('connection'), fields: [] }) }
    } finally { if (alive(revision)) setPending(null) }
  }

  async function cancelJob() {
    // Always targets the report actually in flight, not whichever one is selected.
    const id = activeJobId
    if (!id || !window.confirm(c.cancelConfirm)) return
    setPending('cancel'); setPageFailure(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.POST('/api/ai/reports/{id}/cancel', { params: { path: { id } } })
      if (!alive(revision)) return
      const parsed = aiReportCancelResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPageFailure(apiFailure(result.error, t('failed'))); return }
      setNotice(c.cancelDone)
      if (jobSettled(parsed.data.status)) activeIdRef.current = null
      setDetail(current => current && current.id === id ? { ...current, status: parsed.data.status } : current)
      setList(current => current ? { ...current, items: current.items.map(item => item.id === id ? { ...item, status: parsed.data.status } : item) } : current)
      if (jobSettled(parsed.data.status)) refreshCapabilities()
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  async function deleteReport() {
    const id = selectedId
    if (!id || !window.confirm(c.deleteConfirm)) return
    setPending('delete'); setPageFailure(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.DELETE('/api/ai/reports/{id}', { params: { path: { id } } })
      if (!alive(revision)) return
      if (!result.response.ok) { setPageFailure(apiFailure(result.error, t('failed'))); return }
      setNotice(c.deleteDone)
      if (activeIdRef.current === id) activeIdRef.current = null
      setSelectedId(null); setDetail(null)
      setList(current => current ? { ...current, items: current.items.filter(item => item.id !== id) } : current)
      if (!accessDeniedRef.current) setListAttempt(value => value + 1)
      refreshCapabilities()
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  async function loadMoreHistory() {
    if (!list?.nextCursor) return
    const revision = sessionRevRef.current
    try {
      const result = await api.GET('/api/ai/reports', { params: { query: { limit: 20, cursor: list.nextCursor } } })
      if (!alive(revision) || accessDeniedRef.current) return
      if (result.response.status === 403) { clearRevokedContent(); return }
      const parsed = aiReportListResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setListFailure(apiFailure(result.error, t('failed'))); return }
      setList(current => current ? { items: [...current.items, ...parsed.data.data.filter(item => !current.items.some(known => known.id === item.id))], nextCursor: parsed.data.nextCursor } : current)
    } catch { if (alive(revision)) setListFailure({ message: t('connection'), fields: [] }) }
  }

  const statusLabel = (status: AiReportStatus) => c[`status${status[0]!.toUpperCase()}${status.slice(1)}` as 'statusQueued' | 'statusRunning' | 'statusSucceeded' | 'statusFailed' | 'statusCancelled']
  // `reason` is a stable error code from the server; map it to localized text.
  const gateLine = !denied && capabilities && !capabilities.canGenerate
    ? aiFailureText(capabilities.reason ?? undefined, locale) ?? c.gateLocked
    : null
  const evidenceBadgeClass = (level: EvidenceLevel) => level === 'interpretation' ? 'badge badge-info' : level === 'insufficient' ? 'badge badge-warn' : 'badge'
  const sourceTypeLabel = (source: AiReportSource) => source.sourceType === 'diary' ? c.sourceDiary : source.sourceType === 'transaction' ? c.sourceTransaction : source.sourceType === 'discipline' ? c.sourceDiscipline : c.sourceHolding
  const sourceChip = (alias: string): ReactNode => {
    const source = detail?.sources.find(entry => entry.alias === alias)
    const href = source ? sourceWebHref(source) : null
    const text = source ? `${alias} · ${sourceTypeLabel(source)}` : alias
    return href ? <a key={alias} className="ai-source-chip" href={href}>{text}</a> : <span key={alias} className="ai-source-chip">{text}</span>
  }
  // Preview and report metrics render side by side; scoping keeps their DOM ids distinct
  // so analysis refs always anchor into the report's own metric list.
  const metricRow = (scope: 'preview' | 'report', metric: AiReportMetric) => <div key={metric.id} id={`ai-metric-${scope}-${metric.id}`} className="ai-metric" title={metric.definition}>
    <dt>{aiMetricText('labels', metric.label, locale)}</dt>
    <dd>{metric.availability === 'unavailable' || metric.value === null ? <span className="muted">{c.metricUnavailable}</span> : <span className="ai-metric-value">{metric.value}{metric.unit ? <small> {aiMetricText('units', metric.unit, locale)}</small> : null}</span>}</dd>
  </div>
  const metricRefChip = (ref: string): ReactNode => <a key={ref} className="ai-metric-ref" href={`#ai-metric-report-${ref}`}>{aiMetricText('labels', ref, locale)}</a>
  const coverageList = (coverage: AiReportPreview['coverage'] | AiReportDetail['coverage']) => <>
    <dl className="ai-coverage-list">
      <div><dt>{c.coverageDiaries}</dt><dd className="num">{coverage.diaries.count}</dd></div>
      <div><dt>{c.coverageTransactions}</dt><dd className="num">{coverage.transactions.count}</dd></div>
      <div><dt>{c.coverageHoldings}</dt><dd className="num">{coverage.holdings.count}</dd></div>
      <div><dt>{c.coverageDisciplines}</dt><dd className="num">{coverage.disciplines.count}</dd></div>
    </dl>
    {coverage.notes.length > 0 && <ul className="ai-notes">{coverage.notes.map((note, index) => <li key={index}>{aiMetricText('notes', note, locale)}</li>)}</ul>}
  </>

  const showReport = detail !== null && detail.id === selectedId
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: showReport ? detail!.timezone : undefined })
  const fmt = (value: string | null) => value ? <time dateTime={value}>{dateFmt.format(new Date(value))}</time> : '—'

  // The outlet's session state gates everything: query nothing private until it confirms auth.
  if (authenticated !== true) {
    return <section className="ai-page"><h1>{c.title}</h1><div className="ai-gate" role="note"><p>{authenticated === false ? t('loginRequired') : t('loading')}</p></div></section>
  }

  return <section className="ai-page">
    <header className="ai-header"><h1>{c.title}</h1><p className="lede">{c.lede}</p></header>

    {denied && <div className="ai-gate" role="note"><p>{c.gateLocked}</p></div>}
    {gateLine && <div className="ai-gate" role="note"><p>{gateLine}</p></div>}
    {capabilities && capabilities.remainingQuota !== null && capabilities.monthlyQuota !== null && <p className="ai-quota muted">{c.quotaLine.replace('{n}', String(capabilities.remainingQuota)).replace('{total}', String(capabilities.monthlyQuota))}</p>}

    <FailureNotice failure={pageFailure} />
    {pageFailure && !retained && <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button>}
    {notice && <p className="success" role="status">{notice}</p>}
    {retained?.id && <button type="button" className="secondary" data-testid="ai-retry-submission" disabled={pending !== null} onClick={() => void regenerateSelected()}>{c.retrySubmission}</button>}

    {!denied && !listDenied && !detailDenied && capabilities && <section className="card ai-generate" aria-labelledby="ai-generate-title">
      <h2 id="ai-generate-title">{c.sectionGenerate}</h2>
      <fieldset className="ai-period" disabled={retained !== null || pending !== null}>
        <legend className="ai-sr">{c.period}</legend>
        <div className="ai-period-type" role="radiogroup" aria-label={c.period}>
          <label><input type="radio" name="ai-period-type" checked={periodType === 'weekly'} onChange={() => choosePeriodType('weekly')} /> {c.weekly}</label>
          <label><input type="radio" name="ai-period-type" checked={periodType === 'monthly'} onChange={() => choosePeriodType('monthly')} /> {c.monthly}</label>
        </div>
        <label className="ai-period-start">{c.period}
          <select data-testid="ai-period-select" value={effectiveStart ?? ''} onChange={event => chooseStart(event.target.value)}>
            {starts.map(start => <option key={start} value={start}>{periodType === 'weekly' ? `${start} – ${shiftDays(start, 6)}` : start.slice(0, 7)}</option>)}
          </select>
        </label>
        <p className="muted ai-period-hint">{c.periodHint}</p>
      </fieldset>
      <div className="ai-preview-row">
        <button type="button" className="secondary" data-testid="ai-preview" disabled={!effectiveStart || previewPending || retained !== null || pending !== null} onClick={() => void runPreview()}>{previewPending ? c.previewPending : c.previewAction}</button>
        <p className="muted">{c.previewHint}</p>
      </div>
      <FailureNotice failure={previewFailure} messageOverride={previewFailure ? aiFailureText(previewFailure.code, locale) ?? previewFailure.message : undefined} />
      {preview && <section className="ai-coverage" aria-label={c.coverageTitle}>
        <h3>{c.coverageTitle}{preview.period.isPartialPeriod ? <> <span className="badge badge-warn">{c.partialBadge}</span></> : null}</h3>
        {preview.period.isPartialPeriod && <p className="ai-note">{c.partialPeriod}</p>}
        {coverageList(preview.coverage)}
        <h4>{c.metricsTitle}</h4>
        <dl className="ai-metrics">{preview.metrics.map(metric => metricRow('preview', metric))}</dl>
      </section>}
      {capabilities.recipientRevision !== null && <section className="ai-consent" aria-labelledby="ai-consent-title">
        <h3 id="ai-consent-title">{c.consentTitle}</h3>
        <p><strong>{c.consentRecipient}:</strong> {capabilities.recipientName ?? '—'}</p>
        {capabilities.disclosureText && <p className="ai-disclosure">{capabilities.disclosureText}</p>}
        {!consentCurrent && <button type="button" className="secondary" data-testid="ai-consent-accept" disabled={pending !== null} onClick={() => void acceptConsent()}>{c.consentAccept}</button>}
        {consentAccepted && <p className="muted">
          {consentCurrent && <>{c.consentCurrent.replace('{date}', consent?.acceptedAt ? dateFmt.format(new Date(consent.acceptedAt)) : '—')}{' '}</>}
          <button type="button" className="button-compact secondary" disabled={pending !== null} onClick={() => void withdrawConsent()}>{c.consentWithdraw}</button>
        </p>}
      </section>}
      <div className="ai-generate-row">
        <button type="button" className="button" data-testid="ai-generate"
          disabled={pending !== null || (retained !== null && retained.id !== null) || (activeJobId !== null && retained?.id !== null) || !consentCurrent || (!capabilities.canGenerate && retained?.id !== null) || ((!preview || preview.recipientRevision !== capabilities.recipientRevision) && retained?.id !== null)}
          title={!consentCurrent ? c.gateConsent : !preview && retained?.id !== null ? c.generateNeedPreview : !capabilities.canGenerate && retained?.id !== null ? gateLine ?? undefined : undefined}
          onClick={() => void generate()}>{c.generate}</button>
        {!preview && retained?.id !== null && <p className="muted">{c.generateNeedPreview}</p>}
        {!consentCurrent && <p className="muted">{c.gateConsent}</p>}
      </div>
      <p className="muted ai-quota-note">{c.quotaChargeNote}</p>
      <p className="muted ai-language-note">{c.reportLanguageNote}</p>
    </section>}

    {activeJobId && <div className="card ai-active" data-testid="ai-active" role="status">
      <p><strong>{c.activeJobTitle}</strong></p>
      <button type="button" className="secondary" data-testid="ai-cancel" disabled={pending !== null} onClick={() => void cancelJob()}>{c.cancelJob}</button>
    </div>}

    <div className="ai-workspace">
      <nav className="ai-history" aria-labelledby="ai-history-title">
        <h2 id="ai-history-title">{c.historyTitle}</h2>
        <FailureNotice failure={listFailure} />
        {listDenied && <div className="ai-gate" role="note"><p>{aiFailureText('AI_ACCESS_DENIED', locale)!}</p></div>}
        {list === null && !listFailure && !listDenied ? <p role="status">{t('loading')}</p>
          : list !== null && list.items.length === 0 ? <div className="empty-state"><p>{c.historyEmpty}</p></div>
            : list !== null && <><ul className="ai-history-list" data-testid="ai-history">
              {list.items.map(item => <li key={item.id}>
                <button type="button" className="ai-history-item" data-testid="ai-history-item" aria-current={item.id === selectedId || undefined} onClick={() => { setSelectedId(item.id); setNotice(null); setPageFailure(null); setDetailDenied(false) }}>
                  <span className="ai-history-period"><time dateTime={item.period.periodStart}>{periodLabel(item.period)}</time></span>
                  <span className="ai-history-meta">{item.period.periodType === 'weekly' ? c.weekly : c.monthly} · {c.revisionShort.replace('{n}', String(item.revision))}</span>
                  <span className={`badge${item.status === 'succeeded' ? '' : item.status === 'failed' || item.status === 'cancelled' ? ' badge-warn' : ' badge-info'}`}>{statusLabel(item.status)}</span>
                  {item.sourceState !== 'current' && <span className="badge badge-warn">{item.sourceState === 'changed' ? c.sourceChanged : c.sourceInvalidated}</span>}
                </button>
              </li>)}
            </ul>
              {list.nextCursor && <button type="button" className="secondary" onClick={() => void loadMoreHistory()}>{c.loadMore}</button>}
            </>}
      </nav>
      <div className="ai-report-column">
        {!selectedId ? <div className="empty-state"><p>{c.reportNone}</p></div>
          : detailDenied ? <div className="ai-gate" role="note"><p>{aiFailureText('AI_ACCESS_DENIED', locale)!}</p><button type="button" className="secondary ai-delete" data-testid="ai-delete" disabled={pending !== null} onClick={() => void deleteReport()}>{c.deleteReport}</button></div>
            : detailPending && !showReport ? <p role="status">{c.reportLoading}</p>
              : showReport && <article className="ai-report" data-testid="ai-report">
              <div className="ai-report-actions">
                {detail!.status === 'succeeded' && <button type="button" className="secondary button-compact" data-testid="ai-regenerate" disabled={pending !== null || !consentCurrent || (retained !== null && retained.id !== detail!.id)} onClick={() => void regenerateSelected()}>{c.regenerate}</button>}
                {activeJob && <button type="button" className="secondary button-compact" data-testid="ai-cancel-inline" disabled={pending !== null} onClick={() => void cancelJob()}>{c.cancelJob}</button>}
                <button type="button" className="secondary button-compact ai-delete" data-testid="ai-delete" disabled={pending !== null} onClick={() => void deleteReport()}>{c.deleteReport}</button>
              </div>
              <header className="ai-report-header">
                <h2>{periodLabel(detail!.period)} · {detail!.period.periodType === 'weekly' ? c.weekly : c.monthly} <span className={`badge${detail!.status === 'succeeded' ? '' : ' badge-warn'}`}>{statusLabel(detail!.status)}</span>{detail!.period.isPartialPeriod ? <> <span className="badge badge-warn">{c.partialBadge}</span></> : null}</h2>
                <dl className="ai-meta">
                  <div><dt>{c.metaGeneratedAt}</dt><dd>{fmt(detail!.generatedAt)}</dd></div>
                  <div><dt>{c.metaSnapshot}</dt><dd>{fmt(detail!.snapshotCapturedAt)}</dd></div>
                  <div><dt>{c.metaTimezone}</dt><dd>{detail!.timezone}</dd></div>
                  <div><dt>{c.metaLocale}</dt><dd>{detail!.locale}</dd></div>
                  <div><dt>{c.metaModel}</dt><dd>{detail!.model ?? '—'}</dd></div>
                  <div><dt>{c.metaPromptVersion}</dt><dd>{detail!.promptVersion ?? '—'}</dd></div>
                  <div><dt>{c.metaSchemaVersion}</dt><dd>{detail!.schemaVersion}</dd></div>
                  <div><dt>{c.metaRevision}</dt><dd>{c.revisionShort.replace('{n}', String(detail!.revision))}</dd></div>
                </dl>
                <p className={`ai-source-note${detail!.sourceState === 'invalidated' ? ' ai-source-note-invalid' : ''}`} role="note">{detail!.sourceState === 'changed' ? c.sourceChanged : detail!.sourceState === 'invalidated' ? c.sourceInvalidated : c.sourceCurrent}</p>
                {detail!.errorCode && <FailureNotice failure={{ message: aiFailureText(detail!.errorCode, locale) ?? detail!.errorCode, code: detail!.errorCode, fields: [] }} />}
              </header>
              <section className="ai-server-data" aria-labelledby="ai-metrics-title">
                <h3 id="ai-metrics-title">{c.metricsTitle}</h3>
                {coverageList(detail!.coverage)}
                {detail!.metrics.length > 0 && <dl className="ai-metrics">{detail!.metrics.map(metric => metricRow('report', metric))}</dl>}
              </section>
              {detail!.analysis ? <>
                <AnalysisSection id="ai-section-summary" title={c.sectionSummary} items={detail!.analysis.summary} empty={c.analysisEmpty} evidenceBadgeClass={evidenceBadgeClass} sourceChip={sourceChip} metricRef={metricRefChip} labels={evidenceLabels(c)} />
                <AnalysisSection id="ai-section-decision" title={c.sectionDecision} items={detail!.analysis.decisionReview} empty={c.analysisEmpty} evidenceBadgeClass={evidenceBadgeClass} sourceChip={sourceChip} metricRef={metricRefChip} labels={evidenceLabels(c)} />
                <AnalysisSection id="ai-section-position" title={c.sectionPosition} items={detail!.analysis.positionReview} empty={c.analysisEmpty} evidenceBadgeClass={evidenceBadgeClass} sourceChip={sourceChip} metricRef={metricRefChip} labels={evidenceLabels(c)} />
                <section className="ai-analysis-section" aria-labelledby="ai-market-title">
                  <h3 id="ai-market-title">{c.sectionMarket}</h3>
                  <p className="muted ai-note">{c.sectionMarketNote}</p>
                  <AnalysisItems items={detail!.analysis.marketReflection} empty={c.analysisEmpty} evidenceBadgeClass={evidenceBadgeClass} sourceChip={sourceChip} metricRef={metricRefChip} labels={evidenceLabels(c)} />
                </section>
                <section className="ai-analysis-section" aria-labelledby="ai-discipline-title">
                  <h3 id="ai-discipline-title">{c.sectionDiscipline}</h3>
                  {detail!.analysis.disciplineChecks.length === 0 ? <p className="muted">{c.analysisEmpty}</p> : <ul className="ai-discipline-list">
                    {detail!.analysis.disciplineChecks.map((check, index) => <li key={`${check.ruleSourceId}-${index}`}>
                      <div className="ai-discipline-head">
                        {sourceChip(check.ruleSourceId)}
                        <span className={`badge${check.assessment === 'possible_deviation' ? ' badge-warn' : check.assessment === 'insufficient_evidence' ? ' badge-info' : ''}`}>{check.assessment === 'supported_by_records' ? c.assessmentSupported : check.assessment === 'possible_deviation' ? c.assessmentDeviation : c.assessmentInsufficient}</span>
                      </div>
                      <p className="ai-analysis-text">{check.observation.text}</p>
                      <ItemRefs item={check.observation} evidenceBadgeClass={evidenceBadgeClass} sourceChip={sourceChip} metricRef={metricRefChip} labels={evidenceLabels(c)} />
                      {check.followUpQuestion && <p className="ai-followup"><strong>{c.followUp}:</strong> {check.followUpQuestion}</p>}
                    </li>)}
                  </ul>}
                </section>
                <section className="ai-analysis-section" aria-labelledby="ai-next-title">
                  <h3 id="ai-next-title">{c.sectionNext}</h3>
                  {detail!.analysis.nextPeriodFocus.length === 0 ? <p className="muted">{c.analysisEmpty}</p> : <ol className="ai-focus-list">{detail!.analysis.nextPeriodFocus.map((item, index) => <li key={index}><p className="ai-analysis-text">{item.text}</p><ItemRefs item={item} evidenceBadgeClass={evidenceBadgeClass} sourceChip={sourceChip} metricRef={metricRefChip} labels={evidenceLabels(c)} /></li>)}</ol>}
                </section>
                <section className="ai-analysis-section" aria-labelledby="ai-limitations-title">
                  <h3 id="ai-limitations-title">{c.sectionLimitations}</h3>
                  {detail!.analysis.limitations.length === 0 ? <p className="muted">{c.analysisEmpty}</p> : <ul className="ai-notes">{detail!.analysis.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul>}
                </section>
              </> : detail!.status === 'succeeded' ? <p className="ai-note" role="note">{c.sourceInvalidated}</p> : null}
            </article>}
      </div>
    </div>
  </section>
}

function ItemRefs({ item, evidenceBadgeClass, sourceChip, metricRef, labels }: {
  item: { evidenceLevel: EvidenceLevel; sourceIds: readonly string[]; metricRefs: readonly string[] }
  evidenceBadgeClass: (level: EvidenceLevel) => string
  sourceChip: (alias: string) => ReactNode
  metricRef: (ref: string) => ReactNode
  labels: { recorded: string; interpretation: string; insufficient: string }
}) {
  return <p className="ai-item-refs">
    <span className={evidenceBadgeClass(item.evidenceLevel)}>{labels[item.evidenceLevel]}</span>
    {item.sourceIds.map(sourceChip)}
    {item.metricRefs.map(metricRef)}
  </p>
}

function AnalysisItems({ items, empty, evidenceBadgeClass, sourceChip, metricRef, labels }: {
  items: readonly AiAnalysisItemView[]
  empty: string
  evidenceBadgeClass: (level: EvidenceLevel) => string
  sourceChip: (alias: string) => ReactNode
  metricRef: (ref: string) => ReactNode
  labels: { recorded: string; interpretation: string; insufficient: string }
}) {
  if (items.length === 0) return <p className="muted">{empty}</p>
  return <ul className="ai-analysis-list">{items.map((item, index) => <li key={index}>
    <p className="ai-analysis-text">{item.text}</p>
    <ItemRefs item={item} evidenceBadgeClass={evidenceBadgeClass} sourceChip={sourceChip} metricRef={metricRef} labels={labels} />
  </li>)}</ul>
}

function AnalysisSection({ id, title, items, empty, evidenceBadgeClass, sourceChip, metricRef, labels }: {
  id: string
  title: string
  items: readonly AiAnalysisItemView[]
  empty: string
  evidenceBadgeClass: (level: EvidenceLevel) => string
  sourceChip: (alias: string) => ReactNode
  metricRef: (ref: string) => ReactNode
  labels: { recorded: string; interpretation: string; insufficient: string }
}) {
  return <section className="ai-analysis-section" aria-labelledby={id}>
    <h3 id={id}>{title}</h3>
    <AnalysisItems items={items} empty={empty} evidenceBadgeClass={evidenceBadgeClass} sourceChip={sourceChip} metricRef={metricRef} labels={labels} />
  </section>
}
