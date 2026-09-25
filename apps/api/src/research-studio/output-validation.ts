import type { ResearchDraft, ResearchSourceRecord } from '@diary/contracts'

function valueAtPath(value: unknown, path: string): unknown {
  for (const key of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : []
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return [Number(value)]
  if (Array.isArray(value)) return value.flatMap(numbers)
  return value && typeof value === 'object' ? Object.values(value).flatMap(numbers) : []
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
  for (const claim of draft.claims.filter(item => item.type === 'computed')) {
    const referenced = [
      ...claim.metricPaths.map(path => valueAtPath(evidence.metrics, path)),
      ...selectedCandidates(evidence.candidates, 'zoneId', claim.zoneIds),
      ...selectedCandidates(evidence.candidates, 'planId', claim.planIds),
    ].flatMap(numbers)
    // Indicator periods and calendar labels are identifiers, not computed observations.
    const text = claim.text.replace(/\b(?:EMA|SMA|RSI|ATR|ADX|RVOL)\s*\(?\d+\)?/gi, '')
      .replace(/\bMACD\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi, '')
      .replace(/\b\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+Z?)?\b/g, '')
      .replace(/(?<=\d)R\b/gi, ' ')
    for (const match of text.matchAll(/(?<![A-Za-z0-9_.])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][-+]?\d+)?(?![A-Za-z0-9_]|\.\d)/g)) {
      const literal = match[0].replaceAll(',', '')
      const value = Number(literal)
      const decimals = Math.min(9, literal.split('.')[1]?.split(/[eE]/)[0]?.length ?? 0)
      const supported = referenced.some(candidate => Number(candidate.toFixed(decimals)) === value || Math.abs(candidate - value) <= Number.EPSILON * Math.max(1, Math.abs(candidate)))
      if (!Number.isFinite(value) || !supported) return `Computed claim ${claim.claimId} contains a number absent from its cited calculation values`
    }
  }
  return null
}
