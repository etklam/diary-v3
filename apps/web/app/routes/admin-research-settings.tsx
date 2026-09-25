import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { researchProviderSettingsSchema, researchProviderUpdateSchema, researchRuntimeResponseSchema, researchRuntimeUpdateSchema, researchSettingsResponseSchema, type ResearchProviderSettings } from '@diary/contracts'
import { FailureNotice, type Failure } from '../api-error'
import { PageHeader, ResearchFailure, ResearchStatus, researchRequest, statusTone } from '../research-studio'
import { permissionStatusLabel, researchConfigurationCopy, researchCopy, researchSourcePurposeKeys, formatDate, type Locale } from '../research-studio-copy'
import { useUi } from '../ui'
import './admin-research.css'

type ProviderForm = {
  baseUrl: string
  maxInputTokens: string
  maxOutputTokens: string
  timeoutMs: string
  apiKey: string
}

function providerForm(provider: ResearchProviderSettings | null): ProviderForm {
  return { baseUrl: provider?.baseUrl ?? 'https://openrouter.ai/api/v1', maxInputTokens: String(provider?.maxInputTokens ?? 64000), maxOutputTokens: String(provider?.maxOutputTokens ?? 6000), timeoutMs: String(provider?.timeoutMs ?? 45000), apiKey: '' }
}

