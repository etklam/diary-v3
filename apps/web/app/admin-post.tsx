import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useOutletContext } from 'react-router'
import { postAdminDetailSchema, postWriteRequestSchema, type AutomaticTranslationAdmission, type PostAdminDetail, type PostStatus } from '@diary/contracts/post'
import type { ArticleLocale } from '@diary/contracts'
import { csrfToken, invalidateArticleCache, sessionFetch, signInPath, wasExplicitSignOut } from './session'
import { Markdown } from './markdown'
import './diary-editor.css'
import './trade-plan.css'
import { useUi } from './ui'
import { apiFailure, FailureNotice, invalidField, type Failure } from './api-error'
import type { ShellOutletContext } from './root'
import { ArticleLanguagesPanel } from './article-languages'

type PostAccess = 'PUBLIC' | 'MEMBER'
type Draft = { title: string; content: string; excerpt: string; excerptAuthored: boolean; coverImage: string; category: string; tags: string; access: PostAccess; status: PostStatus; sourceLocale: ArticleLocale; autoTranslateEnabled: boolean; autoTranslateLocales: ArticleLocale[]; autoTranslateProvider: 'edge' | 'ai' }
type RecoveryDraft = Pick<Draft, 'title' | 'content' | 'excerpt' | 'coverImage' | 'category' | 'tags' | 'excerptAuthored' | 'sourceLocale' | 'autoTranslateEnabled' | 'autoTranslateLocales' | 'autoTranslateProvider'>
type Success = { status: PostStatus; slug: string; kind: 'saved' | 'published' | 'updated' | 'archived' | 'restored'; automaticTranslationAdmission?: AutomaticTranslationAdmission }
const blank: Draft = { title: '', content: '', excerpt: '', excerptAuthored: false, coverImage: '', category: 'market', tags: '', access: 'MEMBER', status: 'DRAFT', sourceLocale: 'zh-TW', autoTranslateEnabled: false, autoTranslateLocales: [], autoTranslateProvider: 'edge' }

const copy = {
  en: { newTitle: 'New article', editTitle: 'Edit article', intro: 'Drafts are private to administrators. After publication, any visitor can read the article.', title: 'Title', content: 'Content', excerpt: 'Excerpt (optional)', cover: 'Cover image (optional)', coverUnavailable: 'The cover image could not be previewed.', category: 'Category', tags: 'Tags', preview: 'Preview', hidePreview: 'Return to editing', saveDraft: 'Save draft', saveArchived: 'Save changes', publish: 'Publish publicly', republish: 'Republish publicly', update: 'Update published article', archive: 'Archive article', archiveHint: 'Archiving removes the article from public view.', back: 'Back to article management', publicList: 'Public articles', view: 'View public article', signIn: 'Sign in', loading: 'Loading…', savedDraft: 'Draft saved.', savedArchived: 'Archived article saved.', published: 'Article published publicly.', updated: 'Published article updated.', archived: 'Article archived and no longer public.', restored: 'Unsaved edits were restored for this article.', pending: 'Saving…', invalid: 'Check the marked fields.', connection: 'Unable to connect. Your content remains in the form.', forbidden: 'You do not have permission to manage articles.', discard: 'Discard unsaved article changes?', draftStatus: 'Draft', publishedStatus: 'Published', archivedStatus: 'Archived', fundamental: 'Fundamental', technical: 'Technical', market: 'Market', strategy: 'Strategy' },
  'zh-TW': { newTitle: '新增文章', editTitle: '編輯文章', intro: '草稿僅供管理員查看。公開發布後，任何訪客都能閱讀。', title: '標題', content: '內容', excerpt: '摘要（選填）', cover: '封面圖片（選填）', coverUnavailable: '無法預覽封面圖片。', category: '分類', tags: '標籤', preview: '預覽', hidePreview: '返回編輯', saveDraft: '保存草稿', saveArchived: '保存變更', publish: '公開發布', republish: '重新公開發布', update: '更新公開文章', archive: '封存文章', archiveHint: '封存後文章將不再公開。', back: '返回文章管理', publicList: '返回公開文章列表', view: '查看公開文章', signIn: '登入', loading: '正在載入…', savedDraft: '草稿已保存。', savedArchived: '已保存封存文章。', published: '文章已公開發布。', updated: '已發布文章已更新。', archived: '文章已封存，不再公開。', restored: '已還原這篇文章未保存的編輯。', pending: '正在保存…', invalid: '請檢查標示的欄位。', connection: '暫時無法連線，內容仍保留在表單中。', forbidden: '你沒有管理文章的權限。', discard: '放棄未保存的文章變更？', draftStatus: '草稿', publishedStatus: '已發布', archivedStatus: '已封存', fundamental: '基本面', technical: '技術面', market: '市場觀察', strategy: '投資策略' },
  'zh-CN': { newTitle: '新增文章', editTitle: '编辑文章', intro: '草稿仅供管理员查看。公开发布后，任何访客都能阅读。', title: '标题', content: '内容', excerpt: '摘要（选填）', cover: '封面图片（选填）', coverUnavailable: '无法预览封面图片。', category: '分类', tags: '标签', preview: '预览', hidePreview: '返回编辑', saveDraft: '保存草稿', saveArchived: '保存更改', publish: '公开发布', republish: '重新公开发布', update: '更新公开文章', archive: '归档文章', archiveHint: '归档后文章将不再公开。', back: '返回文章管理', publicList: '返回公开文章列表', view: '查看公开文章', signIn: '登录', loading: '正在加载…', savedDraft: '草稿已保存。', savedArchived: '已保存归档文章。', published: '文章已公开发布。', updated: '已发布文章已更新。', archived: '文章已归档，不再公开。', restored: '已恢复这篇文章未保存的编辑。', pending: '正在保存…', invalid: '请检查标记的字段。', connection: '暂时无法连接，内容仍保留在表单中。', forbidden: '你没有管理文章的权限。', discard: '放弃未保存的文章更改？', draftStatus: '草稿', publishedStatus: '已发布', archivedStatus: '已归档', fundamental: '基本面', technical: '技术面', market: '市场观察', strategy: '投资策略' },
} as const

