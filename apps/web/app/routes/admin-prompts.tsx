import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { sharedPromptAuditSchema, sharedPromptListSchema, sharedPromptPlaygroundResponseSchema, sharedPromptVersionSchema, type SharedPromptItem, type SharedPromptKey } from '@diary/contracts/shared-prompts'
import { api, useUi } from '../ui'
import { apiFailure } from '../api-error'
import { useSessionState } from '../session'
import { promptCopy } from './admin-prompts-copy'
import { AdminAiShell, useAdminAiSettings } from './admin-ai-shell'
import './admin-prompts.css'
import { formatInstantLocal } from '../market-display';

type Action = 'create-from-default' | 'duplicate' | 'activate' | 'rollback' | 'archive' | 'disable'
type Playground = z.infer<typeof sharedPromptPlaygroundResponseSchema>
type Audit = z.infer<typeof sharedPromptAuditSchema>
const formatted = (value: unknown) => JSON.stringify(value, null, 2)

export default function AdminPrompts() {
  const { locale } = useUi(), c = promptCopy[locale], session = useSessionState()
  // The registry keeps its own page header; the shell gives it the view
  // navigation and the site-wide live state every AI admin view must show.
  const adminAi = useAdminAiSettings()
  const [items, setItems] = useState<SharedPromptItem[] | null>(null)
  const [key, setKey] = useState<SharedPromptKey>('ai-report.weekly')
  const [selected, setSelected] = useState('')
  const [name, setName] = useState(''), [template, setTemplate] = useState('')
  const [failure, setFailure] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false), [attempt, setAttempt] = useState(0)
  const [auditAttempt, setAuditAttempt] = useState(0)
  const [playground, setPlayground] = useState<Playground | null>(null), [audit, setAudit] = useState<Audit | null>(null)
  const [confirmation, setConfirmation] = useState<Action | null>(null)
  const dialog = useRef<HTMLDialogElement>(null), epoch = useRef(session.revision)
  epoch.current = session.revision
  const item = items?.find(value => value.systemDefault.key === key)
  const version = item?.versions.find(value => value.id === selected)
  const dirty = Boolean(version && (version.template !== template || version.name !== name))

  useEffect(() => {
    const controller = new AbortController(), revision = session.revision
    setItems(null); setFailure(null); setPending(false); setNotice(null); setConfirmation(null); setPlayground(null); setAudit(null); setSelected(''); setTemplate(''); setName('')
    api.GET('/api/admin/ai/prompt-registry', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || epoch.current !== revision) return
      const parsed = sharedPromptListSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(result.response.status === 403 ? c.forbidden : c.failed); return }
      setItems(parsed.data.data)
    }).catch(() => { if (!controller.signal.aborted && epoch.current === revision) setFailure(c.failed) })
    return () => controller.abort()
  }, [session.revision, attempt])
  useEffect(() => { setSelected(''); setPlayground(null); setAudit(null) }, [key])
  useEffect(() => { setName(version?.name ?? ''); setTemplate(version?.template ?? item?.systemDefault.template ?? '') }, [version?.id, item?.systemDefault.template])
  useEffect(() => {
    const controller = new AbortController(), revision = session.revision
    api.GET('/api/admin/ai/prompt-registry/{key}/audit', { params: { path: { key } }, signal: controller.signal }).then(result => {
      const parsed = sharedPromptAuditSchema.safeParse(result.data)
      if (!controller.signal.aborted && epoch.current === revision && result.response.ok && parsed.success) setAudit(parsed.data)
    }).catch(() => {})
    return () => controller.abort()
  }, [key, item?.revision, session.revision, auditAttempt])
  useEffect(() => { const current = dialog.current; if (confirmation && current && !current.open) current.showModal(); else if (!confirmation && current?.open) current.close() }, [confirmation])

  async function refresh(versionId?: string) {
    const revision = epoch.current
    const result = await api.GET('/api/admin/ai/prompt-registry')
    const parsed = sharedPromptListSchema.safeParse(result.data)
    if (!result.response.ok || !parsed.success) throw new Error(c.failed)
    if (epoch.current !== revision) return
    setItems(parsed.data.data)
    if (versionId !== undefined) setSelected(versionId)
  }
  async function mutate(action?: Action) {
    if (!item || pending) return
    const revision = epoch.current
    setPending(true); setFailure(null); setNotice(null); setConfirmation(null)
    try {
      const result = action
        ? await api.POST('/api/admin/ai/prompt-registry/{key}/actions', { params: { path: { key } }, body: { action, expectedRevision: item.revision, ...(selected ? { versionId: selected } : {}) } })
        : await api.POST('/api/admin/ai/prompt-registry/{key}/versions', { params: { path: { key } }, body: { name, template, expectedRevision: item.revision } })
      if (epoch.current !== revision) return
      if (!result.response.ok) { setFailure(apiFailure(result.error, c.failed).code === 'AI_CONFIG_CHANGED' ? c.testRequired : result.response.status === 409 ? c.conflict : c.failed); return }
      const parsed = sharedPromptVersionSchema.safeParse(result.data)
      await refresh(parsed.success ? parsed.data.id : '')
      if (epoch.current !== revision) return
      setPlayground(null); setNotice(c.saved)
    } catch { if (epoch.current === revision) setFailure(c.failed) }
    finally { if (epoch.current === revision) setPending(false) }
  }
  async function run(mode: 'preview' | 'test') {
    if (pending) return
    const revision = epoch.current
    setPending(true); setFailure(null); setNotice(null)
    try {
      const result = await api.POST('/api/admin/ai/prompt-registry/{key}/playground', { params: { path: { key } }, body: { mode, ...(selected ? { versionId: selected } : {}) } })
      if (epoch.current !== revision) return
      const parsed = sharedPromptPlaygroundResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(c.failed); return }
      setPlayground(parsed.data); await refresh()
    } catch { if (epoch.current === revision) setFailure(c.failed) }
    finally { if (epoch.current === revision) { setPending(false); if (mode === 'test') setAuditAttempt(value => value + 1) } }
  }
  const confirmationCopy = confirmation === 'archive' ? c.confirmArchive : confirmation === 'disable' ? c.confirmDisable : c.confirmActivate
  const readable = (label: string, value: unknown) => <details><summary>{label}</summary><pre tabIndex={0}>{typeof value === 'string' ? value : formatted(value)}</pre></details>

  return <AdminAiShell view="registry" state={adminAi}>
   <div className="admin-prompts">
    <header className="page-heading"><h1>{c.title}</h1><p className="muted">{c.intro}</p></header>
    {failure && <div role="alert"><p>{failure}</p><button className="secondary" disabled={pending} onClick={() => items ? void refresh().then(() => setFailure(null)).catch(() => setFailure(c.failed)) : setAttempt(value => value + 1)}>{c.reload}</button></div>}
    {notice && <p role="status">{notice}</p>}
    {pending && <p role="status">{c.pending}</p>}
    {!items && !failure && <p role="status">{c.loading}</p>}
    {item && <>
      <div className="admin-prompt-controls">
        <label>{c.prompt}<select value={key} disabled={pending || dirty} onChange={event => setKey(event.target.value as SharedPromptKey)}><option value="ai-report.weekly">{c.weekly}</option><option value="ai-report.monthly">{c.monthly}</option></select></label>
        <label>{c.version}<select value={selected} disabled={pending} onChange={event => { setSelected(event.target.value); setPlayground(null) }}><option value="">{c.default} · {item.systemDefault.systemVersion}</option>{item.versions.map(row => <option key={row.id} value={row.id}>{row.name} · v{row.revision}{row.archivedAt ? ` · ${c.archived}` : row.id === item.activeVersionId ? ` · ${c.active}` : ''}</option>)}</select></label>
      </div>
      <p className="admin-prompt-state">{c.source}: <strong>{item.effectiveSource === 'override' ? c.override : c.default}</strong> · {c.revision}: <span className="number">{item.revision}</span></p>
      <form className="admin-prompt-editor panel" onSubmit={event => { event.preventDefault(); void mutate() }}>
        <h2>{version ? `${version.name} · v${version.revision}` : c.default}</h2>
        {!version && <p className="muted">{c.immutable}</p>}
        {version && <label>{c.name}<input required maxLength={120} value={name} disabled={pending || Boolean(version.archivedAt)} onChange={event => setName(event.target.value)} /></label>}
        <label>{c.template}<textarea rows={8} required maxLength={12000} readOnly={!version || Boolean(version.archivedAt)} disabled={pending} value={template} onChange={event => { setTemplate(event.target.value); setPlayground(null) }} /></label>
        <p className="muted">{c.variables}: {item.systemDefault.allowedVariables.map(variable => <code key={variable}>{`{{${variable}}} `}</code>)}</p>
        <div className="button-row">
          {!version ? <button type="button" disabled={pending} onClick={() => void mutate('create-from-default')}>{c.create}</button> : !version.archivedAt && <button type="submit" disabled={pending || !dirty}>{c.save}</button>}
          {version && !version.archivedAt && <button type="button" className="secondary" disabled={pending || dirty} onClick={() => void mutate('duplicate')}>{c.duplicate}</button>}
          <button type="button" className="secondary" disabled={pending || dirty || Boolean(version?.archivedAt)} onClick={() => void run('preview')}>{c.preview}</button>
          <button type="button" className="secondary" disabled={pending || dirty || Boolean(version?.archivedAt)} onClick={() => void run('test')}>{c.test}</button>
        </div>
        {dirty && <p role="status">{c.dirty}</p>}
        {version && !version.archivedAt && <div className="button-row admin-prompt-lifecycle">
          <button type="button" className="secondary" disabled={pending || dirty || item.activeVersionId === version.id} onClick={() => setConfirmation('activate')}>{c.activate}</button>
          <button type="button" className="secondary" disabled={pending || dirty || item.activeVersionId === version.id} onClick={() => setConfirmation('rollback')}>{c.rollback}</button>
          <button type="button" className="danger-button" disabled={pending || item.activeVersionId === version.id} onClick={() => setConfirmation('archive')}>{c.archive}</button>
        </div>}
        {item.activeVersionId && <button type="button" className="danger-button" disabled={pending} onClick={() => setConfirmation('disable')}>{c.disable}</button>}
      </form>
      <section className="panel admin-prompt-reference" aria-label={c.default}>
        {readable(c.guardrails, item.systemDefault.guardrails)}{readable(c.schema, item.systemDefault.outputSchema)}{readable(c.models, item.systemDefault.modelSettings)}
      </section>
      <section className="panel" aria-labelledby="prompt-playground"><h2 id="prompt-playground">{c.playground}</h2><p className="muted">{c.testHint}</p>
        {playground && <div className="admin-prompt-playground" data-testid="prompt-playground-result">
          <p role="status">{playground.validation === 'passed' ? c.passed : c.notRun}</p>
          <dl><dt>{c.systemVersion}</dt><dd>{playground.systemVersion}</dd><dt>{c.versionId}</dt><dd>{playground.versionId ?? c.default}</dd><dt>{c.providerModel}</dt><dd>{playground.provider ? `${playground.provider} / ${playground.model}` : c.noProvider}</dd></dl>
          {readable(c.sample, playground.sampleInput)}{readable(c.variables, playground.variables)}{readable(c.rendered, playground.renderedPrompts)}{readable(c.schema, playground.outputSchema)}{readable(c.usage, playground.usage)}{playground.validation === 'passed' && readable(c.output, playground.output)}
        </div>}
      </section>
      <section className="panel" aria-labelledby="prompt-audit"><h2 id="prompt-audit">{c.audit}</h2>{!audit?.data.length ? <p className="muted">{c.noAudit}</p> : <ol className="admin-prompt-audit">{audit.data.map(row => <li key={row.id}><strong>{row.action}</strong><span>{c.version}: {row.versionId ?? c.default} · {c.actor}: {row.actorUserId ?? c.system}</span><time dateTime={row.createdAt}>{formatInstantLocal(locale,row.createdAt)}</time></li>)}</ol>}</section>
    </>}
    <dialog ref={dialog} aria-labelledby="prompt-confirm-heading" onCancel={() => setConfirmation(null)} onClose={() => setConfirmation(null)} className="admin-prompt-dialog"><h2 id="prompt-confirm-heading">{confirmationCopy}</h2><div className="button-row"><button className={confirmation === 'archive' || confirmation === 'disable' ? 'danger-button' : ''} onClick={() => confirmation && void mutate(confirmation)}>{c.confirm}</button><button className="secondary" onClick={() => setConfirmation(null)}>{c.close}</button></div></dialog>
   </div>
  </AdminAiShell>
}
