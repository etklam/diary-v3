import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBlocker, useSearchParams } from 'react-router'
import { createPriceAlertRequestSchema, PRICE_ALERT_MOVING_AVG_PERIODS, priceAlertTypeSchema, priceAlertListResponseSchema, updatePriceAlertRequestSchema, type CreatePriceAlertRequest, type PriceAlertResponse, type UpdatePriceAlertRequest } from '@diary/contracts/price-alerts'
import { api, useUi } from '../ui'
import { useSessionState, signInPath } from '../session'
import { FailureNotice, apiFailure, type Failure } from '../api-error'
import { priceAlertCopy } from '../price-alert-copy'
import '../trade-plan.css'

type PriceAlertType = typeof priceAlertTypeSchema._output
type MovingAverageDirection = 'above' | 'below'

function conditionLabel(row: PriceAlertResponse, copy: typeof priceAlertCopy.en) {
 if (row.type === 'PRICE_ABOVE') return copy.above
 if (row.type === 'PRICE_BELOW') return copy.below
 if (row.type === 'CHANGE_PERCENT') return copy.percent
 const template = row.movingAverageDirection === 'below' ? copy.movingAverageBelow : copy.movingAverageAbove
 return template.replace('{period}', String(Number(row.threshold)))
}

export default function PriceAlerts() {
 const { locale, t } = useUi(), c = priceAlertCopy[locale], session = useSessionState(), [params] = useSearchParams()
 const [rows, setRows] = useState<PriceAlertResponse[] | null>(null), [error, setError] = useState<Failure | null>(null), [attempt, retry] = useState(0), [timezone, setTimezone] = useState('UTC')
 const [symbol, setSymbol] = useState(params.get('symbol') ?? ''), [type, setType] = useState<PriceAlertType>('PRICE_ABOVE'), [threshold, setThreshold] = useState(''), [direction, setDirection] = useState<MovingAverageDirection>('above'), [message, setMessage] = useState('')
 const [editing, setEditing] = useState<string | null>(null), [pending, setPending] = useState(false), [writeError, setWriteError] = useState<Failure | null>(null), [notice, setNotice] = useState('')
 const priceInput = useRef<HTMLInputElement>(null), periodInput = useRef<HTMLSelectElement>(null)
 const editingRow = editing ? rows?.find(row => row.id === editing) : undefined
 const formType = editingRow?.type ?? type
 const dirty = useRef(false), mutation = useRef<AbortController | null>(null), translate = useRef(t); translate.current = t
 const blocker = useBlocker(() => dirty.current && session.authenticated !== false)

 useEffect(() => {
  if (!editing) return
  if (editingRow?.type === 'MOVING_AVG') periodInput.current?.focus()
  else priceInput.current?.focus()
 }, [editing, editingRow?.type])
 useEffect(() => { if (blocker.state === 'blocked') { if (window.confirm(c.discard)) blocker.proceed(); else blocker.reset() } }, [blocker, c.discard])
 useEffect(() => { const leave = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', leave); return () => { mutation.current?.abort(); window.removeEventListener('beforeunload', leave) } }, [])
 useEffect(() => {
  const controller = new AbortController(); setError(null)
  Promise.all([api.GET('/api/stocks/alerts', { signal: controller.signal }), api.GET('/api/auth/me', { signal: controller.signal })]).then(([result, user]) => {
   if (controller.signal.aborted) return
   const parsed = priceAlertListResponseSchema.safeParse(result.data)
   if (!result.response.ok || !parsed.success || !user.data) { setError(apiFailure(result.error ?? user.error, translate.current('failed'))); return }
   setRows(parsed.data); setTimezone(user.data.data.timezone)
  }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))) })
  return () => controller.abort()
 }, [attempt])

 function clearForm() { dirty.current = false; setEditing(null); setThreshold(formType === 'MOVING_AVG' && !editing ? '20' : ''); setDirection('above'); setMessage(''); setWriteError(null) }

 async function save(event: FormEvent) {
  event.preventDefault(); if (pending) return
  let request: { kind: 'update'; id: string; body: UpdatePriceAlertRequest } | { kind: 'create'; body: CreatePriceAlertRequest }
  if (editing) {
   const body = updatePriceAlertRequestSchema.safeParse({ threshold, message, ...(formType === 'MOVING_AVG' ? { movingAverageDirection: direction } : {}) })
   if (!body.success) { setWriteError({ message: c.invalid, fields: [] }); return }
   request = { kind: 'update', id: editing, body: body.data }
  } else {
   const body = createPriceAlertRequestSchema.safeParse({ symbol, type, threshold, message, ...(type === 'MOVING_AVG' ? { movingAverageDirection: direction } : {}) })
   if (!body.success) { setWriteError({ message: c.invalid, fields: [] }); return }
   request = { kind: 'create', body: body.data }
  }
  setPending(true); setWriteError(null); setNotice(''); const controller = new AbortController(); mutation.current = controller
  try {
   const result = request.kind === 'update'
    ? await api.PUT('/api/stocks/alerts/{id}', { params: { path: { id: request.id } }, body: request.body, signal: controller.signal })
    : await api.POST('/api/stocks/alerts', { body: request.body, signal: controller.signal })
   if (controller.signal.aborted) return
   if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return }
   clearForm(); setNotice(c.success); retry(value => value + 1); window.dispatchEvent(new Event('diary-price-alerts-changed'))
  } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection'))) }
  finally { if (!controller.signal.aborted) setPending(false) }
 }

 async function changeState(id: string, remove: boolean) {
  if (pending) return
  setPending(true); setWriteError(null); setNotice(''); const controller = new AbortController(); mutation.current = controller
  try {
   const result = remove ? await api.DELETE('/api/stocks/alerts/{id}', { params: { path: { id } }, signal: controller.signal }) : await api.PUT('/api/stocks/alerts/{id}', { params: { path: { id } }, body: { isTriggered: false, triggeredAt: null }, signal: controller.signal })
   if (controller.signal.aborted) return
   if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return }
   setNotice(remove ? c.deleted : c.success); retry(value => value + 1); window.dispatchEvent(new Event('diary-price-alerts-changed'))
  } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection'))) }
  finally { if (!controller.signal.aborted) setPending(false) }
 }

 const thresholdLabel = formType === 'CHANGE_PERCENT' ? c.percentThreshold : formType === 'MOVING_AVG' ? c.period : c.priceThreshold
 const thresholdUnit = formType === 'CHANGE_PERCENT' ? c.percentUnit : formType === 'MOVING_AVG' ? c.periodUnit : c.priceUnit
 const thresholdHelp = formType === 'CHANGE_PERCENT' ? c.percentHelp : formType === 'MOVING_AVG' ? c.movingAverageHelp : undefined
 return <section className="plan-page"><h1>{c.title}</h1><p className="lede">{c.intro}</p><p>{c.scope}</p>{error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/stocks/alerts')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : rows === null ? <p role="status">{t('loading')}</p> : <>
  <form className="plan-form" onSubmit={save}><fieldset disabled={pending}><legend>{editing ? `${c.edit} ${editingRow?.symbol ?? ''}` : c.create}</legend><div className="plan-grid">
   {!editing && <><label>{c.symbol}<input aria-label={c.symbol} required maxLength={32} value={symbol} onChange={event => { dirty.current = true; setSymbol(event.target.value) }}/></label><label>{c.type}<select aria-label={c.type} value={type} onChange={event => { const next = priceAlertTypeSchema.parse(event.target.value); dirty.current = true; setType(next); if (next === 'MOVING_AVG' && !(PRICE_ALERT_MOVING_AVG_PERIODS as readonly string[]).includes(threshold)) setThreshold('20') }}><option value="PRICE_ABOVE">{c.above}</option><option value="PRICE_BELOW">{c.below}</option><option value="CHANGE_PERCENT">{c.percent}</option><option value="MOVING_AVG">{c.movingAverage}</option></select></label></>}
   <label>{thresholdLabel}{formType === 'MOVING_AVG' ? <select ref={periodInput} aria-label={c.period} required value={threshold} onChange={event => { dirty.current = true; setThreshold(event.target.value) }}><option value="">—</option>{PRICE_ALERT_MOVING_AVG_PERIODS.map(period => <option key={period} value={period}>{period}</option>)}</select> : <input ref={priceInput} aria-label={thresholdLabel} required inputMode="decimal" value={threshold} onChange={event => { dirty.current = true; setThreshold(event.target.value) }}/>}<span className="muted">{thresholdUnit}</span>{thresholdHelp && <small id="price-alert-threshold-help">{thresholdHelp}</small>}</label>
   {formType === 'MOVING_AVG' && <label>{c.direction}<select aria-label={c.direction} value={direction} onChange={event => { dirty.current = true; setDirection(event.target.value as MovingAverageDirection) }}><option value="above">{c.above}</option><option value="below">{c.below}</option></select></label>}
   <label className="plan-wide">{c.message}<textarea aria-label={c.message} rows={2} maxLength={500} value={message} onChange={event => { dirty.current = true; setMessage(event.target.value) }}/></label>
  </div><p>{c.rearmHint}</p><div className="actions"><button type="submit">{pending ? t('pending') : editing ? c.save : c.create}</button>{editing && <button className="secondary" type="button" onClick={clearForm}>{c.cancel}</button>}</div></fieldset></form>
  <FailureNotice failure={writeError}/>{notice && <p role="status">{notice}</p>}<p className="muted">{c.timezone}: {timezone}</p>{!rows.length ? <p>{c.empty}</p> : <ul className="plan-list">{rows.map(row => <li key={row.id} data-testid="price-reminder"><header className="plan-header"><h2><Link to={`/stocks/${row.symbol}`}>{row.symbol}</Link> · {conditionLabel(row, c)} {row.type === 'CHANGE_PERCENT' ? `${row.threshold}%` : row.type === 'MOVING_AVG' ? '' : row.threshold}</h2><span>{row.isTriggered ? c.triggered : c.armed}</span></header><p style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{row.message}</p>{row.triggeredAt && <p><time dateTime={row.triggeredAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(row.triggeredAt))}</time></p>}<div className="actions"><button className="secondary" disabled={pending || editing !== null || dirty.current} onClick={() => { setEditing(row.id); setThreshold(row.type === 'MOVING_AVG' ? String(Number(row.threshold)) : row.threshold); setDirection(row.movingAverageDirection ?? 'above'); setMessage(row.message); setWriteError(null) }}>{c.edit}</button>{row.isTriggered && <button className="secondary" disabled={pending || editing !== null} onClick={() => void changeState(row.id, false)}>{c.rearm}</button>}<button className="secondary" disabled={pending || editing !== null} onClick={() => void changeState(row.id, true)}>{c.remove}</button></div></li>)}</ul>}
 </>}</section>
}
