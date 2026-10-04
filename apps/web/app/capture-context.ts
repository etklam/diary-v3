import { calendarDateSchema, createDiaryRequestSchema } from '@diary/contracts';
import { marketSymbolSchema } from '@diary/contracts/market';

export const CAPTURE_CONTEXT_SOURCE = 'company' as const;
export const CAPTURE_QUERY_MAX_LENGTH = 256;
/** A share sheet sends a real URL and a real excerpt, so the share-carrying
 *  query needs more room than the company handoff — still bounded, and every
 *  value is bounded again on its own. */
export const CAPTURE_SHARE_QUERY_MAX_LENGTH = 4096;
export const CAPTURE_SHARE_LIMITS = { title: 300, url: 2048, text: 2000 } as const;

export type CaptureSource = typeof CAPTURE_CONTEXT_SOURCE;
export type CaptureContext = {
  source: CaptureSource;
  symbol: string;
};
export type CaptureMode = 'quick' | 'new';
/** Web Share Target payload: untrusted external text destined for the textarea. */
export type CaptureShare = { title?: string; text?: string; url?: string };
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
  share?: CaptureShare;
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

/** Shared values are literal text: keep newlines and tabs, drop every other
 *  control character, and bound the length. Never trusted markup. */
function sharedText(value: string | null, limit: number): string | undefined {
  if (value === null) return undefined;
  const cleaned = [...value].filter(character => {
    const code = character.charCodeAt(0);
    return character === '\n' || character === '\t' || (code > 0x1f && code !== 0x7f);
  }).join('').trim();
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

/** A shared URL is only kept when it is a real http(s) address. */
function sharedUrl(value: string | null): string | undefined {
  const cleaned = sharedText(value, CAPTURE_SHARE_LIMITS.url);
  if (!cleaned) return undefined;
  try {
    const url = new URL(cleaned);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString().slice(0, CAPTURE_SHARE_LIMITS.url) : undefined;
  } catch {
    return undefined;
  }
}

/** The writing-area seed a share produces: title and source, then the excerpt. */
export function composeSharedContent(share: CaptureShare | undefined): string {
  if (!share) return '';
  const { title, text, url } = share;
  const head = [title, url && url !== title ? url : undefined].filter(Boolean).join('\n');
  const body = text && text !== url && text !== title ? text : '';
  return [head, body].filter(Boolean).join('\n\n');
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
  if (malformedPercentEncoding(raw)) return { context: null, issue: 'invalid-encoding' };
  const shareKeys = ['title', 'text', 'url'];
  const shared = shareKeys.some(key => params.has(key));
  if (raw.length > (shared ? CAPTURE_SHARE_QUERY_MAX_LENGTH : CAPTURE_QUERY_MAX_LENGTH)) return { context: null, issue: 'query-too-long' };
  if (hasDuplicate(params)) return { context: null, issue: 'duplicate-query' };

  const keys = [...params.keys()];
  if (keys.some(key => key !== 'symbol' && key !== 'source' && key !== 'date' && !shareKeys.includes(key))) {
    return { context: null, issue: 'unknown-query' };
  }
  const share: CaptureShare = {};
  const title = sharedText(params.get('title'), CAPTURE_SHARE_LIMITS.title);
  const text = sharedText(params.get('text'), CAPTURE_SHARE_LIMITS.text);
  // Some share sheets put the link in `text` and send no `url` at all.
  const url = sharedUrl(params.get('url')) ?? (params.get('url') === null ? sharedUrl(params.get('text')) : undefined);
  if (title) share.title = title;
  if (text) share.text = text;
  if (url) share.url = url;
  const sharePart = Object.keys(share).length ? { share } : {};

  const symbolValue = params.get('symbol');
  const sourceValue = params.get('source');
  const dateValue = params.get('date');
  const date = dateValue && calendarDateSchema.safeParse(dateValue).success ? dateValue : undefined;
  const dateIssue = dateValue !== null && date === undefined;
  const hasSymbol = symbolValue !== null;
  const hasSource = sourceValue !== null;

  if (hasSymbol !== hasSource) {
    return { context: null, ...(date ? { date } : {}), ...sharePart, issue: 'incomplete-context' };
  }
  if (hasSource && sourceValue !== CAPTURE_CONTEXT_SOURCE) {
    return { context: null, ...(date ? { date } : {}), ...sharePart, issue: 'invalid-source' };
  }

  const symbol = hasSymbol ? normalizeDiarySymbol(symbolValue ?? '') : null;
  if (hasSymbol && !symbol) {
    return { context: null, ...(date ? { date } : {}), ...sharePart, issue: 'invalid-symbol' };
  }

  return {
    context: symbol ? { source: CAPTURE_CONTEXT_SOURCE, symbol } : null,
    ...(date ? { date } : {}),
    ...sharePart,
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

export function buildCapturePath(mode: CaptureMode, context?: CaptureContext | null, date?: string, share?: CaptureShare): string {
  const params = new URLSearchParams();
  const normalized = normalizeCaptureContext(context);
  if (normalized) {
    params.set('symbol', normalized.symbol);
    params.set('source', normalized.source);
  }
  if (date && calendarDateSchema.safeParse(date).success) params.set('date', date);
  // Shared values round-trip through the same validated surface, so a share that
  // arrives signed out survives the sign-in return path.
  if (share?.title) params.set('title', share.title.slice(0, CAPTURE_SHARE_LIMITS.title));
  if (share?.text) params.set('text', share.text.slice(0, CAPTURE_SHARE_LIMITS.text));
  if (share?.url) params.set('url', share.url.slice(0, CAPTURE_SHARE_LIMITS.url));
  const query = params.toString();
  return `/diaries/${mode}${query ? `?${query}` : ''}`;
}

export function buildCompanyPath(context: CaptureContext | null | undefined): string | null {
  const normalized = normalizeCaptureContext(context);
  return normalized ? `/stocks/${encodeURIComponent(normalized.symbol)}` : null;
}

/** Canonicalize an in-site editor destination for auth return handling. */
export function safeCaptureReturnPath(candidate: string | null): string | null {
  if (!candidate || candidate.length > CAPTURE_SHARE_QUERY_MAX_LENGTH + 64 || candidate.includes('\\') || candidate.includes('#') || hasUnsafeControl(candidate) || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
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
  return buildCapturePath(url.pathname === '/diaries/quick' ? 'quick' : 'new', parsed.context, parsed.date, parsed.share);
}
