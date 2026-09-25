import {
  researchSourceRecordSchema,
  type ResearchDraft,
  type ResearchEvidence,
  type ResearchSourceRecord,
} from '@diary/contracts'
import { sourcePermissionIsVerifiedAllowed } from './source-policy.js'

type RenderEvidence = Pick<ResearchEvidence, 'manifest' | 'metrics' | 'candidates' | 'sources' | 'quality'>

const METRICS = [
  ['latest.close', '正規收市', 2, ''],
  ['latest.ema10', 'EMA10', 4, ''],
  ['latest.ema20', 'EMA20', 4, ''],
  ['latest.sma50', 'SMA50', 4, ''],
  ['latest.sma200', 'SMA200', 4, ''],
  ['latest.sma30Week', '完成週線 SMA30', 4, ''],
  ['latest.rsi14', 'RSI14', 2, ''],
  ['latest.macd', 'MACD', 4, ''],
  ['latest.macdSignal', 'MACD Signal', 4, ''],
  ['latest.macdHistogram', 'MACD Histogram', 4, ''],
  ['latest.atr14', 'ATR14', 4, ''],
  ['latest.atrPct', 'ATR%', 2, '%'],
  ['latest.plusDi14', '+DI14', 2, ''],
  ['latest.minusDi14', '-DI14', 2, ''],
  ['latest.adx14', 'ADX14', 2, ''],
  ['latest.bollingerMid', 'Bollinger 中軌', 4, ''],
  ['latest.bollingerUpper', 'Bollinger 上軌', 4, ''],
  ['latest.bollingerLower', 'Bollinger 下軌', 4, ''],
  ['latest.bollingerWidthPct', 'Bollinger 寬度', 2, '%'],
  ['latest.rvol20', 'RVOL20', 2, '×'],
] as const

const RELATIVE_STRENGTH_LIMIT = 60
const SOURCE_LIMIT = 50

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function valueAtPath(value: unknown, path: string): unknown {
  for (const key of path.split('.')) {
    const record = object(value)
    if (!Object.hasOwn(record, key)) return undefined
    value = record[key]
  }
  return value
}

function decimalParts(value: unknown): { negative: boolean; digits: bigint; shift: number } | null {
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const raw = String(value)
  if (raw.length > 120) return null
  const match = raw.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/u)
  if (!match) return null
  const exponent = Number(match[4] ?? 0)
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 120) return null
  const fraction = match[3] ?? ''
  const digits = BigInt(`${match[2]}${fraction}`)
  return { negative: match[1] === '-', digits, shift: exponent - fraction.length }
}

/** Format decimal evidence with deterministic half-away-from-zero rounding. */
export function formatResearchDecimal(value: unknown, places: number): string {
  if (!Number.isInteger(places) || places < 0 || places > 9) return 'N/A'
  const parsed = decimalParts(value)
  if (!parsed) return 'N/A'
  const shift = parsed.shift + places
  let rounded: bigint
  if (shift >= 0) {
    if (shift > 120) return 'N/A'
    rounded = parsed.digits * (10n ** BigInt(shift))
  } else {
    if (shift < -120) return parsed.digits === 0n ? (places ? `0.${'0'.repeat(places)}` : '0') : 'N/A'
    const divisor = 10n ** BigInt(-shift)
    const quotient = parsed.digits / divisor
    const remainder = parsed.digits % divisor
    rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n)
  }
  const fixed = rounded.toString().padStart(places + 1, '0')
  const whole = places > 0 ? fixed.slice(0, -places) : fixed
  const fraction = places > 0 ? `.${fixed.slice(-places)}` : ''
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  const sign = parsed.negative && rounded !== 0n ? '-' : ''
  return `${sign}${grouped}${fraction}`
}

function cleanCell(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ').replace(/\p{Cc}/gu, ' ').trim()
}

