import type { ResearchDraft, ResearchSourceRecord } from '@diary/contracts'
import { formatResearchDecimal } from './render.js'

function valueAtPath(value: unknown, path: string): unknown {
  for (const key of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : []
  if (typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value)) return [Number(value)]
  if (Array.isArray(value)) return value.flatMap(numbers)
  return value && typeof value === 'object' ? Object.values(value).flatMap(numbers) : []
}
function supportedNumbersFromClaim(claim: ResearchDraft['claims'][number], evidence: { metrics: Record<string, unknown>; candidates: Record<string, unknown> }): number[] {
  return [
    ...claim.metricPaths.map(path => valueAtPath(evidence.metrics, path)),
    ...selectedCandidates(evidence.candidates, 'zoneId', claim.zoneIds),
    ...selectedCandidates(evidence.candidates, 'planId', claim.planIds),
  ].flatMap(numbers)
}
function selectedCandidates(value: unknown, key: 'zoneId' | 'planId', ids: readonly string[]): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => selectedCandidates(item, key, ids))
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  if (typeof record[key] === 'string' && ids.includes(record[key])) return [record]
  return Object.values(record).flatMap(item => selectedCandidates(item, key, ids))
}
function normalizedUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null } catch { return null }
}

function numericLiterals(value: string): Array<{ value: number; decimals: number }> {
  // Dates, indicator periods, fixed report horizons, and URLs are identifiers/context,
  // not claimed observations. Remove them before checking numeric support.
  const text = value
    .replace(/https?:\/\/[^\s<>"'\])]+/giu, '')
    .replace(/\b(?:EMA|SMA|RSI|ATR|ADX|RVOL)\s*\(?\d+\)?/giu, '')
    .replace(/\bMACD\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/giu, '')
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[ T][0-9:.+-]+Z?)?\b/giu, '')
    .replace(/\b(?:section|question|answer)\s*#?\s*\d+\b/giu, '')
    .replace(/^\s*\d{1,2}[.)]\s+/gmu, '')
    .replace(/(?<=\d)R\b/giu, ' ')
    .replace(/\b(?:5\s*[/／]\s*20|1\s*[-–]\s*20|2\s*[-–]\s*4)\s*[-–]?\s*(?:個)?(?:trading(?:\s+|-))?(?:sessions?|days?|交易日|session|週|weeks?|日)/giu, ' ')
    .replace(/\b3\s*(?:calendar\s+months?|個曆月|曆月)\b/giu, ' ')
    .replace(/\b28\s*(?:days?|日)\b/giu, ' ')
  const literals: Array<{ value: number; decimals: number }> = []
  for (const match of text.matchAll(/(?<![A-Za-z0-9_.])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][-+]?\d+)?(?![A-Za-z0-9_]|\.\d)/giu)) {
    const raw = match[0].replaceAll(',', '')
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      literals.push({ value: Number.NaN, decimals: 0 })
      continue
    }
    const [mantissa, exponentText] = raw.split(/[eE]/u)
    const exponent = Number(exponentText ?? 0)
    const decimals = Math.max(0, Math.min(9, (mantissa?.split('.')[1]?.length ?? 0) - exponent))
    literals.push({ value: parsed, decimals })
  }
  return literals
}

function decimalForComparison(value: number, decimals: number): string {
  return formatResearchDecimal(value, decimals).replaceAll(',', '')
}

function numericTextIsSupported(text: string, referenced: readonly number[]): boolean {
  return numericLiterals(text).every(literal => Number.isFinite(literal.value)
    && referenced.some(candidate => decimalForComparison(candidate, literal.decimals) === decimalForComparison(literal.value, literal.decimals)))
}

/** Mechanical consistency only. Source support, meaning and cross-section consistency still require human QA. */
export function researchOutputEvidenceIssue(draft: ResearchDraft, evidence: { sources: readonly ResearchSourceRecord[]; metrics: Record<string, unknown>; candidates: Record<string, unknown> }): string | null {
  const allowedUrls = new Set(evidence.sources.flatMap(source => [source.requestedUrl, source.resolvedUrl]).filter((url): url is string => url !== null).map(normalizedUrl))
  const texts = [draft.title, ...draft.sections.flatMap(section => [section.title, section.content]), ...draft.claims.map(claim => claim.text), ...draft.finalAnswers.flatMap(answer => [answer.question, answer.answer]), ...draft.limitations]
  for (const text of texts) {
    for (const match of text.matchAll(/https?:\/\/[^\s<>"'\])]+/gi)) {
      const url = normalizedUrl(match[0].replace(/[.,;:!?，。；：！？]+$/u, ''))
      if (!url || !allowedUrls.has(url)) return 'A report URL is not present in the frozen source registry'
    }
  }
  const referencedByClaim = new Map(draft.claims.map(claim => [claim.claimId, supportedNumbersFromClaim(claim, evidence)]))
  for (const claim of draft.claims) {
    if (!numericTextIsSupported(claim.text, referencedByClaim.get(claim.claimId) ?? [])) {
      return `Claim ${claim.claimId} contains a number absent from its cited calculation values`
    }
  }
  for (const section of draft.sections) {
    const referenced = section.claimIds.flatMap(id => referencedByClaim.get(id) ?? [])
    if (!numericTextIsSupported(section.content, referenced)) {
      return `Section ${section.section} contains a number absent from its cited frozen evidence paths`
    }
  }
  for (const answer of draft.finalAnswers) {
    const referenced = answer.claimIds.flatMap(id => referencedByClaim.get(id) ?? [])
    if (!numericTextIsSupported(`${answer.question}\n${answer.answer}`, referenced)) {
      return 'A final answer contains a number absent from its cited frozen evidence paths'
    }
  }
  return null
}
