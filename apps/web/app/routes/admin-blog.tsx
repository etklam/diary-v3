import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { postAdminListResponseSchema, postStatusSchema } from '@diary/contracts/post'
import { csrfToken, sessionFetch, signInPath } from '../session'
import { useUi } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import '../trade-plan.css'

const copy = {
  en: { title: 'Article admin', intro: 'Manage drafts, publication, and the public article index.', new: 'New article', search: 'Search title or author', status: 'Status', all: 'All statuses', apply: 'Apply', loading: 'Loading…', empty: 'No articles yet.', edit: 'Edit', publish: 'Publish', archive: 'Archive', remove: 'Delete', selected: 'selected', bulkPublish: 'Publish selected', bulkDelete: 'Delete selected', confirm: 'Delete the selected articles?', forbidden: 'You do not have permission to manage articles.', connection: 'Unable to load articles.' },
  'zh-TW': { title: '文章管理', intro: '管理草稿、發布及公開文章索引。', new: '新增文章', search: '搜尋標題或作者', status: '狀態', all: '全部狀態', apply: '套用', loading: '正在載入…', empty: '目前沒有文章。', edit: '編輯', publish: '發布', archive: '封存', remove: '刪除', selected: '項已選取', bulkPublish: '發布所選', bulkDelete: '刪除所選', confirm: '刪除所選文章？', forbidden: '你沒有管理文章的權限。', connection: '暫時無法載入文章。' },
  'zh-CN': { title: '文章管理', intro: '管理草稿、发布及公开文章索引。', new: '新增文章', search: '搜索标题或作者', status: '状态', all: '全部状态', apply: '应用', loading: '正在加载…', empty: '目前没有文章。', edit: '编辑', publish: '发布', archive: '归档', remove: '删除', selected: '项已选中', bulkPublish: '发布所选', bulkDelete: '删除所选', confirm: '删除所选文章？', forbidden: '你没有管理文章的权限。', connection: '暂时无法加载文章。' },
} as const

export default function AdminBlog() {
  const { locale } = useUi(), c = copy[locale]
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [submitted, setSubmitted] = useState(0)
  const [rows, setRows] = useState<Awaited<ReturnType<typeof postAdminListResponseSchema.parse>> | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set()), [failure, setFailure] = useState<Failure | null>(null)
  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ limit: '50' }); if (search) query.set('search', search); if (status) query.set('status', status)
    void sessionFetch(`/api/blog/admin?${query}`).then(async response => {
      const body = await response.json().catch(() => null)
      if (!active) return
      const parsed = postAdminListResponseSchema.safeParse(body)
      if (response.ok && parsed.success) { setRows(parsed.data); setFailure(null); setSelected(new Set()) }
      else setFailure(apiFailure(body, response.status === 403 ? c.forbidden : c.connection))
    }).catch(() => { if (active) setFailure({ message: c.connection, fields: [] }) })
    return () => { active = false }
  }, [submitted, search, status, c.connection, c.forbidden])
  const refresh = () => setSubmitted(value => value + 1)
  async function action(path: string, method = 'POST', body?: unknown) {
    if (method === 'DELETE' && !window.confirm(c.confirm)) return
    if (!csrfToken()) await sessionFetch('/api/auth/me')
    const response = await sessionFetch(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() ?? '' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.ok) { setFailure(apiFailure(await response.json().catch(() => null), c.connection)); return }
    refresh()
  }
  const allSelected = Boolean(rows?.data.length && rows.data.every(row => selected.has(row.id)))
  return <section className="plan-page">
    <header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link className="button" to="/admin/blog/new">{c.new}</Link></header>
    <form method="get" className="plan-filters" onSubmit={event => { event.preventDefault(); refresh() }}><label>{c.search}<input value={search} onChange={event => setSearch(event.target.value)} /></label><label>{c.status}<select value={status} onChange={event => setStatus(event.target.value)}><option value="">{c.all}</option>{postStatusSchema.options.map(value => <option key={value} value={value}>{value}</option>)}</select></label><button type="submit">{c.apply}</button></form>
    <FailureNotice failure={failure} />
    {rows === null && !failure ? <p role="status">{c.loading}</p> : rows?.data.length === 0 ? <p>{c.empty}</p> : rows && <>
      <div className="actions"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={allSelected} onChange={event => setSelected(event.target.checked ? new Set(rows.data.map(row => row.id)) : new Set())} />{selected.size} {c.selected}</label><button type="button" disabled={!selected.size} onClick={() => void action('/api/blog/admin/bulk-publish', 'POST', { ids: [...selected] })}>{c.bulkPublish}</button><button type="button" className="secondary" disabled={!selected.size} onClick={() => void action('/api/blog/admin/bulk-delete', 'POST', { ids: [...selected] })}>{c.bulkDelete}</button></div>
      <div className="table-scroll"><table><caption>{c.title}</caption><thead><tr><th scope="col">{c.title}</th><th scope="col">{c.status}</th><th scope="col">Author</th><th scope="col">Updated</th><th scope="col">Actions</th></tr></thead><tbody>{rows.data.map(row => <tr key={row.id}><th scope="row"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={selected.has(row.id)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next })} />{row.title}</label></th><td>{row.status}</td><td>{row.author.name ?? '—'}<br /><span className="muted">{row.author.email}</span></td><td><time dateTime={row.updatedAt}>{row.updatedAt}</time></td><td><div className="actions"><Link className="button secondary" to={`/admin/blog/${row.id}/edit`}>{c.edit}</Link>{row.status === 'PUBLISHED' ? <button type="button" className="secondary" onClick={() => void action(`/api/blog/admin/${row.id}/archive`)}>{c.archive}</button> : <button type="button" onClick={() => void action(`/api/blog/admin/${row.id}/publish`)}>{c.publish}</button>}<button type="button" className="secondary" onClick={() => void action(`/api/blog/${row.id}`, 'DELETE')}>{c.remove}</button></div></td></tr>)}</tbody></table></div>
    </>}
    {failure?.code === 'AUTH_UNAUTHORIZED' && <Link to={signInPath('/admin/blog')}>Sign in</Link>}
  </section>
}
