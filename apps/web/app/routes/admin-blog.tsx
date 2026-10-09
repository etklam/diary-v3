import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { postAdminDetailSchema, postAdminListResponseSchema, postBulkResponseSchema, postStatusSchema } from '@diary/contracts/post'
import { csrfToken, invalidateArticleCache, sessionFetch, signInPath } from '../session'
import { useUi } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { TranslationBatch } from '../admin-translation-batch'
import { ConfirmDialog } from '../authoring-controls'
import { formatInstantUtc } from '../market-display'
import '../trade-plan.css'
import './admin-blog.css'

const copy = {
  en: { articleColumn: 'Title', caption: 'Articles', noAuthor: 'Unnamed account', title: 'Article management', intro: 'Manage drafts, publication, and the public article index.', new: 'New article', search: 'Search title or author', status: 'Status', all: 'All statuses', draft: 'Draft', published: 'Published', archived: 'Archived', apply: 'Apply', loading: 'Loading…', empty: 'No articles yet.', edit: 'Edit', view: 'View article', publish: 'Publish', archive: 'Archive', remove: 'Delete', selected: 'selected', bulkPublish: 'Publish selected', bulkDelete: 'Delete selected', confirm: 'Delete the selected articles?', confirmOne: 'Delete this article permanently? Published readers lose access to it immediately.', cancel: 'Cancel', author: 'Author', updated: 'Updated', actions: 'Actions', forbidden: 'You do not have permission to manage articles.', connection: 'Unable to load articles.' },
  'zh-TW': { articleColumn: '標題', caption: '文章', noAuthor: '未命名帳戶', title: '文章管理', intro: '管理草稿、發布及公開文章索引。', new: '新增文章', search: '搜尋標題或作者', status: '狀態', all: '全部狀態', draft: '草稿', published: '已發布', archived: '已封存', apply: '套用', loading: '正在載入…', empty: '目前沒有文章。', edit: '編輯', view: '查看文章', publish: '發布', archive: '封存', remove: '刪除', selected: '項已選取', bulkPublish: '發布所選', bulkDelete: '刪除所選', confirm: '刪除所選文章？', confirmOne: '永久刪除這篇文章？已發布的讀者會立即失去存取權。', cancel: '取消', author: '作者', updated: '已更新', actions: '操作', forbidden: '你沒有管理文章的權限。', connection: '暫時無法載入文章。' },
  'zh-CN': { articleColumn: '标题', caption: '文章', noAuthor: '未命名账户', title: '文章管理', intro: '管理草稿、发布及公开文章索引。', new: '新增文章', search: '搜索标题或作者', status: '状态', all: '全部状态', draft: '草稿', published: '已发布', archived: '已归档', apply: '应用', loading: '正在加载…', empty: '目前没有文章。', edit: '编辑', view: '查看文章', publish: '发布', archive: '归档', remove: '删除', selected: '项已选中', bulkPublish: '发布所选', bulkDelete: '删除所选', confirm: '删除所选文章？', confirmOne: '永久删除这篇文章？已发布的读者会立即失去访问权。', cancel: '取消', author: '作者', updated: '已更新', actions: '操作', forbidden: '你没有管理文章的权限。', connection: '暂时无法加载文章。' },
} as const

const publishCopy = {
  en: {
    published: (count: number) => `${count} article${count === 1 ? '' : 's'} published.`,
    skipped: (count: number) => `${count} article${count === 1 ? '' : 's'} had translation work skipped. Review the translation states and request skipped work again.`,
    edgeResume: (value: string) => `The Edge provider can accept requests again after ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))}. Skipped translations are not queued automatically.`,
    review: 'Review article translations',
  },
  'zh-TW': {
    published: (count: number) => `已發布 ${count} 篇文章。`,
    skipped: (count: number) => `${count} 篇文章有翻譯工作未能入列。請查看翻譯狀態，並重新發起已跳過的工作。`,
    edgeResume: (value: string) => `Edge 服務可在 ${new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))} 後再次接受請求。已跳過的翻譯不會自動入列。`,
    review: '查看文章翻譯狀態',
  },
  'zh-CN': {
    published: (count: number) => `已发布 ${count} 篇文章。`,
    skipped: (count: number) => `${count} 篇文章有翻译工作未能入队。请查看翻译状态，并重新发起已跳过的工作。`,
    edgeResume: (value: string) => `Edge 服务可在 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))} 后再次接受请求。已跳过的翻译不会自动入队。`,
    review: '查看文章翻译状态',
  },
} as const