const accessCopy = {
  en: { intro: 'Drafts are private to administrators. Choose who can read the article after publication.', excerpt: 'Public teaser (optional)', excerptHint: 'This teaser is shown before a member signs in.', access: 'Who can read after publication', publicAccess: 'Public', publicHint: 'Anyone can read.', memberAccess: 'Members only', memberHint: 'Readers must sign in.', publish: 'Publish', republish: 'Republish', update: 'Update article', published: 'Article published.', publicList: 'Articles', view: 'View article' },
  'zh-TW': { intro: '草稿僅供管理員查看。請選擇發布後的閱讀權限。', excerpt: '公開摘要（選填）', excerptHint: '會員登入前會看到這段摘要。', access: '發布後誰可以閱讀', publicAccess: '公開', publicHint: '任何人都能閱讀。', memberAccess: '僅限會員', memberHint: '讀者需要登入。', publish: '發布', republish: '重新發布', update: '更新文章', published: '文章已發布。', publicList: '文章', view: '查看文章' },
  'zh-CN': { intro: '草稿仅供管理员查看。请选择发布后的阅读权限。', excerpt: '公开摘要（选填）', excerptHint: '会员登录前会看到这段摘要。', access: '发布后谁可以阅读', publicAccess: '公开', publicHint: '任何人都能阅读。', memberAccess: '仅限会员', memberHint: '读者需要登录。', publish: '发布', republish: '重新发布', update: '更新文章', published: '文章已发布。', publicList: '文章', view: '查看文章' },
} as const

const translationAdmissionCopy = {
  en: { notQueued: 'The article was published, but its translation was skipped. It will need a new request; you can start one below.', partial: 'The article was published, but some translations were skipped. Review the translation states and request those translations again below.', edgePaused: (value: string) => `The Edge provider can accept requests again after ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))}. This skipped translation is not queued automatically; request it below or choose AI.` },
  'zh-TW': { notQueued: '文章已發布，但翻譯未入列。這次跳過的翻譯需要重新發起，你可以在下方手動開始。', partial: '文章已發布，但部分翻譯已跳過。請查看各語言狀態，並在下方重新發起需要的翻譯。', edgePaused: (value: string) => `Edge 服務可在 ${new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))} 後再次接受請求。這次跳過的翻譯不會自動補排；你可在下方重新發起，或改用 AI。` },
  'zh-CN': { notQueued: '文章已发布，但翻译未入队。这次跳过的翻译需要重新发起，你可以在下方手动开始。', partial: '文章已发布，但部分翻译已跳过。请查看各语言状态，并在下方重新发起需要的翻译。', edgePaused: (value: string) => `Edge 服务可在 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))} 后再次接受请求。这次跳过的翻译不会自动补入队列；你可在下方重新发起，或改用 AI。` },
} as const

