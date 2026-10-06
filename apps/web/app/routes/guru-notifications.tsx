import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  guruNotificationListResponseSchema,
  guruNotificationPreferencesResponseSchema,
  guruNotificationReadResponseSchema,
  type GuruNotification,
  type GuruNotificationPreferences,
} from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { guruNotificationsCopy, type GuruNotificationsCopy } from '../guru-notifications-copy'
import { formatSignedPercent, percent } from '../guru-format'
import { signInPath, useSessionState } from '../session'
import { api, useUi } from '../ui'
import './guru-notifications.css'

type Preferences = ReturnType<typeof guruNotificationPreferencesResponseSchema.parse>['data']
type ToggleKey = Exclude<keyof GuruNotificationPreferences, 'minWeightPercent' | 'minQuantityChangePercent'>

const toggleKeys: ToggleKey[] = ['newFiling', 'newPosition', 'exitedPosition', 'strongAdd', 'strongReduce', 'newStockHolder', 'consensusChange']

function describe(notification: GuruNotification, copy: GuruNotificationsCopy) {
  const subject = notification.symbol ?? notification.company ?? notification.guru?.name ?? '—'
  const label = copy.events[notification.eventType === 'NEW_FILING' ? 'newFiling'
    : notification.eventType === 'NEW_POSITION' ? 'newPosition'
      : notification.eventType === 'EXITED_POSITION' ? 'exitedPosition'
        : notification.eventType === 'STRONG_ADD' ? 'strongAdd'
          : notification.eventType === 'STRONG_REDUCE' ? 'strongReduce'
            : notification.eventType === 'NEW_STOCK_HOLDER' ? 'newStockHolder' : 'consensusChange']
  return { subject, label }
}

