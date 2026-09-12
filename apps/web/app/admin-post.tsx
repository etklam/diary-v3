import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useOutletContext } from 'react-router'
import { postAdminDetailSchema, postWriteRequestSchema, type PostAdminDetail, type PostStatus } from '@diary/contracts/post'
import { csrfToken, sessionFetch, signInPath, wasExplicitSignOut } from './session'
import { Markdown } from './markdown'
import './diary-editor.css'
import { useUi } from './ui'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import type { ShellOutletContext } from './root'

type Draft = { title: string; content: string; excerpt: string; coverImage: string; category: string; tags: string; status: PostStatus }
type Success = { status: PostStatus; slug: string; kind: 'saved' | 'published' | 'updated' | 'archived' | 'restored' }
const blank: Draft = { title: '', content: '', excerpt: '', coverImage: '', category: 'market', tags: '', status: 'DRAFT' }

const copy = {
  en: { newTitle: 'New article', editTitle: 'Edit article', intro: 'Drafts are private to administrators. After publication, any visitor can read the article.', title: 'Title', content: 'Content', excerpt: 'Excerpt (optional)', cover: 'Cover image (optional)', category: 'Category', tags: 'Tags', preview: 'Preview', hidePreview: 'Return to editing', saveDraft: 'Save draft', saveArchived: 'Save changes', publish: 'Publish publicly', republish: 'Republish publicly', update: 'Update published article', archive: 'Archive article', archiveHint: 'Archiving removes the article from public view.', back: 'Back to article management', publicList: 'Public articles', view: 'View public article', signIn: 'Sign in', loading: 'Loading…', savedDraft: 'Draft saved.', savedArchived: 'Archived article saved.', published: 'Article published publicly.', updated: 'Published article updated.', archived: 'Article archived and no longer public.', restored: 'Unsaved edits were restored for this article.', pending: 'Saving…', invalid: 'Check the marked fields.', connection: 'Unable to connect. Your content remains in the form.', forbidden: 'You do not have permission to manage articles.', discard: 'Discard unsaved article changes?', draftStatus: 'Draft', publishedStatus: 'Published', archivedStatus: 'Archived', fundamental: 'Fundamental', technical: 'Technical', market: 'Market', strategy: 'Strategy' },
  'zh-TW': { newTitle: '新增文章', editTitle: '編輯文章', intro: '草稿僅供管理員查看。公開發布後，任何訪客都能閱讀。', title: '標題', content: '內容', excerpt: '摘要（選填）', cover: '封面圖片（選填）', category: '分類', tags: '標籤', preview: '預覽', hidePreview: '返回編輯', saveDraft: '保存草稿', saveArchived: '保存變更', publish: '公開發布', republish: '重新公開發布', update: '更新公開文章', archive: '封存文章', archiveHint: '封存後文章將不再公開。', back: '返回文章管理', publicList: '返回公開文章列表', view: '查看公開文章', signIn: '登入', loading: '正在載入…', savedDraft: '草稿已保存。', savedArchived: '已保存封存文章。', published: '文章已公開發布。', updated: '公開文章已更新。', archived: '文章已封存，不再公開。', restored: '已還原這篇文章未保存的編輯。', pending: '正在保存…', invalid: '請檢查標示的欄位。', connection: '暫時無法連線，內容仍保留在表單中。', forbidden: '你沒有管理文章的權限。', discard: '放棄未保存的文章變更？', draftStatus: '草稿', publishedStatus: '已發布', archivedStatus: '已封存', fundamental: '基本面', technical: '技術面', market: '市場觀察', strategy: '投資策略' },
  'zh-CN': { newTitle: '新增文章', editTitle: '编辑文章', intro: '草稿仅供管理员查看。公开发布后，任何访客都能阅读。', title: '标题', content: '内容', excerpt: '摘要（选填）', cover: '封面图片（选填）', category: '分类', tags: '标签', preview: '预览', hidePreview: '返回编辑', saveDraft: '保存草稿', saveArchived: '保存更改', publish: '公开发布', republish: '重新公开发布', update: '更新公开文章', archive: '归档文章', archiveHint: '归档后文章将不再公开。', back: '返回文章管理', publicList: '返回公开文章列表', view: '查看公开文章', signIn: '登录', loading: '正在加载…', savedDraft: '草稿已保存。', savedArchived: '已保存归档文章。', published: '文章已公开发布。', updated: '公开文章已更新。', archived: '文章已归档，不再公开。', restored: '已恢复这篇文章未保存的编辑。', pending: '正在保存…', invalid: '请检查标记的字段。', connection: '暂时无法连接，内容仍保留在表单中。', forbidden: '你没有管理文章的权限。', discard: '放弃未保存的文章更改？', draftStatus: '草稿', publishedStatus: '已发布', archivedStatus: '已归档', fundamental: '基本面', technical: '技术面', market: '市场观察', strategy: '投资策略' },
} as const

