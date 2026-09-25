import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPrivateSession, markSignedIn, safeReturnPath, sessionFetch, webSession } from '../../apps/web/app/session'

afterEach(() => { vi.restoreAllMocks(); markSignedIn() })

describe('AI browser session boundary', () => {
  it.each(['/reviews/ai-reports', '/admin/ai'])('preserves only the exact private return path %s', path => {
    expect(safeReturnPath(path)).toBe(path)
    expect(safeReturnPath(`${path}?next=https://outside.example`)).toBe('/diaries/new')
    expect(safeReturnPath(`//outside.example${path}`)).toBe('/diaries/new')
  })

  it.each(['/api/ai/reports/42', '/api/admin/ai/settings', '/api/v2/diaries/42'])('blocks a remounted private fetch after logout: %s', async path => {
    const transport = vi.spyOn(webSession, 'fetch').mockResolvedValue(Response.json({ privateBody: 'synthetic' }))
    markSignedIn()
    clearPrivateSession()
    expect((await sessionFetch(`http://localhost${path}`)).status).toBe(401)
    expect(transport).not.toHaveBeenCalled()
  })

  it.each(['/api/ai/reports/42', '/api/v2/diaries/42'])('discards an in-flight private response when the owner epoch changes: %s', async path => {
    let resolve!: (response: Response) => void
    vi.spyOn(webSession, 'fetch').mockImplementation(() => new Promise<Response>(done => { resolve = done }))
    markSignedIn()
    const pending = sessionFetch(`http://localhost${path}`)
    clearPrivateSession()
    markSignedIn()
    resolve(Response.json({ privateBody: 'previous-owner-synthetic-report' }))
    const result = await pending
    expect(result.status).toBe(401)
    expect(await result.text()).not.toContain('previous-owner-synthetic-report')
  })
})
