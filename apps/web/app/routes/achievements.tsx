import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { achievementListSchema, writeAchievementSchema, type AchievementResponse } from '@diary/contracts/achievements'
import { goalListSchema, writeGoalSchema, type GoalResponse, type GoalStatus } from '@diary/contracts/goals'
import { api, useUi, LoadingBlock } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { signInPath } from '../session'
import '../achievements.css'

const copy = {
  en: {
    title: 'Achievements and goals',
    intro: 'Keep a private record of the milestones that matter to you, and the goals you are still working towards.',
    goals: 'Goals',
    addGoal: 'Add goal',
    editGoal: 'Edit goal',
    goalContent: 'Goal',
    goalPlaceholder: 'For example: reach 15% YTD this year',
    targetDate: 'Target date',
    openEnded: 'No deadline',
    saveGoal: 'Save goal',
    goalEmpty: 'No goals set yet.',
    goalSaved: 'Goal saved.',
    goalDeleted: 'Goal deleted.',
    goalInvalid: 'Enter a goal between 1 and 1,000 characters, and either a valid target date or no deadline.',
    confirmGoal: 'Delete this goal permanently?',
    markAchieved: 'Mark achieved',
    reactivate: 'Resume',
    statusActive: 'In progress',
    statusAchieved: 'Achieved',
    statusOverdue: 'Overdue',
    noDeadline: 'No deadline',
    due: (date: string) => `Due ${date}`,
    daysLeft: (days: number) => `${days} days left`,
    dueToday: 'Due today',
    overdueBy: (days: number) => `${days} days overdue`,
    achievedOn: (date: string) => `Achieved on ${date}`,
    prefilled: 'Goal marked achieved. Review the wording, then save it as an achievement.',
    achievements: 'Achievements',
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
    title: '個人成就與目標',
    intro: '記下對你重要的里程碑，以及還在努力的目標。',
    goals: '目標',
    addGoal: '新增目標',
    editGoal: '編輯目標',
    goalContent: '目標內容',
    goalPlaceholder: '例如：今年 YTD 達 15%',
    targetDate: '截止日期',
    openEnded: '無期限',
    saveGoal: '儲存目標',
    goalEmpty: '尚未設定任何目標。',
    goalSaved: '目標已儲存。',
    goalDeleted: '目標已刪除。',
    goalInvalid: '請輸入 1 至 1,000 個字元的目標內容，並選擇有效的截止日期或設為無期限。',
    confirmGoal: '確定要永久刪除這項目標嗎？',
    markAchieved: '已達成',
    reactivate: '重新進行',
    statusActive: '進行中',
    statusAchieved: '已達成',
    statusOverdue: '已逾期',
    noDeadline: '無期限',
    due: (date: string) => `到 ${date}`,
    daysLeft: (days: number) => `剩 ${days} 天`,
    dueToday: '今天到期',
    overdueBy: (days: number) => `逾期 ${days} 天`,
    achievedOn: (date: string) => `於 ${date} 達成`,
    prefilled: '目標已標記達成，確認成就內容後儲存。',
    achievements: '成就',
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
    title: '个人成就与目标',
    intro: '记下对你重要的里程碑，以及还在努力的目标。',
    goals: '目标',
    addGoal: '新增目标',
    editGoal: '编辑目标',
    goalContent: '目标内容',
    goalPlaceholder: '例如：今年 YTD 达 15%',
    targetDate: '截止日期',
    openEnded: '无期限',
    saveGoal: '保存目标',
    goalEmpty: '尚未设定任何目标。',
    goalSaved: '目标已保存。',
    goalDeleted: '目标已删除。',
    goalInvalid: '请输入 1 至 1,000 个字符的目标内容，并选择有效的截止日期或设为无期限。',
    confirmGoal: '确定要永久删除这项目标吗？',
    markAchieved: '已达成',
    reactivate: '重新进行',
    statusActive: '进行中',
    statusAchieved: '已达成',
    statusOverdue: '已逾期',
    noDeadline: '无期限',
    due: (date: string) => `到 ${date}`,
    daysLeft: (days: number) => `剩 ${days} 天`,
    dueToday: '今天到期',
    overdueBy: (days: number) => `逾期 ${days} 天`,
    achievedOn: (date: string) => `于 ${date} 达成`,
    prefilled: '目标已标记达成，确认成就内容后保存。',
    achievements: '成就',
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

type Copy = (typeof copy)[keyof typeof copy]
/** An achieved goal hands its text to the achievement form; the user still confirms the save. */
type Prefill = { date: string; content: string; token: number }

const DAY_MS = 86_400_000
const civilToday = () => new Date().toISOString().slice(0, 10)
const civilDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

function useDateFormatter(locale: string) {
  const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
  return (date: string) => format.format(new Date(`${date}T00:00:00Z`))
}

/** Deadline wording for an active goal; an achieved goal reads its own date instead. */
function deadline(c: Copy, formatDate: (date: string) => string, targetDate: string | null) {
  if (targetDate === null) return c.noDeadline
  const days = civilDays(civilToday(), targetDate)
  const remaining = days === 0 ? c.dueToday : days > 0 ? c.daysLeft(days) : c.overdueBy(-days)
  return `${c.due(formatDate(targetDate))} · ${remaining}`
}

/** Overdue is derived from the deadline, so a goal ages into it without a stored transition. */
const isOverdue = (goal: GoalResponse) =>
  goal.status === 'active' && goal.targetDate !== null && civilDays(civilToday(), goal.targetDate) < 0

const goalStatusTone = (goal: GoalResponse) => goal.status === 'achieved' ? 'achieved' : isOverdue(goal) ? 'overdue' : 'active'

function goalStatusLabel(c: Copy, goal: GoalResponse) {
  if (goal.status === 'achieved') return c.statusAchieved
  return isOverdue(goal) ? c.statusOverdue : c.statusActive
}

/**
 * Moving focus across an open/close has to wait for the render that mounts the
 * target: an animation frame can run before React re-attaches the ref, which
 * drops the focus move entirely.
 */
function useDeferredFocus<T extends HTMLElement>() {
  const target = useRef<T>(null)
  const [armed, setArmed] = useState(0)
  useEffect(() => { if (armed > 0) target.current?.focus() }, [armed])
  return [target, () => setArmed(value => value + 1)] as const
}

export default function Achievements() {
  const { locale, t } = useUi()
  const c = copy[locale]
  const formatDate = useDateFormatter(locale)
  const [goals, setGoals] = useState<GoalResponse[] | null>(null)
  const [rows, setRows] = useState<AchievementResponse[] | null>(null)
  const [error, setError] = useState<Failure | null>(null)
  const [attempt, retry] = useState(0)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const translate = useRef(t)
  translate.current = t

  useEffect(() => {
    const controller = new AbortController()
    setGoals(null)
    setRows(null)
    setError(null)
    Promise.all([
      api.GET('/api/goals', { signal: controller.signal }),
      api.GET('/api/achievements', { signal: controller.signal }),
    ]).then(([goalResult, achievementResult]) => {
      if (controller.signal.aborted) return
      const parsedGoals = goalListSchema.safeParse(goalResult.data)
      const parsedRows = achievementListSchema.safeParse(achievementResult.data)
      if (!goalResult.response.ok || !parsedGoals.success) setError(apiFailure(goalResult.error, translate.current('failed')))
      else if (!achievementResult.response.ok || !parsedRows.success) setError(apiFailure(achievementResult.error, translate.current('failed')))
      else {
        setGoals(parsedGoals.data)
        setRows(parsedRows.data)
      }
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))) })
    return () => controller.abort()
  }, [attempt])

  const reload = () => retry(value => value + 1)

  return <section className="plan-page achievements-page">
    <header className="plan-header">
      <div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div>
    </header>
    {error ? <><FailureNotice failure={error} /><div className="actions"><button type="button" onClick={reload}>{t('retry')}</button>{error.code?.startsWith('AUTH_') && <Link className="button secondary" to={signInPath('/achievements')}>{t('login')}</Link>}</div></> : <>
      <GoalsSection
        c={c}
        formatDate={formatDate}
        goals={goals}
        onChanged={reload}
        onRemoved={id => setGoals(previous => previous?.filter(goal => goal.id !== id) ?? null)}
        onAchieved={goal => setPrefill({ date: goal.achievedDate ?? civilToday(), content: goal.content, token: Date.now() })}
      />
      <AchievementsSection
        c={c}
        formatDate={formatDate}
        rows={rows}
        prefill={prefill}
        onChanged={reload}
        onRemoved={id => setRows(previous => previous?.filter(row => row.id !== id) ?? null)}
      />
    </>}
  </section>
}

