import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { achievementListSchema, writeAchievementSchema, type AchievementResponse } from '@diary/contracts/achievements'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { signInPath } from '../session'
import '../achievements.css'

const copy = {
  en: {
    title: 'Personal achievements',
    intro: 'Keep a private record of milestones that matter to you.',
    add: 'Add achievement',
    edit: 'Edit achievement',
    date: 'Date',
    content: 'Achievement',
    placeholder: 'For example: First reached USD 100,000 in the account',
    save: 'Save achievement',
    cancel: 'Cancel',
    editAction: 'Edit',
    remove: 'Delete',
    confirm: 'Delete this achievement permanently?',
    empty: 'No achievements recorded yet.',
    saved: 'Achievement saved.',
    deleted: 'Achievement deleted.',
    invalid: 'Enter a valid date and an achievement between 1 and 1,000 characters.',
  },
  'zh-TW': {
    title: '個人成就',
    intro: '記下對你重要的里程碑，保留一份私人的成就記錄。',
    add: '新增成就',
    edit: '編輯成就',
    date: '日期',
    content: '成就內容',
    placeholder: '例如：帳戶第一次達到 10 萬美元',
    save: '儲存成就',
    cancel: '取消',
    editAction: '編輯',
    remove: '刪除',
    confirm: '確定要永久刪除這項成就嗎？',
    empty: '尚未記錄任何成就。',
    saved: '成就已儲存。',
    deleted: '成就已刪除。',
    invalid: '請輸入有效日期，以及 1 至 1,000 個字元的成就內容。',
  },
  'zh-CN': {
    title: '个人成就',
    intro: '记下对你重要的里程碑，保留一份私人的成就记录。',
    add: '新增成就',
    edit: '编辑成就',
    date: '日期',
    content: '成就内容',
    placeholder: '例如：账户第一次达到 10 万美元',
    save: '保存成就',
    cancel: '取消',
    editAction: '编辑',
    remove: '删除',
    confirm: '确定要永久删除这项成就吗？',
    empty: '尚未记录任何成就。',
    saved: '成就已保存。',
    deleted: '成就已删除。',
    invalid: '请输入有效日期，以及 1 至 1,000 个字符的成就内容。',
  },
} as const

