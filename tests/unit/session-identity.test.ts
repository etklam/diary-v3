import { afterEach, describe, expect, it, vi } from 'vitest'

type SessionModule = typeof import('../../apps/web/app/session')

// The session store is module state, so each scenario starts from a fresh
// import rather than from whatever the previous one published.
async function freshSession(): Promise<SessionModule> {
  vi.resetModules()
  return import('../../apps/web/app/session')
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('session content identity', () => {
  it('confirming the session the page already loaded under is not an identity change', async () => {
    const session = await freshSession()
    expect(session.getSessionRevision()).toBe(0)
    expect(session.getSessionIdentity()).toBe(0)
    session.markSignedIn()
    // The revision still advances: account caches key off it. The in-flight
    // read guard keys off the identity instead, so a read that was issued
    // before this confirmation is still answered (see account-session-fetch).
    expect(session.getSessionRevision()).toBe(1)
    // The identity does not, so the routed content keeps its own state.
    expect(session.getSessionIdentity()).toBe(0)
  })

  it('does not republish once the session is already confirmed', async () => {
    const session = await freshSession()
    session.markSignedIn()
    session.markSignedIn()
    expect(session.getSessionRevision()).toBe(1)
    expect(session.getSessionIdentity()).toBe(0)
  })

  it('treats a login over a confirmed session as a new identity', async () => {
    const session = await freshSession()
    session.markSignedIn()
    session.markSignedIn(true)
    expect(session.getSessionRevision()).toBe(2)
    expect(session.getSessionIdentity()).toBe(1)
  })

  it('treats a login from an unconfirmed document as a new identity', async () => {
    const session = await freshSession()
    session.markSignedIn(true)
    expect(session.getSessionIdentity()).toBe(1)
  })

  it('treats signing in after a signed-out state as a new identity', async () => {
    const session = await freshSession()
    session.clearPrivateSession()
    expect(session.getSessionIdentity()).toBe(1)
    session.markSignedIn()
    expect(session.getSessionRevision()).toBe(2)
    expect(session.getSessionIdentity()).toBe(2)
  })

  it('ends an identity on sign-out so private content on screen cannot survive it', async () => {
    const session = await freshSession()
    session.markSignedIn()
    session.clearPrivateSession(true)
    expect(session.getSessionRevision()).toBe(2)
    expect(session.getSessionIdentity()).toBe(1)
  })

  it('ends an identity on an expiry that was never confirmed', async () => {
    const session = await freshSession()
    session.clearPrivateSession()
    expect(session.getSessionIdentity()).toBe(1)
  })
})