type PublishFeedback = { count: number; warningCount: number; resumeAt: string | null; articles: Array<{ id: string; title: string }> }

export default function AdminBlog() {
  const { locale } = useUi(), c = copy[locale]
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [submitted, setSubmitted] = useState(0)
  const [rows, setRows] = useState<Awaited<ReturnType<typeof postAdminListResponseSchema.parse>> | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set()), [failure, setFailure] = useState<Failure | null>(null)
  // 'bulk' for the selection, an article id for one row. Deletion names its
  // consequence in the project dialog; the row control had no confirmation at
  // all and the bulk one used window.confirm.
  const [doomed, setDoomed] = useState<string | null>(null)
  const [publishFeedback, setPublishFeedback] = useState<PublishFeedback | null>(null)
  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ limit: '50' }); if (search) query.set('search', search); if (status) query.set('status', status)
    void sessionFetch(`/api/blog/admin?${query}`).then(async response => {
      const body = await response.json().catch(() => null)
      if (!active) return
      const parsed = postAdminListResponseSchema.safeParse(body)
      // A reload must not silently drop a selection the admin is still working
      // with; only articles that left the list are deselected.
      if (response.ok && parsed.success) { setRows(parsed.data); setFailure(null); setSelected(current => new Set([...current].filter(id => parsed.data.data.some(row => row.id === id)))) }
      else setFailure(apiFailure(body, response.status === 403 ? c.forbidden : c.connection))
    }).catch(() => { if (active) setFailure({ message: c.connection, fields: [] }) })
    return () => { active = false }
  }, [submitted, search, status, c.connection, c.forbidden])
  const refresh = () => setSubmitted(value => value + 1)
  async function action(path: string, method = 'POST', body?: unknown) {
    // Both delete paths confirm in the project dialog before they get here.
    // This helper used to raise `window.confirm` for every DELETE, with the
    // bulk copy — "Delete the selected articles?" — in front of a single row.
    setPublishFeedback(null)
    if (!csrfToken()) await sessionFetch('/api/auth/me')
    const response = await sessionFetch(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() ?? '' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.ok) { setFailure(apiFailure(await response.json().catch(() => null), c.connection)); return }
    if (path.endsWith('/bulk-publish')) {
      const parsed = postBulkResponseSchema.safeParse(await response.json().catch(() => null))
      if (parsed.success) {
        const ids = (body as { ids?: unknown } | undefined)?.ids
        const articleIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
        setPublishFeedback({
          count: parsed.data.count,
          warningCount: parsed.data.automaticTranslationWarningCount ?? 0,
          resumeAt: parsed.data.automaticTranslationResumeAt ?? null,
          articles: articleIds.map(id => ({ id, title: rows?.data.find(row => row.id === id)?.title ?? `Article ${id}` })),
        })
      }
    } else if (/\/\d+\/publish$/.test(path)) {
      const parsed = postAdminDetailSchema.safeParse(await response.json().catch(() => null))
      const id = path.match(/\/admin\/(\d+)\/publish$/)?.[1]
      if (parsed.success && parsed.data.status === 'PUBLISHED') {
        const admission = parsed.data.automaticTranslationAdmission
        setPublishFeedback({
          count: 1,
          warningCount: admission && admission.status !== 'queued' ? 1 : 0,
          resumeAt: admission?.resumeAt ?? null,
          articles: id ? [{ id, title: parsed.data.title }] : [],
        })
      }
    }
    invalidateArticleCache()
    refresh()
  }
  const allSelected = Boolean(rows?.data.length && rows.data.every(row => selected.has(row.id)))
  const statusLabel = (value: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') => value === 'DRAFT' ? c.draft : value === 'PUBLISHED' ? c.published : c.archived
  const formatDate = (value: string) => formatInstantUtc(locale, value)
  return <section className="plan-page">
    <header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link className="button" to="/admin/blog/new">{c.new}</Link></header>
    <form method="get" className="plan-filters" onSubmit={event => { event.preventDefault(); refresh() }}><label>{c.search}<input value={search} onChange={event => setSearch(event.target.value)} /></label><label>{c.status}<select value={status} onChange={event => setStatus(event.target.value)}><option value="">{c.all}</option>{postStatusSchema.options.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><button type="submit" className="secondary">{c.apply}</button></form>
    <FailureNotice failure={failure} />
    {publishFeedback && <div className="article-save-result admin-publish-result" role="status">
      <p>{publishCopy[locale].published(publishFeedback.count)}</p>
      {publishFeedback.warningCount > 0 && <p>{publishCopy[locale].skipped(publishFeedback.warningCount)}</p>}
      {publishFeedback.resumeAt && <p>{publishCopy[locale].edgeResume(publishFeedback.resumeAt)}</p>}
      {publishFeedback.warningCount > 0 && publishFeedback.articles.length > 0 && <p>{publishCopy[locale].review}: {publishFeedback.articles.map(article => <span key={article.id}><Link to={`/admin/blog/${article.id}/edit`}>{article.title}</Link>{' '}</span>)}</p>}
    </div>}
    {rows === null && !failure ? <p role="status">{c.loading}</p> : rows?.data.length === 0 ? <div className="empty-state"><p>{c.empty}</p></div> : rows && <>
      <div className="actions"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={allSelected} onChange={event => setSelected(event.target.checked ? new Set(rows.data.map(row => row.id)) : new Set())} />{selected.size} {c.selected}</label><button type="button" className="secondary" disabled={!selected.size} onClick={() => void action('/api/blog/admin/bulk-publish', 'POST', { ids: [...selected] })}>{c.bulkPublish}</button><button type="button" className="secondary danger-button" disabled={!selected.size} onClick={() => setDoomed('bulk')}>{c.bulkDelete}</button></div>
      <TranslationBatch selected={[...selected]} />
      <div className="table-scroll admin-blog-table"><table><caption>{c.caption}</caption><thead><tr><th scope="col">{c.articleColumn}</th><th scope="col" className="admin-blog-status">{c.status}</th><th scope="col">{c.author}</th><th scope="col">{c.updated}</th><th scope="col">{c.actions}</th></tr></thead><tbody>{rows.data.map(row => <tr key={row.id}><th scope="row"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={selected.has(row.id)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next })} />{row.title}</label></th><td className="admin-blog-status">{statusLabel(row.status)}</td><td className="admin-blog-author">{row.author.name ?? <span className="muted">{c.noAuthor}</span>}<br /><span className="muted">{row.author.email}</span></td><td className="admin-blog-updated"><time dateTime={row.updatedAt}>{formatDate(row.updatedAt)}</time></td><td><div className="actions admin-blog-row-actions"><Link className="button quiet-button button-compact" to={`/admin/blog/${row.id}/edit`}>{c.edit}</Link>{row.status === 'PUBLISHED' && <Link className="button quiet-button button-compact" to={`/articles/${encodeURIComponent(row.slug)}`}>{c.view}</Link>}{row.status === 'PUBLISHED' ? <button type="button" className="quiet-button button-compact" onClick={() => void action(`/api/blog/admin/${row.id}/archive`)}>{c.archive}</button> : <button type="button" className="quiet-button button-compact" onClick={() => void action(`/api/blog/admin/${row.id}/publish`)}>{c.publish}</button>}<button type="button" className="danger-button button-compact" onClick={() => setDoomed(row.id)}>{c.remove}</button></div></td></tr>)}</tbody></table></div>
    </>}
    {failure?.code === 'AUTH_UNAUTHORIZED' && <Link to={signInPath('/admin/blog')}>Sign in</Link>}
    <ConfirmDialog open={doomed !== null} title={c.remove} body={doomed === 'bulk' ? c.confirm : c.confirmOne} confirmLabel={c.remove} danger
      onConfirm={() => { const target = doomed; setDoomed(null); if (target === 'bulk') void action('/api/blog/admin/bulk-delete', 'POST', { ids: [...selected] }); else if (target) void action(`/api/blog/${target}`, 'DELETE') }}
      onCancel={() => setDoomed(null)} />
  </section>
}