function fromPost(post: PostAdminDetail): Draft {
  return { title: post.title, content: post.content, excerpt: post.excerptAuthored ? post.excerpt ?? '' : '', excerptAuthored: post.excerptAuthored, coverImage: post.coverImage ?? '', category: post.category, tags: post.tags ?? '', access: post.access, status: post.status, sourceLocale: post.sourceLocale, autoTranslateEnabled: post.autoTranslateEnabled, autoTranslateLocales: post.autoTranslateLocales, autoTranslateProvider: post.autoTranslateProvider }
}

function recoveryDraft(draft: Draft): RecoveryDraft {
  const { title, content, excerpt, excerptAuthored, coverImage, category, tags, sourceLocale, autoTranslateEnabled, autoTranslateLocales, autoTranslateProvider } = draft
  return { title, content, excerpt, excerptAuthored, coverImage, category, tags, sourceLocale, autoTranslateEnabled, autoTranslateLocales, autoTranslateProvider }
}

function storedDraft(value: unknown): RecoveryDraft | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (!['title', 'content', 'excerpt', 'coverImage', 'category', 'tags'].every(field => typeof item[field] === 'string')) return null
  const sourceLocale = item.sourceLocale === 'zh-CN' || item.sourceLocale === 'en' ? item.sourceLocale : 'zh-TW'
  const autoTranslateLocales = Array.isArray(item.autoTranslateLocales) ? item.autoTranslateLocales.filter((value): value is ArticleLocale => value === 'zh-TW' || value === 'zh-CN' || value === 'en') : []
  return { title: item.title as string, content: item.content as string, excerpt: item.excerptAuthored === true ? item.excerpt as string : '', excerptAuthored: item.excerptAuthored === true, coverImage: item.coverImage as string, category: item.category as string, tags: item.tags as string, sourceLocale, autoTranslateEnabled: item.autoTranslateEnabled === true, autoTranslateLocales, autoTranslateProvider: item.autoTranslateProvider === 'ai' ? 'ai' : 'edge' }
}

async function bodyOf(response: Response) { return response.json().catch(() => null) as Promise<unknown> }

