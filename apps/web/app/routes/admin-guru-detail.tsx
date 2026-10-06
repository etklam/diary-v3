import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { adminGuruResponseSchema, type AdminGuru } from '@diary/contracts/admin-gurus'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { signInPath } from '../session'
import { api, useUi } from '../ui'
import { AdminGuruAnalysis } from './admin-guru-analysis'
import { AdminGuruOperations } from './admin-guru-operations'
import { AdminGuruForm } from './admin-guru-form'
import { guruAdminCopy, type GuruAdminCopy } from './admin-gurus-copy'
import './admin-gurus.css'

function guruFailure(error: unknown, fallback: string): Failure {
  const failure = apiFailure(error, fallback)
  if (failure.code === 'GURU_SLUG_CONFLICT') failure.fields.push('profile.slug')
  if (failure.code === 'GURU_CIK_CONFLICT') failure.fields.push('manager.cik')
  return failure
}

function failureCopy(failure: Failure | null, copy: GuruAdminCopy, fallback = copy.failed) {
  if (failure?.code === 'GURU_SLUG_CONFLICT') return copy.slugConflict
  if (failure?.code === 'GURU_CIK_CONFLICT') return copy.cikConflict
  if (failure?.code === 'GURU_NOT_FOUND' || failure?.code === 'SYS_NOT_FOUND') return copy.notFound
  if (failure?.code === 'AUTH_FORBIDDEN') return copy.forbidden
  if (failure?.code === 'AUTH_UNAUTHORIZED') return copy.unauthorized
  return failure?.message ?? fallback
}

export default function AdminGuruDetail() {
  const { id = '' } = useParams()
  const { locale } = useUi()
  const c = guruAdminCopy[locale]
  const navigate = useNavigate()
  const [guru, setGuru] = useState<AdminGuru | null>(null)
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null)
  const [saveFailure, setSaveFailure] = useState<Failure | null>(null)
  const [pending, setPending] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!/^[1-9]\d*$/.test(id)) {
      setGuru(null)
      setLoadFailure({ message: c.notFound, code: 'GURU_NOT_FOUND', fields: [] })
      return
    }
    const controller = new AbortController()
    setGuru(null)
    setLoadFailure(null)
    void api.GET('/api/admin/gurus/{id}', { params: { path: { id } }, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        const parsed = adminGuruResponseSchema.safeParse(result.data)
        if (!result.response.ok || !parsed.success) {
          setLoadFailure(guruFailure(result.error, c.loadFailed))
          return
        }
        setGuru(parsed.data.data)
      })
      .catch(() => { if (!controller.signal.aborted) setLoadFailure({ message: c.loadFailed, fields: [] }) })
    return () => controller.abort()
  }, [attempt, c.loadFailed, c.notFound, id])

  async function saveGuru(value: { profile: AdminGuru['profile']; manager: { cik: string } }) {
    if (pending) return
    setPending(true)
    setSaveFailure(null)
    setNotice('')
    try {
      const result = await api.PUT('/api/admin/gurus/{id}', { params: { path: { id } }, body: value })
      const parsed = adminGuruResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) {
        setSaveFailure(guruFailure(result.error, c.failed))
        return
      }
      setGuru(parsed.data.data)
      setNotice(c.updated)
    } catch {
      setSaveFailure({ message: c.failed, fields: [] })
    } finally {
      setPending(false)
    }
  }

  const needsSignIn = loadFailure?.code === 'AUTH_UNAUTHORIZED' || saveFailure?.code === 'AUTH_UNAUTHORIZED'
  return <section className="admin-gurus-page admin-guru-detail-page" data-testid="admin-guru-detail">
    <header className="admin-gurus-header admin-guru-detail-header">
      <div>
        <h1>{guru?.profile.name ?? c.title}</h1>
        <p className="lede">{guru ? `${guru.profile.managerName} · ${c.cik} ${guru.manager.cik}` : c.intro}</p>
      </div>
      <Link className="secondary" to="/admin/gurus">{c.back}</Link>
    </header>
    <FailureNotice failure={loadFailure} id="admin-guru-load-error" messageOverride={failureCopy(loadFailure, c, c.loadFailed)} />
    {needsSignIn && <Link to={signInPath(`/admin/gurus/${id}`)}>{c.unauthorized}</Link>}
    {guru === null && !loadFailure && <p role="status" className="admin-gurus-loading">{c.loading}</p>}
    {loadFailure && <div className="admin-gurus-retry"><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button></div>}
    {guru && <>
      <dl className="admin-guru-metadata">
        <div><dt>{c.profileState}</dt><dd><span className={`admin-guru-status${guru.profile.active ? '' : ' is-inactive'}`}>{guru.profile.active ? c.active : c.inactive}{guru.profile.featured ? ` · ${c.featured}` : ''}</span></dd></div>
        <div><dt>{c.slug}</dt><dd>/{guru.profile.slug}</dd></div>
        <div><dt>{c.updatedAt}</dt><dd><time dateTime={guru.updatedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(guru.updatedAt))}</time></dd></div>
      </dl>
      {notice && <p className="admin-gurus-notice" role="status">{notice}</p>}
      <AdminGuruForm initial={guru} saving={pending} failure={saveFailure} failureMessage={failureCopy(saveFailure, c)} submitLabel={c.save} cancelLabel={c.back} onSubmit={saveGuru} onCancel={() => void navigate('/admin/gurus')} onEdit={() => { setSaveFailure(null); setNotice('') }} />
      <AdminGuruOperations id={id} />
      <AdminGuruAnalysis id={id} />
    </>}
  </section>
}