/** Escape untrusted text before placing it into a Markdown table or link label. */
export function escapeResearchMarkdownCell(value: string): string {
  return cleanCell(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\\', '\\\\')
    .replace(/([|`*_()!])/gu, '\\$1')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

function isDiscoverySource(source: ResearchSourceRecord): boolean {
  return source.sourceId === 'TAVILY_SEARCH'
    || /(?:^|[_.-])(?:search|discovery)(?:$|[_.-])/iu.test(source.purpose)
    || /discovery_only/iu.test(source.evidenceLocator ?? '')
}

function publicationPermissionVerified(source: ResearchSourceRecord): boolean {
  const permission = source.use.publicationOfAnalysisAndExcerpts
  return sourcePermissionIsVerifiedAllowed(permission)
    && Boolean(permission.basis && safeHttpsUrl(permission.basis))
}

function publicCitationUrl(source: ResearchSourceRecord): string | null {
  if (isDiscoverySource(source) || !publicationPermissionVerified(source) || !source.retrievedAt) return null
  const candidate = source.resolvedUrl === null ? source.requestedUrl : source.resolvedUrl
  return safeHttpsUrl(candidate)
}

function isBlsHosted(source: ResearchSourceRecord): boolean {
  if (!source.retrievedAt || !source.resolvedUrl) return false
  try {
    const hostname = new URL(source.resolvedUrl).hostname.toLowerCase()
    return hostname === 'bls.gov' || hostname.endsWith('.bls.gov')
  } catch { return false }
}

/** Keep source identifiers for claim validation while allowing links only for verified public citations. */
export function researchReportCitationSources(sources: readonly ResearchSourceRecord[]): ResearchSourceRecord[] {
  return sources.map(source => {
    const url = publicCitationUrl(source)
    return { ...source, requestedUrl: url, resolvedUrl: url }
  })
}

function cell(value: string): string {
  return escapeResearchMarkdownCell(value.slice(0, 500)) || 'N/A'
}

function numericCell(value: unknown, places: number, suffix = ''): string {
  const formatted = formatResearchDecimal(value, places)
  return formatted === 'N/A' ? formatted : `${formatted}${suffix}`
}

function metricTable(metrics: Record<string, unknown>): string {
  const rows = METRICS.map(([path, label, places, suffix]) => {
    const value = valueAtPath(metrics, path)
    return `| ${cell(label)} | \`${path}\` | ${numericCell(value, places, suffix)} |`
  })
  const missing = METRICS.filter(([path]) => formatResearchDecimal(valueAtPath(metrics, path), 2) === 'N/A').map(([path]) => `\`${path}\``)
  const limitation = missing.length
    ? `\n\n缺值欄位以 N/A 保留：${missing.join('、')}。這些值未包含在凍結快照中，不能由報告補算。`
    : ''
  return [
    '| 指標 | 凍結 metric path | 數值 |',
    '| --- | --- | ---: |',
    ...rows,
  ].join('\n') + limitation
}

function relativeStrengthTable(metrics: Record<string, unknown>): string | null {
  const rows = Array.isArray(metrics.relativeStrength) ? metrics.relativeStrength.slice(0, RELATIVE_STRENGTH_LIMIT) : []
  if (!rows.length) return null
  const rendered = rows.map((item, index) => {
    const record = object(item)
    const benchmark = typeof record.benchmark === 'string' && /^[A-Z0-9.-]{1,20}$/u.test(record.benchmark) ? record.benchmark : 'N/A'
    const window = ['5_session', '20_session', '3_calendar_month'].includes(String(record.window)) ? String(record.window) : 'N/A'
    const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : 'N/A'
    const path = `relativeStrength[${index}]`
    return `| ${cell(benchmark)} | ${cell(window)} | ${date(record.startDate)} | ${date(record.endDate)} | ${numericCell(record.targetReturnPct, 2, '%')} | ${numericCell(record.benchmarkReturnPct, 2, '%')} | ${numericCell(record.outperformancePp, 2, ' pp')} | \`${path}\` |`
  })
  return [
    '### 相對強弱',
    '',
    '| Benchmark | 窗口 | 起日 | 迄日 | 標的回報 | Benchmark 回報 | 差異 | metric path |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | --- |',
    ...rendered,
  ].join('\n')
}

function zoneSummary(value: unknown): string {
  const zone = object(value)
  const zoneId = typeof zone.zoneId === 'string' && /^[A-Za-z0-9_.+-]{1,80}$/u.test(zone.zoneId) ? cell(zone.zoneId) : null
  const lower = formatResearchDecimal(zone.lower, 2)
  const upper = formatResearchDecimal(zone.upper, 2)
  if (!zoneId || lower === 'N/A' || upper === 'N/A') return 'N/A'
  return `${zoneId} (${lower}–${upper})`
}

function riskReward(value: unknown): string {
  const formatted = formatResearchDecimal(value, 2)
  return formatted === 'N/A' ? formatted : `${formatted} R`
}

function planSection(planId: 'breakout' | 'pullback', evidence: unknown): string {
  const candidates = object(evidence)
  const plans = Array.isArray(candidates.tradePlans) ? candidates.tradePlans : []
  const plan = plans.map(object).find(candidate => candidate.planId === planId)
  const status = plan?.status === 'WATCH' ? 'WATCH' : plan?.status === 'N_A' ? 'N/A' : 'N/A'
  const mid = object(plan?.midRewardRisk)
  const conservative = object(plan?.conservativeRewardRisk)
  const fixed = (key: string, value: string) => `| ${key} | ${value} |`
  const facts = [
    fixed('計劃 ID', `\`${planId}\``),
    fixed('狀態', status === 'WATCH' ? 'WATCH — 條件候選，非可執行建議' : 'N/A — 凍結快照沒有可用候選'),
    fixed('入場區', zoneSummary(plan?.entry)),
    fixed('結構止損區', zoneSummary(plan?.structuralStop)),
    fixed('目標 1 區', zoneSummary(plan?.target1)),
    fixed('目標 2 區', zoneSummary(plan?.target2)),
    fixed('Mid R/R (T1 / T2)', `${riskReward(mid.target1)} / ${riskReward(mid.target2)}`),
    fixed('Conservative R/R (T1 / T2)', `${riskReward(conservative.target1)} / ${riskReward(conservative.target2)}`),
    fixed('有效至', typeof plan?.validUntilSession === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(plan.validUntilSession) ? plan.validUntilSession : 'N/A'),
    fixed('倉位／訂單', 'N/A — 未建立股數或執行訂單'),
    fixed('限制', plan && typeof plan.reason === 'string' ? cell(plan.reason) : '沒有可用的凍結候選資料。'),
  ]
  const details = plan && plan.status === 'WATCH'
    ? [
      ['觸發條件', plan.trigger],
      ['確認條件', plan.confirmation],
      ['失效條件', plan.invalidation],
    ].filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].trim().length > 0)
      .map(([label, text]) => `- ${label}：${cell(text)}`)
    : []
  return [
    `#### ${planId}`,
    '',
    '| 欄位 | 凍結計劃值 |',
    '| --- | --- |',
    ...facts,
    ...(details.length ? ['', ...details] : []),
  ].join('\n')
}