export function AdminPostEditor({ id }: { id?: string }) {
  const { locale } = useUi(), c = { ...copy[locale], ...accessCopy[locale] }
  const { viewer } = useOutletContext<ShellOutletContext>()
  const navigate = useNavigate(), location = useLocation()
  const [draft, setDraft] = useState<Draft>(blank)
  const [baseline, setBaseline] = useState<Draft>(blank)
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(Boolean(id))
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState<Success | null>(() => location.state?.postSuccess ?? null)
  const [publicSlug, setPublicSlug] = useState(success?.slug ?? '')
  const [coverFailed, setCoverFailed] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const pendingRef = useRef(false), draftRef = useRef(draft), dirtyRef = useRef(false), checkedKey = useRef('')
  const previewHeading = useRef<HTMLHeadingElement>(null), previewTrigger = useRef<HTMLButtonElement>(null)
  draftRef.current = draft
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline])
  const sourceDirty = useMemo(() => {
    const sourceFields: (keyof Draft)[] = ['title', 'content', 'excerpt', 'excerptAuthored', 'coverImage', 'category', 'tags', 'access', 'status', 'sourceLocale']
    return sourceFields.some(field => draft[field] !== baseline[field])
  }, [draft, baseline])
  dirtyRef.current = dirty
  const draftKey = viewer ? `post-editor-draft:${viewer.id}:${id ?? 'new'}` : null

  useEffect(() => {
    if (!id) return
    let active = true
    void sessionFetch(`/api/blog/admin/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async response => {
      if (!active) return
      const body = await bodyOf(response)
      const parsed = postAdminDetailSchema.safeParse(body)
      if (response.ok && parsed.success) { const next = fromPost(parsed.data); setDraft(next); setBaseline(next); setPublicSlug(parsed.data.slug) }
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
      if (recovered) { setDraft(current => ({ ...current, ...recovered })); setSuccess({ status: draft.status, slug: '', kind: 'restored' }) }
    } catch { /* Recovery is best effort. */ }
  }, [draftKey, loading])

  useEffect(() => {
    if (!draftKey || !dirty) return
    const timer = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), value: recoveryDraft(draftRef.current) })) } catch { /* Recovery is best effort. */ } }, 600)
    return () => clearTimeout(timer)
  }, [draft, draftKey, dirty])
  useEffect(() => () => {
    if (!draftKey || !dirtyRef.current || wasExplicitSignOut()) return
    try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), value: recoveryDraft(draftRef.current) })) } catch { /* Recovery is best effort. */ }
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
  useEffect(() => {
    if (preview) requestAnimationFrame(() => previewHeading.current?.focus())
  }, [preview])

  function update(field: keyof Draft, value: string) {
    setSuccess(null)
    if (field === 'coverImage') setCoverFailed(false)
    setDraft(current => ({ ...current, [field]: value, ...(field === 'excerpt' ? { excerptAuthored: true } : {}) }))
  }
  function confirmSaved(post: PostAdminDetail, kind: Success['kind']) {
    const next = fromPost(post)
    setDraft(next); setBaseline(next); setPublicSlug(post.slug); dirtyRef.current = false; setSuccess({ status: post.status, slug: post.slug, kind, automaticTranslationAdmission: post.automaticTranslationAdmission })
    if (draftKey) { try { localStorage.removeItem(draftKey) } catch { /* Ignore unavailable storage. */ } }
  }

  async function save(status: PostStatus) {
    if (pendingRef.current) return
    const input = postWriteRequestSchema.safeParse({
      title: draft.title,
      content: draft.content,
      excerpt: draft.excerptAuthored ? draft.excerpt || null : null,
      coverImage: draft.coverImage || null,
      category: draft.category,
      tags: draft.tags,
      access: draft.access,
      status,
      sourceLocale: draft.sourceLocale,
      autoTranslateEnabled: draft.autoTranslateEnabled,
      autoTranslateLocales: draft.autoTranslateLocales,
      autoTranslateProvider: draft.autoTranslateProvider,
    })
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
      invalidateArticleCache()
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
      invalidateArticleCache()
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { pendingRef.current = false; setPending(false) }
  }

  if (loading) return <section className="editor"><p role="status">{c.loading}</p></section>
  const statusLabel = draft.status === 'DRAFT' ? c.draftStatus : draft.status === 'PUBLISHED' ? c.publishedStatus : c.archivedStatus
  const successText = success?.kind === 'restored' ? c.restored : success?.kind === 'published' ? c.published : success?.kind === 'updated' ? c.updated : success?.kind === 'archived' ? c.archived : success?.status === 'ARCHIVED' ? c.savedArchived : c.savedDraft
  const admission = success?.automaticTranslationAdmission
  const admissionNotice = admission && admission.status !== 'queued'
    ? admission.status === 'partial' ? translationAdmissionCopy[locale].partial
      : admission.reason === 'provider_circuit_open' && admission.resumeAt ? translationAdmissionCopy[locale].edgePaused(admission.resumeAt)
        : translationAdmissionCopy[locale].notQueued
    : null
  return <section className="editor">
    <header><Link to="/admin/blog">{c.back}</Link><div className="article-editor-title"><h1>{id ? c.editTitle : c.newTitle}</h1><span className="badge">{statusLabel}</span></div><p className="lede">{c.intro}</p></header>
    <FailureNotice failure={failure} id="article-editor-error" />
    {success && <div className="article-save-result" role="status"><span>{successText}</span>{admissionNotice && <p>{admissionNotice}</p>}</div>}
    {!preview && <ArticleLanguagesPanel
      id={id}
      sourceLocale={draft.sourceLocale}
      onSourceLocaleChange={sourceLocale => setDraft(current => ({ ...current, sourceLocale }))}
      targetLocales={draft.autoTranslateLocales}
      onTargetLocalesChange={autoTranslateLocales => setDraft(current => ({ ...current, autoTranslateLocales }))}
      provider={draft.autoTranslateProvider}
      onProviderChange={autoTranslateProvider => setDraft(current => ({ ...current, autoTranslateProvider }))}
      autoTranslateEnabled={draft.autoTranslateEnabled}
      onAutoTranslateEnabledChange={autoTranslateEnabled => setDraft(current => ({ ...current, autoTranslateEnabled }))}
      access={draft.access}
      sourceDirty={sourceDirty}
      locale={locale}
    />}
    {preview ? <div className="context-panel"><h2 ref={previewHeading} tabIndex={-1}>{draft.title || c.preview}</h2>{draft.excerpt && <p className="lede">{draft.excerpt}</p>}{draft.coverImage && (coverFailed ? <p role="status">{c.coverUnavailable}</p> : <img className="article-cover-preview" src={draft.coverImage} alt={draft.title || c.cover} onError={() => setCoverFailed(true)} />)}<Markdown>{draft.content || ' '}</Markdown><button type="button" className="secondary" onClick={() => { setPreview(false); requestAnimationFrame(() => previewTrigger.current?.focus()) }}>{c.hidePreview}</button></div> : <form onSubmit={event => { event.preventDefault(); void save(draft.status) }} aria-busy={pending}>
      <fieldset className="article-editor-fields" disabled={pending}>
        <label>{c.title}<input className="title-input" value={draft.title} onChange={event => update('title', event.target.value)} maxLength={255} required aria-invalid={invalidField(failure, 'title')} aria-describedby={invalidField(failure, 'title') ? 'article-editor-error' : undefined} /></label>
        <label>{c.content}<textarea value={draft.content} onChange={event => update('content', event.target.value)} rows={18} maxLength={100000} required aria-invalid={invalidField(failure, 'content')} aria-describedby={invalidField(failure, 'content') ? 'article-editor-error' : undefined} /></label>
        <div className="plan-grid"><label>{c.excerpt}<textarea aria-label={c.excerpt} value={draft.excerpt} onChange={event => update('excerpt', event.target.value)} rows={3} maxLength={1000} aria-invalid={invalidField(failure, 'excerpt')} aria-describedby={invalidField(failure, 'excerpt') ? 'article-editor-error article-editor-teaser-hint' : 'article-editor-teaser-hint'} /><span id="article-editor-teaser-hint" className="muted article-editor-teaser-hint">{c.excerptHint}</span></label><label>{c.cover}<input value={draft.coverImage} onChange={event => update('coverImage', event.target.value)} maxLength={500} aria-invalid={invalidField(failure, 'coverImage')} aria-describedby={invalidField(failure, 'coverImage') ? 'article-editor-error' : undefined} /></label><label>{c.category}<select value={draft.category} onChange={event => update('category', event.target.value)} aria-invalid={invalidField(failure, 'category')} aria-describedby={invalidField(failure, 'category') ? 'article-editor-error' : undefined}><option value="fundamental">{c.fundamental}</option><option value="technical">{c.technical}</option><option value="market">{c.market}</option><option value="strategy">{c.strategy}</option></select></label><label>{c.tags}<input value={draft.tags} onChange={event => update('tags', event.target.value)} placeholder="research, thesis" aria-invalid={invalidField(failure, 'tags')} aria-describedby={invalidField(failure, 'tags') ? 'article-editor-error' : undefined} /></label></div>
      </fieldset>
      <footer className="editor-footer"><div className="article-publish-settings"><label htmlFor="article-access">{c.access}<select id="article-access" value={draft.access} disabled={pending} onChange={event => update('access', event.target.value)} aria-describedby="article-access-hint"><option value="PUBLIC">{c.publicAccess}</option><option value="MEMBER">{c.memberAccess}</option></select></label><span id="article-access-hint" className="muted">{draft.access === 'PUBLIC' ? c.publicHint : c.memberHint}</span></div><span>{pending ? c.pending : ''}</span><div className="actions"><button ref={previewTrigger} type="button" className="secondary" disabled={pending} onClick={() => setPreview(true)}>{c.preview}</button>{draft.status === 'PUBLISHED' && <button type="button" className="secondary" disabled={pending || dirty} title={dirty ? c.archiveHint : undefined} onClick={() => void archive()}>{c.archive}</button>}<button type="submit" disabled={pending}>{draft.status === 'DRAFT' ? c.saveDraft : draft.status === 'PUBLISHED' ? c.update : c.saveArchived}</button>{draft.status !== 'PUBLISHED' && <button type="button" className="secondary" disabled={pending} onClick={() => void save('PUBLISHED')}>{draft.status === 'ARCHIVED' ? c.republish : c.publish}</button>}</div></footer>
      {draft.status === 'PUBLISHED' && <p className="muted article-archive-hint">{c.archiveHint}</p>}
    </form>}
    <p className="article-public-list"><Link to="/articles">{c.publicList}</Link>{draft.status === 'PUBLISHED' && publicSlug && <><span aria-hidden="true"> · </span><Link to={`/articles/${encodeURIComponent(publicSlug)}`}>{c.view}</Link></>}</p>
    {failure?.code === 'AUTH_UNAUTHORIZED' && <Link to={signInPath(id ? `/admin/blog/${id}/edit` : '/admin/blog/new')}>{c.signIn}</Link>}
  </section>
}
