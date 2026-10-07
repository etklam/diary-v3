import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { NavLink, useOutletContext } from 'react-router'
import type { ShellOutletContext } from '../root'
import { aiAdminRuntimeStateSchema, aiAdminSettingsResponseSchema } from '@diary/contracts/admin-ai'
import type { z } from 'zod'
import { api, useUi } from '../ui'
import { useSessionState } from '../session'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { adminAiCopy } from '../ai-copy'
import { promptCopy } from './admin-prompts-copy'
import './admin-ai.css'

export type AdminSettings = z.infer<typeof aiAdminSettingsResponseSchema>
export type AdminAiView = 'provider' | 'prompts' | 'registry' | 'access' | 'usage'

export type AdminAiState = {
  settings: AdminSettings | null
  setSettings: Dispatch<SetStateAction<AdminSettings | null>>
  /** The server refused this administrator; distinct from a read that failed. */
  denied: boolean
  /** No administrator is confirmed for this session, so no view may render. */
  blocked: boolean
  adminReady: boolean
  loadFailure: Failure | null
  retry: () => void
  /**
   * Advanced by any mutation that writes a usage or audit row. The views that
   * read those rows re-read on it, so the site-wide switch in the shared
   * chrome still shows up in the audit log of the view it was thrown from.
   */
  ledger: number
  recordLedgerChange: () => void
  /** The mutation that started under `revision` may still apply its result. */
  alive: (revision: number) => boolean
  sessionRevision: () => number
}

/**
 * Provider, prompts, access and usage all need the settings document — the
 * provider revision, the prompt templates, or just the runtime state for the
 * live-state region. Each view reads it once for itself, which is what keeps
 * their data fetching independent now that they are separate routes.
 */
export function useAdminAiSettings(): AdminAiState {
  const { t } = useUi()
  const session = useSessionState()
  const { authenticated, viewer } = useOutletContext<ShellOutletContext>()
  const adminReady = authenticated === true && viewer?.role === 'ADMIN'
  const translate = useRef(t); translate.current = t
  const mountedRef = useRef(true)
  const sessionRevRef = useRef(session.revision)
  sessionRevRef.current = session.revision
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [denied, setDenied] = useState(false)
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [ledger, setLedger] = useState(0)

  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    setSettings(null); setDenied(false); setLoadFailure(null)
    api.GET('/api/admin/ai/settings', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = aiAdminSettingsResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setSettings(parsed.data)
      else if (result.response.status === 403) setDenied(true)
      else setLoadFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setLoadFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
  }, [attempt, session.revision, adminReady])

  return {
    settings, setSettings, denied, adminReady, loadFailure,
    ledger,
    recordLedgerChange: () => setLedger(value => value + 1),
    blocked: authenticated === false || (authenticated === true && viewer !== null && viewer.role !== 'ADMIN'),
    retry: () => setAttempt(value => value + 1),
    alive: (revision: number) => mountedRef.current && sessionRevRef.current === revision,
    sessionRevision: () => sessionRevRef.current,
  }
}

const views: Array<{ view: AdminAiView; to: string }> = [
  { view: 'provider', to: '/admin/ai' },
  { view: 'prompts', to: '/admin/ai/report-prompts' },
  { view: 'registry', to: '/admin/ai/prompts' },
  { view: 'access', to: '/admin/ai/access' },
  { view: 'usage', to: '/admin/ai/usage' },
]

/**
 * The chrome every AI administration view shares: which view you are in, and
 * whether generation is live right now.
 *
 * The site-wide switch used to sit 4,000px above the configuration it governs,
 * so nothing an administrator could see told them whether any of it was in
 * effect. It is deliberately the one mutation that is not part of a view's save
 * scope: it belongs to all of them, so it states its effect in every one.
 *
 * `heading` is optional because the prompt registry owns its own page header;
 * it still gets the navigation and the live state.
 */
