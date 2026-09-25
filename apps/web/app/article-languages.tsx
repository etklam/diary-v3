import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  articleTranslationActionResponseSchema,
  articleTranslationAdminResponseSchema,
  articleTranslationEditRequestSchema,
  articleTranslationJobResponseSchema,
  type ArticleLocale,
  type ArticleTranslationAdminResponse,
} from '@diary/contracts'
import type { PostAccess } from '@diary/contracts/post'
import { csrfToken, sessionFetch } from './session'
import { Markdown } from './markdown'
import { apiFailure } from './api-error'
import './article-languages.css'

type Provider = 'edge' | 'ai'
type TranslationText = { title: string; excerpt: string; content: string }
type ArticleTranslationAdminRow = ArticleTranslationAdminResponse['translations'][number]

const locales: ArticleLocale[] = ['zh-TW', 'zh-CN', 'en']
const localeName: Record<ArticleLocale, string> = { 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English' }
const copy = {
  en: {
    title: 'Article Languages / 文章語言', original: 'Original language', targets: 'Translate to', provider: 'Provider', settings: 'AI settings',
    edge: 'Microsoft Edge Translate (Experimental)', ai: 'AI Translate', automatic: 'Automatically create translation drafts after publishing original',
    warning: 'Article text will be sent to a third-party translation service.', edgeUnavailable: 'Edge Translate is temporarily unavailable. You can choose AI explicitly.',
    edgeMembers: 'Edge Translate is limited to publicly publishable articles.', saveFirst: 'Save the article before requesting a translation.', saveChangesFirst: 'Save the original changes before translating the latest version.',
    translate: 'Translate Now', preview: 'Preview', edit: 'Edit', publish: 'Publish', approve: 'Approve', unpublish: 'Unpublish', retranslate: 'Retranslate', retry: 'Retry', useAi: 'Use AI',
    originalBadge: 'Original', missing: 'Not translated', queued: 'Queued', translating: 'Translating', review: 'Pending review', published: 'Published', stale: 'Stale', failed: 'Failed',
    approvedReady: 'Approved · Ready to publish', publishedVersion: 'Published version', current: 'Current', staleHint: 'The original changed. Readers are shown the original until this translation is reviewed and published again.',
    noPreview: 'There is no translation content to preview yet.', editTitle: 'Edit translation draft', titleLabel: 'Title', excerptLabel: 'Excerpt (optional)', contentLabel: 'Content', saveTranslation: 'Save translation draft', cancel: 'Cancel', close: 'Close preview', discardTranslation: 'Discard unsaved translation edits?',
    editing: 'Unsaved translation changes', restored: 'Recovered unsaved translation edits.', saveArticleToTranslate: 'Save the article to enable translation actions.', requestFailed: 'Could not load translations.', actionFailed: 'The translation action could not be completed.', saved: 'Translation draft saved.', jobQueued: 'Translation job queued. It will remain a draft until you review and publish it.', approved: 'Translation approved. Publish it when ready.', publishedOk: 'Translation published.', unpublished: 'Translation unpublished.', confirmUnpublish: 'Unpublish this translation? Readers will fall back to the original.',
    failedDetail: 'View error', closeError: 'Hide error', status: 'Status', progress: 'Progress', thirdPartyHeading: 'Third-party translation', aiProvider: 'AI provider',
  },
  'zh-TW': {
    title: 'Article Languages / 文章語言', original: '原文語言', targets: '翻譯成', provider: '翻譯服務', settings: 'AI 設定',
    edge: 'Microsoft Edge Translate (Experimental)', ai: 'AI 翻譯', automatic: '原文發布後自動建立翻譯草稿',
    warning: '文章內容會傳送至第三方翻譯服務。', edgeUnavailable: 'Edge Translate 暫時無法使用。你可以明確選擇 AI 翻譯。',
    edgeMembers: 'Edge Translate 僅能處理可公開發布的文章。', saveFirst: '請先保存文章，再建立翻譯。', saveChangesFirst: '請先保存原文變更，再翻譯最新版本。',
    translate: '立即翻譯', preview: '預覽', edit: '編輯', publish: '發布', approve: '審核通過', unpublish: '取消發布', retranslate: '重新翻譯', retry: '重試', useAi: '改用 AI',
    originalBadge: '原文', missing: '尚未翻譯', queued: '等待中', translating: '翻譯中', review: '待審核', published: '已發布', stale: '原文已更新', failed: '失敗',
    approvedReady: '審核通過 · 可以發布', publishedVersion: '已發布版本', current: '目前版本', staleHint: '原文已有修改。重新審核並發布前，讀者會看到原文。',
    noPreview: '目前沒有可預覽的翻譯內容。', editTitle: '編輯翻譯草稿', titleLabel: '標題', excerptLabel: '摘要（選填）', contentLabel: '內容', saveTranslation: '保存翻譯草稿', cancel: '取消', close: '關閉預覽', discardTranslation: '放棄未保存的翻譯變更？',
    editing: '翻譯尚有未保存的變更', restored: '已還原未保存的翻譯編輯。', saveArticleToTranslate: '保存文章後即可使用翻譯功能。',
    requestFailed: '無法載入翻譯。', actionFailed: '無法完成這項翻譯操作。', saved: '翻譯草稿已保存。', jobQueued: '翻譯工作已排入佇列。完成後仍會是草稿，需經審核才能發布。', approved: '翻譯已通過審核，可以發布。', publishedOk: '翻譯已發布。', unpublished: '翻譯已取消發布。', confirmUnpublish: '要取消發布這個翻譯嗎？讀者將改為看到原文。',
    failedDetail: '查看錯誤', closeError: '隱藏錯誤', status: '狀態', progress: '進度', thirdPartyHeading: '第三方翻譯服務', aiProvider: 'AI Provider',
  },
  'zh-CN': {
    title: 'Article Languages / 文章語言', original: '原文语言', targets: '翻译成', provider: '翻译服务', settings: 'AI 设置',
    edge: 'Microsoft Edge Translate (Experimental)', ai: 'AI 翻译', automatic: '原文发布后自动创建翻译草稿',
    warning: '文章内容会发送至第三方翻译服务。', edgeUnavailable: 'Edge Translate 暂时无法使用。你可以明确选择 AI 翻译。',
    edgeMembers: 'Edge Translate 仅能处理可公开发布的文章。', saveFirst: '请先保存文章，再创建翻译。', saveChangesFirst: '请先保存原文更改，再翻译最新版本。',
    translate: '立即翻译', preview: '预览', edit: '编辑', publish: '发布', approve: '审核通过', unpublish: '取消发布', retranslate: '重新翻译', retry: '重试', useAi: '改用 AI',
    originalBadge: '原文', missing: '尚未翻译', queued: '等待中', translating: '翻译中', review: '待审核', published: '已发布', stale: '原文已更新', failed: '失败',
    approvedReady: '审核通过 · 可以发布', publishedVersion: '已发布版本', current: '当前版本', staleHint: '原文已有更改。重新审核并发布前，读者会看到原文。',
    noPreview: '目前没有可预览的翻译内容。', editTitle: '编辑翻译草稿', titleLabel: '标题', excerptLabel: '摘要（选填）', contentLabel: '内容', saveTranslation: '保存翻译草稿', cancel: '取消', close: '关闭预览', discardTranslation: '放弃未保存的翻译更改？',
    editing: '翻译尚有未保存的更改', restored: '已恢复未保存的翻译编辑。', saveArticleToTranslate: '保存文章后即可使用翻译功能。',
    requestFailed: '无法加载翻译。', actionFailed: '无法完成这项翻译操作。', saved: '翻译草稿已保存。', jobQueued: '翻译任务已加入队列。完成后仍会是草稿，需经审核才能发布。', approved: '翻译已通过审核，可以发布。', publishedOk: '翻译已发布。', unpublished: '翻译已取消发布。', confirmUnpublish: '要取消发布这个翻译吗？读者将改为看到原文。',
    failedDetail: '查看错误', closeError: '隐藏错误', status: '状态', progress: '进度', thirdPartyHeading: '第三方翻译服务', aiProvider: 'AI Provider',
  },
} as const

function blankText(): TranslationText { return { title: '', excerpt: '', content: '' } }
function contentFor(row: ArticleTranslationAdminRow | null): TranslationText {
  if (!row) return blankText()
  if (row.draftTitle !== null && row.draftContent !== null) return { title: row.draftTitle, excerpt: row.draftExcerpt ?? '', content: row.draftContent }
  if (row.publishedTitle !== null && row.publishedContent !== null) return { title: row.publishedTitle, excerpt: row.publishedExcerpt ?? '', content: row.publishedContent }
  return blankText()
}

export function ArticleLanguagesPanel({
  id,
  sourceLocale,
  onSourceLocaleChange,
  targetLocales,
  onTargetLocalesChange,
  provider,
  onProviderChange,
  autoTranslateEnabled,
  onAutoTranslateEnabledChange,
  access,
  sourceDirty,
  locale,
}: {
  id?: string
  sourceLocale: ArticleLocale
  onSourceLocaleChange: (locale: ArticleLocale) => void
  targetLocales: ArticleLocale[]
  onTargetLocalesChange: (locales: ArticleLocale[]) => void
  provider: Provider
  onProviderChange: (provider: Provider) => void
  autoTranslateEnabled: boolean
  onAutoTranslateEnabledChange: (enabled: boolean) => void
  access: PostAccess
  sourceDirty: boolean
  locale: 'zh-TW' | 'zh-CN' | 'en'
}) {
  const c = copy[locale]
  const [data, setData] = useState<ReturnType<typeof articleTranslationAdminResponseSchema.parse> | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [expandedError, setExpandedError] = useState<ArticleLocale | null>(null)
  const [previewLocale, setPreviewLocale] = useState<ArticleLocale | null>(null)
  const [editLocale, setEditLocale] = useState<ArticleLocale | null>(null)
  const [edit, setEdit] = useState<TranslationText>(blankText)
  const [editBaseline, setEditBaseline] = useState<TranslationText>(blankText)
  const [recovered, setRecovered] = useState(false)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const editRef = useRef(edit), editDirtyRef = useRef(false)
  editRef.current = edit
  const editDirty = useMemo(() => JSON.stringify(edit) !== JSON.stringify(editBaseline), [edit, editBaseline])
  editDirtyRef.current = editDirty
  const recoveryKey = id && editLocale ? `post-editor-draft:${id}:translation-${editLocale}` : null

  const load = useCallback(async (quiet = false) => {
    if (!id) return
    if (!quiet) setLoading(true)
    try {
      const response = await sessionFetch(`/api/blog/admin/${encodeURIComponent(id)}/translations`, { cache: 'no-store' })
      const body = await response.json().catch(() => null) as unknown
      const parsed = articleTranslationAdminResponseSchema.safeParse(body)
      if (response.ok && parsed.success) {
        setData(parsed.data)
        setError('')
      } else if (!quiet) {
        setError(apiFailure(body, c.requestFailed).message)
      }
    } catch {
      if (!quiet) setError(c.requestFailed)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [id, c.requestFailed])

  useEffect(() => { void load() }, [load])
  const wasDirty = useRef(sourceDirty)
  useEffect(() => {
    if (wasDirty.current && !sourceDirty) void load(true)
    wasDirty.current = sourceDirty
  }, [sourceDirty, load])
  useEffect(() => {
    if (!data?.translations.some(row => row.latestJob?.status === 'QUEUED' || row.latestJob?.status === 'RUNNING')) return
    const timer = window.setInterval(() => { void load(true) }, 3500)
    return () => window.clearInterval(timer)
  }, [data, load])
  useEffect(() => {
    if (!previewLocale) return
    requestAnimationFrame(() => previewHeading.current?.focus())
  }, [previewLocale])
  useEffect(() => {
    if (!recoveryKey || !editLocale) return
    setRecovered(false)
    try {
      const saved = JSON.parse(localStorage.getItem(recoveryKey) ?? 'null') as { at?: unknown; value?: unknown } | null
      const value = saved?.value as Partial<TranslationText> | undefined
      if (typeof saved?.at === 'number' && saved.at <= Date.now() && Date.now() - saved.at < 86_400_000 && value && typeof value.title === 'string' && typeof value.content === 'string' && typeof value.excerpt === 'string') {
        const next = { title: value.title, excerpt: value.excerpt, content: value.content }
        setEdit(next)
        setRecovered(true)
      }
    } catch { /* Recovery is best effort. */ }
  }, [recoveryKey, editLocale])
  useEffect(() => {
    if (!recoveryKey || !editDirty) return
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(recoveryKey, JSON.stringify({ at: Date.now(), value: editRef.current })) } catch { /* Recovery is best effort. */ }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [edit, recoveryKey, editDirty])
  useEffect(() => () => {
    if (!recoveryKey || !editDirtyRef.current) return
    try { localStorage.setItem(recoveryKey, JSON.stringify({ at: Date.now(), value: editRef.current })) } catch { /* Recovery is best effort. */ }
  }, [recoveryKey])
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (editDirtyRef.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', before)
    return () => window.removeEventListener('beforeunload', before)
  }, [])

  const rows = new Map(data?.translations.map(row => [row.locale, row]) ?? [])
  const chosenTargets = targetLocales.filter(target => target !== sourceLocale)
  const previewTarget = chosenTargets.find(target => Boolean(contentFor(rows.get(target) ?? null).content))
  const edgeAllowed = (id ? Boolean(data?.edgeEnabled) : true) && access === 'PUBLIC'
  const needsSave = !id || sourceDirty

  async function mutate(path: string, method = 'POST', body?: unknown, successMessage?: string) {
    if (!id || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (!csrfToken()) await sessionFetch('/api/auth/me')
      const response = await sessionFetch(path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), 'x-csrf-token': csrfToken() ?? '' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const value = await response.json().catch(() => null) as unknown
      if (!response.ok) { setError(apiFailure(value, c.actionFailed).message); return }
      if (successMessage) setNotice(successMessage)
      await load(true)
      return value
    } catch {
      setError(c.actionFailed)
    } finally { setBusy(false) }
  }

  async function translate(targets: ArticleLocale[], selectedProvider = provider) {
    if (!id || needsSave || targets.length === 0) return
    if (selectedProvider === 'edge' && !edgeAllowed) { setError(access === 'MEMBER' ? c.edgeMembers : c.edgeUnavailable); return }
    const result = await mutate(`/api/blog/admin/${encodeURIComponent(id)}/translations/jobs`, 'POST', { targetLocales: targets, provider: selectedProvider }, c.jobQueued)
    if (result && articleTranslationJobResponseSchema.safeParse(result).success) setPreviewLocale(null)
  }

  async function retranslate(target: ArticleLocale, selectedProvider = provider) {
    if (!id || needsSave) return
    if (selectedProvider === 'edge' && !edgeAllowed) { setError(access === 'MEMBER' ? c.edgeMembers : c.edgeUnavailable); return }
    await mutate(`/api/blog/admin/${encodeURIComponent(id)}/translations/${target}/retranslate`, 'POST', { provider: selectedProvider }, c.jobQueued)
  }

  function beginEdit(target: ArticleLocale, row: ArticleTranslationAdminRow | null) {
    if (editDirty && !window.confirm(c.discardTranslation)) return
    const initial = contentFor(row)
    setEditLocale(target); setEdit(initial); setEditBaseline(initial); setRecovered(false); setPreviewLocale(null); setNotice(''); setError('')
  }

  async function saveTranslation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!id || !editLocale || busy) return
    const parsed = articleTranslationEditRequestSchema.safeParse({ title: edit.title, excerpt: edit.excerpt || null, content: edit.content })
    if (!parsed.success) { setError(c.actionFailed); return }
    const result = await mutate(`/api/blog/admin/${encodeURIComponent(id)}/translations/${editLocale}`, 'PUT', parsed.data, c.saved)
    if (result && articleTranslationActionResponseSchema.safeParse(result).success) {
      setEditBaseline(edit)
      editDirtyRef.current = false
      if (recoveryKey) { try { localStorage.removeItem(recoveryKey) } catch { /* Ignore unavailable storage. */ } }
      setEditLocale(null)
    }
  }

  async function approve(target: ArticleLocale) {
    const result = await mutate(`/api/blog/admin/${encodeURIComponent(id!)}/translations/${target}/review`, 'POST', undefined, c.approved)
    if (result && articleTranslationActionResponseSchema.safeParse(result).success) setData(current => {
      if (!current) return current
      const updated = articleTranslationActionResponseSchema.parse(result).translation
      return { ...current, translations: current.translations.map(row => row.locale === target ? updated : row) }
    })
  }

  async function publish(target: ArticleLocale) {
    const result = await mutate(`/api/blog/admin/${encodeURIComponent(id!)}/translations/${target}/publish`, 'POST', undefined, c.publishedOk)
    if (result && articleTranslationActionResponseSchema.safeParse(result).success) setData(current => {
      if (!current) return current
      const updated = articleTranslationActionResponseSchema.parse(result).translation
      return { ...current, translations: current.translations.map(row => row.locale === target ? updated : row) }
    })
  }

  async function unpublish(target: ArticleLocale) {
    if (!window.confirm(c.confirmUnpublish)) return
    await mutate(`/api/blog/admin/${encodeURIComponent(id!)}/translations/${target}/unpublish`, 'POST', undefined, c.unpublished)
  }

  function closeEdit() {
    if (editDirty && !window.confirm(c.discardTranslation)) return
    setEditLocale(null); setRecovered(false)
  }

  function toggleTarget(target: ArticleLocale, checked: boolean) {
    onTargetLocalesChange(checked ? [...new Set([...chosenTargets, target])] : chosenTargets.filter(value => value !== target))
  }

  return <section className="article-languages" aria-labelledby="article-languages-heading">
    <header className="article-languages-heading">
      <div><h2 id="article-languages-heading">{c.title}</h2><p className="muted">{!id ? c.saveFirst : sourceDirty ? c.saveChangesFirst : ''}</p></div>
      <Link className="secondary article-language-settings-link" to="/admin/article-translations">{c.settings}</Link>
    </header>
    <div className="article-language-settings">
      <label>{c.original}<select value={sourceLocale} disabled={busy} onChange={event => {
        const next = event.target.value as ArticleLocale
        onSourceLocaleChange(next)
        onTargetLocalesChange(targetLocales.filter(value => value !== next))
      }}>{locales.map(value => <option key={value} value={value}>{localeName[value]}</option>)}</select></label>
      <fieldset className="article-language-targets"><legend>{c.targets}</legend>{locales.filter(value => value !== sourceLocale).map(value => <label key={value}><input type="checkbox" checked={chosenTargets.includes(value)} disabled={busy} onChange={event => toggleTarget(value, event.target.checked)} />{localeName[value]}</label>)}</fieldset>
      <label>{c.provider}<select value={provider} disabled={busy} onChange={event => onProviderChange(event.target.value as Provider)}><option value="edge" disabled={!edgeAllowed}>{c.edge}{data && !data.edgeEnabled ? ` — ${c.failed}` : ''}</option><option value="ai">{c.ai}</option></select></label>
      <label className="article-language-auto"><input type="checkbox" checked={autoTranslateEnabled} disabled={busy || (provider === 'edge' && access === 'MEMBER' && !autoTranslateEnabled)} onChange={event => {
        if (event.target.checked && provider === 'edge' && access === 'MEMBER') { setError(c.edgeMembers); return }
        onAutoTranslateEnabledChange(event.target.checked)
      }} />{c.automatic}</label>
      <div className="article-language-notices">
        {provider === 'edge' && <p className="article-language-warning" role="note"><strong>{c.thirdPartyHeading}:</strong> {c.warning} {access === 'MEMBER' ? ` ${c.edgeMembers}` : ''}</p>}
        {provider === 'edge' && data && !data.edgeEnabled && <p className="muted">{c.edgeUnavailable}</p>}
      </div>
      <div className="article-language-toolbar"><button type="button" disabled={busy || needsSave || chosenTargets.length === 0 || (provider === 'edge' && !edgeAllowed)} onClick={() => void translate(chosenTargets)}>{busy ? (locale === 'en' ? 'Working…' : '處理中…') : c.translate}</button><button type="button" className="secondary" disabled={!previewTarget || busy} onClick={() => previewTarget && setPreviewLocale(previewTarget)}>{c.preview}</button><span className="muted">{autoTranslateEnabled ? c.jobQueued : ''}</span></div>
    </div>
    {notice && <p className="article-language-notice" role="status">{notice}</p>}
    {error && <p className="error article-language-error" role="alert">{error}</p>}
    {loading && <p role="status">{locale === 'en' ? 'Loading translations…' : locale === 'zh-CN' ? '正在加载翻译…' : '正在載入翻譯…'}</p>}
    {data && <div className="article-language-list" aria-live="polite">{locales.map(target => {
      if (target === data.sourceLocale) return <div className="article-language-row is-original" key={target}><div className="article-language-name"><strong>{localeName[target]}</strong><span className="article-language-status">{c.originalBadge}</span></div><span className="muted">{c.current}</span></div>
      const row = rows.get(target) ?? null
      const status = row?.status ?? 'MISSING'
      const label = status === 'QUEUED' ? c.queued : status === 'TRANSLATING' ? c.translating : status === 'NEEDS_REVIEW' ? c.review : status === 'READY' ? c.approvedReady : status === 'PUBLISHED' ? c.published : status === 'UNPUBLISHED' ? c.unpublished : status === 'STALE' ? c.stale : status === 'FAILED' ? c.failed : c.missing
      const hasPublished = Boolean(row?.publishedAt)
      const hasContent = Boolean(row && (row.draftContent !== null || row.publishedContent !== null))
      const jobActive = row?.latestJob?.status === 'QUEUED' || row?.latestJob?.status === 'RUNNING'
      const isBusy = busy || jobActive
      const jobError = row?.latestJob?.error
      const canPublish = status === 'READY' && Boolean(row?.draftIsCurrent)
      return <article className="article-language-row" key={target}>
        <div className="article-language-row-main"><div className="article-language-name"><strong>{localeName[target]}</strong><span className={`article-language-status status-${status.toLowerCase().replace('_', '-')}`}>{label}</span>{hasPublished && <span className="muted">{c.publishedVersion} v{row?.publishedVersion}{row?.isCurrent ? ` · ${c.current}` : ''}</span>}</div>
          {status === 'STALE' && <p className="muted article-language-stale-note">{c.staleHint}</p>}
          {row?.latestJob?.provider === 'ai' && row.latestJob.providerProfileName && <p className="muted article-language-stale-note">{c.aiProvider}: {row.latestJob.providerProfileName}</p>}
          {row?.latestJob?.status === 'RUNNING' && <progress aria-label={`${localeName[target]} ${c.progress}`} max={100} value={row.latestJob.progress} />}
        </div>
        <div className="article-language-actions">
          {hasContent && <button type="button" className="secondary" disabled={busy} onClick={() => {
            if (editDirty && editLocale !== target && !window.confirm(c.discardTranslation)) return
            if (editLocale !== target) setEditLocale(null)
            setPreviewLocale(target); setError('')
          }}>{c.preview}</button>}
          <button type="button" className="secondary" disabled={isBusy || !id} onClick={() => beginEdit(target, row)}>{c.edit}</button>
          {status === 'NEEDS_REVIEW' && <button type="button" className="secondary" disabled={isBusy || !row?.draftIsCurrent} onClick={() => void approve(target)}>{c.approve}</button>}
          {canPublish && <button type="button" disabled={isBusy} onClick={() => void publish(target)}>{c.publish}</button>}
          {hasPublished && <button type="button" className="secondary" disabled={isBusy} onClick={() => void unpublish(target)}>{c.unpublish}</button>}
          {row?.latestJob?.status === 'FAILED' && <><button type="button" className="secondary" disabled={isBusy || needsSave} onClick={() => void translate([target], row.latestJob?.provider ?? provider)}>{c.retry}</button>{row.latestJob.provider !== 'ai' && <button type="button" className="secondary" disabled={isBusy || needsSave} onClick={() => void translate([target], 'ai')}>{c.useAi}</button>}</>}
          {row?.latestJob?.status !== 'FAILED' && status !== 'MISSING' && <button type="button" className="secondary" disabled={isBusy || needsSave || (provider === 'edge' && !edgeAllowed)} onClick={() => void retranslate(target)}>{c.retranslate}</button>}
          {jobError && <button type="button" className="text-button" aria-expanded={expandedError === target} onClick={() => setExpandedError(expandedError === target ? null : target)}>{expandedError === target ? c.closeError : c.failedDetail}</button>}
        </div>
        {expandedError === target && jobError && <p className="article-language-job-error" role="status">{jobError}</p>}
      </article>
    })}</div>}
    {previewLocale && (() => {
      const row = rows.get(previewLocale) ?? null
      const value = editLocale === previewLocale ? edit : contentFor(row)
      return <section className="article-translation-preview" aria-labelledby="article-translation-preview-heading">
        <div className="article-translation-preview-heading"><h3 id="article-translation-preview-heading" ref={previewHeading} tabIndex={-1}>{localeName[previewLocale]} · {c.preview}</h3><button type="button" className="secondary" onClick={() => setPreviewLocale(null)}>{c.close}</button></div>
        {value.title ? <><h1>{value.title}</h1>{value.excerpt && <p className="lede">{value.excerpt}</p>}<Markdown>{value.content}</Markdown><button type="button" className="secondary" onClick={() => beginEdit(previewLocale, row)}>{c.edit}</button></> : <p>{c.noPreview}</p>}
      </section>
    })()}
    {editLocale && <form className="article-translation-edit" onSubmit={event => void saveTranslation(event)} aria-busy={busy}>
      <div className="article-translation-preview-heading"><h3>{c.editTitle} · {localeName[editLocale]}</h3><button type="button" className="secondary" disabled={busy} onClick={closeEdit}>{c.cancel}</button></div>
      {recovered && <p role="status" className="article-language-notice">{c.restored}</p>}
      {editDirty && <p className="muted" role="status">{c.editing}</p>}
      <fieldset disabled={busy}>
        <label>{c.titleLabel}<input value={edit.title} maxLength={255} required onChange={event => setEdit(current => ({ ...current, title: event.target.value }))} /></label>
        <label>{c.excerptLabel}<textarea value={edit.excerpt} maxLength={1000} rows={3} onChange={event => setEdit(current => ({ ...current, excerpt: event.target.value }))} /></label>
        <label>{c.contentLabel}<textarea value={edit.content} maxLength={100000} rows={16} required onChange={event => setEdit(current => ({ ...current, content: event.target.value }))} /></label>
      </fieldset>
      <div className="article-language-toolbar"><button type="submit" disabled={busy || !editDirty}>{busy ? (locale === 'en' ? 'Saving…' : '正在保存…') : c.saveTranslation}</button><button type="button" className="secondary" disabled={busy} onClick={() => setPreviewLocale(editLocale)}>{c.preview}</button></div>
    </form>}
  </section>
}
