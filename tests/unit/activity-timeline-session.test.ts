import { afterEach, describe, expect, it, vi } from 'vitest'
import { DECORATIVE_READ_HEADER, clearPrivateSession, isLocallySignedOut, markSignedIn, sessionFetch, webSession } from '../../apps/web/app/session'

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

/**
 * The review-count badge is requested from the shell on every authenticated
 * page. A 401 on that decorative read must not end the session, or a background
 * count could discard whatever the reader was in the middle of writing.
 */
describe('decorative background reads', () => {
  it('does not sign the reader out when the badge count is unauthorized', async () => {
    vi.spyOn(webSession, 'fetch').mockResolvedValue(Response.json({ data: { code: 'AUTH_UNAUTHORIZED' } }, { status: 401 }))
    markSignedIn()
    const response = await sessionFetch('http://localhost/api/reviews?limit=1', {
      headers: { [DECORATIVE_READ_HEADER]: '1' },
    })
    // The caller still learns the read failed; the session simply survives it.
    expect(response.status).toBe(401)
    expect(isLocallySignedOut()).toBe(false)
  })

  it('still signs the reader out when the review queue itself is unauthorized', async () => {
    vi.spyOn(webSession, 'fetch').mockResolvedValue(Response.json({ data: { code: 'AUTH_UNAUTHORIZED' } }, { status: 401 }))
    markSignedIn()
    const response = await sessionFetch('http://localhost/api/reviews?limit=1')
    expect(response.status).toBe(401)
    expect(isLocallySignedOut()).toBe(true)
  })
})
