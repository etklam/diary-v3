import { useEffect, useRef, useState } from 'react'
import { aiAccessItemSchema, aiAccessListResponseSchema, type AiAccessItem } from '@diary/contracts/admin-ai'
import { api, useUi } from '../ui'
import { useSessionState } from '../session'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { adminAiCopy } from '../ai-copy'
import { AdminAiShell, useAdminAiSettings } from './admin-ai-shell'

/**
 * One job: who may ask for a report, and how many per month.
 *
 * The per-row Save is the documented exception to one-save-scope-per-view: the
 * state it commits belongs to one account, so a single page-level save would
 * have to invent a batch semantics the API does not have. It is the only save
 * in this view.
 */
export default function AdminAiAccess() {
  const { locale, t } = useUi()
  const c = adminAiCopy[locale]
  const session = useSessionState()
  const state = useAdminAiSettings()
  const { adminReady, alive, sessionRevision } = state
  const translate = useRef(t); translate.current = t

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [access, setAccess] = useState<{ items: AiAccessItem[]; nextCursor: string | null } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; quota: string }>>({})
  const [pending, setPending] = useState<string | null>(null)
  const [morePending, setMorePending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Bumped whenever page 1 reloads, so an in-flight load-more can never append
  // to a newer list.
  const epochRef = useRef(0)

  useEffect(() => { setNotice(null) }, [locale])

  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    epochRef.current += 1
    setAccess(null); setMorePending(false)
    api.GET('/api/admin/ai/access', { params: { query: { limit: 50, search: query || undefined } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = aiAccessListResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setAccess({ items: parsed.data.data, nextCursor: parsed.data.nextCursor })
        setDrafts(current => ({ ...current, ...Object.fromEntries(parsed.data.data.map(item => [item.userId, current[item.userId] ?? { enabled: item.enabled, quota: String(item.monthlyQuota) }])) }))
      } else setFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
  }, [query, attempt, session.revision, adminReady])

  async function saveAccess(item: AiAccessItem) {
    const row = drafts[item.userId]
    if (!row) return
    const quota = Number(row.quota)
    if (!Number.isInteger(quota) || quota < 0) { setFailure({ message: t('failed'), fields: ['monthlyQuota'] }); return }
    setPending(item.userId); setFailure(null); setNotice(null)
    const revision = sessionRevision()
    try {
      const result = await api.PUT('/api/admin/ai/access/{userId}', { params: { path: { userId: item.userId } }, body: { enabled: row.enabled, monthlyQuota: quota } })
      if (!alive(revision)) return
      const parsed = aiAccessItemSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, t('failed'))); return }
      setAccess(current => current ? { ...current, items: current.items.map(known => known.userId === item.userId ? { ...known, enabled: parsed.data.enabled, monthlyQuota: parsed.data.monthlyQuota } : known) } : current)
      setDrafts(current => ({ ...current, [item.userId]: { enabled: parsed.data.enabled, quota: String(parsed.data.monthlyQuota) } }))
      setNotice(c.saved)
    } catch { if (alive(revision)) setFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision)) setPending(null) }
  }

  async function loadMore() {
    if (!access?.nextCursor) return
    const revision = sessionRevision()
    const epoch = epochRef.current
    const cursor = access.nextCursor
    const current = query
    setMorePending(true)
    try {
      const result = await api.GET('/api/admin/ai/access', { params: { query: { limit: 50, cursor, search: current || undefined } } })
      if (!alive(revision) || epochRef.current !== epoch) return
      const parsed = aiAccessListResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, t('failed'))); return }
      setAccess(known => {
        if (!known || known.nextCursor !== cursor) return known
        return { items: [...known.items, ...parsed.data.data.filter(item => !known.items.some(seen => seen.userId === item.userId))], nextCursor: parsed.data.nextCursor }
      })
      setDrafts(known => ({ ...known, ...Object.fromEntries(parsed.data.data.map(item => [item.userId, known[item.userId] ?? { enabled: item.enabled, quota: String(item.monthlyQuota) }])) }))
    } catch { if (alive(revision) && epochRef.current === epoch) setFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision) && epochRef.current === epoch) setMorePending(false) }
  }

  return <AdminAiShell view="access" state={state}>
    <FailureNotice failure={failure} />
    {notice && <p className="success" role="status">{notice}</p>}
    <form className="admin-ai-search" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setAttempt(value => value + 1) }}>
      <label>{c.accessSearch}<input type="search" maxLength={255} value={search} disabled={morePending} onChange={event => setSearch(event.target.value)} /></label>
      <button type="submit" className="secondary" disabled={morePending}>{c.accessSearchAction}</button>
    </form>
    {access === null ? <p role="status">{t('loading')}</p> : access.items.length === 0 ? <div className="empty-state"><p>{c.accessEmpty}</p></div> : <>
      <div className="admin-ai-table-wrap" role="region" aria-label={c.viewAccess} tabIndex={0}><table data-testid="admin-ai-access-table">
        <caption className="sr-only">{c.viewAccess}</caption>
        <thead><tr><th scope="col">{c.accessEmail}</th><th scope="col">{c.accessName}</th><th scope="col">{c.accessEnabled}</th><th scope="col">{c.accessQuota}</th><th scope="col" /></tr></thead>
        <tbody>{access.items.map(item => {
          const row = drafts[item.userId] ?? { enabled: item.enabled, quota: String(item.monthlyQuota) }
          return <tr key={item.userId}>
            <th scope="row"><span className="admin-ai-email">{item.email}</span></th>
            <td>{item.name ?? '—'}</td>
            <td><input type="checkbox" aria-label={`${c.accessEnabled}: ${item.email}`} checked={row.enabled} disabled={pending !== null} onChange={event => setDrafts(current => ({ ...current, [item.userId]: { ...row, enabled: event.target.checked } }))} /></td>
            <td><input type="number" min={0} max={10000} aria-label={`${c.accessQuota}: ${item.email}`} value={row.quota} disabled={pending !== null} onChange={event => setDrafts(current => ({ ...current, [item.userId]: { ...row, quota: event.target.value } }))} /></td>
            <td><button type="button" className="secondary" disabled={pending !== null || (row.enabled === item.enabled && Number(row.quota) === item.monthlyQuota)} onClick={() => void saveAccess(item)}>{pending === item.userId ? '…' : c.accessSave}</button></td>
          </tr>
        })}</tbody>
      </table></div>
      {access.nextCursor && <button type="button" className="secondary" disabled={morePending} onClick={() => void loadMore()}>{morePending ? '…' : c.loadMore}</button>}
    </>}
  </AdminAiShell>
}
