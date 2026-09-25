import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { z } from 'zod'
import { researchInstrumentProfileSchema, researchMethodProfileSchema, researchRunDetailSchema, researchRunSummarySchema, researchPrepareRequestSchema } from '@diary/contracts'
import { FailureNotice, invalidField, type Failure } from '../api-error'
import { PageHeader, ResearchFailure, ResearchStatus, researchRequest } from '../research-studio'
import { researchConfigurationCopy, researchCopy, type Locale } from '../research-studio-copy'
import { useUi } from '../ui'
import './admin-research.css'

const prepareResponseSchema = z.union([researchRunDetailSchema, researchRunSummarySchema])

function currentTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' } catch { return 'America/New_York' }
}

function toInstant(value: string) {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

export default function AdminResearchNew() {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const configCopy = researchConfigurationCopy(locale as Locale)
  const navigate = useNavigate()
  const [methods, setMethods] = useState<z.infer<typeof researchMethodProfileSchema>[] | null>(null)
  const [instruments, setInstruments] = useState<z.infer<typeof researchInstrumentProfileSchema>[] | null>(null)
  const [methodProfileId, setMethodProfileId] = useState('')
  const [instrumentProfileId, setInstrumentProfileId] = useState('')
  const [profileFailure, setProfileFailure] = useState<Failure | null>(null)
  const [profileAttempt, setProfileAttempt] = useState(0)
  const [timezone, setTimezone] = useState(currentTimezone)
  const [asOf, setAsOf] = useState('')
  const [synthetic, setSynthetic] = useState(true)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState('')
  const activeMethods = methods?.filter(method => method.status !== 'RETIRED') ?? []
  const selectedMethod = activeMethods.find(method => method.id === methodProfileId) ?? null
  const selectedInstrument = instruments?.find(instrument => instrument.id === instrumentProfileId) ?? null

  useEffect(() => {
    const controller = new AbortController()
    setMethods(null)
    setInstruments(null)
    setProfileFailure(null)
    void researchRequest('/api/admin/research/methods', researchMethodProfileSchema.array(), configCopy.profilesUnavailable, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        if (!result.data) { setProfileFailure(result.failure); return }
        setMethods(result.data)
        setMethodProfileId(current => result.data!.some(method => method.id === current && method.status !== 'RETIRED')
          ? current
          : result.data!.find(method => method.status === 'COMPLETE')?.id ?? result.data!.find(method => method.status !== 'RETIRED')?.id ?? '')
      })
      .catch(() => { if (!controller.signal.aborted) setProfileFailure({ message: c.connection, fields: [] }) })
    return () => controller.abort()
  }, [configCopy.profilesUnavailable, c.connection, profileAttempt])

  useEffect(() => {
    if (!methodProfileId) { setInstruments([]); setInstrumentProfileId(''); return }
    const controller = new AbortController()
    setInstruments(null)
    setInstrumentProfileId('')
    setProfileFailure(null)
    const params = new URLSearchParams({ methodProfileId })
    void researchRequest(`/api/admin/research/instruments?${params}`, researchInstrumentProfileSchema.array(), configCopy.profilesUnavailable, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        if (!result.data) { setProfileFailure(result.failure); return }
        setInstruments(result.data)
        setInstrumentProfileId(result.data.find(instrument => instrument.symbol === 'SOXX')?.id ?? result.data[0]?.id ?? '')
      })
      .catch(() => { if (!controller.signal.aborted) setProfileFailure({ message: c.connection, fields: [] }) })
    return () => controller.abort()
  }, [methodProfileId, profileAttempt, configCopy.profilesUnavailable, c.connection])

  const input = useMemo(() => researchPrepareRequestSchema.safeParse({ instrumentProfileId, methodProfileId, displayTimezone: timezone.trim(), ...(toInstant(asOf) ? { asOf: toInstant(asOf) } : {}), synthetic }), [asOf, instrumentProfileId, methodProfileId, synthetic, timezone])

  async function prepare(event: React.FormEvent) {
    event.preventDefault()
    if (!input.success || pending || !selectedMethod || !selectedInstrument) {
      setFailure({ message: c.actionFailed, fields: input.success ? [] : input.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []) })
      return
    }
    setPending(true); setFailure(null); setNotice('')
    try {
      const result = await researchRequest('/api/admin/research/runs', prepareResponseSchema, c.failed, { method: 'POST', body: JSON.stringify(input.data) })
      if (!result.response.ok || !result.data) { setFailure(result.failure); return }
      setNotice(c.prepareComplete)
      await navigate(`/admin/research/${encodeURIComponent(result.data.id)}`)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(false) }
  }

  return <section className="research-page research-new-page">
    <PageHeader title={c.newRun} intro={c.intro} actions={<Link className="secondary" to="/admin/research">{c.back}</Link>} />
    <form className="research-form research-prepare-form" onSubmit={prepare} aria-busy={pending}>
      <fieldset disabled={pending}>
        <section className="research-form-section" aria-labelledby="research-profile-title"><h2 id="research-profile-title">{c.profile}</h2>
          <label>{configCopy.chooseProfile}<select aria-label={configCopy.chooseProfile} value={methodProfileId} onChange={event => setMethodProfileId(event.target.value)} disabled={methods === null || activeMethods.length === 0}><option value="">{methods === null ? configCopy.loadingProfiles : configCopy.noProfiles}</option>{activeMethods.map(method => <option key={method.id} value={method.id}>{method.title} · v{method.version} · {method.status === 'COMPLETE' ? configCopy.completeMethod : configCopy.incompleteMethodStatus}</option>)}</select></label>
          {methods === null && !profileFailure && <p className="field-hint" role="status">{configCopy.loadingProfiles}</p>}
          {methods !== null && activeMethods.length === 0 && <p className="field-hint">{configCopy.noProfiles}</p>}
          {selectedMethod && <div className="research-profile-summary"><p><strong>{configCopy.methodStatus}:</strong> <ResearchStatus value={selectedMethod.status} tone={selectedMethod.status === 'COMPLETE' ? 'info' : 'warn'} label={selectedMethod.status === 'COMPLETE' ? configCopy.completeMethod : configCopy.incompleteMethodStatus} /></p><p><strong>{configCopy.methodVersion}:</strong> {selectedMethod.key} · v{selectedMethod.version}</p><p><strong>{configCopy.bundle}:</strong> <code>{selectedMethod.bundleHash ?? '—'}</code></p>{selectedMethod.status !== 'COMPLETE' && <div className="research-blocked-callout"><strong>{c.blocked}:</strong> {c.incompleteMethod}</div>}</div>}
        </section>
        <section className="research-form-section" aria-labelledby="research-input-title"><h2 id="research-input-title">{c.instrument}</h2>
          <label>{configCopy.chooseInstrument}<select aria-label={configCopy.chooseInstrument} value={instrumentProfileId} onChange={event => setInstrumentProfileId(event.target.value)} disabled={!selectedMethod || instruments === null || instruments.length === 0}><option value="">{instruments === null ? configCopy.loadingProfiles : configCopy.noInstruments}</option>{instruments?.map(instrument => <option key={instrument.id} value={instrument.id}>{instrument.symbol} · {instrument.name}</option>)}</select></label>
          {instruments === null && methodProfileId && !profileFailure && <p className="field-hint" role="status">{configCopy.loadingProfiles}</p>}
          {instruments?.length === 0 && <p className="field-hint">{configCopy.noInstruments}</p>}
          {selectedInstrument && <section className="research-instrument-summary" aria-labelledby="research-instrument-summary-title"><h3 id="research-instrument-summary-title">{configCopy.instrumentDetails}</h3><dl><div><dt>{c.identity}</dt><dd>{selectedInstrument.symbol} · {selectedInstrument.name}</dd></div><div><dt>{configCopy.exchange}</dt><dd>{selectedInstrument.exchange}</dd></div><div><dt>{configCopy.currency}</dt><dd>{selectedInstrument.currency}</dd></div><div><dt>{configCopy.assetType}</dt><dd>{selectedInstrument.assetType}</dd></div><div><dt>{c.benchmarks}</dt><dd>{selectedInstrument.benchmarks.join(' · ') || configCopy.noneConfigured}</dd></div><div><dt>{c.peers}</dt><dd>{selectedInstrument.peers.join(' · ') || configCopy.noneConfigured}</dd></div></dl></section>}
          <div className="research-form-grid"><label>{c.timezone}<input required value={timezone} onChange={event => setTimezone(event.target.value)} aria-invalid={invalidField(failure, 'displayTimezone')} /></label><label>{c.asOf}<input type="datetime-local" value={asOf} onChange={event => setAsOf(event.target.value)} aria-describedby="research-asof-hint" /><span id="research-asof-hint" className="field-hint">{c.asOfHint}</span></label></div>
        </section>
        <section className="research-form-section" aria-labelledby="research-evidence-mode-title"><h2 id="research-evidence-mode-title">{c.preparation}</h2><label className="research-check-label"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} />{c.synthetic}</label><p className="field-hint">{c.syntheticHint}</p></section>
        <ResearchFailure failure={profileFailure} onRetry={() => setProfileAttempt(value => value + 1)} id="research-profile-error" />
        <FailureNotice failure={failure} id="research-prepare-error" />
        {notice && <p className="research-notice" role="status">{notice}</p>}
        <div className="research-form-actions"><button type="submit" disabled={pending || !selectedMethod || !selectedInstrument}>{pending ? c.preparing : c.prepare}</button><Link className="secondary" to="/admin/research">{c.cancel}</Link></div>
      </fieldset>
    </form>
  </section>
}
