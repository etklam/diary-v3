import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import type { ShellOutletContext } from '../root'
import {
  aiAccessItemSchema,
  aiAccessListResponseSchema,
  aiAdminAuditResponseSchema,
  aiAdminRuntimeStateSchema,
  aiAdminSettingsResponseSchema,
  aiAdminUsageResponseSchema,
  aiPromptVersionSchema,
  aiProviderSettingsSchema,
  type AiAccessItem,
  type AiPromptVersion,
} from '@diary/contracts/admin-ai'
import { z } from 'zod'
import { api, useUi } from '../ui'
import { useSessionState } from '../session'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { adminAiCopy } from '../ai-copy'
import './admin-ai.css'

type AdminSettings = z.infer<typeof aiAdminSettingsResponseSchema>
type UsageItem = z.infer<typeof aiAdminUsageResponseSchema>['data'][number]
type AuditEvent = z.infer<typeof aiAdminAuditResponseSchema>['data'][number]
type PromptType = 'weekly' | 'monthly'

type ProviderForm = {
  displayName: string; baseUrl: string; model: string; thinking: 'enabled' | 'disabled'
  maxInputTokens: string; maxOutputTokens: string; timeoutMs: string; monthlyBudgetCents: string
  recipientName: string; disclosureVersion: string; disclosureText: string
  pricingCurrency: string; pricingVersion: string; inputPricePerMillionCents: string; outputPricePerMillionCents: string; reservationCostCents: string
}

// Draft suggestion only; the admin confirms every value and publishing stays explicit.
// disclosureText is prefilled with the contract's server-side default so a required string is always sent.
const emptyProviderForm: ProviderForm = {
  displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: '', thinking: 'disabled',
  maxInputTokens: '32000', maxOutputTokens: '4000', timeoutMs: '120000', monthlyBudgetCents: '0',
  recipientName: '', disclosureVersion: 'v1',
  disclosureText: 'Your saved journal records will be processed by the configured AI provider to create a private review report.',
  pricingCurrency: 'USD', pricingVersion: '', inputPricePerMillionCents: '', outputPricePerMillionCents: '', reservationCostCents: '0',
}

const hydrateProviderForm = (provider: NonNullable<AdminSettings['provider']>): ProviderForm => ({
  displayName: provider.displayName,
  baseUrl: provider.baseUrl,
  model: provider.model,
  thinking: provider.thinking,
  maxInputTokens: String(provider.maxInputTokens),
  maxOutputTokens: String(provider.maxOutputTokens),
  timeoutMs: String(provider.timeoutMs),
  monthlyBudgetCents: String(provider.monthlyBudgetCents),
  recipientName: provider.recipientName,
  disclosureVersion: provider.disclosureVersion,
  disclosureText: provider.disclosureText,
  pricingCurrency: provider.pricingCurrency,
  pricingVersion: provider.pricingVersion ?? '',
  inputPricePerMillionCents: provider.inputPricePerMillionCents === null ? '' : String(provider.inputPricePerMillionCents),
  outputPricePerMillionCents: provider.outputPricePerMillionCents === null ? '' : String(provider.outputPricePerMillionCents),
  reservationCostCents: String(provider.reservationCostCents),
})

const intOrNull = (value: string) => value.trim() === '' ? null : Number(value.trim())
const intOr = (value: string, fallback: number) => intOrNull(value) ?? fallback
const utcMonth = () => new Date().toISOString().slice(0, 7)
const dateTimeFmt = (locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })

export default function AdminAi() {
  const { locale, t } = useUi()
  const c = adminAiCopy[locale]
  const session = useSessionState()
  const { authenticated, viewer } = useOutletContext<ShellOutletContext>()
  const adminReady = authenticated === true && viewer?.role === 'ADMIN'
  const translate = useRef(t); translate.current = t
  const fmtDateTime = dateTimeFmt(locale)
  const mountedRef = useRef(true)
  const sessionRevRef = useRef(session.revision)
  sessionRevRef.current = session.revision
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  const alive = (revision: number) => mountedRef.current && sessionRevRef.current === revision

  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [prompts, setPrompts] = useState<AiPromptVersion[] | null>(null)
  const [denied, setDenied] = useState(false)
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [pageFailure, setPageFailure] = useState<Failure | null>(null)
  // Mutations that produce usage/audit rows; bumping refreshes those panels.
  const [ledgerAttempt, setLedgerAttempt] = useState(0)
  // List epochs: bumped whenever page 1 reloads (query/search/session/ledger
  // changes) so an in-flight load-more can never append to a newer list.
  const accessListEpochRef = useRef(0)
  const auditListEpochRef = useRef(0)

  const [draft, setDraft] = useState<ProviderForm>(emptyProviderForm)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [apiKeyAction, setApiKeyAction] = useState<'keep' | 'replace' | 'clear'>('keep')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<string[] | null>(null)
  const [providerPending, setProviderPending] = useState<'save' | 'test' | 'publish' | 'models' | 'runtime' | null>(null)

  const [promptDrafts, setPromptDrafts] = useState<{ weekly: string; monthly: string } | null>(null)
  const [promptSaved, setPromptSaved] = useState<{ weekly: string; monthly: string } | null>(null)
  const [promptRevisions, setPromptRevisions] = useState<{ weekly: number; monthly: number }>({ weekly: 0, monthly: 0 })
  const [promptStatus, setPromptStatus] = useState<{ weekly: 'draft' | 'published' | null; monthly: 'draft' | 'published' | null }>({ weekly: null, monthly: null })
  const [promptTest, setPromptTest] = useState<{ weekly?: { revision: number; analysis: unknown } | undefined; monthly?: { revision: number; analysis: unknown } | undefined }>({})
  const [promptPending, setPromptPending] = useState<string | null>(null)

  const [accessSearch, setAccessSearch] = useState('')
  const [accessQuery, setAccessQuery] = useState('')
  const [accessAttempt, setAccessAttempt] = useState(0)
  const [access, setAccess] = useState<{ items: AiAccessItem[]; nextCursor: string | null } | null>(null)
  const [accessDrafts, setAccessDrafts] = useState<Record<string, { enabled: boolean; quota: string }>>({})
  const [accessPending, setAccessPending] = useState<string | null>(null)

  const [usageMonth, setUsageMonth] = useState(utcMonth())
  const [usageUser, setUsageUser] = useState('')
  const [usageUserQuery, setUsageUserQuery] = useState('')
  const [usage, setUsage] = useState<UsageItem[] | null>(null)
  const [usageFailure, setUsageFailure] = useState<Failure | null>(null)
  const [audit, setAudit] = useState<{ items: AuditEvent[]; nextCursor: string | null } | null>(null)
  const [auditFailure, setAuditFailure] = useState<Failure | null>(null)
  const [accessMorePending, setAccessMorePending] = useState(false)
  const [auditMorePending, setAuditMorePending] = useState(false)

  useEffect(() => { setNotice(null) }, [locale])

  // Settings and prompt history per session epoch; the provider form re-hydrates
  // from server state whenever the saved revision changes.
  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    setSettings(null); setPrompts(null); setDenied(false); setLoadFailure(null)
    setPageFailure(null); setNotice(null); setDraftHydrated(false); setModels(null); setPromptTest({})
    api.GET('/api/admin/ai/settings', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = aiAdminSettingsResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setSettings(parsed.data)
      else if (result.response.status === 403) setDenied(true)
      else setLoadFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setLoadFailure({ message: translate.current('connection'), fields: [] }) })
    api.GET('/api/admin/ai/prompts', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = z.object({ data: z.array(aiPromptVersionSchema) }).safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setPrompts(parsed.data.data)
        // expectedRevision always targets the newest known revision of each type.
        const latest = (type: 'weekly' | 'monthly') => Math.max(0, ...parsed.data.data.filter(version => version.reportType === type).map(version => version.revision))
        setPromptRevisions(current => ({ weekly: Math.max(current.weekly, latest('weekly')), monthly: Math.max(current.monthly, latest('monthly')) }))
      }
    }).catch(() => undefined)
    return () => controller.abort()
  }, [attempt, session.revision, adminReady])

  useEffect(() => {
    if (!settings || draftHydrated) return
    if (settings.provider) {
      setDraft(hydrateProviderForm(settings.provider))
      setApiKeyAction(settings.provider.hasApiKey ? 'keep' : 'replace')
    } else {
      setDraft(emptyProviderForm)
      setApiKeyAction('replace')
    }
    setPromptDrafts({
      weekly: settings.prompts.weekly?.template ?? '',
      monthly: settings.prompts.monthly?.template ?? '',
    })
    setPromptSaved({
      weekly: settings.prompts.weekly?.template ?? '',
      monthly: settings.prompts.monthly?.template ?? '',
    })
    setPromptRevisions(current => ({
      weekly: Math.max(current.weekly, settings.prompts.weekly?.revision ?? 0),
      monthly: Math.max(current.monthly, settings.prompts.monthly?.revision ?? 0),
    }))
    setPromptStatus({
      weekly: settings.prompts.weekly?.status ?? null,
      monthly: settings.prompts.monthly?.status ?? null,
    })
    setDraftHydrated(true)
  }, [settings, draftHydrated])

  // Access list.
  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    accessListEpochRef.current += 1
    setAccess(null); setAccessMorePending(false)
    api.GET('/api/admin/ai/access', { params: { query: { limit: 50, search: accessQuery || undefined } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = aiAccessListResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setAccess({ items: parsed.data.data, nextCursor: parsed.data.nextCursor })
        setAccessDrafts(current => ({ ...current, ...Object.fromEntries(parsed.data.data.map(item => [item.userId, current[item.userId] ?? { enabled: item.enabled, quota: String(item.monthlyQuota) }])) }))
      } else setPageFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setPageFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
  }, [accessQuery, accessAttempt, session.revision, adminReady])

  // Usage and audit.
  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    setUsage(null); setUsageFailure(null)
    api.GET('/api/admin/ai/usage', { params: { query: { month: usageMonth ? `${usageMonth}-01` : undefined, userId: usageUserQuery || undefined, limit: 50 } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = aiAdminUsageResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setUsage(parsed.data.data)
      else setUsageFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setUsageFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
  }, [usageMonth, usageUserQuery, session.revision, adminReady, ledgerAttempt])

  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    auditListEpochRef.current += 1
    setAudit(null); setAuditFailure(null); setAuditMorePending(false)
    api.GET('/api/admin/ai/audit', { params: { query: { limit: 50 } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = aiAdminAuditResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setAudit({ items: parsed.data.data, nextCursor: parsed.data.nextCursor })
      else setAuditFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setAuditFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
  }, [session.revision, adminReady, ledgerAttempt])

  function setField<K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  function providerBody() {
    return {
      displayName: draft.displayName.trim(),
      providerType: 'deepseek' as const,
      protocol: 'chat_completions' as const,
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      thinking: draft.thinking,
      maxInputTokens: intOr(draft.maxInputTokens, 0),
      maxOutputTokens: intOr(draft.maxOutputTokens, 0),
      timeoutMs: intOr(draft.timeoutMs, 0),
      monthlyBudgetCents: intOr(draft.monthlyBudgetCents, 0),
      recipientName: draft.recipientName.trim(),
      disclosureVersion: draft.disclosureVersion.trim(),
      disclosureText: draft.disclosureText.trim() || 'Your saved journal records will be processed by the configured AI provider to create a private review report.',
      pricingCurrency: draft.pricingCurrency.trim().toUpperCase(),
      pricingVersion: draft.pricingVersion.trim() || null,
      inputPricePerMillionCents: intOrNull(draft.inputPricePerMillionCents),
      outputPricePerMillionCents: intOrNull(draft.outputPricePerMillionCents),
      reservationCostCents: intOr(draft.reservationCostCents, 0),
      apiKeyAction,
      ...(apiKeyAction === 'replace' && apiKey ? { apiKey } : {}),
      expectedRevision: settings?.provider?.revision ?? 0,
    }
  }

  async function saveProviderDraft() {
    setProviderPending('save'); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.PUT('/api/admin/ai/settings/draft', { body: providerBody() })
      if (!alive(revision)) return
      const parsed = aiProviderSettingsSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPageFailure(apiFailure(result.error, c.revisionConflict)); return }
      setSettings(current => current ? { ...current, provider: parsed.data } : current)
      // Re-hydrate from the normalized response so currency casing, trailing
      // slashes, and zero-padded numbers don't leave the form falsely dirty.
      setDraft(hydrateProviderForm(parsed.data))
      setApiKeyAction(parsed.data.hasApiKey ? 'keep' : 'replace'); setApiKey('')
      setNotice(c.saved)
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setProviderPending(null) }
  }

  async function testProvider() {
    if (!window.confirm(c.testConfirm)) return
    setProviderPending('test'); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.POST('/api/admin/ai/settings/test', { body: { expectedRevision: settings?.provider?.revision ?? 0 } })
      if (!alive(revision)) return
      const parsed = aiProviderSettingsSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPageFailure(apiFailure(result.error, c.revisionConflict)); return }
      setSettings(current => current ? { ...current, provider: parsed.data } : current)
      setNotice(c.saved); setLedgerAttempt(value => value + 1)
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setProviderPending(null) }
  }

  async function publishProvider() {
    if (!window.confirm(c.publishConfirm)) return
    setProviderPending('publish'); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.POST('/api/admin/ai/settings/publish', { body: { expectedRevision: settings?.provider?.revision ?? 0 } })
      if (!alive(revision)) return
      const parsed = aiProviderSettingsSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPageFailure(apiFailure(result.error, c.revisionConflict)); return }
      setSettings(current => current ? { ...current, provider: parsed.data } : current)
      setDraft(hydrateProviderForm(parsed.data)); setApiKey(''); setNotice(c.saved); setLedgerAttempt(value => value + 1)
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setProviderPending(null) }
  }

  async function refreshModels() {
    setProviderPending('models'); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.POST('/api/admin/ai/models/refresh', {})
      if (!alive(revision)) return
      const parsed = z.object({ data: z.array(z.string()) }).safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPageFailure(apiFailure(result.error, t('failed'))); return }
      setModels(parsed.data.data); setNotice(c.modelsReady)
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setProviderPending(null) }
  }

  async function toggleRuntime(enabled: boolean) {
    setProviderPending('runtime'); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.PUT('/api/admin/ai/runtime', { body: { generationEnabled: enabled } })
      if (!alive(revision)) return
      const parsed = aiAdminRuntimeStateSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPageFailure(apiFailure(result.error, t('failed'))); return }
      setSettings(current => current ? { ...current, runtime: parsed.data } : current)
      setNotice(c.saved); setLedgerAttempt(value => value + 1)
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setProviderPending(null) }
  }

  async function promptAction(type: PromptType, action: 'draft' | 'test' | 'publish' | 'restore-default') {
    if (action === 'test' && !window.confirm(c.testConfirm)) return
    if ((action === 'publish' && !window.confirm(c.promptPublishConfirm)) || (action === 'restore-default' && !window.confirm(c.promptRestoreConfirm))) return
    const key = `${action}:${type}`
    setPromptPending(key); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    try {
      const body = action === 'draft'
        ? { template: promptDrafts?.[type] ?? '', expectedRevision: promptRevisions[type] }
        : { expectedRevision: promptRevisions[type] }
      const result = await api.POST(`/api/admin/ai/prompts/{type}/${action}`, { params: { path: { type } }, body })
      if (!alive(revision)) return
      if (!result.response.ok) { setPageFailure(apiFailure(result.error, c.revisionConflict)); return }
      if (action === 'test') {
        const parsed = z.object({ analysis: z.unknown() }).safeParse(result.data)
        if (parsed.success) setPromptTest(current => ({ ...current, [type]: { revision: promptRevisions[type], analysis: parsed.data.analysis } }))
        setNotice(c.saved); setLedgerAttempt(value => value + 1)
        return
      }
      const parsed = aiPromptVersionSchema.safeParse(result.data)
      if (!parsed.success) { setPageFailure({ message: t('failed'), fields: [] }); return }
      setPromptRevisions(current => ({ ...current, [type]: parsed.data.revision }))
      setPromptStatus(current => ({ ...current, [type]: parsed.data.status }))
      if (action === 'draft' || action === 'restore-default') {
        setPromptDrafts(current => current ? { ...current, [type]: parsed.data.template } : current)
        setPromptSaved(current => current ? { ...current, [type]: parsed.data.template } : current)
        setPromptTest(current => ({ ...current, [type]: undefined }))
      }
      setNotice(c.saved); setLedgerAttempt(value => value + 1)
      const [list, fresh] = await Promise.all([api.GET('/api/admin/ai/prompts'), api.GET('/api/admin/ai/settings')])
      if (!alive(revision)) return
      const listParsed = z.object({ data: z.array(aiPromptVersionSchema) }).safeParse(list.data)
      if (list.response.ok && listParsed.success) setPrompts(listParsed.data.data)
      const freshParsed = aiAdminSettingsResponseSchema.safeParse(fresh.data)
      if (fresh.response.ok && freshParsed.success) setSettings(freshParsed.data)
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPromptPending(null) }
  }

  async function saveAccess(item: AiAccessItem) {
    const row = accessDrafts[item.userId]
    if (!row) return
    const quota = Number(row.quota)
    if (!Number.isInteger(quota) || quota < 0) { setPageFailure({ message: t('failed'), fields: ['monthlyQuota'] }); return }
    setAccessPending(item.userId); setPageFailure(null); setNotice(null)
    const revision = sessionRevRef.current
    try {
      const result = await api.PUT('/api/admin/ai/access/{userId}', { params: { path: { userId: item.userId } }, body: { enabled: row.enabled, monthlyQuota: quota } })
      if (!alive(revision)) return
      const parsed = aiAccessItemSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPageFailure(apiFailure(result.error, t('failed'))); return }
      setAccess(current => current ? { ...current, items: current.items.map(row => row.userId === item.userId ? { ...row, enabled: parsed.data.enabled, monthlyQuota: parsed.data.monthlyQuota } : row) } : current)
      setAccessDrafts(current => ({ ...current, [item.userId]: { enabled: parsed.data.enabled, quota: String(parsed.data.monthlyQuota) } }))
      setNotice(c.saved); setLedgerAttempt(value => value + 1)
    } catch { if (alive(revision)) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setAccessPending(null) }
  }

  async function loadMoreAccess() {
    if (!access?.nextCursor) return
    const revision = sessionRevRef.current
    const epoch = accessListEpochRef.current
    const cursor = access.nextCursor
    const query = accessQuery
    setAccessMorePending(true)
    try {
      const result = await api.GET('/api/admin/ai/access', { params: { query: { limit: 50, cursor, search: query || undefined } } })
      if (!alive(revision) || accessListEpochRef.current !== epoch) return
      const parsed = aiAccessListResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setPageFailure(apiFailure(result.error, t('failed'))); return }
      setAccess(current => {
        if (!current || current.nextCursor !== cursor) return current
        return { items: [...current.items, ...parsed.data.data.filter(item => !current.items.some(known => known.userId === item.userId))], nextCursor: parsed.data.nextCursor }
      })
      setAccessDrafts(current => ({ ...current, ...Object.fromEntries(parsed.data.data.map(item => [item.userId, current[item.userId] ?? { enabled: item.enabled, quota: String(item.monthlyQuota) }])) }))
    } catch { if (alive(revision) && accessListEpochRef.current === epoch) setPageFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision) && accessListEpochRef.current === epoch) setAccessMorePending(false) }
  }

  async function loadMoreAudit() {
    if (!audit?.nextCursor) return
    const revision = sessionRevRef.current
    const epoch = auditListEpochRef.current
    const cursor = audit.nextCursor
    setAuditMorePending(true)
    try {
      const result = await api.GET('/api/admin/ai/audit', { params: { query: { limit: 50, cursor } } })
      if (!alive(revision) || auditListEpochRef.current !== epoch) return
      const parsed = aiAdminAuditResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setAuditFailure(apiFailure(result.error, t('failed'))); return }
      setAudit(current => {
        if (!current || current.nextCursor !== cursor) return current
        return { items: [...current.items, ...parsed.data.data.filter(event => !current.items.some(known => known.id === event.id))], nextCursor: parsed.data.nextCursor }
      })
    } catch { if (alive(revision) && auditListEpochRef.current === epoch) setAuditFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision) && auditListEpochRef.current === epoch) setAuditMorePending(false) }
  }

  const runtime = settings?.runtime
  const provider = settings?.provider ?? null
  // The paid test always runs against the saved draft; block it while the form
  // has unsaved changes so the tested revision is the published candidate.
  const providerDirty = provider === null
    || apiKeyAction !== 'keep' || apiKey !== ''
    || JSON.stringify(draft) !== JSON.stringify(hydrateProviderForm(provider))
  const promptDirty = (type: PromptType) => promptDrafts !== null && promptSaved !== null && promptDrafts[type] !== promptSaved[type]
  const statusBadge = (status: 'draft' | 'published') => <span className={`badge${status === 'published' ? ' badge-info' : ''}`}>{status === 'published' ? c.statusPublished : c.statusDraft}</span>

  if (authenticated === false || (authenticated === true && viewer !== null && viewer.role !== 'ADMIN')) {
    return <section className="admin-ai-page"><h1>{c.title}</h1><div className="ai-gate" role="note"><p>{c.denied}</p></div></section>
  }

  return <section className="admin-ai-page">
    <header className="admin-ai-header"><div><h1>{c.title}</h1><p className="lede">{c.lede}</p></div></header>

    {denied && <div className="ai-gate" role="note"><p>{c.denied}</p></div>}
    <FailureNotice failure={loadFailure ?? pageFailure} />
    {(loadFailure ?? pageFailure) && <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button>}
    {notice && <p className="success" role="status">{notice}</p>}

    {!denied && adminReady && <>
      <section className="admin-ai-section" aria-labelledby="admin-ai-provider">
        <h2 id="admin-ai-provider">{c.sectionProvider}</h2>
        {settings === null && !loadFailure ? <p role="status">{t('loading')}</p> : <>
          <div className="admin-ai-runtime">
            <label className="admin-ai-switch">
              <input type="checkbox" data-testid="admin-ai-runtime" checked={runtime?.generationEnabled ?? false} disabled={providerPending !== null || !runtime} onChange={event => void toggleRuntime(event.target.checked)} />
              <span>{c.generationEnabled}</span>
            </label>
            <p className="muted">{c.generationEnabledNote}</p>
            <p className="muted" data-testid="admin-ai-worker">{runtime?.workerAvailable ? c.workerOnline.replace('{time}', runtime.workerHeartbeatAt ? fmtDateTime.format(new Date(runtime.workerHeartbeatAt)) : '—') : c.workerOffline}</p>
          </div>
          {provider === null && <div className="empty-state"><p>{c.providerEmpty}</p></div>}
          <form className="admin-ai-form" onSubmit={event => { event.preventDefault(); void saveProviderDraft() }}>
            {/* Freezes every control during test/save/publish so visible edits can't race a mutation. */}
            <fieldset disabled={providerPending !== null} style={{ margin: 0, padding: 0, border: 'none', minWidth: 0 }}>
            <div className="admin-ai-grid">
              <label>{c.fieldDisplayName}<input required maxLength={120} value={draft.displayName} onChange={event => setField('displayName', event.target.value)} /></label>
              <label>{c.fieldBaseUrl}<input required type="url" maxLength={500} value={draft.baseUrl} onChange={event => setField('baseUrl', event.target.value)} /></label>
              <label>{c.fieldModel}<input required maxLength={200} list="admin-ai-models" value={draft.model} onChange={event => setField('model', event.target.value)} /></label>
              <datalist id="admin-ai-models">{models?.map(model => <option key={model} value={model} />)}</datalist>
              <label>{c.fieldThinking}<select value={draft.thinking} onChange={event => setField('thinking', event.target.value as 'enabled' | 'disabled')}><option value="disabled">{c.thinkingDisabled}</option><option value="enabled">{c.thinkingEnabled}</option></select></label>
              <label>{c.fieldMaxInput}<input required type="number" min={1} max={200000} value={draft.maxInputTokens} onChange={event => setField('maxInputTokens', event.target.value)} /></label>
              <label>{c.fieldMaxOutput}<input required type="number" min={1} max={32000} value={draft.maxOutputTokens} onChange={event => setField('maxOutputTokens', event.target.value)} /></label>
              <label>{c.fieldTimeout}<input required type="number" min={1000} max={300000} value={draft.timeoutMs} onChange={event => setField('timeoutMs', event.target.value)} /></label>
              <label>{c.fieldBudget}<input required type="number" min={0} value={draft.monthlyBudgetCents} onChange={event => setField('monthlyBudgetCents', event.target.value)} /></label>
              <label>{c.fieldRecipientName}<input required maxLength={200} value={draft.recipientName} onChange={event => setField('recipientName', event.target.value)} /></label>
              <label>{c.fieldDisclosureVersion}<input required maxLength={80} value={draft.disclosureVersion} onChange={event => setField('disclosureVersion', event.target.value)} /></label>
            </div>
            <label className="admin-ai-wide">{c.fieldDisclosureText}<textarea rows={3} maxLength={10000} value={draft.disclosureText} onChange={event => setField('disclosureText', event.target.value)} /></label>
            <fieldset className="admin-ai-pricing">
              <legend>{c.pricingHeading}</legend>
              <div className="admin-ai-grid">
                <label>{c.fieldPricingCurrency}<input required pattern="[A-Za-z]{3}" maxLength={3} value={draft.pricingCurrency} onChange={event => setField('pricingCurrency', event.target.value)} /></label>
                <label>{c.fieldPricingVersion}<input maxLength={80} value={draft.pricingVersion} onChange={event => setField('pricingVersion', event.target.value)} /></label>
                <label>{c.fieldInputPrice}<input type="number" min={0} value={draft.inputPricePerMillionCents} onChange={event => setField('inputPricePerMillionCents', event.target.value)} /></label>
                <label>{c.fieldOutputPrice}<input type="number" min={0} value={draft.outputPricePerMillionCents} onChange={event => setField('outputPricePerMillionCents', event.target.value)} /></label>
                <label>{c.fieldReservation}<input required type="number" min={0} value={draft.reservationCostCents} onChange={event => setField('reservationCostCents', event.target.value)} /></label>
              </div>
            </fieldset>
            <fieldset className="admin-ai-pricing">
              <legend>{c.keyHeading}</legend>
              <p className="muted">{provider?.hasApiKey ? c.keyStored : c.keyMissing}</p>
              <div className="admin-ai-key-actions">
                <label><input type="radio" name="admin-ai-key-action" checked={apiKeyAction === 'keep'} onChange={() => { setApiKeyAction('keep'); setApiKey('') }} /> {c.keyKeep}</label>
                <label><input type="radio" name="admin-ai-key-action" checked={apiKeyAction === 'replace'} onChange={() => setApiKeyAction('replace')} /> {c.keyReplace}</label>
                <label><input type="radio" name="admin-ai-key-action" checked={apiKeyAction === 'clear'} onChange={() => { setApiKeyAction('clear'); setApiKey('') }} /> {c.keyClear}</label>
              </div>
              {apiKeyAction === 'replace' && <label className="admin-ai-wide">{c.fieldApiKey}<input required type="password" autoComplete="off" maxLength={500} value={apiKey} onChange={event => setApiKey(event.target.value)} /></label>}
            </fieldset>
            <div className="admin-ai-actions">
              <button type="submit" data-testid="admin-ai-provider-save" disabled={providerPending !== null}>{providerPending === 'save' ? '…' : c.saveDraft}</button>
              <button type="button" className="secondary" data-testid="admin-ai-provider-test" disabled={providerPending !== null || providerDirty || provider?.status !== 'draft'} onClick={() => void testProvider()}>{c.testProvider}</button>
              <button type="button" className="secondary" disabled={providerPending !== null} onClick={() => void refreshModels()}>{c.refreshModels}</button>
              <button type="button" className="secondary" data-testid="admin-ai-provider-publish" disabled={providerPending !== null || providerDirty || provider === null || provider.status !== 'draft' || provider.lastTestStatus !== 'passed'} onClick={() => void publishProvider()}>{c.publishProvider}</button>
            </div>
            {provider && <p className="muted admin-ai-provider-meta">
              {statusBadge(provider.status)} · {c.revision.replace('{n}', String(provider.revision))} · {c.lastTest}: {provider.lastTestStatus === 'passed' ? c.testPassed : provider.lastTestStatus === 'failed' ? c.testFailed : c.testNever}
              {provider.publishedAt ? <> · {fmtDateTime.format(new Date(provider.publishedAt))}</> : null}
            </p>}
            </fieldset>
          </form>
        </>}
      </section>

      <section className="admin-ai-section" aria-labelledby="admin-ai-prompts">
        <h2 id="admin-ai-prompts">{c.sectionPrompts}</h2>
        {!promptDrafts ? <p role="status">{t('loading')}</p> : <div className="admin-ai-prompts">
          {(['weekly', 'monthly'] as const).map(type => <form key={type} className="admin-ai-prompt" onSubmit={event => { event.preventDefault(); void promptAction(type, 'draft') }} data-testid={`admin-ai-prompt-${type}`}>
            <h3>{type === 'weekly' ? c.promptWeekly : c.promptMonthly} {promptStatus[type] ? statusBadge(promptStatus[type]!) : null}</h3>
            <label className="admin-ai-wide">{c.promptTemplate}
              <textarea data-testid={`admin-ai-prompt-draft-${type}`} rows={10} required maxLength={100000} value={promptDrafts[type]} onChange={event => { setPromptDrafts(current => current ? { ...current, [type]: event.target.value } : current); setPromptTest(current => ({ ...current, [type]: undefined })) }} />
            </label>
            <p className="muted admin-ai-prompt-hint">{c.promptHint}</p>
            <div className="admin-ai-actions">
              <button type="submit" disabled={promptPending !== null}>{promptPending === `draft:${type}` ? '…' : c.promptSave}</button>
              <button type="button" className="secondary" disabled={promptPending !== null || promptDirty(type)} onClick={() => void promptAction(type, 'test')}>{promptPending === `test:${type}` ? '…' : c.promptTest}</button>
              <button type="button" className="secondary" disabled={promptPending !== null || promptDirty(type)} onClick={() => void promptAction(type, 'publish')}>{promptPending === `publish:${type}` ? '…' : c.promptPublish}</button>
              <button type="button" className="secondary" disabled={promptPending !== null} onClick={() => void promptAction(type, 'restore-default')}>{promptPending === `restore-default:${type}` ? '…' : c.promptRestore}</button>
            </div>
            {promptTest[type] && <div className="admin-ai-test-result">
              <h4>{c.promptTestResult} · {c.revision.replace('{n}', String(promptTest[type]!.revision))}</h4>
              <pre data-testid={`admin-ai-prompt-test-${type}`}>{JSON.stringify(promptTest[type]!.analysis, null, 2)}</pre>
            </div>}
            <details className="admin-ai-prompt-history">
              <summary>{c.promptHistory}</summary>
              <ul>{(prompts ?? []).filter(version => version.reportType === type).map(version => <li key={version.id}>
                {c.revision.replace('{n}', String(version.revision))} · {statusBadge(version.status)}{version.isDefault ? <> · {c.versionDefault}</> : null} · <time dateTime={version.createdAt}>{fmtDateTime.format(new Date(version.createdAt))}</time>
              </li>)}
                {(prompts ?? []).every(version => version.reportType !== type) && <li className="muted">{c.promptNone}</li>}
              </ul>
            </details>
          </form>)}
        </div>}
      </section>

      <section className="admin-ai-section" aria-labelledby="admin-ai-access">
        <h2 id="admin-ai-access">{c.sectionAccess}</h2>
        <form className="admin-ai-search" onSubmit={event => { event.preventDefault(); setAccessQuery(accessSearch.trim()); setAccessAttempt(value => value + 1) }}>
          <label>{c.accessSearch}<input type="search" maxLength={255} value={accessSearch} disabled={accessMorePending} onChange={event => setAccessSearch(event.target.value)} /></label>
          <button type="submit" disabled={accessMorePending}>{c.accessSearchAction}</button>
        </form>
        {access === null ? <p role="status">{t('loading')}</p> : access.items.length === 0 ? <div className="empty-state"><p>{c.accessEmpty}</p></div> : <>
          <div className="admin-ai-table-wrap"><table data-testid="admin-ai-access-table">
            <thead><tr><th scope="col">{c.accessEmail}</th><th scope="col">{c.accessName}</th><th scope="col">{c.accessEnabled}</th><th scope="col">{c.accessQuota}</th><th scope="col" /></tr></thead>
            <tbody>{access.items.map(item => {
              const row = accessDrafts[item.userId] ?? { enabled: item.enabled, quota: String(item.monthlyQuota) }
              return <tr key={item.userId}>
                <th scope="row"><span className="admin-ai-email">{item.email}</span></th>
                <td>{item.name ?? '—'}</td>
                <td><input type="checkbox" aria-label={`${c.accessEnabled}: ${item.email}`} checked={row.enabled} disabled={accessPending !== null} onChange={event => setAccessDrafts(current => ({ ...current, [item.userId]: { ...row, enabled: event.target.checked } }))} /></td>
                <td><input type="number" min={0} max={10000} aria-label={`${c.accessQuota}: ${item.email}`} value={row.quota} disabled={accessPending !== null} onChange={event => setAccessDrafts(current => ({ ...current, [item.userId]: { ...row, quota: event.target.value } }))} /></td>
                <td><button type="button" className="secondary" disabled={accessPending !== null || (row.enabled === item.enabled && Number(row.quota) === item.monthlyQuota)} onClick={() => void saveAccess(item)}>{accessPending === item.userId ? '…' : c.accessSave}</button></td>
              </tr>
            })}</tbody>
          </table></div>
          {access.nextCursor && <button type="button" className="secondary" disabled={accessMorePending} onClick={() => void loadMoreAccess()}>{accessMorePending ? '…' : c.loadMore}</button>}
        </>}
      </section>

      <section className="admin-ai-section" aria-labelledby="admin-ai-usage">
        <h2 id="admin-ai-usage">{c.sectionUsage}</h2>
        <form className="admin-ai-usage-controls" onSubmit={event => { event.preventDefault(); setUsageUserQuery(usageUser.trim()) }}>
          <label>{c.usageMonth}<input type="month" data-testid="admin-ai-usage-month" value={usageMonth} onChange={event => setUsageMonth(event.target.value)} /></label>
          <label>{c.usageUser}<input type="text" inputMode="numeric" value={usageUser} onChange={event => setUsageUser(event.target.value)} /></label>
          <button type="submit" className="secondary">{c.accessSearchAction}</button>
        </form>
        <FailureNotice failure={usageFailure} />
        {usage === null && !usageFailure ? <p role="status">{t('loading')}</p>
          : usage !== null && usage.length === 0 ? <div className="empty-state"><p>{c.usageEmpty}</p></div>
            : usage !== null && <><div className="admin-ai-table-wrap"><table data-testid="admin-ai-usage-table">
              <thead><tr><th scope="col">{c.usageMonth}</th><th scope="col">{c.usageOwner}</th><th scope="col">{c.usageReserved}</th><th scope="col">{c.usageReservedCost}</th><th scope="col">{c.usageConsumed}</th><th scope="col">{c.usageReleased}</th><th scope="col">{c.usageUnknown}</th><th scope="col">{c.usageInputTokens}</th><th scope="col">{c.usageOutputTokens}</th><th scope="col">{c.usageEstimated}</th></tr></thead>
              <tbody>{usage.map((row, index) => <tr key={`${row.userId ?? 'site'}-${row.month}-${index}`}>
                <td>{row.month}</td>
                <td>{row.userId ? <code>{row.userId}</code> : c.usageGlobal}</td>
                <td className="num">{row.reserved}</td>
                <td className="num">{row.reservedCostCents}</td>
                <td className="num">{row.consumed}</td>
                <td className="num">{row.released}</td>
                <td className="num">{row.unknown}</td>
                <td className="num">{row.inputTokens ?? <span className="muted">—</span>}</td>
                <td className="num">{row.outputTokens ?? <span className="muted">—</span>}</td>
                <td className="num">{row.estimatedCostCents === null ? <span className="muted">—</span> : row.estimatedCostCents} {row.pricingCurrency ?? <span className="muted">—</span>}</td>
              </tr>)}</tbody>
            </table></div>
              <p className="muted">{c.usageCap}</p></>}
        <h3 className="admin-ai-subheading">{c.auditHeading}</h3>
        <FailureNotice failure={auditFailure} />
        {audit === null && !auditFailure ? <p role="status">{t('loading')}</p>
          : audit !== null && audit.items.length === 0 ? <div className="empty-state"><p>{c.auditEmpty}</p></div>
            : audit !== null && <div className="admin-ai-table-wrap"><table data-testid="admin-ai-audit-table">
              <thead><tr><th scope="col">{c.auditTime}</th><th scope="col">{c.auditAction}</th><th scope="col">{c.auditTarget}</th><th scope="col">{c.auditSummary}</th></tr></thead>
              <tbody>{audit.items.map(event => <tr key={event.id}>
                <td><time dateTime={event.createdAt}>{fmtDateTime.format(new Date(event.createdAt))}</time></td>
                <td><code>{event.action}</code></td>
                <td>{event.targetType}{event.targetId ? <> · <code>{event.targetId}</code></> : null}</td>
                <td>{event.summary}</td>
              </tr>)}</tbody>
            </table></div>}
        {audit?.nextCursor && <button type="button" className="secondary" disabled={auditMorePending} onClick={() => void loadMoreAudit()}>{auditMorePending ? '…' : c.loadMore}</button>}
      </section>
    </>}
  </section>
}