function GoalsSection({ c, formatDate, goals, onChanged, onRemoved, onAchieved }: {
  c: Copy
  formatDate: (date: string) => string
  goals: GoalResponse[] | null
  onChanged: () => void
  onRemoved: (id: string) => void
  onAchieved: (goal: GoalResponse) => void
}) {
  const { t } = useUi()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [openEnded, setOpenEnded] = useState(false)
  const [pending, setPending] = useState(false)
  const [writeError, setWriteError] = useState<Failure | null>(null)
  const [status, setStatus] = useState<'saved' | 'deleted' | null>(null)
  const [addButton, focusAdd] = useDeferredFocus<HTMLButtonElement>()
  const [contentInput, focusContent] = useDeferredFocus<HTMLTextAreaElement>()
  const mutation = useRef<AbortController | null>(null)

  useEffect(() => () => mutation.current?.abort(), [])

  function openCreate() {
    setEditing(null)
    setContent('')
    setTargetDate('')
    setOpenEnded(false)
    setWriteError(null)
    setStatus(null)
    setFormOpen(true)
    focusContent()
  }

  function openEdit(goal: GoalResponse) {
    setEditing(goal.id)
    setContent(goal.content)
    setTargetDate(goal.targetDate ?? '')
    setOpenEnded(goal.targetDate === null)
    setWriteError(null)
    setStatus(null)
    setFormOpen(true)
    focusContent()
  }

  function cancel() {
    setFormOpen(false)
    setEditing(null)
    setContent('')
    setTargetDate('')
    setOpenEnded(false)
    setWriteError(null)
    focusAdd()
  }

  /** Every goal write funnels through here so the abort and failure handling stays in one place. */
  async function write(action: (signal: AbortSignal) => Promise<{ response: Response; error?: unknown }>, done: () => void) {
    if (pending) return
    const controller = new AbortController()
    mutation.current = controller
    setPending(true)
    setWriteError(null)
    setStatus(null)
    try {
      const result = await action(controller.signal)
      if (controller.signal.aborted) return
      if (!result.response.ok) {
        setWriteError(apiFailure(result.error, t('failed')))
        return
      }
      done()
    } catch {
      if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection')))
    } finally {
      if (!controller.signal.aborted) {
        mutation.current = null
        setPending(false)
      }
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const parsed = writeGoalSchema.safeParse({ content, targetDate: openEnded ? null : targetDate })
    if (!parsed.success) {
      setWriteError({ message: c.goalInvalid, code: 'SYS_VALIDATION_ERROR', fields: parsed.error.issues.map(issue => issue.path.join('.')) })
      return
    }
    const id = editing
    await write(
      signal => id
        ? api.PUT('/api/goals/{id}', { params: { path: { id } }, body: parsed.data, signal })
        : api.POST('/api/goals', { body: parsed.data, signal }),
      () => {
        cancel()
        setStatus('saved')
        onChanged()
      },
    )
  }

  async function changeStatus(goal: GoalResponse, next: GoalStatus) {
    await write(
      signal => api.PUT('/api/goals/{id}', {
        params: { path: { id: goal.id } },
        body: { content: goal.content, targetDate: goal.targetDate, status: next },
        signal,
      }),
      () => {
        onChanged()
        if (next === 'achieved') onAchieved(goal)
      },
    )
  }

  async function remove(goal: GoalResponse) {
    if (pending || !window.confirm(c.confirmGoal)) return
    await write(
      signal => api.DELETE('/api/goals/{id}', { params: { path: { id: goal.id } }, signal }),
      () => {
        onRemoved(goal.id)
        setStatus('deleted')
      },
    )
  }

  return <section className="achievements-section" aria-labelledby="goals-heading">
    <div className="achievements-section-header">
      <h2 id="goals-heading">{c.goals}</h2>
      {!formOpen && <button ref={addButton} type="button" onClick={openCreate}>{c.addGoal}</button>}
    </div>
    {formOpen && <form className="card achievement-form" onSubmit={save}>
      <fieldset disabled={pending}>
        <legend>{editing ? c.editGoal : c.addGoal}</legend>
        <div className="plan-grid">
          <label className="plan-wide">{c.goalContent}<textarea ref={contentInput} data-testid="goal-input" value={content} onChange={event => setContent(event.target.value)} maxLength={1000} rows={3} placeholder={c.goalPlaceholder} required aria-invalid={writeError?.fields.includes('content') || undefined} aria-describedby={writeError ? 'goal-form-error' : undefined} /></label>
          <label>{c.targetDate}<input data-testid="goal-date" type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)} disabled={openEnded} required={!openEnded} aria-invalid={writeError?.fields.includes('targetDate') || undefined} aria-describedby={writeError ? 'goal-form-error' : undefined} /></label>
          <label className="goal-open-ended"><input data-testid="goal-open-ended" type="checkbox" checked={openEnded} onChange={event => setOpenEnded(event.target.checked)} />{c.openEnded}</label>
        </div>
        <div className="actions"><button type="submit">{pending ? t('pending') : c.saveGoal}</button><button type="button" className="secondary" onClick={cancel}>{c.cancel}</button></div>
      </fieldset>
    </form>}
    <FailureNotice failure={writeError} id="goal-form-error" />
    {status && <p role="status">{status === 'saved' ? c.goalSaved : c.goalDeleted}</p>}
    {goals === null ? <LoadingBlock label={t('loading')} /> : goals.length === 0 ? <div className="empty-state"><p>{c.goalEmpty}</p></div> : <ul className="goal-list card">
      {goals.map(goal => <li key={goal.id} data-testid="goal" data-status={goal.status}>
        <p className="achievement-content">{goal.content}</p>
        <p className="goal-meta">
          <span className={`goal-status goal-status-${goalStatusTone(goal)}`}>{goalStatusLabel(c, goal)}</span>
          <span>{goal.status === 'achieved' && goal.achievedDate !== null ? c.achievedOn(formatDate(goal.achievedDate)) : deadline(c, formatDate, goal.targetDate)}</span>
        </p>
        <div className="actions">
          <button type="button" className="secondary" disabled={pending || formOpen} onClick={() => void changeStatus(goal, goal.status === 'active' ? 'achieved' : 'active')}>{goal.status === 'active' ? c.markAchieved : c.reactivate}</button>
          <button type="button" className="secondary" disabled={pending || formOpen} onClick={() => openEdit(goal)}>{c.editAction}</button>
          <button type="button" className="secondary danger-button" disabled={pending || formOpen} onClick={() => void remove(goal)}>{c.remove}</button>
        </div>
      </li>)}
    </ul>}
  </section>
}

