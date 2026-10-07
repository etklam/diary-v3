import { useEffect, useState } from 'react'
import { aiProviderSettingsSchema } from '@diary/contracts/admin-ai'
import { z } from 'zod'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { adminAiCopy } from '../ai-copy'
import { ConfirmDialog } from '../authoring-controls'
import { AdminAiShell, AdminAiStatusBadge, useAdminAiDateTime, useAdminAiSettings, type AdminSettings } from './admin-ai-shell'

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

/**
 * One job: the data recipient this installation sends journal records to.
 *
 * One save scope — `Save draft` commits this form. `Run paid test` and
 * `Publish` act on the saved draft rather than on the form, which is why both
 * stay disabled while it is dirty, and both state their consequence in a
 * confirmation before they run.
 */
export default function AdminAiProvider() {
  const { locale, t } = useUi()
  const c = adminAiCopy[locale]
  const state = useAdminAiSettings()
  const { settings, setSettings, alive, sessionRevision } = state
  const fmtDateTime = useAdminAiDateTime()

  const [draft, setDraft] = useState<ProviderForm>(emptyProviderForm)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [apiKeyAction, setApiKeyAction] = useState<'keep' | 'replace' | 'clear'>('keep')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<string[] | null>(null)
  const [pending, setPending] = useState<'save' | 'test' | 'publish' | 'models' | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'test' | 'publish' | null>(null)

  useEffect(() => { setNotice(null) }, [locale])
  useEffect(() => { setDraftHydrated(false); setModels(null) }, [settings === null])

  useEffect(() => {
    if (!settings || draftHydrated) return
    if (settings.provider) {
      setDraft(hydrateProviderForm(settings.provider))
      setApiKeyAction(settings.provider.hasApiKey ? 'keep' : 'replace')
    } else {
      setDraft(emptyProviderForm)
      setApiKeyAction('replace')
    }
    setDraftHydrated(true)
  }, [settings, draftHydrated])

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
    setPending('save'); setFailure(null); setNotice(null)
    const revision = sessionRevision()
    try {
      const result = await api.PUT('/api/admin/ai/settings/draft', { body: providerBody() })
      if (!alive(revision)) return
      const parsed = aiProviderSettingsSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, c.revisionConflict)); return }
      setSettings(current => current ? { ...current, provider: parsed.data } : current)
      // Re-hydrate from the normalized response so currency casing, trailing
      // slashes, and zero-padded numbers don't leave the form falsely dirty.
      setDraft(hydrateProviderForm(parsed.data))
      setApiKeyAction(parsed.data.hasApiKey ? 'keep' : 'replace'); setApiKey('')
      setNotice(c.saved)
    } catch { if (alive(revision)) setFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  async function testProvider() {
    setPending('test'); setFailure(null); setNotice(null)
    const revision = sessionRevision()
    try {
      const result = await api.POST('/api/admin/ai/settings/test', { body: { expectedRevision: settings?.provider?.revision ?? 0 } })
      if (!alive(revision)) return
      const parsed = aiProviderSettingsSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, c.revisionConflict)); return }
      setSettings(current => current ? { ...current, provider: parsed.data } : current)
      setNotice(c.saved)
    } catch { if (alive(revision)) setFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  async function publishProvider() {
    setPending('publish'); setFailure(null); setNotice(null)
    const revision = sessionRevision()
    try {
      const result = await api.POST('/api/admin/ai/settings/publish', { body: { expectedRevision: settings?.provider?.revision ?? 0 } })
      if (!alive(revision)) return
      const parsed = aiProviderSettingsSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, c.revisionConflict)); return }
      setSettings(current => current ? { ...current, provider: parsed.data } : current)
      setDraft(hydrateProviderForm(parsed.data)); setApiKey(''); setNotice(c.saved)
    } catch { if (alive(revision)) setFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  async function refreshModels() {
    setPending('models'); setFailure(null); setNotice(null)
    const revision = sessionRevision()
    try {
      const result = await api.POST('/api/admin/ai/models/refresh', {})
      if (!alive(revision)) return
      const parsed = z.object({ data: z.array(z.string()) }).safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, t('failed'))); return }
      setModels(parsed.data.data); setNotice(c.modelsReady)
    } catch { if (alive(revision)) setFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  const provider = settings?.provider ?? null
  // The paid test always runs against the saved draft; block it while the form
  // has unsaved changes so the tested revision is the published candidate.
  const providerDirty = provider === null
    || apiKeyAction !== 'keep' || apiKey !== ''
    || JSON.stringify(draft) !== JSON.stringify(hydrateProviderForm(provider))

  return <AdminAiShell view="provider" state={state}>
    <FailureNotice failure={failure} />
    {notice && <p className="success" role="status">{notice}</p>}
    {settings === null && !state.loadFailure ? <p role="status">{t('loading')}</p> : <>
      {provider === null && <div className="empty-state"><p>{c.providerEmpty}</p></div>}
      <form className="admin-ai-form" onSubmit={event => { event.preventDefault(); void saveProviderDraft() }}>
        {/* Freezes every control during test/save/publish so visible edits can't race a mutation. */}
        <fieldset disabled={pending !== null} className="admin-ai-fieldset">
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

          {/* Ruled regions, not boxes: a card nested inside a card is always wrong. */}
          <div className="admin-ai-region" role="group" aria-labelledby="admin-ai-pricing">
            <h2 id="admin-ai-pricing">{c.pricingHeading}</h2>
            <div className="admin-ai-grid">
              <label>{c.fieldPricingCurrency}<input required pattern="[A-Za-z]{3}" maxLength={3} value={draft.pricingCurrency} onChange={event => setField('pricingCurrency', event.target.value)} /></label>
              <label>{c.fieldPricingVersion}<input maxLength={80} value={draft.pricingVersion} onChange={event => setField('pricingVersion', event.target.value)} /></label>
              <label>{c.fieldInputPrice}<input type="number" min={0} value={draft.inputPricePerMillionCents} onChange={event => setField('inputPricePerMillionCents', event.target.value)} /></label>
              <label>{c.fieldOutputPrice}<input type="number" min={0} value={draft.outputPricePerMillionCents} onChange={event => setField('outputPricePerMillionCents', event.target.value)} /></label>
              <label>{c.fieldReservation}<input required type="number" min={0} value={draft.reservationCostCents} onChange={event => setField('reservationCostCents', event.target.value)} /></label>
            </div>
          </div>
          <div className="admin-ai-region" role="group" aria-labelledby="admin-ai-key">
            <h2 id="admin-ai-key">{c.keyHeading}</h2>
            <p className="muted">{provider?.hasApiKey ? c.keyStored : c.keyMissing}</p>
            <div className="admin-ai-key-actions">
              <label><input type="radio" name="admin-ai-key-action" checked={apiKeyAction === 'keep'} onChange={() => { setApiKeyAction('keep'); setApiKey('') }} /> {c.keyKeep}</label>
              <label><input type="radio" name="admin-ai-key-action" checked={apiKeyAction === 'replace'} onChange={() => setApiKeyAction('replace')} /> {c.keyReplace}</label>
              <label><input type="radio" name="admin-ai-key-action" checked={apiKeyAction === 'clear'} onChange={() => { setApiKeyAction('clear'); setApiKey('') }} /> {c.keyClear}</label>
            </div>
            {apiKeyAction === 'replace' && <label className="admin-ai-wide">{c.fieldApiKey}<input required type="password" autoComplete="off" maxLength={500} value={apiKey} onChange={event => setApiKey(event.target.value)} /></label>}
          </div>

          <div className="admin-ai-actions">
            <button type="submit" data-testid="admin-ai-provider-save" disabled={pending !== null}>{pending === 'save' ? '…' : c.saveDraft}</button>
            <button type="button" className="secondary" disabled={pending !== null} onClick={() => void refreshModels()}>{c.refreshModels}</button>
            <button type="button" className="secondary" data-testid="admin-ai-provider-publish" disabled={pending !== null || providerDirty || provider === null || provider.status !== 'draft' || provider.lastTestStatus !== 'passed'} onClick={() => setConfirming('publish')}>{c.publishProvider}</button>
          </div>
          {/* Spending is not a sibling of saving: the one action that costs money
              is named as such and kept out of the save row. */}
          <div className="admin-ai-paid">
            <button type="button" className="secondary admin-ai-paid-action" data-testid="admin-ai-provider-test" disabled={pending !== null || providerDirty || provider?.status !== 'draft'} onClick={() => setConfirming('test')}>{pending === 'test' ? '…' : c.testProvider}</button>
            <span className="badge admin-ai-paid-badge">{c.paidAction}</span>
          </div>
          {provider && <p className="muted admin-ai-provider-meta">
            <AdminAiStatusBadge status={provider.status} /> · {c.revision.replace('{n}', String(provider.revision))} · {c.lastTest}: {provider.lastTestStatus === 'passed' ? c.testPassed : provider.lastTestStatus === 'failed' ? c.testFailed : c.testNever}
            {provider.publishedAt ? <> · {fmtDateTime.format(new Date(provider.publishedAt))}</> : null}
          </p>}
        </fieldset>
      </form>
    </>}
    <ConfirmDialog open={confirming === 'test'} title={c.testProvider} body={c.testConfirm} confirmLabel={c.testProvider} danger onConfirm={() => { setConfirming(null); void testProvider() }} onCancel={() => setConfirming(null)} />
    <ConfirmDialog open={confirming === 'publish'} title={c.publishProvider} body={c.publishConfirm} confirmLabel={c.publishProvider} danger onConfirm={() => { setConfirming(null); void publishProvider() }} onCancel={() => setConfirming(null)} />
  </AdminAiShell>
}
