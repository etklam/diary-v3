import { articleLocaleSchema, serializedIdSchema } from '@diary/contracts';
import { safeCaptureReturnPath } from './capture-context';

/**
 * Where sign-in is allowed to send someone back to.
 *
 * Only known internal destinations are accepted, so no candidate can become an
 * external redirect and no unexpected query string survives. The cost of that
 * guarantee is that an unlisted route silently collapses to the fallback, which
 * is why `tests/unit/return-paths.test.ts` walks `routes.ts` and fails when a
 * private route is neither listed here nor declared as a non-destination.
 */
export const RETURN_FALLBACK = '/diaries/new';

/** Exact paths with no parameters and no accepted query string. */
const EXACT_RETURN_PATHS = new Set([
  // Diary, review, and planning surfaces.
  '/diaries', '/timeline', '/calendar', '/reviews', '/reviews/ai-reports', '/achievements',
  '/discipline', '/alerts', '/partners', '/partners/compare',
  // Portfolio and market surfaces. `/stocks/alerts` is listed rather than left
  // to the symbol pattern below, which would accept it only by coincidence.
  '/stocks', '/stocks/watchlist', '/stocks/alerts', '/etf/watchlist', '/strategy-performance',
  // Public reading index; the article detail has its own locale-aware rule.
  '/articles',
  // Public tools, which keep their inputs through a sign-in round trip.
  '/tools', '/tools/etf', '/tools/financial-freedom', '/tools/market-rotation',
  '/tools/position-sizing', '/tools/relative-value', '/tools/seasonality', '/tools/sec-filings',
  // Account.
  '/settings', '/settings/api-keys', '/settings/security',
  // Administration.
  '/admin/etf', '/admin/users', '/admin/gurus', '/admin/ai', '/admin/ai/prompts', '/admin/email-settings',
  '/admin/institutional', '/admin/institutional/mappings',
  '/admin/article-translations', '/admin/research', '/admin/research/new',
  '/admin/research/settings', '/admin/blog', '/admin/blog/new',
  // Guru research surfaces. Each one is a reading destination a member returns to.
  '/gurus', '/gurus/activity', '/gurus/consensus', '/gurus/stocks', '/gurus/sectors', '/gurus/compare', '/gurus/notifications',
]);

/**
 * Parameterized or query-bearing destinations. Each entry owns the exact query
 * shape it accepts; anything else falls through to the fallback.
 */
const PATTERN_RETURN_PATHS: readonly RegExp[] = [
  // A review continuation must keep the session that identifies the queue.
  /^\/(?:diaries\/[1-9]\d*\/review|stocks\/[A-Za-z0-9.]{1,32}\/thesis)\?reviewSession=[a-f0-9-]{36}$/,
  // Partner comparison keeps only the allowlisted selection and limit.
  /^\/partners\/compare\?partnerId=[1-9]\d{0,18}$/,
  /^\/partners\/compare\?partnerId=[1-9]\d{0,18}&limit=(?:20|40|60)$/,
  /^\/partners\/compare\?limit=(?:20|40|60)&partnerId=[1-9]\d{0,18}$/,
  /^\/partners\/compare\?limit=(?:20|40|60)$/,
  /^\/discipline\?import=[A-Za-z0-9%+/=]+$/,
  /^\/trade-plans(?:\/(?:new|[1-9]\d*))?$/,
  /^\/stocks\/[A-Za-z0-9.]{1,32}(?:\/thesis)?$/,
  /^\/tools\/sec-filings\/\d{1,10}\/\d{10}-\d{2}-\d{6}$/,
  /^\/admin\/research\/[^/]+$/,
  /^\/admin\/gurus\/[1-9]\d*$/,
  /^\/admin\/institutional\/filings\/[1-9]\d*$/,
  /^\/gurus\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:portfolio|changes|history|filings|analysis))?$/,
  /^\/stocks\/[A-Za-z0-9.]{1,32}\/gurus$/,
  /^\/diaries\/(?:new|quick|[1-9]\d*(?:\/(?:edit|review))?)$/,
];

function safeArticleReturnPath(candidate: string | null): string | null {
  const match = candidate?.match(/^\/articles\/([^/?#]+)(?:\?([^#]*))?$/);
  if (!candidate || !match) return null;
  try {
    const url = new URL(candidate, 'https://article-return.invalid');
    if (url.origin !== 'https://article-return.invalid') return null;
    const slug = decodeURIComponent(match[1]!);
    if (!/^[\p{Letter}\p{Number}-]+$/u.test(slug)) return null;
    if ([...url.searchParams.keys()].some(key => key !== 'lang')) return null;
    const locales = url.searchParams.getAll('lang');
    if (locales.length > 1) return null;
    const locale = locales[0] === undefined ? undefined : articleLocaleSchema.safeParse(locales[0]);
    if (locale && !locale.success) return null;
    return `/articles/${encodeURIComponent(slug)}${locale?.success ? `?lang=${locale.data}` : ''}`;
  } catch {
    return null;
  }
}

function adminBlogEditPath(candidate: string | null): string | null {
  const match = candidate?.match(/^\/admin\/blog\/([^/]+)\/edit$/);
  return match && serializedIdSchema.safeParse(match[1]).success ? candidate : null;
}

/** The editor may return to the record it was opened from, and nowhere else. */
function diaryEditorContinuationPath(candidate: string | null): string | null {
  const match = candidate?.match(/^\/diaries\/([1-9]\d*)\/edit\?returnTo=([^#]+)(#review-schedule)?$/);
  if (!match) return null;
  try {
    const diaryId = match[1];
    const target = decodeURIComponent(match[2]!);
    return target === `/diaries/${diaryId}` || target === `/diaries/${diaryId}/review` ? candidate : null;
  } catch {
    // Keep the safe default for a malformed continuation value.
    return null;
  }
}

export function safeReturnPath(candidate: string | null): string {
  if (!candidate) return RETURN_FALLBACK;
  if (EXACT_RETURN_PATHS.has(candidate)) return candidate;
  if (PATTERN_RETURN_PATHS.some(pattern => pattern.test(candidate))) return candidate;
  const capturePath = safeCaptureReturnPath(candidate);
  if (capturePath) return capturePath;
  return safeArticleReturnPath(candidate)
    ?? adminBlogEditPath(candidate)
    ?? diaryEditorContinuationPath(candidate)
    ?? RETURN_FALLBACK;
}

/** A query string of ordinary URL-safe characters, or nothing at all. */
const PLAIN_QUERY = /^\?[A-Za-z0-9_\-.~%=&+,:]*$/;

/**
 * The destination rule used when writing and reading a `returnTo` value.
 *
 * Administration list pages carry filter, status, and pagination state that is
 * worth keeping across a sign-in, so their query string survives — but only
 * once the path itself has passed `safeReturnPath`. Writer and reader share
 * this function so a link this app produces is never rejected by the page that
 * consumes it.
 */
export function safeAuthReturnPath(candidate: string | null): string {
  if (candidate?.startsWith('/admin/')) {
    const separator = candidate.search(/[?#]/);
    const pathname = separator === -1 ? candidate : candidate.slice(0, separator);
    const query = separator === -1 || candidate[separator] === '#' ? '' : candidate.slice(separator);
    if (safeReturnPath(pathname) === pathname && (query === '' || PLAIN_QUERY.test(query))) return `${pathname}${query}`;
  }
  return safeReturnPath(candidate);
}
