import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { postAdminDetailSchema, postWriteRequestSchema, type PostAdminDetail, type PostStatus } from '@diary/contracts/post'
import { csrfToken, sessionFetch, signInPath } from './session'
import { Markdown } from './markdown'
import './diary-editor.css'
import { useUi } from './ui'
import { apiFailure, FailureNotice, type Failure } from './api-error'

type Draft = { title: string; content: string; excerpt: string; coverImage: string; category: string; tags: string; status: PostStatus }
const blank: Draft = { title: '', content: '', excerpt: '', coverImage: '', category: 'market', tags: '', status: 'DRAFT' }

const copy = {
  en: { newTitle: 'New article', editTitle: 'Edit article', intro: 'Write, preview, and save a private Markdown article.', title: 'Title', content: 'Content', excerpt: 'Excerpt (optional)', cover: 'Cover image (optional)', category: 'Category', tags: 'Tags', preview: 'Preview', hidePreview: 'Hide preview', draft: 'Save draft', publish: 'Publish', back: 'Back to articles', loading: 'Loading…', saved: 'Saved.', connection: 'Unable to connect. Your draft remains in the form.', invalid: 'Check the marked fields.', forbidden: 'You do not have permission to manage articles.' },
  'zh-TW': { newTitle: '新增文章', editTitle: '編輯文章', intro: '撰寫、預覽並保存私下的 Markdown 文章。', title: '標題', content: '內容', excerpt: '摘要（選填）', cover: '封面圖片（選填）', category: '分類', tags: '標籤', preview: '預覽', hidePreview: '關閉預覽', draft: '保存草稿', publish: '發布', back: '返回文章', loading: '正在載入…', saved: '已保存。', connection: '暫時無法連線，草稿仍保留在表單中。', invalid: '請檢查標示的欄位。', forbidden: '你沒有管理文章的權限。' },
  'zh-CN': { newTitle: '新增文章', editTitle: '编辑文章', intro: '撰写、预览并保存私下的 Markdown 文章。', title: '标题', content: '内容', excerpt: '摘要（选填）', cover: '封面图片（选填）', category: '分类', tags: '标签', preview: '预览', hidePreview: '关闭预览', draft: '保存草稿', publish: '发布', back: '返回文章', loading: '正在加载…', saved: '已保存。', connection: '暂时无法连接，草稿仍保留在表单中。', invalid: '请检查标记的字段。', forbidden: '你没有管理文章的权限。' },
} as const

function fromPost(post: PostAdminDetail): Draft {
  return { title: post.title, content: post.content, excerpt: post.excerpt ?? '', coverImage: post.coverImage ?? '', category: post.category, tags: post.tags ?? '', status: post.status }
}

async function bodyOf(response: Response) { return response.json().catch(() => null) as Promise<unknown> }

export function AdminPostEditor({ id }: { id?: string }) {
  const { locale } = useUi(), c = copy[locale]
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(blank)
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(Boolean(id))
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState<Failure | null>(null)
  useEffect(() => {
    if (!id) return
    let active = true
    void sessionFetch(`/api/blog/admin/${encodeURIComponent(id)}`).then(async response => {
      if (!active) return
      const body = await bodyOf(response)
      const parsed = postAdminDetailSchema.safeParse(body)
      if (response.ok && parsed.success) setDraft(fromPost(parsed.data))
      else setFailure(apiFailure(body, response.status === 403 ? c.forbidden : c.connection))
      setLoading(false)
    }).catch(() => { if (active) { setFailure({ message: c.connection, fields: [] }); setLoading(false) } })
    return () => { active = false }
  }, [id, c.connection, c.forbidden])
  function update(field: keyof Draft, value: string) { setDraft(current => ({ ...current, [field]: value })) }
  async function save(status: PostStatus) {
    const input = postWriteRequestSchema.safeParse({ ...draft, excerpt: draft.excerpt || null, coverImage: draft.coverImage || null, status })
    if (!input.success) { setFailure({ message: c.invalid, fields: input.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []) }); return }
    setPending(true); setNotice(''); setFailure(null)
    try {
      if (!csrfToken()) await sessionFetch('/api/auth/me')
      const response = await sessionFetch(id ? `/api/blog/${encodeURIComponent(id)}` : '/api/blog', { method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() ?? '' }, body: JSON.stringify(input.data) })
      const body = await bodyOf(response)
      const parsed = postAdminDetailSchema.safeParse(body)
      if (!response.ok || !parsed.success) { setFailure(apiFailure(body, response.status === 403 ? c.forbidden : c.connection)); return }
      setDraft(fromPost(parsed.data)); setNotice(c.saved)
      if (!id) navigate(`/admin/blog/${parsed.data.id}/edit`, { replace: true })
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(false) }
  }
  if (loading) return <section className="editor"><p role="status">{c.loading}</p></section>
  return <section className="editor">
    <header><Link to="/admin/blog">{c.back}</Link><h1>{id ? c.editTitle : c.newTitle}</h1><p className="lede">{c.intro}</p></header>
    <FailureNotice failure={failure} />
    {preview ? <div className="context-panel"><h2>{draft.title || c.preview}</h2><Markdown>{draft.content || ' '}</Markdown><button type="button" className="secondary" onClick={() => setPreview(false)}>{c.hidePreview}</button></div> : <form onSubmit={event => { event.preventDefault(); void save('DRAFT') }}>
      <label>{c.title}<input className="title-input" value={draft.title} onChange={event => update('title', event.target.value)} maxLength={255} required /></label>
      <label>{c.content}<textarea value={draft.content} onChange={event => update('content', event.target.value)} rows={18} maxLength={100000} required /></label>
      <div className="plan-grid"><label>{c.excerpt}<textarea value={draft.excerpt} onChange={event => update('excerpt', event.target.value)} rows={3} maxLength={1000} /></label><label>{c.cover}<input value={draft.coverImage} onChange={event => update('coverImage', event.target.value)} maxLength={500} /></label><label>{c.category}<select value={draft.category} onChange={event => update('category', event.target.value)}><option value="fundamental">Fundamental</option><option value="technical">Technical</option><option value="market">Market</option><option value="strategy">Strategy</option></select></label><label>{c.tags}<input value={draft.tags} onChange={event => update('tags', event.target.value)} placeholder="research, thesis" /></label></div>
      <footer className="editor-footer"><span>{notice}</span><div className="actions"><button type="button" className="secondary" disabled={pending} onClick={() => setPreview(true)}>{c.preview}</button><button type="submit" disabled={pending}>{c.draft}</button><button type="button" disabled={pending} onClick={() => void save('PUBLISHED')}>{c.publish}</button></div></footer>
    </form>}
    {failure?.code === 'AUTH_UNAUTHORIZED' && <Link to={signInPath(id ? `/admin/blog/${id}/edit` : '/admin/blog/new')}>Sign in</Link>}
  </section>
}