function AchievementsSection({ c, formatDate, rows, prefill, onChanged, onRemoved }: {
  c: Copy
  formatDate: (date: string) => string
  rows: AchievementResponse[] | null
  prefill: Prefill | null
  onChanged: () => void
  onRemoved: (id: string) => void
}) {
  const { t } = useUi()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [content, setContent] = useState('')
  const [pending, setPending] = useState(false)
  const [writeError, setWriteError] = useState<Failure | null>(null)
  const [status, setStatus] = useState<'saved' | 'deleted' | 'prefilled' | null>(null)
  const [addButton, focusAdd] = useDeferredFocus<HTMLButtonElement>()
  const [dateInput, focusDate] = useDeferredFocus<HTMLInputElement>()
  const mutation = useRef<AbortController | null>(null)

  useEffect(() => () => mutation.current?.abort(), [])
  useEffect(() => {
    if (prefill === null) return
    setEditing(null)
    setDate(prefill.date)
    setContent(prefill.content)
    setWriteError(null)
    setStatus('prefilled')
    setFormOpen(true)
    focusDate()
  }, [prefill?.token])

  function openCreate() {
    setEditing(null)
    setDate('')
    setContent('')
    setWriteError(null)
    setStatus(null)
    setFormOpen(true)
    focusDate()
  }

  function openEdit(row: AchievementResponse) {
    setEditing(row.id)
    setDate(row.date)
    setContent(row.content)
    setWriteError(null)
    setStatus(null)
    setFormOpen(true)
    focusDate()
  }

  function cancel() {
    setFormOpen(false)
    setEditing(null)
    setDate('')
    setContent('')
    setWriteError(null)
    focusAdd()
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
      onChanged()
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
      onRemoved(row.id)
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

  return <section className="achievements-section" aria-labelledby="achievements-heading">
    <div className="achievements-section-header">
      <h2 id="achievements-heading">{c.achievements}</h2>
      {!formOpen && <button ref={addButton} type="button" onClick={openCreate}>{c.add}</button>}
    </div>
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
    {status && <p role="status">{status === 'saved' ? c.saved : status === 'deleted' ? c.deleted : c.prefilled}</p>}
    {rows === null ? <LoadingBlock label={t('loading')} /> : rows.length === 0 ? <div className="empty-state"><p>{c.empty}</p></div> : <ol className="achievement-list card">
      {rows.map(row => <li key={row.id} data-testid="achievement">
        <time dateTime={row.date}>{formatDate(row.date)}</time>
        <p className="achievement-content">{row.content}</p>
        <div className="actions"><button type="button" className="secondary" disabled={pending || formOpen} onClick={() => openEdit(row)}>{c.editAction}</button><button type="button" className="secondary danger-button" disabled={pending || formOpen} onClick={() => void remove(row)}>{c.remove}</button></div>
      </li>)}
    </ol>}
  </section>
}