export default function Achievements() {
  const { locale, t } = useUi()
  const c = copy[locale]
  const [rows, setRows] = useState<AchievementResponse[] | null>(null)
  const [error, setError] = useState<Failure | null>(null)
  const [writeError, setWriteError] = useState<Failure | null>(null)
  const [attempt, retry] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [content, setContent] = useState('')
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<'saved' | 'deleted' | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const dateInput = useRef<HTMLInputElement>(null)
  const mutation = useRef<AbortController | null>(null)
  const translate = useRef(t)
  translate.current = t

  useEffect(() => () => mutation.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    setRows(null)
    setError(null)
    api.GET('/api/achievements', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = achievementListSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, translate.current('failed')))
      else setRows(parsed.data)
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))) })
    return () => controller.abort()
  }, [attempt])

  function openCreate() {
    setEditing(null)
    setDate('')
    setContent('')
    setWriteError(null)
    setStatus(null)
    setFormOpen(true)
    requestAnimationFrame(() => dateInput.current?.focus())
  }

  function openEdit(row: AchievementResponse) {
    setEditing(row.id)
    setDate(row.date)
    setContent(row.content)
    setWriteError(null)
    setStatus(null)
    setFormOpen(true)
    requestAnimationFrame(() => dateInput.current?.focus())
  }

  function cancel() {
    setFormOpen(false)
    setEditing(null)
    setDate('')
    setContent('')
    setWriteError(null)
    requestAnimationFrame(() => addButton.current?.focus())
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const parsed = writeAchievementSchema.safeParse({ date, content })
    if (!parsed.success) {
      setWriteError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: parsed.error.issues.map(issue => issue.path.join('.')) })
      return
    }
    if (pending) return
    const controller = new AbortController()
    mutation.current = controller
    setPending(true)
    setWriteError(null)
    setStatus(null)
    try {
      const result = editing
        ? await api.PUT('/api/achievements/{id}', { params: { path: { id: editing } }, body: parsed.data, signal: controller.signal })
        : await api.POST('/api/achievements', { body: parsed.data, signal: controller.signal })
      if (controller.signal.aborted) return
      if (!result.response.ok) {
        setWriteError(apiFailure(result.error, t('failed')))
        return
      }
      cancel()
      setStatus('saved')
      retry(value => value + 1)
    } catch {
      if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection')))
    } finally {
      if (!controller.signal.aborted) {
        mutation.current = null
        setPending(false)
      }
    }
  }

  async function remove(row: AchievementResponse) {
    if (pending || !window.confirm(c.confirm)) return
    const controller = new AbortController()
    mutation.current = controller
    setPending(true)
    setWriteError(null)
    setStatus(null)
    try {
      const result = await api.DELETE('/api/achievements/{id}', { params: { path: { id: row.id } }, signal: controller.signal })
      if (controller.signal.aborted) return
      if (!result.response.ok) {
        setWriteError(apiFailure(result.error, t('failed')))
        return
      }
      setRows(previous => previous?.filter(item => item.id !== row.id) ?? null)
      setStatus('deleted')
    } catch {
      if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection')))
    } finally {
      if (!controller.signal.aborted) {
        mutation.current = null
        setPending(false)
      }
    }
  }

  return <section className="plan-page achievements-page">
    <header className="plan-header">
      <div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div>
      {!formOpen && <button ref={addButton} type="button" onClick={openCreate}>{c.add}</button>}
    </header>
    {formOpen && <form className="card achievement-form" onSubmit={save}>
      <fieldset disabled={pending}>
        <legend>{editing ? c.edit : c.add}</legend>
        <div className="plan-grid">
          <label>{c.date}<input ref={dateInput} data-testid="achievement-date" type="date" value={date} onChange={event => setDate(event.target.value)} required aria-invalid={writeError?.fields.includes('date') || undefined} aria-describedby={writeError ? 'achievement-form-error' : undefined} /></label>
          <label className="plan-wide">{c.content}<textarea data-testid="achievement-input" value={content} onChange={event => setContent(event.target.value)} maxLength={1000} rows={3} placeholder={c.placeholder} required aria-invalid={writeError?.fields.includes('content') || undefined} aria-describedby={writeError ? 'achievement-form-error' : undefined} /></label>
        </div>
        <div className="actions"><button type="submit">{pending ? t('pending') : c.save}</button><button type="button" className="secondary" onClick={cancel}>{c.cancel}</button></div>
      </fieldset>
    </form>}
    <FailureNotice failure={writeError} id="achievement-form-error" />
    {status && <p role="status">{status === 'saved' ? c.saved : c.deleted}</p>}
    {error ? <><FailureNotice failure={error} /><div className="actions"><button type="button" onClick={() => retry(value => value + 1)}>{t('retry')}</button>{error.code?.startsWith('AUTH_') && <Link className="button secondary" to={signInPath('/achievements')}>{t('login')}</Link>}</div></> : rows === null ? <p role="status">{t('loading')}</p> : rows.length === 0 ? <div className="empty-state"><p>{c.empty}</p></div> : <ol className="achievement-list card">
      {rows.map(row => <li key={row.id} data-testid="achievement">
        <time dateTime={row.date}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${row.date}T00:00:00Z`))}</time>
        <p className="achievement-content">{row.content}</p>
        <div className="actions"><button type="button" className="secondary" disabled={pending || formOpen} onClick={() => openEdit(row)}>{c.editAction}</button><button type="button" className="secondary" disabled={pending || formOpen} onClick={() => void remove(row)}>{c.remove}</button></div>
      </li>)}
    </ol>}
  </section>
}
