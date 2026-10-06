import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { adminGuruListResponseSchema, adminGuruResponseSchema, type AdminGuru } from '@diary/contracts/admin-gurus'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { signInPath } from '../session'
import { api, useUi } from '../ui'
import { AdminGuruForm } from './admin-guru-form'
import { guruAdminCopy, type GuruAdminCopy } from './admin-gurus-copy'
import './admin-gurus.css'

type BooleanFilter = '' | 'true' | 'false'

function guruFailure(error: unknown, fallback: string): Failure {
  const failure = apiFailure(error, fallback)
  if (failure.code === 'GURU_SLUG_CONFLICT') failure.fields.push('profile.slug')
  if (failure.code === 'GURU_CIK_CONFLICT') failure.fields.push('manager.cik')
  return failure
}

function failureCopy(failure: Failure | null, copy: GuruAdminCopy, fallback = copy.failed) {
  if (failure?.code === 'GURU_SLUG_CONFLICT') return copy.slugConflict
  if (failure?.code === 'GURU_CIK_CONFLICT') return copy.cikConflict
  if (failure?.code === 'AUTH_FORBIDDEN') return copy.forbidden
  if (failure?.code === 'AUTH_UNAUTHORIZED') return copy.unauthorized
  return failure?.message ?? fallback
}

function Status({ active, featured, copy }: { active: boolean; featured: boolean; copy: GuruAdminCopy }) {
  return <span className={`admin-guru-status${active ? '' : ' is-inactive'}`}>
    {active ? copy.active : copy.inactive}{featured ? ` · ${copy.featured}` : ''}
  </span>
}

