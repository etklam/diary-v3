/**
 * Which register a route is written in.
 *
 * `DESIGN.md`'s fifth principle has always said "Reading and working density
 * stay separate", and the app has always applied one texture to everything —
 * the same hairline, the same label-above-value, the same `--space-5` rhythm on
 * a writing surface, a figure grid and an essay alike. Ticket 120 made that
 * principle operative instead of aspirational, and added the third register the
 * product's own core surface needs.
 *
 * - **capture** — writing surfaces. The field is the subject of the page.
 * - **ledger** — tables and figure grids. The current texture, unchanged.
 * - **reading** — entries and articles. Capped measure, a real heading
 *   hierarchy, secondary modules visibly subordinate.
 *
 * Each register carries its own measure, rhythm and heading step. None of them
 * carries its own colours or its own components: the vocabulary is single, the
 * rhythm is not.
 *
 * `none` is for routes that render no page — the sitemap, robots, and redirects.
 *
 * The keys are the route paths exactly as `routes.ts` writes them, so
 * `scripts/check-register-assignment.mjs` can compare the two sets and fail
 * when a new route arrives without a register.
 */
export type Register = 'capture' | 'ledger' | 'reading'

export const ROUTE_REGISTERS: Record<string, Register | 'none'> = {
  // Public reading and the marketing surfaces.
  '': 'reading',
  about: 'reading',
  guide: 'reading',
  articles: 'ledger',
  'articles/:slug': 'reading',
  'discipline/share': 'reading',
  'design-preview': 'reading',

  // Authentication: short forms, read like capture rather than like a table.
  login: 'capture',
  register: 'capture',
  'register/complete': 'reading',
  'forgot-password': 'capture',
  'reset-password': 'capture',

  // Diary: writing, browsing, reading. The three registers meet here, which is
  // why one texture across all of them was most visible on this feature.
  'diaries/new': 'capture',
  'diaries/quick': 'capture',
  'diaries/:id/edit': 'capture',
  'diaries/:id/review': 'capture',
  'diaries/:id': 'reading',
  diaries: 'ledger',
  timeline: 'ledger',
  calendar: 'ledger',
  reviews: 'ledger',
  'reviews/ai-reports': 'ledger',
  alerts: 'ledger',
  partners: 'ledger',
  'partners/compare': 'ledger',
  discipline: 'reading',

  // Positions, plans and markets: figures in rows. The ledger register is the
  // texture these pages already had.
  stocks: 'ledger',
  'stocks/watchlist': 'ledger',
  'stocks/alerts': 'ledger',
  'stocks/:symbol': 'ledger',
  'stocks/:symbol/gurus': 'ledger',
  'stocks/:symbol/thesis': 'capture',
  'trade-plans': 'ledger',
  'trade-plans/new': 'capture',
  'trade-plans/:id': 'capture',
  'strategy-performance': 'ledger',
  gurus: 'ledger',
  'gurus/activity': 'ledger',
  'gurus/notifications': 'ledger',
  'gurus/consensus': 'ledger',
  'gurus/stocks': 'ledger',
  'gurus/sectors': 'ledger',
  'gurus/compare': 'ledger',
  'gurus/:slug': 'reading',
  'gurus/:slug/portfolio': 'ledger',
  'gurus/:slug/changes': 'ledger',
  'gurus/:slug/history': 'ledger',
  'gurus/:slug/filings': 'ledger',
  'gurus/:slug/analysis': 'reading',

  // Tools: inputs on one side, figures on the other.
  tools: 'ledger',
  'tools/etf': 'ledger',
  'tools/market-rotation': 'ledger',
  'tools/relative-value': 'ledger',
  'tools/seasonality': 'ledger',
  'tools/sec-filings': 'ledger',
  'tools/sec-filings/:cik/:accession': 'reading',
  'tools/financial-freedom': 'ledger',
  'tools/position-sizing': 'ledger',
  'etf/watchlist': 'ledger',

  // Account.
  settings: 'ledger',
  'settings/api-keys': 'ledger',
  'settings/security': 'ledger',
  achievements: 'ledger',

  // Administration is data management; the two article editors are writing.
  'admin/etf': 'ledger',
  'admin/email-settings': 'ledger',
  'admin/users': 'ledger',
  'admin/gurus': 'ledger',
  'admin/gurus/:id': 'ledger',
  'admin/institutional': 'ledger',
  'admin/institutional/filings/:id': 'ledger',
  'admin/institutional/mappings': 'ledger',
  'admin/ai': 'ledger',
  'admin/ai/report-prompts': 'ledger',
  'admin/ai/access': 'ledger',
  'admin/ai/usage': 'ledger',
  'admin/ai/prompts': 'capture',
  'admin/article-translations': 'ledger',
  'admin/research': 'ledger',
  'admin/research/new': 'capture',
  'admin/research/settings': 'ledger',
  'admin/research/:id': 'reading',
  'admin/blog': 'ledger',
  'admin/blog/new': 'capture',
  'admin/blog/:id/edit': 'capture',

  // Not pages.
  'sitemap.xml': 'none',
  'robots.txt': 'none',
  blog: 'none',
  'blog/:slug': 'none',
}

/**
 * Route patterns are matched longest-literal first, so `/diaries/new` wins over
 * `/diaries/:id` without the table having to be written in a particular order.
 */
const matchers = Object.entries(ROUTE_REGISTERS)
  .map(([pattern, register]) => ({
    pattern,
    register,
    literals: pattern.split('/').filter(segment => segment !== '' && !segment.startsWith(':')).length,
    test: new RegExp(`^/${pattern.split('/').map(segment => segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('/')}$`, 'u'),
  }))
  .sort((a, b) => b.literals - a.literals || b.pattern.length - a.pattern.length)

/** The register for a pathname, or null when nothing matches. */
export function registerFor(pathname: string): Register | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname
  const matched = matchers.find(entry => entry.test.test(path === '/' ? '/' : path))
  if (!matched || matched.register === 'none') return null
  return matched.register
}