export function AdminAiShell({ view, state, children }: { view: AdminAiView; state: AdminAiState; children: ReactNode }) {
  const { locale, t } = useUi()
  const c = adminAiCopy[locale]
  const registry = promptCopy[locale]
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const runtime = state.settings?.runtime ?? null
  const live = runtime?.generationEnabled === true
  const label: Record<AdminAiView, string> = {
    provider: c.sectionProvider, prompts: c.sectionPrompts, registry: registry.title,
    access: c.sectionAccess, usage: c.sectionUsage,
  }
  const heading: Record<AdminAiView, string | null> = {
    provider: c.viewProvider, prompts: c.viewPrompts, registry: null, access: c.viewAccess, usage: c.viewUsage,
  }
  const lede: Record<AdminAiView, string> = {
    provider: c.ledeProvider, prompts: c.ledePrompts, registry: registry.intro, access: c.ledeAccess, usage: c.ledeUsage,
  }
  const fmtDateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })

  async function toggleRuntime(enabled: boolean) {
    setPending(true); setFailure(null)
    const revision = state.sessionRevision()
    try {
      const result = await api.PUT('/api/admin/ai/runtime', { body: { generationEnabled: enabled } })
      if (!state.alive(revision)) return
      const parsed = aiAdminRuntimeStateSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, t('failed'))); return }
      state.setSettings(current => current ? { ...current, runtime: parsed.data } : current)
      // Throwing the switch writes an audit row; the view reading that log is
      // one of the views this chrome renders in.
      state.recordLedgerChange()
    } catch { if (state.alive(revision)) setFailure({ message: t('connection'), fields: [] }) }
    finally { if (state.alive(revision)) setPending(false) }
  }

  const title = heading[view]
  return <section className="admin-ai-page">
    {title && <header className="admin-ai-header"><div><h1>{title}</h1><p className="lede">{lede[view]}</p></div></header>}
    <nav className="admin-ai-views" aria-label={c.title}>
      {/* NavLink sets `aria-current="page"` on the active view, which is both
          the accessible state and what the stylesheet selects on. */}
      {views.map(item => <NavLink key={item.to} to={item.to} end>{label[item.view]}</NavLink>)}
    </nav>

    <div className="admin-ai-live" data-live={live ? 'on' : 'off'} data-testid="admin-ai-live">
      <p className="admin-ai-live-state">{live ? c.liveOn : c.liveOff}</p>
      <label className="admin-ai-switch">
        <input type="checkbox" data-testid="admin-ai-runtime" checked={live} disabled={pending || !runtime} onChange={event => void toggleRuntime(event.target.checked)} />
        <span>{c.generationEnabled}</span>
      </label>
      <p className="muted">{c.generationEnabledNote}</p>
      <p className="muted" data-testid="admin-ai-worker">{runtime?.workerAvailable ? c.workerOnline.replace('{time}', runtime.workerHeartbeatAt ? fmtDateTime.format(new Date(runtime.workerHeartbeatAt)) : '—') : c.workerOffline}</p>
    </div>

    <FailureNotice failure={failure} />
    {state.denied && <div className="ai-gate" role="note"><p>{c.denied}</p></div>}
    <FailureNotice failure={state.loadFailure} />
    {state.loadFailure && <button type="button" className="secondary" onClick={state.retry}>{t('retry')}</button>}
    {state.blocked
      ? <div className="ai-gate" role="note"><p>{c.denied}</p></div>
      : !state.denied && state.adminReady ? children : null}
  </section>
}

/** Every AI administration view formats the same instants the same way. */
export function useAdminAiDateTime() {
  const { locale } = useUi()
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Draft/published badge, shared by the provider and the prompt views. */
export function AdminAiStatusBadge({ status }: { status: 'draft' | 'published' }) {
  const { locale } = useUi()
  const c = adminAiCopy[locale]
  return <span className={`badge${status === 'published' ? ' badge-info' : ''}`}>{status === 'published' ? c.statusPublished : c.statusDraft}</span>
}
