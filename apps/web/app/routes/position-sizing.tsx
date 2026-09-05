import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { calculatePositionSizing, positionSizingStrategies, type PositionSizingOutput, type PositionSizingRounding, type PositionSizingStrategyId } from '@diary/domain/position-sizing'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { signInPath } from '../session'
import { positionSizingCopy } from '../position-sizing-copy'
import '../position-sizing.css'

const initialValues = { capital: '', price: '', reserve: '0', symbol: '', context: '' }

function numberValue(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function translateWarning(warning: string, copy: typeof positionSizingCopy.en) {
  if (warning.startsWith('Strategy ratios total')) {
    const sum = warning.match(/total ([\d.-]+)%/)?.[1] ?? ''
    return copy.ratioWarning.replace('{sum}', sum)
  }
  if (warning.startsWith('Final batch shares')) return copy.adjustedLast
  if (warning.startsWith('Stock price')) return copy.priceHigh
  if (warning.startsWith('Available capital')) return copy.noShares
  return warning
}

export function meta() { return [{ title: 'Position sizing — diary-v3' }] }

export default function PositionSizing() {
  const { locale } = useUi()
  const copy = positionSizingCopy[locale]
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [strategyId, setStrategyId] = useState<PositionSizingStrategyId>('pyramid')
  const [roundingMode, setRoundingMode] = useState<PositionSizingRounding>('down')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const capital = numberValue(values.capital)
  const price = numberValue(values.price)
  const reserve = numberValue(values.reserve)
  const selected = positionSizingStrategies.find(strategy => strategy.id === strategyId) ?? positionSizingStrategies[0]
  const invalidInput = capital === null || price === null || reserve === null || capital <= 0 || price <= 0 || reserve < 0 || reserve > 100
  const attempted = Object.values(values).some(value => value.trim() !== '' && value !== '0')
  const output = useMemo<PositionSizingOutput | null>(() => {
    if (invalidInput || capital === null || price === null || reserve === null) return null
    try {
      return calculatePositionSizing({ capital, stockPrice: price, ratios: selected.ratios, reserveCashPercent: reserve, roundingMode })
    } catch {
      return null
    }
  }, [capital, invalidInput, price, reserve, roundingMode, selected.ratios])
  const summary = output?.summary ?? null
  const money = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const shares = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
  const markdown = summary && output ? buildMarkdown(copy, values, selected.id, selected.ratios, roundingMode, output, money, shares) : ''
  const showInvalid = attempted && !summary

  function change(field: keyof typeof values, value: string) {
    setValues(current => ({ ...current, [field]: value }))
    setCopyState('idle')
    setNotice('')
    setFailure(null)
  }

  async function copyMarkdown() {
    if (!markdown) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(markdown)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  async function saveDiary(appendToToday: boolean) {
    if (!markdown || pending) return
    setPending(true)
    setFailure(null)
    setNotice('')
    try {
      const result = await api.POST('/api/diaries', {
        body: {
          title: values.symbol.trim() ? `${copy.title} · ${values.symbol.trim().toUpperCase()}` : copy.title,
          content: markdown,
          tags: ['position-sizing'],
          appendToToday,
        },
      })
      if (result.response.ok && result.data) setNotice(copy.diarySaved)
      else setFailure(apiFailure(result.error, copy.failure))
    } catch {
      setFailure(apiFailure(null, copy.failure))
    } finally {
      setPending(false)
    }
  }

  function prepareTradePlan() {
    if (!markdown || !summary) return
    try {
      sessionStorage.setItem('tradePlanPrefill', JSON.stringify({
        symbol: values.symbol.trim().toUpperCase(),
        entryPrice: values.price,
        maxPositionSize: summary.totalInvested.toFixed(2),
        notes: markdown,
        status: 'draft',
      }))
      navigate('/trade-plans/new?prefill=position-sizing')
    } catch {
      setFailure(apiFailure(null, copy.failure))
    }
  }

  return <section className="position-sizing-page">
    <header>
      <h1>{copy.title}</h1>
      <p className="lede">{copy.intro}</p>
    </header>
    <div className="position-sizing-grid">
      <section className="position-sizing-panel" aria-labelledby="position-sizing-inputs">
        <h2 id="position-sizing-inputs">{copy.inputs}</h2>
        <div className="position-sizing-fields">
          <label>{copy.capital}<input data-testid="position-sizing-capital" type="number" min="0" step="any" value={values.capital} onChange={event => change('capital', event.target.value)} aria-invalid={showInvalid && (capital === null || capital <= 0) || undefined} /></label>
          <label>{copy.price}<input data-testid="position-sizing-price" type="number" min="0" step="any" value={values.price} onChange={event => change('price', event.target.value)} aria-invalid={showInvalid && (price === null || price <= 0) || undefined} /></label>
          <label>{copy.reserve}<input data-testid="position-sizing-reserve" type="number" min="0" max="100" step="any" value={values.reserve} onChange={event => change('reserve', event.target.value)} aria-invalid={showInvalid && (reserve === null || reserve < 0 || reserve > 100) || undefined} /><small>0–100%</small></label>
          <label>{copy.symbol}<input data-testid="position-sizing-symbol" maxLength={32} value={values.symbol} onChange={event => change('symbol', event.target.value)} /></label>
          <label>{copy.context}<textarea data-testid="position-sizing-context" rows={3} maxLength={1000} value={values.context} onChange={event => change('context', event.target.value)} /></label>
          <label className="position-sizing-strategy">{copy.strategy}<select data-testid="position-sizing-strategy" value={strategyId} onChange={event => setStrategyId(event.target.value as PositionSizingStrategyId)}>{positionSizingStrategies.map(strategy => <option key={strategy.id} value={strategy.id}>{copy.strategyNames[strategy.id]}</option>)}</select><span className="position-sizing-ratios" data-testid="position-sizing-ratios">{selected.ratios.join(' / ')} · {copy.strategyDescriptions[selected.id]}</span></label>
          <label>{copy.rounding}<select data-testid="position-sizing-rounding" value={roundingMode} onChange={event => setRoundingMode(event.target.value as PositionSizingRounding)}>{(['down', 'nearest', 'up'] as const).map(mode => <option key={mode} value={mode}>{copy.roundingNames[mode]}</option>)}</select></label>
          <small>{copy.calculateHint}</small>
        </div>
      </section>
      <section className="position-sizing-panel position-sizing-results" aria-labelledby="position-sizing-results">
        <h2 id="position-sizing-results">{copy.results}</h2>
        {!summary ? <p className={showInvalid ? 'position-sizing-error' : 'muted'} data-testid={showInvalid ? 'position-sizing-invalid' : 'position-sizing-hint'}>{showInvalid ? copy.invalid : copy.calculateHint}</p> : <>
          <dl className="position-sizing-total"><dt>{copy.invested}</dt><dd data-testid="position-sizing-invested">{money(summary.totalInvested)}</dd></dl>
          <dl className="position-sizing-summary"><div><dt>{copy.shares}</dt><dd data-testid="position-sizing-shares">{shares(summary.totalShares)}</dd></div><div><dt>{copy.averagePrice}</dt><dd>{money(summary.avgPrice)}</dd></div><div><dt>{copy.utilization}</dt><dd>{money(summary.utilizationRate)}%</dd></div></dl>
          <dl className="position-sizing-cash"><div><dt>{copy.reserveCash}</dt><dd data-testid="position-sizing-reserved">{money(summary.reservedCash)}</dd></div><div><dt>{copy.unallocatedCash}</dt><dd data-testid="position-sizing-unallocated">{money(summary.unallocatedCash)}</dd></div><div><dt>{copy.remainingCash}</dt><dd data-testid="position-sizing-remaining">{money(summary.totalRemainingCash)}</dd></div></dl>
          {summary.isOverBudget && <p className="position-sizing-overbudget" data-testid="position-sizing-overbudget">{copy.overBudget}: {money(summary.overBudgetAmount)}</p>}
          <div className="position-sizing-actions"><button type="button" data-testid="position-sizing-copy" onClick={() => void copyMarkdown()}>{copyState === 'copied' ? copy.copied : copy.copy}</button><button type="button" className="secondary" disabled={pending} data-testid="position-sizing-save-new" onClick={() => void saveDiary(false)}>{copy.saveNew}</button><button type="button" className="secondary" disabled={pending} data-testid="position-sizing-append" onClick={() => void saveDiary(true)}>{copy.appendToday}</button><button type="button" className="secondary" data-testid="position-sizing-trade-plan" onClick={prepareTradePlan}>{copy.tradePlan}</button></div>
          {notice && <p className="success" role="status">{notice}</p>}
          {copyState === 'failed' && <label className="position-sizing-markdown">{copy.savedCopyLabel}<textarea aria-label={copy.markdown} rows={8} readOnly value={markdown} onFocus={event => event.currentTarget.select()} /><small>{copy.copyFailed}</small></label>}
        </>}
        {failure && <><FailureNotice failure={failure} />{failure.code?.startsWith('AUTH_') && <a className="inline-link" href={signInPath('/tools/position-sizing')}>{copy.signIn}</a>}</>}
      </section>
    </div>
    {summary && output && <section className="position-sizing-table" aria-labelledby="position-sizing-batches"><h2 id="position-sizing-batches">{copy.batches}</h2><div className="position-sizing-table-wrap" role="region" tabIndex={0} aria-label={copy.batches}><table><thead><tr><th>{copy.ratio}</th><th>{copy.planned}</th><th>{copy.wholeShares}</th><th>{copy.actual}</th><th>{copy.cumulativeShares}</th><th>{copy.cumulativeAmount}</th></tr></thead><tbody>{output.results.map((row, index) => <tr key={`${row.ratio}-${index}`}><th scope="row">{row.ratio}%</th><td>{money(row.amount)}</td><td>{shares(row.shares)}</td><td>{money(row.actualAmount)}</td><td>{shares(row.cumulativeShares)}</td><td>{money(row.cumulativeAmount)}</td></tr>)}</tbody></table></div>{output.warnings.length > 0 && <div className="position-sizing-warnings"><h3>{copy.warning}</h3>{output.warnings.map(warning => <p key={warning}>{translateWarning(warning, copy)}</p>)}</div>}<label className="position-sizing-markdown">{copy.markdown}<textarea rows={10} readOnly value={markdown} /></label><p className="muted">{values.context.trim() || copy.calculateHint}</p></section>}
  </section>
}

function buildMarkdown(
  copy: typeof positionSizingCopy.en,
  values: typeof initialValues,
  strategyId: PositionSizingStrategyId,
  ratios: readonly number[],
  roundingMode: PositionSizingRounding,
  output: PositionSizingOutput,
  money: (value: number) => string,
  shares: (value: number) => string,
) {
  const summary = output.summary
  if (!summary) return ''
  const lines = [`# ${copy.title}${values.symbol.trim() ? ` · ${values.symbol.trim().toUpperCase()}` : ''}`, '', `${copy.capital}: ${values.capital}`, `${copy.price}: ${values.price}`, `${copy.reserve}: ${values.reserve}%`, `${copy.strategy}: ${copy.strategyNames[strategyId]} (${ratios.join(' / ')})`, `${copy.rounding}: ${copy.roundingNames[roundingMode]}`, ...(values.context.trim() ? ['', values.context.trim()] : []), '', `## ${copy.results}`, `${copy.invested}: ${money(summary.totalInvested)}`, `${copy.shares}: ${shares(summary.totalShares)}`, `${copy.averagePrice}: ${money(summary.avgPrice)}`, `${copy.reserveCash}: ${money(summary.reservedCash)}`, `${copy.unallocatedCash}: ${money(summary.unallocatedCash)}`, `${copy.remainingCash}: ${money(summary.totalRemainingCash)}`, ...(summary.isOverBudget ? [`${copy.overBudget}: ${money(summary.overBudgetAmount)}`] : []), '', `## ${copy.batches}`, `| ${copy.ratio} | ${copy.planned} | ${copy.wholeShares} | ${copy.actual} | ${copy.cumulativeShares} | ${copy.cumulativeAmount} |`, '|---:|---:|---:|---:|---:|---:|', ...output.results.map(row => `| ${row.ratio}% | ${money(row.amount)} | ${shares(row.shares)} | ${money(row.actualAmount)} | ${shares(row.cumulativeShares)} | ${money(row.cumulativeAmount)} |`)]
  if (output.warnings.length) lines.push('', `## ${copy.warning}`, ...output.warnings.map(warning => `- ${translateWarning(warning, copy)}`))
  return lines.join('\n')
}