export default function GuruNotificationsPage() {
  const { locale } = useUi()
  const copy = guruNotificationsCopy(locale)
  const session = useSessionState()
  const [data, setData] = useState<Preferences | null>(null)
  const [draft, setDraft] = useState<GuruNotificationPreferences | null>(null)
  const [notifications, setNotifications] = useState<GuruNotification[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (session.authenticated !== true) return
    const controller = new AbortController()
    setData(null)
    setNotifications(null)
    setFailure(null)
    void Promise.all([
      api.GET('/api/gurus/notifications/preferences', { signal: controller.signal }),
      api.GET('/api/gurus/notifications', { params: { query: { limit: 20 } }, signal: controller.signal }),
    ]).then(([preferences, inbox]) => {
      if (controller.signal.aborted) return
      const parsedPreferences = guruNotificationPreferencesResponseSchema.safeParse(preferences.data)
      const parsedInbox = guruNotificationListResponseSchema.safeParse(inbox.data)
      if (!preferences.response.ok || !parsedPreferences.success || !inbox.response.ok || !parsedInbox.success) {
        setFailure(apiFailure(preferences.error ?? inbox.error, copy.failed))
        return
      }
      setData(parsedPreferences.data.data)
      setDraft(parsedPreferences.data.data.preferences)
      setNotifications(parsedInbox.data.data)
      setUnread(parsedInbox.data.unreadCount)
    }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, copy.failed)) })
    return () => controller.abort()
  }, [session.authenticated, session.revision, attempt, copy.failed])

  async function save() {
    if (!draft || pending) return
    setPending(true)
    setNotice('')
    setFailure(null)
    try {
      const result = await api.PUT('/api/gurus/notifications/preferences', {
        body: {
          newFiling: draft.newFiling, newPosition: draft.newPosition, exitedPosition: draft.exitedPosition,
          strongAdd: draft.strongAdd, strongReduce: draft.strongReduce, newStockHolder: draft.newStockHolder,
          consensusChange: draft.consensusChange,
          minWeightPercent: draft.minWeightPercent, minQuantityChangePercent: draft.minQuantityChangePercent,
        },
      })
      const parsed = guruNotificationPreferencesResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, copy.saveFailed)); return }
      setData(parsed.data.data)
      setDraft(parsed.data.data.preferences)
      setNotice(copy.saved)
    } catch (error) { setFailure(apiFailure(error, copy.saveFailed)) }
    finally { setPending(false) }
  }

  async function markRead() {
    if (pending) return
    setPending(true)
    try {
      const result = await api.POST('/api/gurus/notifications/read', { body: {} })
      const parsed = guruNotificationReadResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setUnread(parsed.data.data.unreadCount)
        setNotifications(current => current?.map(row => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })) ?? current)
      }
    } catch { setFailure(apiFailure(undefined, copy.failed)) }
    finally { setPending(false) }
  }

  if (session.authenticated === false) return <section className="guru-notifications-page" data-testid="guru-notifications">
    <h1>{copy.title}</h1>
    <p>{copy.signIn}</p>
    <Link to={signInPath('/gurus/notifications')}>{copy.signIn}</Link>
  </section>

  return <section className="guru-notifications-page" data-testid="guru-notifications">
    <header className="guru-notifications-header">
      <div><h1>{copy.title}</h1><p className="lede">{copy.intro}</p></div>
      <a className="secondary" href="#guru-notifications-inbox">{copy.inbox}</a>
    </header>

    <FailureNotice failure={failure} id="guru-notifications-error" messageOverride={failure?.message ?? copy.failed} />
    {failure && <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button>}
    {!data && !failure && <p role="status">{copy.loading}</p>}

    {data && draft && <>
      <section aria-labelledby="guru-notifications-preferences">
        <h2 id="guru-notifications-preferences">{copy.preferences}</h2>
        <ul className="guru-notifications-toggles">{toggleKeys.map(key => <li key={key}>
          <label>
            <input type="checkbox" checked={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.currentTarget.checked })} />
            <span>{copy.events[key]}</span>
          </label>
        </li>)}</ul>

        <h2>{copy.thresholds}</h2>
        <p className="lede">{copy.thresholdHint}</p>
        <div className="guru-notifications-thresholds">
          <label>{copy.minWeight}
            <input inputMode="decimal" value={draft.minWeightPercent ?? ''} onChange={event => setDraft({ ...draft, minWeightPercent: event.currentTarget.value.trim() === '' ? null : event.currentTarget.value.trim() })} />
          </label>
          <label>{copy.minChange}
            <input inputMode="decimal" value={draft.minQuantityChangePercent ?? ''} onChange={event => setDraft({ ...draft, minQuantityChangePercent: event.currentTarget.value.trim() === '' ? null : event.currentTarget.value.trim() })} />
          </label>
        </div>
        <div className="guru-notifications-actions">
          <button type="button" disabled={pending} onClick={() => void save()}>{copy.save}</button>
          {notice && <span role="status">{notice}</span>}
        </div>
      </section>

      <section aria-labelledby="guru-notifications-subscriptions">
        <h2 id="guru-notifications-subscriptions">{copy.following}</h2>
        <p className="lede">{copy.privacy}</p>
        {data.followedGurus.length === 0 ? <p className="guru-muted">{copy.noFollowing}</p> : <ul className="guru-notifications-chips">{data.followedGurus.map(guru => <li key={guru.slug}>
          <Link to={`/gurus/${guru.slug}`}>{guru.name}</Link>
        </li>)}</ul>}
        <h2>{copy.watching}</h2>
        {data.watchedStocks.length === 0 ? <p className="guru-muted">{copy.noWatching}</p> : <ul className="guru-notifications-chips">{data.watchedStocks.map(stock => <li key={stock.securityId}>
          {stock.symbol ? <Link to={`/stocks/${encodeURIComponent(stock.symbol)}/gurus`}>{stock.symbol}</Link> : <span>{stock.company}</span>}
        </li>)}</ul>}
      </section>

      <section aria-labelledby="guru-notifications-inbox">
        <div className="guru-notifications-inbox-heading">
          <h2 id="guru-notifications-inbox">{copy.inbox}</h2>
          <span>{copy.unread(unread)}</span>
          <button type="button" className="secondary" disabled={pending || unread === 0} onClick={() => void markRead()}>{copy.markRead}</button>
        </div>
        {!notifications ? <p role="status">{copy.loading}</p>
          : notifications.length === 0 ? <p className="guru-muted">{copy.empty}</p>
            : <ol className="guru-notifications-list">{notifications.map(notification => {
              const { subject, label } = describe(notification, copy)
              return <li key={notification.id} className={notification.readAt ? undefined : 'is-unread'}>
                <div>
                  <strong>{subject}</strong>
                  <span>{label}</span>
                </div>
                <div className="guru-notifications-detail">
                  {notification.guru && <Link to={`/gurus/${notification.guru.slug}`}>{notification.guru.name}</Link>}
                  {notification.periodEnd && <span>{copy.quarter}: {notification.periodEnd}</span>}
                  {notification.detail.quantityChangePercent !== null && <span>{formatSignedPercent(notification.detail.quantityChangePercent, locale)}</span>}
                  {notification.detail.weightPercent !== null && <span>{percent(notification.detail.weightPercent, locale)}</span>}
                  {notification.detail.holderCount !== null && <span>{copy.snapshotHolders}: {notification.detail.holderCount}</span>}
                  {notification.detail.classification && <span>{notification.detail.previousClassification ?? '—'} → {notification.detail.classification}</span>}
                  {notification.detail.sourceUrl && <a href={notification.detail.sourceUrl} target="_blank" rel="noreferrer">{notification.detail.accession ?? 'SEC'} ↗</a>}
                </div>
              </li>
            })}</ol>}
      </section>
    </>}
  </section>
}
