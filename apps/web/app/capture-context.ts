import { calendarDateSchema, createDiaryRequestSchema } from '@diary/contracts';
import { marketSymbolSchema } from '@diary/contracts/market';

export const CAPTURE_CONTEXT_SOURCE = 'company' as const;
export const CAPTURE_QUERY_MAX_LENGTH = 256;

export type CaptureSource = typeof CAPTURE_CONTEXT_SOURCE;
export type CaptureContext = {
  source: CaptureSource;
  symbol: string;
};
export type CaptureMode = 'quick' | 'new';
export type CaptureContextIssue =
  | 'duplicate-query'
  | 'incomplete-context'
  | 'invalid-date'
  | 'invalid-encoding'
  | 'invalid-source'
  | 'invalid-symbol'
  | 'query-too-long'
  | 'unknown-query';

export type CaptureContextParse = {
  context: CaptureContext | null;
  date?: string;
  issue: CaptureContextIssue | null;
};

type SearchInput = URL | URLSearchParams | string;

function normalizeDiarySymbol(value: string): string | null {
  const market = marketSymbolSchema.safeParse(value);
  if (!market.success) return null;
  const parsed = createDiaryRequestSchema.shape.stockSymbols.safeParse([market.data]);
  return parsed.success && parsed.data?.length === 1 ? parsed.data[0] ?? null : null;
}

function malformedPercentEncoding(value: string): boolean {
  try {
    decodeURIComponent(value);
    return false;
  } catch {
    return true;
  }
}

function hasUnsafeControl(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function searchFor(input: SearchInput): { raw: string; params: URLSearchParams } {
  if (input instanceof URLSearchParams) {
    const raw = input.toString();
    return { raw, params: new URLSearchParams(raw) };
  }
  if (input instanceof URL) {
    const raw = input.search.slice(1);
    return { raw, params: new URLSearchParams(raw) };
  }
  if (input.startsWith('?')) {
    const raw = input.slice(1);
    return { raw, params: new URLSearchParams(raw) };
  }
  try {
    const url = new URL(input, 'https://diary.local');
    const raw = url.search.slice(1);
    return { raw, params: new URLSearchParams(raw) };
  } catch {
    return { raw: input, params: new URLSearchParams() };
  }
}

function hasDuplicate(params: URLSearchParams): boolean {
  return [...new Set(params.keys())].some(key => params.getAll(key).length > 1);
}

/** Parse the small, allowlisted handoff query without accepting private state. */
export function parseCaptureContext(input: SearchInput): CaptureContextParse {
  const { raw, params } = searchFor(input);
  if (raw.length > CAPTURE_QUERY_MAX_LENGTH) return { context: null, issue: 'query-too-long' };
  if (malformedPercentEncoding(raw)) return { context: null, issue: 'invalid-encoding' };
  if (hasDuplicate(params)) return { context: null, issue: 'duplicate-query' };

  const keys = [...params.keys()];
  if (keys.some(key => key !== 'symbol' && key !== 'source' && key !== 'date')) {
    return { context: null, issue: 'unknown-query' };
  }

  const symbolValue = params.get('symbol');
  const sourceValue = params.get('source');
  const dateValue = params.get('date');
  const date = dateValue && calendarDateSchema.safeParse(dateValue).success ? dateValue : undefined;
  const dateIssue = dateValue !== null && date === undefined;
  const hasSymbol = symbolValue !== null;
  const hasSource = sourceValue !== null;

  if (hasSymbol !== hasSource) {
    return { context: null, ...(date ? { date } : {}), issue: 'incomplete-context' };
  }
  if (hasSource && sourceValue !== CAPTURE_CONTEXT_SOURCE) {
    return { context: null, ...(date ? { date } : {}), issue: 'invalid-source' };
  }

  const symbol = hasSymbol ? normalizeDiarySymbol(symbolValue ?? '') : null;
  if (hasSymbol && !symbol) {
    return { context: null, ...(date ? { date } : {}), issue: 'invalid-symbol' };
  }

  return {
    context: symbol ? { source: CAPTURE_CONTEXT_SOURCE, symbol } : null,
    ...(date ? { date } : {}),
    issue: dateIssue ? 'invalid-date' : null,
  };
}

export function normalizeCaptureContext(context: CaptureContext | null | undefined): CaptureContext | null {
  if (!context || context.source !== CAPTURE_CONTEXT_SOURCE) return null;
  const symbol = normalizeDiarySymbol(context.symbol);
  return symbol ? { source: CAPTURE_CONTEXT_SOURCE, symbol } : null;
}

export function captureContextForCompanySymbol(symbol: string): CaptureContext | null {
  return normalizeCaptureContext({ source: CAPTURE_CONTEXT_SOURCE, symbol });
}

export function buildCapturePath(mode: CaptureMode, context?: CaptureContext | null, date?: string): string {
  const params = new URLSearchParams();
  const normalized = normalizeCaptureContext(context);
  if (normalized) {
    params.set('symbol', normalized.symbol);
    params.set('source', normalized.source);
  }
  if (date && calendarDateSchema.safeParse(date).success) params.set('date', date);
  const query = params.toString();
  return `/diaries/${mode}${query ? `?${query}` : ''}`;
}

export function buildCompanyPath(context: CaptureContext | null | undefined): string | null {
  const normalized = normalizeCaptureContext(context);
  return normalized ? `/stocks/${encodeURIComponent(normalized.symbol)}` : null;
}

/** Canonicalize an in-site editor destination for auth return handling. */
export function safeCaptureReturnPath(candidate: string | null): string | null {
  if (!candidate || candidate.length > 512 || candidate.includes('\\') || candidate.includes('#') || hasUnsafeControl(candidate) || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
  const queryStart = candidate.indexOf('?');
  const rawPath = queryStart < 0 ? candidate : candidate.slice(0, queryStart);
  if (rawPath !== '/diaries/quick' && rawPath !== '/diaries/new') return null;
  let url: URL;
  try {
    url = new URL(candidate, 'https://diary.local');
  } catch {
    return null;
  }
  if (url.origin !== 'https://diary.local' || (url.pathname !== '/diaries/quick' && url.pathname !== '/diaries/new')) return null;
  const parsed = parseCaptureContext(url);
  if (parsed.issue && parsed.issue !== 'invalid-date') return null;
  return buildCapturePath(url.pathname === '/diaries/quick' ? 'quick' : 'new', parsed.context, parsed.date);
}
