import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '@diary/db'
import { createAuthSessionService, hashRefreshToken, REFRESH_SECONDS } from '../../apps/api/src/auth-session'
import { provisionTestDatabase } from '../support/database'
import { eq } from 'drizzle-orm'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let clock = new Date('2026-09-26T00:00:00.000Z')
const fail = (status: number, code: string, message: string): never => {
  throw new Error(`${status}:${code}:${message}`)
}

beforeAll(async () => { database = await provisionTestDatabase('auth_session_service') })
afterAll(async () => { await database?.dispose() })

function service() {
  return createAuthSessionService({
    db: database.db,
    jwtSecret: 'auth-session-service-tests-secret-over-32-chars',
    now: () => clock,
    fail,
  })
}

async function nativeLogin(auth = service(), existingUser?: typeof users.$inferSelect) {
  const password = 'auth-session-service-password'
  const [user] = existingUser ? [existingUser] : await database.db.insert(users).values({
    email: `${randomUUID()}@example.test`,
    password: await bcrypt.hash(password, 10),
  }).returning()
  if (!user) throw new Error('Test user insert returned no row')
  const result = await auth.createLoginSession({ candidate: user, password, clientType: 'NATIVE', deviceName: 'service test' })
  if (result.clientType !== 'NATIVE') throw new Error('Test login returned a Web session')
  return { auth, user, pair: result.pair }
}

describe('auth session service native use cases', () => {
  it('rotates one family, revokes it on replay, and leaves another family active', async () => {
    const first = await nativeLogin()
    const other = await nativeLogin(first.auth, first.user)

    const rotated = await first.auth.refreshNativeSession(first.pair.refreshToken)
    expect(rotated.ok).toBe(true)
    if (!rotated.ok) throw new Error('Expected native rotation to succeed')
    expect(rotated.pair.refreshToken).not.toBe(first.pair.refreshToken)

    const rows = await database.pool.query(
      'SELECT id, token, family_id, parent_id, replacement_id, revoked_at, revocation_reason FROM refresh_tokens WHERE user_id = $1 ORDER BY id',
      [first.user.id.toString()],
    )
    expect(rows.rows).toHaveLength(3)
    const parent = rows.rows.find(row => row.token === hashRefreshToken(first.pair.refreshToken))
    const child = rows.rows.find(row => row.token === hashRefreshToken(rotated.pair.refreshToken))
    expect(parent).toMatchObject({ revocation_reason: 'ROTATED', replacement_id: child.id })
    expect(child).toMatchObject({ parent_id: parent.id, family_id: parent.family_id, revoked_at: null })

    expect(await first.auth.refreshNativeSession(first.pair.refreshToken)).toEqual({ ok: false, reason: 'revoked' })
    expect(await first.auth.refreshNativeSession(rotated.pair.refreshToken)).toEqual({ ok: false, reason: 'revoked' })
    const otherRotated = await first.auth.refreshNativeSession(other.pair.refreshToken)
    expect(otherRotated.ok).toBe(true)
    const active = await database.pool.query(
      'SELECT count(*)::int AS count FROM refresh_tokens WHERE user_id = $1 AND family_id = $2 AND revoked_at IS NULL',
      [first.user.id.toString(), parent.family_id],
    )
    expect(active.rows[0].count).toBe(0)
  })

  it('checks tokenVersion after the user and family locks without rotating stale credentials', async () => {
    const session = await nativeLogin()
    await database.db.update(users).set({ tokenVersion: 1 }).where(eq(users.id, session.user.id))

    expect(await session.auth.refreshNativeSession(session.pair.refreshToken)).toEqual({ ok: false, reason: 'revoked' })
    const rows = await database.pool.query(
      'SELECT count(*)::int AS count FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [session.user.id.toString()],
    )
    expect(rows.rows[0].count).toBe(1)
  })

  it('marks an active expired row as expired without granting a grace period', async () => {
    const session = await nativeLogin()
    clock = new Date(clock.getTime() + (REFRESH_SECONDS + 1) * 1000)

    expect(await session.auth.refreshNativeSession(session.pair.refreshToken)).toEqual({ ok: false, reason: 'expired' })
    const row = await database.pool.query(
      'SELECT revoked_at, revocation_reason FROM refresh_tokens WHERE token = $1',
      [hashRefreshToken(session.pair.refreshToken)],
    )
    expect(row.rows[0]).toMatchObject({ revocation_reason: 'EXPIRED' })
    expect(row.rows[0].revoked_at).not.toBeNull()
  })

  it('replays an expired rotated ancestor before expiry handling and revokes descendants', async () => {
    const actualNow = clock
    clock = new Date(actualNow.getTime() - 40 * 86_400_000)
    const session = await nativeLogin()
    clock = new Date(actualNow.getTime() - 20 * 86_400_000)
    const rotated = await session.auth.refreshNativeSession(session.pair.refreshToken)
    expect(rotated.ok).toBe(true)
    if (!rotated.ok) throw new Error('Expected native rotation to succeed')

    clock = actualNow
    expect(await session.auth.refreshNativeSession(session.pair.refreshToken)).toEqual({ ok: false, reason: 'revoked' })
    expect(await session.auth.refreshNativeSession(rotated.pair.refreshToken)).toEqual({ ok: false, reason: 'revoked' })
  })

  it('revokes only the requested family and is idempotent for logout', async () => {
    const first = await nativeLogin()
    const other = await nativeLogin(first.auth, first.user)
    const rotated = await first.auth.refreshNativeSession(first.pair.refreshToken)
    expect(rotated.ok).toBe(true)
    if (!rotated.ok) throw new Error('Expected native rotation to succeed')

    expect(await first.auth.logoutNativeSession(first.pair.refreshToken)).toEqual({ outcome: 'revoked' })
    expect(await first.auth.logoutNativeSession(first.pair.refreshToken)).toEqual({ outcome: 'already-revoked' })
    expect(await first.auth.refreshNativeSession(first.pair.refreshToken)).toEqual({ ok: false, reason: 'revoked' })
    expect(await first.auth.refreshNativeSession(rotated.pair.refreshToken)).toEqual({ ok: false, reason: 'revoked' })
    expect((await first.auth.refreshNativeSession(other.pair.refreshToken)).ok).toBe(true)
  })

  it('returns protocol-neutral outcomes for malformed, unknown, and Web refresh credentials', async () => {
    const session = await nativeLogin()
    expect(await session.auth.refreshNativeSession('malformed')).toEqual({ ok: false, reason: 'invalid' })
    const signed = await session.auth.signToken({
      id: session.user.id.toString(), email: session.user.email, role: session.user.role, tokenVersion: session.user.tokenVersion,
    }, 'refresh')
    expect(await session.auth.refreshNativeSession(signed)).toEqual({ ok: false, reason: 'not-found' })

    const web = await session.auth.createLoginSession({ candidate: session.user, password: 'auth-session-service-password', clientType: 'WEB' })
    if (web.clientType !== 'WEB') throw new Error('Test login returned a Native session')
    expect(await session.auth.refreshNativeSession(web.refreshToken)).toEqual({ ok: false, reason: 'not-found' })
    expect(await session.auth.logoutNativeSession(web.refreshToken)).toEqual({ outcome: 'not-native' })
    expect(await session.auth.logoutNativeSession('unknown')).toEqual({ outcome: 'not-found' })
  })
})
