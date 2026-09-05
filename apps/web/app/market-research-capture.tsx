import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { type StockTimelineSourceType } from '@diary/contracts/stock-timeline-source'
import { stockTimelineRecordSchema } from '@diary/contracts/evidence'
import { diaryResponseSchema } from '@diary/contracts'
import { api, useUi } from './ui'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import { signInPath, useSessionState } from './session'

const copy = {
  en: { capture: 'Capture this read', title: 'Research capture', summary: 'Editable observation', save: 'Save', saved: 'Saved.', login: 'Sign in to save this read.', retry: 'Try again', source: 'Source', destination: 'Destination', evidence: 'Evidence timeline', diaryAppend: 'Diary · append to today', diaryNew: 'Diary · create a new entry', hint: 'Keep the displayed calculation as immutable evidence or an explicitly chosen diary entry.' },
  'zh-TW': { capture: '保存這次讀法', title: '研究捕捉', summary: '可編輯觀察', save: '保存', saved: '已保存。', login: '登入後保存這次讀法。', retry: '重試', source: '來源', destination: '目的地', evidence: '證據時間線', diaryAppend: '日記・追加到今天', diaryNew: '日記・建立新一篇', hint: '可將目前顯示的計算保存為不可變證據，或明確選擇日記目的地。' },
  'zh-CN': { capture: '保存这次读法', title: '研究捕捉', summary: '可编辑观察', save: '保存', saved: '已保存。', login: '登录后保存这次读法。', retry: '重试', source: '来源', destination: '目的地', evidence: '证据时间线', diaryAppend: '日记・追加到今天', diaryNew: '日记・创建新一篇', hint: '可将目前显示的计算保存为不可变证据，或明确选择日记目的地。' },
} as const

type Props = {
  symbol?: string
  sourceType: Extract<StockTimelineSourceType, 'RELATIVE_VALUE' | 'SEASONALITY' | 'SEC_FILING'>
  sourceTitle: string
  suggestedSummary: string
  metadata: Record<string, unknown>
  sourceUrl?: string
  allowCompanyEvidence?: boolean
  allowDiaryCapture?: boolean
}

function evidenceSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase().replace(/^\^/u, '')
  return /^[A-Z0-9.]{1,32}$/u.test(normalized) ? normalized : null
}

export function MarketResearchCapture({ symbol, sourceType, sourceTitle, suggestedSummary, metadata, sourceUrl, allowCompanyEvidence = true, allowDiaryCapture = true }: Props) {
  const { locale } = useUi()
  const c = copy[locale]
  const session = useSessionState()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState(suggestedSummary)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [destination, setDestination] = useState<'evidence' | 'diary-append' | 'diary-new'>(allowCompanyEvidence ? 'evidence' : 'diary-append')
  const [error, setError] = useState<Failure | null>(null)
  const target = evidenceSymbol(symbol ?? '')
  const [capture, setCapture] = useState<{ symbol: string | null; sourceType: Props['sourceType']; sourceTitle: string; sourceUrl?: string; metadata: Record<string, unknown>; occurredAt: string; idempotencyKey: string } | null>(null)

  function toggleCapture() {
    if (open) { setOpen(false); setCapture(null); return }
    const nextDestination = allowCompanyEvidence ? 'evidence' : 'diary-append'
    setDestination(nextDestination)
    setSummary(suggestedSummary)
    setSaved(false)
    setError(null)
    setCapture({ symbol: target, sourceType, sourceTitle, sourceUrl, metadata: { ...metadata }, occurredAt: new Date().toISOString(), idempotencyKey: crypto.randomUUID() })
    setOpen(true)
  }

  if (session.authenticated !== true) return <p className="market-capture-login">{c.login} <Link to={signInPath(location.pathname)}>{locale === 'en' ? 'Sign in' : locale === 'zh-CN' ? '登录' : '登入'}</Link></p>
  async function save() {
    if (!capture || (destination === 'evidence' && (!capture.symbol || !allowCompanyEvidence)) || !summary.trim() || pending) return
    setPending(true)
    setSaved(false)
    setError(null)
    try {
      if (destination === 'evidence') {
        const result = await api.POST('/api/stocks/{symbol}/evidence', {
          params: { path: { symbol: capture.symbol! } },
          body: { summary: summary.trim(), sourceType: capture.sourceType, sourceTitle: capture.sourceTitle, sourceUrl: capture.sourceUrl ?? null, occurredAt: capture.occurredAt, idempotencyKey: capture.idempotencyKey, metadataJson: JSON.stringify(capture.metadata) },
        })
        const parsed = stockTimelineRecordSchema.safeParse(result.data)
        if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, c.retry))
        else setSaved(true)
      } else {
        const result = await api.POST('/api/diaries', {
          body: { title: capture.sourceTitle, content: summary.trim(), tags: [capture.sourceType.toLowerCase()], stockSymbols: [], appendToToday: destination === 'diary-append' },
        })
        const parsed = diaryResponseSchema.safeParse(result.data)
        if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, c.retry))
        else setSaved(true)
      }
    } catch {
      setError(apiFailure(null, c.retry))
    } finally {
      setPending(false)
    }
  }

  return <section className="market-capture" aria-label={c.title}>
    <div className="market-heading"><div><h2>{c.title}</h2><p className="muted">{c.hint}</p></div><button type="button" className="secondary" onClick={toggleCapture}>{c.capture}</button></div>
    {open && capture && <div className="market-capture-form"><label>{c.source}<input readOnly value={`${capture.sourceType} · ${capture.sourceTitle}`} /></label>{allowDiaryCapture && <label>{c.destination}<select value={destination} onChange={event => setDestination(event.target.value as 'evidence' | 'diary-append' | 'diary-new')}><option value="diary-append">{c.diaryAppend}</option><option value="diary-new">{c.diaryNew}</option>{allowCompanyEvidence && capture.symbol && <option value="evidence">{c.evidence}</option>}</select></label>}{!allowDiaryCapture && <p className="muted">{c.evidence}</p>}<label>{c.summary}<textarea rows={8} value={summary} onChange={event => setSummary(event.target.value)} /></label><button type="button" disabled={pending || !summary.trim() || (destination === 'evidence' && !capture.symbol)} onClick={() => void save()}>{pending ? '…' : c.save}</button>{saved && <p role="status">{c.saved}</p>}{error && <><FailureNotice failure={error}/><button type="button" className="secondary" onClick={() => void save()}>{c.retry}</button></>}</div>}
  </section>
}