export default function AdminGurus() {
  const { locale } = useUi()
  const c = guruAdminCopy[locale]
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [rows, setRows] = useState<ReturnType<typeof adminGuruListResponseSchema.parse> | null>(null)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [active, setActive] = useState<BooleanFilter>('')
  const [featured, setFeatured] = useState<BooleanFilter>('')
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null)
  const [createFailure, setCreateFailure] = useState<Failure | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (creating && !dialog.open) dialog.showModal()
    if (!creating && dialog.open) dialog.close()
  }, [creating])

  useEffect(() => {
    const controller = new AbortController()
    setRows(null)
    setLoadFailure(null)
    void api.GET('/api/admin/gurus', { params: { query: { page, limit: 20, search: submittedSearch || undefined, active: active || undefined, featured: featured || undefined } }, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        const parsed = adminGuruListResponseSchema.safeParse(result.data)
        if (!result.response.ok || !parsed.success) {
          setLoadFailure(guruFailure(result.error, c.failed))
          return
        }
        setRows(parsed.data)
      })
      .catch(() => { if (!controller.signal.aborted) setLoadFailure({ message: c.failed, fields: [] }) })
    return () => controller.abort()
  }, [active, attempt, c.failed, featured, page, submittedSearch])

  async function createGuru(value: { profile: AdminGuru['profile']; manager: { cik: string } }) {
    if (saving) return
    setSaving(true)
    setCreateFailure(null)
    try {
      const result = await api.POST('/api/admin/gurus', { body: value })
      const parsed = adminGuruResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) {
        setCreateFailure(guruFailure(result.error, c.createFailed))
        return
      }
      const guru = parsed.data.data
      setCreating(false)
      await navigate(`/admin/gurus/${encodeURIComponent(guru.id)}`)
    } catch {
      setCreateFailure({ message: c.createFailed, fields: [] })
    } finally {
      setSaving(false)
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSubmittedSearch(search.trim())
    setAttempt(value => value + 1)
  }

  function setFilter(setter: (value: BooleanFilter) => void, value: string) {
    setter(value as BooleanFilter)
    setPage(1)
  }

  const empty = rows?.data.length === 0
  return <section className="admin-gurus-page" data-testid="admin-gurus-list">
    <header className="admin-gurus-header">
      <div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div>
      <button type="button" onClick={() => { setCreateFailure(null); setCreating(true) }}>{c.create}</button>
    </header>
    <FailureNotice failure={loadFailure} id="admin-gurus-error" messageOverride={failureCopy(loadFailure, c)} />
    {loadFailure?.code === 'AUTH_UNAUTHORIZED' && <Link to={signInPath('/admin/gurus')}>{c.unauthorized}</Link>}

    <section className="admin-gurus-section" aria-labelledby="admin-gurus-list-title">
      <div className="admin-gurus-section-heading">
        <div><h2 id="admin-gurus-list-title">{c.list}</h2><p className="admin-gurus-count">{rows ? c.resultCount(rows.pagination.total) : c.loading}</p></div>
        <form className="admin-gurus-search" onSubmit={submitSearch}>
          <label>{c.search}<input value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /></label>
          <label>{c.activeFilter}<select value={active} onChange={event => setFilter(setActive, event.target.value)}><option value="">{c.any}</option><option value="true">{c.active}</option><option value="false">{c.inactive}</option></select></label>
          <label>{c.featuredFilter}<select value={featured} onChange={event => setFilter(setFeatured, event.target.value)}><option value="">{c.any}</option><option value="true">{c.featured}</option><option value="false">{c.notFeatured}</option></select></label>
          <button type="submit" className="secondary">{c.searchAction}</button>
        </form>
      </div>

      {rows === null && !loadFailure && <p role="status" className="admin-gurus-loading">{c.loading}</p>}
      {loadFailure && rows === null && <div className="admin-gurus-retry"><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button></div>}
      {empty && <p className="admin-gurus-empty">{submittedSearch || active || featured ? c.noMatches : c.empty}</p>}
      {rows && rows.data.length > 0 && <>
        <div className="admin-gurus-table-wrap"><table className="admin-gurus-table">
          <caption>{c.list}</caption><thead><tr><th scope="col">{c.name}</th><th scope="col">{c.manager}</th><th scope="col">{c.cik}</th><th scope="col">{c.styles}</th><th scope="col">{c.status}</th><th scope="col">{c.updatedAt}</th><th scope="col"><span className="sr-only">{c.open}</span></th></tr></thead>
          <tbody>{rows.data.map(guru => <tr key={guru.id} data-testid="admin-guru-row"><th scope="row"><Link to={`/admin/gurus/${encodeURIComponent(guru.id)}`} className="admin-guru-name">{guru.profile.name}</Link><span className="admin-guru-slug">/{guru.profile.slug}</span></th><td>{guru.profile.managerName}</td><td><code>{guru.manager.cik}</code></td><td>{guru.profile.styleTags.length ? guru.profile.styleTags.join(' · ') : '—'}</td><td><Status active={guru.profile.active} featured={guru.profile.featured} copy={c} /></td><td><time dateTime={guru.updatedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(guru.updatedAt))}</time></td><td><Link className="secondary admin-guru-open" to={`/admin/gurus/${encodeURIComponent(guru.id)}`}>{c.open}</Link></td></tr>)}</tbody>
        </table></div>
        <div className="admin-gurus-mobile-list">{rows.data.map(guru => <article className="admin-guru-mobile-row" data-testid="admin-guru-mobile-row" key={guru.id}>
          <div className="admin-guru-mobile-heading"><div><h3><Link to={`/admin/gurus/${encodeURIComponent(guru.id)}`}>{guru.profile.name}</Link></h3><p>{guru.profile.managerName}</p></div><Status active={guru.profile.active} featured={guru.profile.featured} copy={c} /></div>
          <dl><div><dt>{c.cik}</dt><dd><code>{guru.manager.cik}</code></dd></div><div><dt>{c.slug}</dt><dd>/{guru.profile.slug}</dd></div><div className="admin-guru-mobile-styles"><dt>{c.styles}</dt><dd>{guru.profile.styleTags.join(' · ') || '—'}</dd></div></dl>
          <Link className="secondary" to={`/admin/gurus/${encodeURIComponent(guru.id)}`}>{c.open}</Link>
        </article>)}</div>
        {rows.pagination.totalPages > 1 && <nav className="admin-gurus-pagination" aria-label={c.list}><button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{c.previous}</button><span>{c.page} {page} / {rows.pagination.totalPages}</span><button type="button" className="secondary" disabled={page >= rows.pagination.totalPages} onClick={() => setPage(value => value + 1)}>{c.next}</button></nav>}
      </>}
    </section>

    <dialog ref={dialogRef} className="admin-guru-dialog" aria-labelledby="admin-guru-create-title" onClose={() => setCreating(false)} onCancel={() => setCreating(false)}>
      <div className="admin-guru-dialog-content">
        <header><div><h2 id="admin-guru-create-title">{c.createTitle}</h2><p className="field-hint">{c.identityHint}</p></div><button type="button" className="secondary" aria-label={c.close} onClick={() => setCreating(false)}>{c.close}</button></header>
        <AdminGuruForm saving={saving} failure={createFailure} failureMessage={failureCopy(createFailure, c, c.createFailed)} submitLabel={c.create} cancelLabel={c.cancel} onSubmit={createGuru} onCancel={() => setCreating(false)} onEdit={() => setCreateFailure(null)} />
      </div>
    </dialog>
  </section>
}