function sourceTable(sources: readonly ResearchSourceRecord[]): string {
  const unique = new Map<string, ResearchSourceRecord>()
  for (const source of sources) if (!unique.has(source.sourceId)) unique.set(source.sourceId, source)
  const rows = [...unique.values()].slice(0, SOURCE_LIMIT).map(source => {
    const parsed = researchSourceRecordSchema.safeParse(source)
    if (!parsed.success) return `| N/A | N/A — invalid frozen source record; link withheld. |`
    const record = parsed.data
    if (isDiscoverySource(record)) {
      return `| ${cell(record.sourceId)} | N/A — discovery metadata is not a reviewed evidence citation. |`
    }
    const href = publicCitationUrl(record)
    const retrievedAt = record.retrievedAt
    if (!href || !retrievedAt) {
      return `| ${cell(record.sourceId)} | N/A — public link withheld because HTTPS, verified publication permission, or retrieval timestamp is unavailable. |`
    }
    const label = `${record.publisher ?? ''}${record.publisher && record.title ? ' — ' : ''}${record.title ?? ''}`.trim() || record.sourceId
    const checkedAt = record.use.publicationOfAnalysisAndExcerpts.checkedAt!
    const citation = `[${cell(label)}](<${href}>) (source ID: \`${cell(record.sourceId)}\`; retrieved ${cell(retrievedAt)}; publication-use policy checked ${cell(checkedAt)}).`
    return `| ${cell(record.sourceId)} | ${citation} |`
  })
  if (!rows.length) rows.push('| N/A | N/A — no frozen source records are available for public citation. |')
  if (unique.size > SOURCE_LIMIT) rows.push(`| N/A | ${unique.size - SOURCE_LIMIT} additional source records omitted from this bounded report table. |`)
  return [
    '| Source ID | Public citation or limitation |',
    '| --- | --- |',
    ...rows,
  ].join('\n')
}

