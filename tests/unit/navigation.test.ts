import { describe, expect, it } from 'vitest'
import { navigationOwner } from '../../apps/web/app/nav'
import { defaultWorkspacePath } from '../../apps/web/app/session'

describe('workspace navigation ownership', () => {
  it.each([
    ['/diaries', 'diary'], ['/diaries/quick', 'diary'], ['/diaries/42', 'diary'], ['/diaries/42/edit', 'diary'],
    ['/timeline', 'timeline'], ['/calendar', 'calendar'], ['/partners/compare', 'timeline'],
    ['/reviews', 'reviews'], ['/diaries/42/review', 'reviews'], ['/partners', 'partners'],
    ['/stocks', 'holdings'], ['/strategy-performance', 'holdings'], ['/stocks/watchlist', 'watchlist'],
    ['/stocks/alerts', 'priceReminders'], ['/stocks/AAPL', 'marketResearch'], ['/stocks/AAPL/thesis', 'marketResearch'],
    ['/tools', 'tools'], ['/tools/sec-filings/123/0000000000-00-000000', 'tools'], ['/etf/watchlist', 'tools'],
    ['/settings', 'settings'], ['/settings/security', 'settings'], ['/settings/api-keys', 'settings'],
    ['/admin/blog', 'adminBlog'], ['/admin/blog/new', 'adminBlog'], ['/admin/blog/42/edit', 'adminBlog'],
    ['/admin/users', 'adminUsers'], ['/admin/gurus', 'adminGurus'], ['/admin/gurus/42', 'adminGurus'], ['/admin/etf', 'adminEtf'],
    // The AI administration views are one navigation destination with five
    // task-scoped addresses; the sidebar must not gain an item per view.
    ['/admin/ai', 'adminAi'], ['/admin/ai/report-prompts', 'adminAi'], ['/admin/ai/access', 'adminAi'],
    ['/admin/ai/usage', 'adminAi'], ['/admin/ai/prompts', 'adminAi'],
    ['/diaries/42/review/', 'reviews'], ['/partners/compare/', 'timeline'], ['/stocks/watchlist/', 'watchlist'],
    ['/stocks/NVDA/', 'marketResearch'], ['/trade-plans/42/', 'tradePlans'],
  ] as const)('maps %s to exactly %s', (path, owner) => {
    expect(navigationOwner(path)).toBe(owner)
  })

  it('does not claim a sibling route with a matching text prefix', () => {
    expect(navigationOwner('/trade-plans-extra')).toBeNull()
  })
})

describe('default workspace destination', () => {
  it.each([
    ['diaries', '/diaries'], ['timeline', '/timeline'], ['calendar', '/calendar'],
    [undefined, '/timeline'], ['unsupported', '/timeline'],
  ] as const)('maps %s to %s', (page, path) => {
    expect(defaultWorkspacePath(page)).toBe(path)
  })
})
