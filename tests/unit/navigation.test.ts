import { describe, expect, it } from 'vitest'
import { navigationOwner } from '../../apps/web/app/nav'

describe('workspace navigation ownership', () => {
  it.each([
    ['/diaries', 'diary'], ['/diaries/42', 'diary'], ['/diaries/42/edit', 'diary'],
    ['/timeline', 'diary'], ['/calendar', 'diary'], ['/partners/compare', 'diary'],
    ['/reviews', 'reviews'], ['/diaries/42/review', 'reviews'], ['/partners', 'partners'],
    ['/stocks', 'holdings'], ['/strategy-performance', 'holdings'], ['/stocks/watchlist', 'watchlist'],
    ['/stocks/alerts', 'priceReminders'], ['/stocks/AAPL', 'marketResearch'], ['/stocks/AAPL/thesis', 'marketResearch'],
    ['/tools', 'tools'], ['/tools/sec-filings/123/0000000000-00-000000', 'tools'], ['/etf/watchlist', 'tools'],
    ['/settings', 'settings'], ['/settings/security', 'settings'], ['/settings/api-keys', 'settings'],
    ['/admin/blog', 'adminBlog'], ['/admin/blog/new', 'adminBlog'], ['/admin/blog/42/edit', 'adminBlog'],
    ['/admin/users', 'adminUsers'], ['/admin/etf', 'adminEtf'],
  ] as const)('maps %s to exactly %s', (path, owner) => {
    expect(navigationOwner(path)).toBe(owner)
  })
})
