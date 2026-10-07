import { describe, expect, it } from 'vitest'
import { isAdminPath, isGuestPublicPath, isPublicContentPath, shellChrome } from '../../apps/web/app/shell-chrome'

describe('shell chrome selection', () => {
  it.each([
    ['/about', null, null, 'public'], ['/about', true, 'ADMIN', 'public'],
    ['/articles', true, 'USER', 'public'], ['/articles/why-a-diary', true, 'USER', 'public'],
    ['/blog', true, 'ADMIN', 'public'], ['/blog/2026-10', null, null, 'public'],
    ['/', null, null, 'public'], ['/', false, null, 'public'], ['/', true, 'USER', 'private'],
    ['/tools/relative-value', null, null, 'public'], ['/tools/relative-value', true, 'USER', 'private'],
    ['/register', null, null, 'public'], ['/reset-password', false, null, 'public'],
    ['/login', null, null, 'public'], ['/login', false, null, 'public'], ['/login', true, 'USER', 'pending'],
    ['/admin', null, null, 'pending'], ['/admin/users', true, 'USER', 'pending'], ['/admin/users', true, 'ADMIN', 'private'],
    ['/diaries/quick', null, null, 'private'], ['/diaries/quick', true, 'USER', 'private'],
    ['/timeline', null, null, 'private'], ['/settings', false, null, 'private'],
  ] as const)('puts %s at authenticated=%s role=%s in the %s chrome', (pathname, authenticated, role, expected) => {
    expect(shellChrome(pathname, authenticated, role)).toBe(expected)
  })

  // The ticket-100 invariant: the only thing an unresolved session may change
  // once it confirms is the chrome. A private address must never start public,
  // because that decision is what used to replace the routed element tree.
  it.each(['/diaries', '/diaries/quick', '/timeline', '/calendar', '/reviews', '/stocks', '/settings', '/trade-plans'])(
    'keeps %s on one chrome from the unresolved session to the confirmed one',
    pathname => {
      expect(shellChrome(pathname, null, null)).toBe('private')
      expect(shellChrome(pathname, true, 'USER')).toBe('private')
    },
  )

  it('does not claim a sibling route with a matching text prefix', () => {
    expect(isAdminPath('/administration')).toBe(false)
    expect(isGuestPublicPath('/tools-extra')).toBe(false)
    expect(isPublicContentPath('/articles-archive')).toBe(false)
    expect(shellChrome('/administration', true, 'USER')).toBe('private')
  })
})
