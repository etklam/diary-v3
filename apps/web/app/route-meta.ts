import type { MetaDescriptor, MetaFunction } from 'react-router'

/**
 * Titles and descriptions for the public routes that have no loader of their
 * own. Without these every tool, the sign-in page, and the registration page
 * inherit the root title, so search results and shared links all read
 * "Trade basic — Investment decision diary".
 *
 * Copy stays English here, matching the other `meta` exports: it is search and
 * share metadata, not interface copy, and the in-page copy remains translated.
 *
 * The canonical link is relative on purpose. These pages carry transient query
 * state (a symbol, a range, a comparison) that must not fork the indexed URL,
 * and a relative href resolves against the document so no route needs a loader
 * just to learn its own origin.
 */
const PUBLIC_PAGE_META = {
  '/gurus': {
    title: 'Guru portfolios',
    description: 'Discover tracked investment managers through prepared 13F portfolio analytics, disclosed changes, and shared holdings.',
  },
  '/tools': {
    title: 'Tools',
    description: 'Public calculators and market research: position sizing, financial freedom, ETF research, market rotation, relative value, seasonality, and SEC filings.',
  },
  '/tools/etf': {
    title: 'ETF research',
    description: 'Review an ETF against a benchmark with risk, drawdown, and relative-strength measures over a chosen period.',
  },
  '/tools/market-rotation': {
    title: 'Market rotation',
    description: 'Track sector and style rotation with breadth, trend, and relative-strength readings from completed trading sessions.',
  },
  '/tools/relative-value': {
    title: 'Relative value',
    description: 'Compare two symbols as a price ratio and project corresponding prices across a scenario table.',
  },
  '/tools/seasonality': {
    title: 'Seasonality',
    description: 'Read monthly seasonal strength and volatility for a symbol from its historical closing prices.',
  },
  '/tools/sec-filings': {
    title: 'SEC filings',
    description: 'Search SEC EDGAR companies and filings, read filing details, and download bounded documents or packages.',
  },
  '/login': {
    title: 'Sign in',
    description: 'Sign in to your investment decision diary, trades, research, and reviews.',
  },
  '/register': {
    title: 'Create account',
    description: 'Create a Trade basic account to record investment decisions, trades, research evidence, and later reviews.',
  },
} as const satisfies Record<string, { title: string; description: string }>

export type PublicMetaPath = keyof typeof PUBLIC_PAGE_META

export function publicPageMeta(path: PublicMetaPath): MetaFunction {
  const { title, description } = PUBLIC_PAGE_META[path]
  return ({ location }) => {
    const descriptors: MetaDescriptor[] = [
      { title: `${title} — Trade basic` },
      { name: 'description', content: description },
      { property: 'og:title', content: `${title} — Trade basic` },
      { property: 'og:description', content: description },
      { tagName: 'link', rel: 'canonical', href: location.pathname },
    ]
    return descriptors
  }
}

/** Exposed so a test can assert every registered public route is covered. */
export const publicMetaPaths = Object.keys(PUBLIC_PAGE_META) as PublicMetaPath[]
