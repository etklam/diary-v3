import { useEffect, useRef, useState } from 'react'
import { aiAdminSettingsResponseSchema, aiPromptVersionSchema, type AiPromptVersion } from '@diary/contracts/admin-ai'
import { z } from 'zod'
import { api, useUi } from '../ui'
import { useSessionState } from '../session'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { adminAiCopy } from '../ai-copy'
import { ConfirmDialog } from '../authoring-controls'
import { AdminAiShell, AdminAiStatusBadge, useAdminAiDateTime, useAdminAiSettings } from './admin-ai-shell'

type PromptType = 'weekly' | 'monthly'
type Action = 'draft' | 'test' | 'publish' | 'restore-default'

const promptListSchema = z.object({ data: z.array(aiPromptVersionSchema) })

/**
 * One job: the weekly and monthly report prompt templates.
 *
 * Two editors live here because they are the same job on two report types, and
 * each editor commits only its own template. The three actions that follow a
 * save act on the saved revision, so they stay disabled while that editor is
 * dirty — the same rule the provider view applies to its paid test.
 */
export default function AdminAiReportPrompts() {
  const { locale, t } = useUi()
  const c = adminAiCopy[locale]
  const session = useSessionState()
  const state = useAdminAiSettings()
  const { settings, setSettings, adminReady, alive, sessionRevision } = state
  const fmtDateTime = useAdminAiDateTime()
  const translate = useRef(t); translate.current = t

  const [prompts, setPrompts] = useState<AiPromptVersion[] | null>(null)
  const [drafts, setDrafts] = useState<{ weekly: string; monthly: string } | null>(null)
  const [saved, setSaved] = useState<{ weekly: string; monthly: string } | null>(null)
  const [revisions, setRevisions] = useState<{ weekly: number; monthly: number }>({ weekly: 0, monthly: 0 })
  const [status, setStatus] = useState<{ weekly: 'draft' | 'published' | null; monthly: 'draft' | 'published' | null }>({ weekly: null, monthly: null })
  const [test, setTest] = useState<{ weekly?: { revision: number; analysis: unknown }; monthly?: { revision: number; analysis: unknown } }>({})
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [confirming, setConfirming] = useState<{ action: Action; type: PromptType } | null>(null)

  useEffect(() => { setNotice(null) }, [locale])

  // Version history is this view's own read; the templates come from the
  // settings document the shell and the provider view also use.
  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    setPrompts(null); setTest({}); setHydrated(false)
    api.GET('/api/admin/ai/prompts', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = promptListSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, translate.current('failed'))); return }
      setPrompts(parsed.data.data)
      // expectedRevision always targets the newest known revision of each type.
      const latest = (type: PromptType) => Math.max(0, ...parsed.data.data.filter(version => version.reportType === type).map(version => version.revision))
      setRevisions(current => ({ weekly: Math.max(current.weekly, latest('weekly')), monthly: Math.max(current.monthly, latest('monthly')) }))
    }).catch(() => { if (!controller.signal.aborted) setFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
    // Re-read per session epoch only; a locale switch must not refetch.
  }, [adminReady, session.revision])

  useEffect(() => {
    if (!settings || hydrated) return
    setDrafts({ weekly: settings.prompts.weekly?.template ?? '', monthly: settings.prompts.monthly?.template ?? '' })
    setSaved({ weekly: settings.prompts.weekly?.template ?? '', monthly: settings.prompts.monthly?.template ?? '' })
    setRevisions(current => ({
      weekly: Math.max(current.weekly, settings.prompts.weekly?.revision ?? 0),
      monthly: Math.max(current.monthly, settings.prompts.monthly?.revision ?? 0),
    }))
    setStatus({ weekly: settings.prompts.weekly?.status ?? null, monthly: settings.prompts.monthly?.status ?? null })
    setHydrated(true)
  }, [settings, hydrated])

  async function promptAction(type: PromptType, action: Action) {
    const key = `${action}:${type}`
    setPending(key); setFailure(null); setNotice(null)
    const revision = sessionRevision()
    try {
      const body = action === 'draft'
        ? { template: drafts?.[type] ?? '', expectedRevision: revisions[type] }
        : { expectedRevision: revisions[type] }
      const result = await api.POST(`/api/admin/ai/prompts/{type}/${action}`, { params: { path: { type } }, body })
      if (!alive(revision)) return
      if (!result.response.ok) { setFailure(apiFailure(result.error, c.revisionConflict)); return }
      if (action === 'test') {
        const parsed = z.object({ analysis: z.unknown() }).safeParse(result.data)
        if (parsed.success) setTest(current => ({ ...current, [type]: { revision: revisions[type], analysis: parsed.data.analysis } }))
        setNotice(c.saved)
        return
      }
      const parsed = aiPromptVersionSchema.safeParse(result.data)
      if (!parsed.success) { setFailure({ message: t('failed'), fields: [] }); return }
      setRevisions(current => ({ ...current, [type]: parsed.data.revision }))
      setStatus(current => ({ ...current, [type]: parsed.data.status }))
      if (action === 'draft' || action === 'restore-default') {
        setDrafts(current => current ? { ...current, [type]: parsed.data.template } : current)
        setSaved(current => current ? { ...current, [type]: parsed.data.template } : current)
        setTest(current => ({ ...current, [type]: undefined }))
      }
      setNotice(c.saved)
      const [list, fresh] = await Promise.all([api.GET('/api/admin/ai/prompts'), api.GET('/api/admin/ai/settings')])
      if (!alive(revision)) return
      const listParsed = promptListSchema.safeParse(list.data)
      if (list.response.ok && listParsed.success) setPrompts(listParsed.data.data)
      const freshParsed = aiAdminSettingsResponseSchema.safeParse(fresh.data)
      if (fresh.response.ok && freshParsed.success) setSettings(freshParsed.data)
    } catch { if (alive(revision)) setFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  const dirty = (type: PromptType) => drafts !== null && saved !== null && drafts[type] !== saved[type]
  const confirmBody = confirming === null ? '' : confirming.action === 'test' ? c.testConfirm : confirming.action === 'publish' ? c.promptPublishConfirm : c.promptRestoreConfirm
  const confirmLabel = confirming === null ? '' : confirming.action === 'test' ? c.promptTest : confirming.action === 'publish' ? c.promptPublish : c.promptRestore

  return <AdminAiShell view="prompts" state={state}>
    <FailureNotice failure={failure} />
    {notice && <p className="success" role="status">{notice}</p>}
    {!drafts ? <p role="status">{t('loading')}</p> : <div className="admin-ai-prompts">
      {(['weekly', 'monthly'] as const).map(type => <form key={type} className="admin-ai-prompt" onSubmit={event => { event.preventDefault(); void promptAction(type, 'draft') }} data-testid={`admin-ai-prompt-${type}`}>
        <h2>{type === 'weekly' ? c.promptWeekly : c.promptMonthly} {status[type] ? <AdminAiStatusBadge status={status[type]!} /> : null}</h2>
        <label className="admin-ai-wide">{c.promptTemplate}
          <textarea data-testid={`admin-ai-prompt-draft-${type}`} rows={10} required maxLength={100000} value={drafts[type]} onChange={event => { setDrafts(current => current ? { ...current, [type]: event.target.value } : current); setTest(current => ({ ...current, [type]: undefined })) }} />
        </label>
        <p className="muted admin-ai-prompt-hint">{c.promptHint}</p>
        <div className="admin-ai-actions">
          <button type="submit" disabled={pending !== null}>{pending === `draft:${type}` ? '…' : c.promptSave}</button>
          <button type="button" className="secondary" disabled={pending !== null || dirty(type)} onClick={() => setConfirming({ action: 'publish', type })}>{pending === `publish:${type}` ? '…' : c.promptPublish}</button>
          <button type="button" className="secondary" disabled={pending !== null} onClick={() => setConfirming({ action: 'restore-default', type })}>{pending === `restore-default:${type}` ? '…' : c.promptRestore}</button>
        </div>
        <div className="admin-ai-paid">
          <button type="button" className="secondary admin-ai-paid-action" disabled={pending !== null || dirty(type)} onClick={() => setConfirming({ action: 'test', type })}>{pending === `test:${type}` ? '…' : c.promptTest}</button>
          <span className="badge admin-ai-paid-badge">{c.paidAction}</span>
        </div>
        {test[type] && <div className="admin-ai-test-result">
          <h3>{c.promptTestResult} · {c.revision.replace('{n}', String(test[type]!.revision))}</h3>
          <pre data-testid={`admin-ai-prompt-test-${type}`} tabIndex={0}>{JSON.stringify(test[type]!.analysis, null, 2)}</pre>
        </div>}
        <details className="admin-ai-prompt-history">
          <summary>{c.promptHistory}</summary>
          <ul>{(prompts ?? []).filter(version => version.reportType === type).map(version => <li key={version.id}>
            {c.revision.replace('{n}', String(version.revision))} · <AdminAiStatusBadge status={version.status} />{version.isDefault ? <> · {c.versionDefault}</> : null} · <time dateTime={version.createdAt}>{fmtDateTime.format(new Date(version.createdAt))}</time>
          </li>)}
            {(prompts ?? []).every(version => version.reportType !== type) && <li className="muted">{c.promptNone}</li>}
          </ul>
        </details>
      </form>)}
    </div>}
    <ConfirmDialog open={confirming !== null} title={confirmLabel} body={confirmBody} confirmLabel={confirmLabel} danger
      onConfirm={() => { const current = confirming; setConfirming(null); if (current) void promptAction(current.type, current.action) }}
      onCancel={() => setConfirming(null)} />
  </AdminAiShell>
}