export default function AdminResearchSettings() {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const sourceCopy = researchConfigurationCopy(locale as Locale)
  const [settings, setSettings] = useState<ReturnType<typeof researchSettingsResponseSchema.parse> | null>(null)
  const [provider, setProvider] = useState<ProviderForm>(() => providerForm(null))
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)

  function sourceStatusLabel(value: string) {
    if (value === 'READY') return sourceCopy.sourceReadyLabel
    if (value === 'NOT_CONFIGURED') return sourceCopy.sourceNotConfiguredLabel
    if (value === 'POLICY_RESTRICTED') return sourceCopy.sourcePolicyRestrictedLabel
    if (value === 'BUDGET_NOT_CONFIGURED') return sourceCopy.sourceBudgetNotConfiguredLabel
    return sourceCopy.sourcePolicyUnknownLabel
  }

  function sourceStatusMessage(value: string) {
    if (value === 'READY') return sourceCopy.sourceReady
    if (value === 'NOT_CONFIGURED') return sourceCopy.sourceNotConfigured
    if (value === 'POLICY_RESTRICTED') return sourceCopy.sourcePolicyRestricted
    if (value === 'BUDGET_NOT_CONFIGURED') return sourceCopy.sourceBudgetNotConfigured
    return sourceCopy.sourcePolicyUnknown
  }

  function searchStatusLabel(value: string) {
    if (value === 'READY') return sourceCopy.searchReadyLabel
    if (value === 'SEARCH_QUOTA_EXCEEDED') return sourceCopy.searchQuotaExceededLabel
    if (value === 'SEARCH_BUDGET_NOT_CONFIGURED') return sourceCopy.searchBudgetNotConfiguredLabel
    return sourceCopy.searchNotConfiguredLabel
  }

  function searchStatusMessage(value: string) {
    if (value === 'READY') return sourceCopy.searchConfiguredReady
    if (value === 'SEARCH_QUOTA_EXCEEDED') return sourceCopy.searchQuotaExceeded
    if (value === 'SEARCH_BUDGET_NOT_CONFIGURED') return sourceCopy.searchBudgetNotConfigured
    return sourceCopy.searchNotConfigured
  }

  useEffect(() => {
    const controller = new AbortController()
    setSettings(null); setFailure(null)
    void researchRequest('/api/admin/research/settings', researchSettingsResponseSchema, c.settingsUnavailable, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setSettings(result.data); setFailure(result.failure); if (result.data) setProvider(providerForm(result.data.provider)) } })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: c.connection, fields: [] }) })
    return () => controller.abort()
  }, [attempt, c.connection, c.settingsUnavailable])

  async function saveRuntime(patch: { featureEnabled?: boolean; generationEnabled?: boolean }) {
    if (!settings || pending) return
    const body = researchRuntimeUpdateSchema.safeParse({ expectedRevision: settings.runtime.revision, ...patch })
    if (!body.success) return
    setPending('runtime'); setFailure(null); setNotice('')
    try {
      const result = await researchRequest('/api/admin/research/runtime', researchRuntimeResponseSchema, c.actionFailed, { method: 'PUT', body: JSON.stringify(body.data) })
      if (!result.response.ok || !result.data) { setFailure(result.failure); if (result.response.status === 409) setAttempt(value => value + 1); return }
      setSettings(current => current ? { ...current, runtime: result.data! } : current); setNotice(c.settingsSaved)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(null) }
  }

  async function saveProvider(event: React.FormEvent) {
    event.preventDefault()
    if (!settings || pending) return
    const apiKey = provider.apiKey.trim()
    const body = researchProviderUpdateSchema.safeParse({ expectedRevision: settings.provider?.revision ?? 0, baseUrl: provider.baseUrl.trim(), model: 'openrouter/free', maxInputTokens: Number(provider.maxInputTokens), maxOutputTokens: Number(provider.maxOutputTokens), timeoutMs: Number(provider.timeoutMs), ...(apiKey ? { apiKey } : {}) })
    if (!body.success) { setFailure({ message: c.actionFailed, fields: body.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []) }); return }
    setPending('provider'); setFailure(null); setNotice('')
    try {
      const result = await researchRequest('/api/admin/research/provider', researchProviderSettingsSchema, c.actionFailed, { method: 'PUT', body: JSON.stringify(body.data) })
      if (!result.response.ok || !result.data) { setFailure(result.failure); if (result.response.status === 409) setAttempt(value => value + 1); return }
      setSettings(current => current ? { ...current, provider: result.data! } : current); setProvider(providerForm(result.data)); setNotice(c.settingsSaved)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(null) }
  }

  if (settings === null && !failure) return <section className="research-page research-settings-page"><PageHeader title={c.settings} actions={<Link className="secondary" to="/admin/research">{c.back}</Link>} /><p className="research-loading" role="status">{c.loading}</p></section>
  return <section className="research-page research-settings-page">
    <PageHeader title={c.settings} intro={c.providerHint} actions={<Link className="secondary" to="/admin/research">{c.back}</Link>} />
    <ResearchFailure failure={failure} onRetry={() => setAttempt(value => value + 1)} />
    {settings && <>
      {notice && <p className="research-notice" role="status">{notice}</p>}
      <section className="research-panel research-settings-runtime" aria-labelledby="research-runtime-title">
        <h2 id="research-runtime-title">{c.runtime}</h2>
        <label className="research-switch"><input type="checkbox" checked={settings.runtime.featureEnabled} disabled={pending !== null} onChange={event => void saveRuntime({ featureEnabled: event.target.checked })} />{c.featureSwitch}</label>
        <label className="research-switch"><input type="checkbox" checked={settings.runtime.generationEnabled} disabled={pending !== null || !settings.runtime.featureEnabled} onChange={event => void saveRuntime({ generationEnabled: event.target.checked })} />{c.generationSwitch}</label>
        <dl className="research-settings-meta"><div><dt>{c.worker}</dt><dd><ResearchStatus value={settings.runtime.workerAvailable ? 'SUCCEEDED' : 'FAILED'} tone={statusTone(settings.runtime.workerAvailable ? 'SUCCEEDED' : 'FAILED')} /> {settings.runtime.workerAvailable ? c.workerAvailable : c.workerUnavailable}</dd></div><div><dt>{c.budget}</dt><dd>{settings.runtime.budget.reserved} / {settings.runtime.budget.limit}</dd></div><div><dt>{c.lastChanged}</dt><dd>{formatDate(settings.runtime.workerHeartbeatAt, locale as Locale, true)}</dd></div></dl>
        <p className="field-hint">{c.budgetUnknown}</p>
      </section>
      <form className="research-panel research-provider-form" onSubmit={saveProvider} aria-busy={pending === 'provider'}>
        <h2>{c.provider}</h2><p className="field-hint">{c.providerHint}</p>
        <div className="research-form-grid">
          <label>{c.baseUrl}<input type="url" required value={provider.baseUrl} onChange={event => setProvider(current => ({ ...current, baseUrl: event.target.value }))} /></label>
          <label>{c.modelFixed}<input value="openrouter/free" readOnly /></label>
          <label>{c.inputLimit}<input type="number" min={1} max={200000} required value={provider.maxInputTokens} onChange={event => setProvider(current => ({ ...current, maxInputTokens: event.target.value }))} /></label>
          <label>{c.outputLimit}<input type="number" min={1} max={32000} required value={provider.maxOutputTokens} onChange={event => setProvider(current => ({ ...current, maxOutputTokens: event.target.value }))} /></label>
          <label>{c.timeout}<input type="number" min={1000} max={300000} required value={provider.timeoutMs} onChange={event => setProvider(current => ({ ...current, timeoutMs: event.target.value }))} /></label>
          <label>{c.secret}<input type="password" value={provider.apiKey} placeholder={settings.provider?.hasSecret ? c.secretPresent : c.secretMissing} onChange={event => setProvider(current => ({ ...current, apiKey: event.target.value }))} autoComplete="new-password" /><span className="field-hint">{settings.provider?.hasSecret ? c.secretPresent : c.secretMissing}</span></label>
        </div>
        <FailureNotice failure={failure} id="research-settings-error" />
        <div className="research-form-actions"><button type="submit" disabled={pending !== null}>{pending === 'provider' ? c.savingSettings : c.saveSettings}</button></div>
      </form>
      <section className="research-panel research-settings-search" aria-labelledby="research-settings-search-title" data-testid="research-search-availability">
        <div className="research-panel-heading"><h2 id="research-settings-search-title">{sourceCopy.searchConfiguration}</h2><ResearchStatus value={settings.search.status} tone={settings.search.status === 'READY' ? 'info' : settings.search.status === 'SEARCH_QUOTA_EXCEEDED' ? 'warn' : 'neutral'} label={searchStatusLabel(settings.search.status)} /></div>
        <p>{searchStatusMessage(settings.search.status)}</p>
        <p className="muted">{sourceCopy.searchCredentialLabel}: {settings.search.configured ? sourceCopy.configuredYes : sourceCopy.configuredNo}</p>
        <dl className="research-settings-meta"><div><dt>{sourceCopy.searchBudgetLimit}</dt><dd>{settings.search.budget.limit ?? '—'}</dd></div><div><dt>{sourceCopy.searchBudgetReserved}</dt><dd>{settings.search.budget.reserved}</dd></div><div><dt>{sourceCopy.searchBudgetConsumed}</dt><dd>{settings.search.budget.consumed}</dd></div><div><dt>{sourceCopy.searchBudgetUnknown}</dt><dd>{settings.search.budget.unknown}</dd></div></dl>
      </section>
      <section className="research-panel research-settings-source-policy" aria-labelledby="research-settings-source-title" data-testid="research-source-availability">
        <h2 id="research-settings-source-title">{sourceCopy.settingsSources}</h2>
        <div className="research-settings-source-list">{settings.sources.map(source => {
          const permissions = researchSourcePurposeKeys.map(key => [key, source.use[key]] as const)
          const tone = source.status === 'READY' ? 'info' : source.status === 'POLICY_RESTRICTED' ? 'negative' : source.status === 'NOT_CONFIGURED' ? 'neutral' : 'warn'
          return <article key={source.sourceId} className="research-settings-source-row">
            <div className="research-panel-heading"><h3>{source.provider}</h3><ResearchStatus value={source.status} tone={tone} label={sourceStatusLabel(source.status)} /></div>
            <p className="muted"><code>{source.sourceId}</code> · {sourceCopy.configuredLabel}: {source.configured ? sourceCopy.configuredYes : sourceCopy.configuredNo}</p>
            <div className="research-source-purpose-badges" role="list" aria-label={`${source.sourceId}: ${c.sourceRights}`}>{permissions.map(([purpose, permission]) => <span key={purpose} role="listitem" aria-label={`${sourceCopy[purpose]}: ${permissionStatusLabel(permission.status, sourceCopy)}`} className={`research-purpose-badge research-purpose-${permission.status}`}><span>{sourceCopy[purpose]}</span><strong>{permissionStatusLabel(permission.status, sourceCopy)}</strong></span>)}</div>
            <details className="research-source-details"><summary>{sourceCopy.sourceDetails}</summary>
              <p>{sourceStatusMessage(source.status)}</p>
              <dl className="research-source-permissions" aria-label={`${source.sourceId}: ${c.sourceRights}`}>{permissions.map(([purpose, permission]) => <div key={purpose}><dt>{sourceCopy[purpose]} <ResearchStatus value={permission.status} tone={permission.status === 'allowed' ? 'info' : permission.status === 'restricted' ? 'warn' : 'neutral'} label={permissionStatusLabel(permission.status, sourceCopy)} /></dt><dd><span><strong>{sourceCopy.conditions}:</strong> {permission.conditions.length ? permission.conditions.join(' · ') : sourceCopy.noConditions}</span><span><strong>{sourceCopy.basis}:</strong> {permission.basis ?? sourceCopy.noBasis}</span><span><strong>{sourceCopy.checkedAt}:</strong> {permission.checkedAt ? <time dateTime={permission.checkedAt}>{formatDate(permission.checkedAt, locale as Locale, true)}</time> : sourceCopy.notRecorded}</span></dd></div>)}</dl>
            </details>
          </article>
        })}</div>
      </section>
    </>}
  </section>
}
