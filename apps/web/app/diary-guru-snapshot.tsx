import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { diaryGuruSnapshotListResponseSchema, diaryGuruSnapshotResponseSchema, type DiaryGuruSnapshot } from '@diary/contracts'
import { percent } from './guru-format'
import { guruNotificationsCopy } from './guru-notifications-copy'
import { api, useUi } from './ui'
import './routes/guru-notifications.css'
import { formatDay } from './market-display';

/**
 * Decision-time Guru context attached to one diary entry. The stored snapshot is
 * immutable, so a later quarter or analytics rebuild cannot rewrite what the
 * author saw.
 */
export function DiaryGuruSnapshots({ diaryId, symbols }: { diaryId: string; symbols: readonly string[] }) {
  const { locale } = useUi()
  const copy = guruNotificationsCopy(locale)
  const [snapshots, setSnapshots] = useState<DiaryGuruSnapshot[] | null>(null)
  const [symbol, setSymbol] = useState(symbols[0] ?? '')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void api.GET('/api/diaries/{id}/guru-snapshots', { params: { path: { id: diaryId } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = diaryGuruSnapshotListResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setSnapshots(parsed.data.data)
      else setSnapshots([])
    }).catch(() => { if (!controller.signal.aborted) setSnapshots([]) })
    return () => controller.abort()
  }, [diaryId])

  async function attach() {
    if (pending || !/^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/.test(symbol)) return
    setPending(true)
    setNotice('')
    setFailed(false)
    try {
      const result = await api.POST('/api/diaries/{id}/guru-snapshots', { params: { path: { id: diaryId } }, body: { symbol: symbol.toUpperCase() } })
      const parsed = diaryGuruSnapshotResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailed(true); return }
      setNotice(parsed.data.reused ? copy.snapshotReused : '')
      setSnapshots(current => {
        const next = parsed.data.data
        const rest = (current ?? []).filter(row => row.id !== next.id)
        return [next, ...rest]
      })
    } catch { setFailed(true) }
    finally { setPending(false) }
  }

  return <section className="diary-guru-snapshots" aria-labelledby={`diary-guru-snapshots-${diaryId}`}>
    <h2 id={`diary-guru-snapshots-${diaryId}`}>{copy.snapshotTitle}</h2>
    <p className="lede">{copy.snapshotIntro}</p>
    <div className="diary-guru-snapshot-form">
      <label>{copy.snapshotSymbol}
        <input value={symbol} onChange={event => setSymbol(event.currentTarget.value.toUpperCase())} placeholder="MSFT" />
      </label>
      <button type="button" className="secondary" disabled={pending || symbol === ''} onClick={() => void attach()}>{copy.snapshotAttach}</button>
      {notice && <span role="status">{notice}</span>}
      {failed && <span role="alert">{copy.snapshotFailed}</span>}
    </div>
    {snapshots === null ? <p role="status">{copy.loading}</p>
      : snapshots.length === 0 ? <p className="guru-muted">{copy.snapshotEmpty}</p>
        : <ul className="diary-guru-snapshot-list">{snapshots.map(snapshot => <li key={snapshot.id}>
          <div>
            <Link to={`/stocks/${encodeURIComponent(snapshot.symbol)}/gurus?period=${snapshot.periodEnd}`}>{snapshot.symbol}</Link>
            <span> · {copy.quarter} {snapshot.periodEnd}</span>
          </div>
          <dl>
            <div><dt>{copy.snapshotHolders}</dt><dd>{snapshot.holderCount}</dd></div>
            <div><dt>{copy.snapshotNet}</dt><dd>{snapshot.context.consensus?.netBuyerCount ?? '—'}</dd></div>
            <div><dt>{copy.snapshotWeight}</dt><dd>{percent(snapshot.context.consensus?.averagePortfolioWeightPercent ?? null, locale)}</dd></div>
            <div><dt>{copy.snapshotCaptured}</dt><dd>{formatDay(snapshot.capturedAt)}</dd></div>
          </dl>
        </li>)}</ul>}
    <p className="diary-guru-snapshot-source">{copy.snapshotSource}</p>
  </section>
}