function evidencePreamble(evidence: RenderEvidence): string {
  const { manifest, metrics, quality } = evidence
  const symbol = typeof metrics.symbol === 'string' && /^[A-Z0-9.-]{1,20}$/u.test(metrics.symbol) ? metrics.symbol : 'N/A'
  const calculatorVersion = typeof metrics.calculatorVersion === 'string' && /^[A-Za-z0-9._-]{1,80}$/u.test(metrics.calculatorVersion) ? metrics.calculatorVersion : 'N/A'
  const missing = manifest.missingSessions.length
    ? `${manifest.missingSessions.slice(0, 10).join(', ')}${manifest.missingSessions.length > 10 ? ` … (${manifest.missingSessions.length} total)` : ''}`
    : 'N/A'
  const warnings = manifest.warnings.slice(0, 5).map(warning => `- ${cell(warning)}`)
  if (manifest.warnings.length > 5) warnings.push(`- ${manifest.warnings.length - 5} additional warnings omitted.`)
  const adjustmentLimitation = manifest.normalizationVersion === 'split_only'
    ? 'Adjusted close is incomplete; cash-dividend adjustment is unavailable.'
    : manifest.normalizationVersion === 'unavailable'
      ? 'N/A — no supported adjustment basis is available.'
      : 'N/A'
  return [
    `**標的：** ${cell(symbol)} · **Reference session：** ${manifest.referenceSession ?? 'N/A'} · **As of (UTC)：** ${manifest.asOf}`,
    `**資料口徑：** ${cell(manifest.normalizationVersion)} · **資料品質：** ${quality} · **顯示時區：** ${cell(manifest.displayTimezone)} · **交易所時區：** ${cell(manifest.exchangeTimezone)}`,
    `**覆蓋：** ${manifest.rowCount} rows；完整 OHLC ${manifest.completeOhlcRows}；close ${manifest.closeRows}；recent volume ${manifest.volumeRows}；target ${manifest.targetSessions} sessions。Calendar：${cell(manifest.calendarVersion ?? 'N/A')}；calculator：${cell(calculatorVersion)}。`,
    `**Missing sessions：** ${cell(missing)}。**調整限制：** ${cell(adjustmentLimitation)}`,
    `**Synthetic evidence：** ${manifest.synthetic ? 'YES — offline fixture; not publishable.' : 'NO'}`,
    '**Evidence warnings:**',
    ...(warnings.length ? warnings : ['- N/A']),
  ].join('\n\n')
}

function metricSection(metrics: Record<string, unknown>): string {
  return ['### API 白名單指標', '', '以下指標直接取自凍結快照；缺值保留為 N/A。', '', metricTable(metrics)].join('\n')
}

function planFacts(candidates: Record<string, unknown>): string {
  return [
    '### API 凍結候選計劃',
    '',
    'R/R 值直接取自凍結候選資料，僅作顯示格式化；WATCH 不是下單或可執行建議。',
    '',
    planSection('breakout', candidates),
    '',
    planSection('pullback', candidates),
  ].join('\n')
}

function sourceAppendix(sources: readonly ResearchSourceRecord[]): string {
  const blsDisclaimer = sources.some(isBlsHosted)
    ? '\n\nBLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.'
    : ''
  return [
    '### 公開來源引用',
    '',
    '只列出來源登錄中通過 HTTPS、publication permission、HTTPS policy basis、check timestamp 與 retrieval timestamp 驗證的連結；原始證據與 discovery leads 留在管理員證據檢視。',
    '',
    sourceTable(sources) + blsDisclaimer,
  ].join('\n')
}

/** Render the model narrative together with server-owned facts from a validated frozen snapshot. */
export function renderResearchReport(draft: ResearchDraft, evidence: RenderEvidence): string {
  const metrics = object(evidence.metrics)
  const candidates = object(evidence.candidates)
  const relativeStrength = relativeStrengthTable(metrics)
  const sections = [...draft.sections].sort((a, b) => a.section - b.section)
    .map(section => {
      const additions = section.section === 5
        ? `\n\n${metricSection(metrics)}`
        : section.section === 6 && relativeStrength
          ? `\n\n${relativeStrength}`
          : section.section === 9
            ? `\n\n${planFacts(candidates)}`
            : ''
      return `## ${section.section}. ${section.title}\n\n${section.content}${additions}`
    }).join('\n\n')
  const answers = draft.finalAnswers.map((answer, index) => `${index + 1}. ${answer.question}\n${answer.answer}`).join('\n\n')
  const limitations = draft.limitations.length > 0 ? `\n\n## Limitations\n\n${draft.limitations.map(item => `- ${item}`).join('\n')}` : ''
  return `# ${draft.title}\n\n${evidencePreamble(evidence)}\n\n${sections}\n\n## Final answers\n\n${answers}${limitations}\n\n${sourceAppendix(evidence.sources)}`
}
