import { describe, expect, it } from 'vitest'
import { pageTitle } from '../../apps/web/app/page-title'
import { resolveAccountRecoverySupportUrl } from '../../apps/web/app/account-recovery-support.server'

describe('browser page titles', () => {
  it('uses localized visible headings on ordinary routes', () => {
    expect(pageTitle('/tools', 'zh-TW', '工具')).toBe('工具 — Trade basic')
    expect(pageTitle('/tools', 'zh-CN', '工具')).toBe('工具 — Trade basic')
    expect(pageTitle('/tools', 'en', 'Tools')).toBe('Tools — Trade basic')
    expect(pageTitle('/articles/trade-basic-story', 'en', 'Trade basic changed my process')).toBe('Trade basic changed my process — Trade basic')
  })

  it('uses generic titles for private dynamic content while preserving public content titles', () => {
    expect(pageTitle('/diaries/123', 'en', 'Private investment thesis')).toBe('Diary — Trade basic')
    expect(pageTitle('/diaries/123/edit', 'zh-TW', 'Private investment thesis')).toBe('編輯日記 — Trade basic')
    expect(pageTitle('/articles/member-article', 'en', 'Public member-article teaser')).toBe('Public member-article teaser — Trade basic')
    expect(pageTitle('/discipline/share', 'zh-TW', '公開分享標題')).toBe('公開分享標題 — Trade basic')
    expect(pageTitle('/admin/research/run-123', 'zh-CN', 'Private research title')).toBe('研究执行 — Trade basic')
  })

  it('keeps static create routes titled from their visible headings', () => {
    expect(pageTitle('/diaries/new', 'en', 'New diary')).toBe('New diary — Trade basic')
    expect(pageTitle('/trade-plans/new', 'en', 'New trade plan')).toBe('New trade plan — Trade basic')
    expect(pageTitle('/stocks/watchlist', 'en', 'Watchlist')).toBe('Watchlist — Trade basic')
  })

  it('falls back to a localized application title when the route has no heading', () => {
    expect(pageTitle('/unknown', 'en', null)).toBe('Investment decision diary — Trade basic')
  })
})

describe('password recovery support URL', () => {
  it('accepts HTTPS pages and plain mailto contacts', () => {
    expect(resolveAccountRecoverySupportUrl(' https://help.example.test/account ')).toBe('https://help.example.test/account')
    expect(resolveAccountRecoverySupportUrl('mailto:support@example.test')).toBe('mailto:support@example.test')
  })

  it('rejects unsafe, malformed, or credential-bearing URLs', () => {
    expect(resolveAccountRecoverySupportUrl(undefined)).toBeNull()
    expect(resolveAccountRecoverySupportUrl('javascript:alert(1)')).toBeNull()
    expect(resolveAccountRecoverySupportUrl('http://help.example.test')).toBeNull()
    expect(resolveAccountRecoverySupportUrl('https://user:pass@help.example.test')).toBeNull()
    expect(resolveAccountRecoverySupportUrl('mailto:support@example.test?subject=help')).toBeNull()
    expect(resolveAccountRecoverySupportUrl('mailto:support%0d%0a@example.test')).toBeNull()
    expect(resolveAccountRecoverySupportUrl('https://help.example.test/\ninvalid')).toBeNull()
  })
})
