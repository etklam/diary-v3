import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPrivateSession, markSignedIn, sessionFetch, webSession } from '../../apps/web/app/session'

afterEach(() => { vi.restoreAllMocks(); markSignedIn() })

/**
 * The merged activity feed serves diary text, trade prices and review outcomes,
 * so it belongs to the same logout boundary as every other private read: a
 * remounted timeline must not refill itself from cookies while a sign-out is in
 * flight, and a response belonging to the previous owner must never be shown.
 */
describe('activity timeline browser session boundary', () => {
  it('blocks a remounted timeline fetch after logout', async () => {
    const transport = vi.spyOn(webSession, 'fetch').mockResolvedValue(Response.json({ data: [{ title: 'synthetic private diary' }] }))
    markSignedIn()
    clearPrivateSession()
    const response = await sessionFetch('http://localhost/api/timeline?page=1&limit=20')
    expect(response.status).toBe(401)
    expect(transport).not.toHaveBeenCalled()
  })

  it('discards an in-flight timeline response when the owner epoch changes', async () => {
    let resolve!: (response: Response) => void
    vi.spyOn(webSession, 'fetch').mockImplementation(() => new Promise<Response>(done => { resolve = done }))
    markSignedIn()
    const pending = sessionFetch('http://localhost/api/timeline')
    clearPrivateSession()
    markSignedIn()
    resolve(Response.json({ data: [{ title: 'previous-owner-synthetic-trade' }] }))
    const result = await pending
    expect(result.status).toBe(401)
    expect(await result.text()).not.toContain('previous-owner-synthetic-trade')
  })
})