function fromPost(post: PostAdminDetail): Draft {
  return { title: post.title, content: post.content, excerpt: post.excerpt ?? '', coverImage: post.coverImage ?? '', category: post.category, tags: post.tags ?? '', status: post.status }
}

function storedDraft(value: unknown): Draft | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (!['title', 'content', 'excerpt', 'coverImage', 'category', 'tags'].every(field => typeof item[field] === 'string')) return null
  if (item.status !== 'DRAFT' && item.status !== 'PUBLISHED' && item.status !== 'ARCHIVED') return null
  return item as Draft
}

async function bodyOf(response: Response) { return response.json().catch(() => null) as Promise<unknown> }

export function AdminPostEditor({ id }: { id?: string }) {
  const { locale } = useUi(), c = copy[locale]
  const { viewer } = useOutletContext<ShellOutletContext>()
  const navigate = useNavigate(), location = useLocation()
  const [draft, setDraft] = useState<Draft>(blank)
  const [baseline, setBaseline] = useState<Draft>(blank)
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(Boolean(id))
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState<Success | null>(() => location.state?.postSuccess ?? null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const pendingRef = useRef(false), draftRef = useRef(draft), dirtyRef = useRef(false), checkedKey = useRef('')
  draftRef.current = draft
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline])
  dirtyRef.current = dirty
  const draftKey = viewer ? `post-editor-draft:${viewer.id}:${id ?? 'new'}` : null

  useEffect(() => {
    if (!id) return
    let active = true
    void sessionFetch(`/api/blog/admin/${encodeURIComponent(id)}`).then(async response => {
      if (!active) return
      const body = await bodyOf(response)
      const parsed = postAdminDetailSchema.safeParse(body)
      if (response.ok && parsed.success) { const next = fromPost(parsed.data); setDraft(next); setBaseline(next) }
      else setFailure(apiFailure(body, response.status === 403 ? c.forbidden : c.connection))
      setLoading(false)
    }).catch(() => { if (active) { setFailure({ message: c.connection, fields: [] }); setLoading(false) } })
    return () => { active = false }
  }, [id, c.connection, c.forbidden])

  useEffect(() => {
    if (loading || !draftKey || checkedKey.current === draftKey) return
    checkedKey.current = draftKey
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? 'null') as { at?: unknown; value?: unknown } | null
      if (!saved || typeof saved.at !== 'number' || saved.at > Date.now() || Date.now() - saved.at > 86_400_000) return
      const recovered = storedDraft(saved.value)
      if (recovered) { setDraft(recovered); setSuccess({ status: recovered.status, slug: '', kind: 'restored' }) }
    } catch { /* Recovery is best effort. */ }
  }, [draftKey, loading])

  useEffect(() => {
    if (!draftKey || !dirty) return
    const timer = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), value: draftRef.current })) } catch { /* Recovery is best effort. */ } }, 600)
    return () => clearTimeout(timer)
  }, [draft, draftKey, dirty])
  useEffect(() => () => {
    if (!draftKey || !dirtyRef.current || wasExplicitSignOut()) return
    try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), value: draftRef.current })) } catch { /* Recovery is best effort. */ }
  }, [draftKey])

  const blocker = useBlocker(() => dirtyRef.current)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (pendingRef.current) { blocker.reset(); return }
    if (window.confirm(c.discard)) { dirtyRef.current = false; blocker.proceed() } else blocker.reset()
  }, [blocker, c.discard])
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', before)
    return () => window.removeEventListener('beforeunload', before)
  }, [])

  function update(field: keyof Draft, value: string) { setSuccess(null); setDraft(current => ({ ...current, [field]: value })) }
  function confirmSaved(post: PostAdminDetail, kind: Success['kind']) {
    const next = fromPost(post)
    setDraft(next); setBaseline(next); dirtyRef.current = false; setSuccess({ status: post.status, slug: post.slug, kind })
    if (draftKey) { try { localStorage.removeItem(draftKey) } catch { /* Ignore unavailable storage. */ } }
  }

  async function save(status: PostStatus) {
    if (pendingRef.current) return
    const input = postWriteRequestSchema.safeParse({ ...draft, excerpt: draft.excerpt || null, coverImage: draft.coverImage || null, status })
    if (!input.success) { setSuccess(null); setFailure({ message: c.invalid, fields: input.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []) }); return }
    pendingRef.current = true; setPending(true); setSuccess(null); setFailure(null)
    try {
      if (!csrfToken()) await sessionFetch('/api/auth/me')
      const response = await sessionFetch(id ? `/api/blog/${encodeURIComponent(id)}` : '/api/blog', { method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() ?? '' }, body: JSON.stringify(input.data) })
      const body = await bodyOf(response)
      const parsed = postAdminDetailSchema.safeParse(body)
      if (!response.ok || !parsed.success) { setFailure(apiFailure(body, response.status === 403 ? c.forbidden : c.connection)); return }
      const kind: Success['kind'] = status === 'PUBLISHED' ? (draft.status === 'PUBLISHED' ? 'updated' : 'published') : 'saved'
      confirmSaved(parsed.data, kind)
      if (!id) navigate(`/admin/blog/${parsed.data.id}/edit`, { replace: true, state: { postSuccess: { status: parsed.data.status, slug: parsed.data.slug, kind } } })
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { pendingRef.current = false; setPending(false) }
  }

  async function archive() {
    if (!id || pendingRef.current) return
    pendingRef.current = true; setPending(true); setSuccess(null); setFailure(null)
    try {
      if (!csrfToken()) await sessionFetch('/api/auth/me')
      const response = await sessionFetch(`/api/blog/admin/${encodeURIComponent(id)}/archive`, { method: 'POST', headers: { 'x-csrf-token': csrfToken() ?? '' } })
      const body = await bodyOf(response), parsed = postAdminDetailSchema.safeParse(body)
      if (!response.ok || !parsed.success) { setFailure(apiFailure(body, response.status === 403 ? c.forbidden : c.connection)); return }
      confirmSaved(parsed.data, 'archived')
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { pendingRef.current = false; setPending(false) }
  }

  if (loading) return <section className="editor"><p role="status">{c.loading}</p></section>
  const statusLabel = draft.status === 'DRAFT' ? c.draftStatus : draft.status === 'PUBLISHED' ? c.publishedStatus : c.archivedStatus
  const successText = success?.kind === 'restored' ? c.restored : success?.kind === 'published' ? c.published : success?.kind === 'updated' ? c.updated : success?.kind === 'archived' ? c.archived : success?.status === 'ARCHIVED' ? c.savedArchived : c.savedDraft
  return <section className="editor">
    <header><Link to="/admin/blog">{c.back}</Link><div className="article-editor-title"><h1>{id ? c.editTitle : c.newTitle}</h1><span className="badge">{statusLabel}</span></div><p className="lede">{c.intro}</p></header>
    <FailureNotice failure={failure} />
    {success && <div className="article-save-result" role="status"><span>{successText}</span>{success.status === 'PUBLISHED' && success.slug && <Link to={`/articles/${encodeURIComponent(success.slug)}`}>{c.view}</Link>}</div>}
    {preview ? <div className="context-panel"><h2>{draft.title || c.preview}</h2><Markdown>{draft.content || ' '}</Markdown><button type="button" className="secondary" onClick={() => setPreview(false)}>{c.hidePreview}</button></div> : <form onSubmit={event => { event.preventDefault(); void save(draft.status) }} aria-busy={pending}>
      <fieldset className="article-editor-fields" disabled={pending}>
        <label>{c.title}<input className="title-input" value={draft.title} onChange={event => update('title', event.target.value)} maxLength={255} required /></label>
        <label>{c.content}<textarea value={draft.content} onChange={event => update('content', event.target.value)} rows={18} maxLength={100000} required /></label>
        <div className="plan-grid"><label>{c.excerpt}<textarea value={draft.excerpt} onChange={event => update('excerpt', event.target.value)} rows={3} maxLength={1000} /></label><label>{c.cover}<input value={draft.coverImage} onChange={event => update('coverImage', event.target.value)} maxLength={500} /></label><label>{c.category}<select value={draft.category} onChange={event => update('category', event.target.value)}><option value="fundamental">{c.fundamental}</option><option value="technical">{c.technical}</option><option value="market">{c.market}</option><option value="strategy">{c.strategy}</option></select></label><label>{c.tags}<input value={draft.tags} onChange={event => update('tags', event.target.value)} placeholder="research, thesis" /></label></div>
      </fieldset>
      <footer className="editor-footer"><span>{pending ? c.pending : ''}</span><div className="actions"><button type="button" className="secondary" disabled={pending} onClick={() => setPreview(true)}>{c.preview}</button>{draft.status === 'PUBLISHED' && <button type="button" className="secondary" disabled={pending || dirty} title={dirty ? c.archiveHint : undefined} onClick={() => void archive()}>{c.archive}</button>}<button type="submit" disabled={pending}>{draft.status === 'DRAFT' ? c.saveDraft : draft.status === 'PUBLISHED' ? c.update : c.saveArchived}</button>{draft.status !== 'PUBLISHED' && <button type="button" className="secondary" disabled={pending} onClick={() => void save('PUBLISHED')}>{draft.status === 'ARCHIVED' ? c.republish : c.publish}</button>}</div></footer>
      {draft.status === 'PUBLISHED' && <p className="muted article-archive-hint">{c.archiveHint}</p>}
    </form>}
    <p className="article-public-list"><Link to="/articles">{c.publicList}</Link></p>
    {failure?.code === 'AUTH_UNAUTHORIZED' && <Link to={signInPath(id ? `/admin/blog/${id}/edit` : '/admin/blog/new')}>{c.signIn}</Link>}
  </section>
}
