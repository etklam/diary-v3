import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto'
import { MAX_SERIALIZED_ID, nativeTokenPairSchema, serializedIdSchema, type ErrorCode, type NativeTokenPair } from '@diary/contracts'
import { refreshTokens, users, type Database } from '@diary/db'
import bcrypt from 'bcryptjs'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { SignJWT, jwtVerify } from 'jose'

export const ACCESS_COOKIE = 'access-token'
export const REFRESH_COOKIE = 'refresh-token'
export const ACCESS_SECONDS = 60 * 60
export const REFRESH_SECONDS = 60 * 60 * 24 * 30

const JWT_ISSUER = 'invest-diary'
const JWT_AUDIENCE = 'invest-diary-api'

export interface SessionUser {
  id: string
  email: string
  role: 'USER' | 'ADMIN'
  tokenVersion: number
}

interface TokenPayload extends SessionUser {
  expiresAt: number
  type: 'access' | 'refresh'
}

export type NativeRefreshOutcome =
  | { ok: true; pair: NativeTokenPair }
  | { ok: false; reason: 'invalid' | 'not-found' | 'revoked' | 'expired' }

export type NativeLogoutOutcome =
  | { outcome: 'revoked' }
  | { outcome: 'already-revoked' }
  | { outcome: 'not-found' }
  | { outcome: 'not-native' }

type Fail = (
  status: number,
  code: ErrorCode,
  message: string,
  details?: Array<{ field?: string; message?: string; value?: unknown }> | null,
) => never

export function authUser(row: typeof users.$inferSelect) {
  return {
    id: row.id.toString(),
    email: row.email,
    name: row.name,
    role: row.role,
    expectedMonthlyTrades: row.expectedMonthlyTrades,
    expectedProfit: row.expectedProfit,
    expectedAvgHolding: row.expectedAvgHolding,
    timezone: row.timezone,
  }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Serializes every session issue/revoke operation for one account. */
export function userSessionLock(userId: bigint) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${'user-session:' + userId.toString()}, 0::bigint))`
}

/** Native operations take the user lock before this family lock. */
export function nativeFamilyLock(familyId: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${'native-family:' + familyId}, 0::bigint))`
}

function databaseId(value: string): bigint | undefined {
  if (!serializedIdSchema.safeParse(value).success
    || value.length > MAX_SERIALIZED_ID.length
    || (value.length === MAX_SERIALIZED_ID.length && value > MAX_SERIALIZED_ID)) return undefined
  return BigInt(value)
}

export function createAuthSessionService({
  db,
  jwtSecret,
  now = () => new Date(),
  randomUUID = nodeRandomUUID,
  fail,
}: {
  db: Database
  jwtSecret: string
  now?: () => Date
  randomUUID?: () => string
  fail: Fail
}) {
  if (jwtSecret.length < 32 || jwtSecret === 'CHANGE_THIS_RANDOM_SECRET') {
    throw new Error('jwtSecret must be at least 32 characters and must not be a placeholder')
  }
  const secret = new TextEncoder().encode(jwtSecret)

  const findSessionUser = async (id: string): Promise<SessionUser | undefined> => {
    const parsedId = databaseId(id)
    if (parsedId === undefined) return undefined
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      tokenVersion: users.tokenVersion,
    }).from(users).where(eq(users.id, parsedId)).limit(1)
    return user ? { ...user, id: user.id.toString() } : undefined
  }

  const signToken = async (
    user: SessionUser,
    type: TokenPayload['type'],
    issuedAt = Math.floor(now().getTime() / 1000),
  ) => {
    const token = new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      type,
    }).setProtectedHeader({ alg: 'HS256' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + (type === 'access' ? ACCESS_SECONDS : REFRESH_SECONDS))
    if (type === 'refresh') token.setJti(randomUUID())
    return token.sign(secret)
  }

  const parseToken = async (
    token: string,
    expectedType: TokenPayload['type'],
    allowExpired = false,
  ): Promise<TokenPayload | undefined> => {
    try {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        // Refresh persistence is the expiry authority. Verifying an old token's
        // signature still lets native replay containment revoke its family.
        currentDate: allowExpired ? new Date(0) : now(),
      })
      if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)
        || payload.type !== expectedType
        || !serializedIdSchema.safeParse(payload.userId).success
        || typeof payload.email !== 'string'
        || (payload.role !== 'USER' && payload.role !== 'ADMIN')
        || !Number.isInteger(payload.tokenVersion)) throw new Error('invalid claims')
      return {
        id: payload.userId as string,
        email: payload.email,
        role: payload.role,
        tokenVersion: payload.tokenVersion as number,
        type: expectedType,
        expiresAt: payload.exp,
      }
    } catch {
      return undefined
    }
  }

  const verifyToken = async (
    token: string,
    expectedType: TokenPayload['type'],
    allowExpired = false,
  ): Promise<TokenPayload> => {
    const payload = await parseToken(token, expectedType, allowExpired)
    if (!payload) return fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
    return payload
  }

  const authenticateAccess = async (token: string): Promise<SessionUser> => {
    const payload = await verifyToken(token, 'access')
    const user = await findSessionUser(payload.id)
    if (!user || user.tokenVersion !== payload.tokenVersion) return fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
    return user
  }

  const refreshWebSession = async (token: string) => {
    const payload = await verifyToken(token, 'refresh', true)
    const [stored] = await db.select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      clientType: refreshTokens.clientType,
      revokedAt: refreshTokens.revokedAt,
    }).from(refreshTokens)
      .where(eq(refreshTokens.token, hashRefreshToken(token)))
      .limit(1)

    if (!stored || stored.clientType !== 'WEB' || stored.revokedAt) {
      return fail(401, 'AUTH_TOKEN_NOT_FOUND', 'Token not found')
    }
    type WebRefreshOutcome =
      | { ok: true; sessionUser: SessionUser; accessToken: string }
      | { ok: false; reason: 'not-found' | 'expired' | 'invalid' }

    const outcome: WebRefreshOutcome = await db.transaction(async (tx) => {
      await tx.execute(userSessionLock(stored.userId))
      const [current] = await tx.select({
        id: refreshTokens.id,
        clientType: refreshTokens.clientType,
        revokedAt: refreshTokens.revokedAt,
        expiresAt: refreshTokens.expiresAt,
        user: users,
      }).from(refreshTokens)
        .innerJoin(users, eq(users.id, refreshTokens.userId))
        .where(eq(refreshTokens.id, stored.id))
        .limit(1)
      if (!current || current.clientType !== 'WEB' || current.revokedAt) {
        return { ok: false, reason: 'not-found' }
      }
      const operationNow = now()
      if (current.expiresAt <= operationNow) {
        await tx.update(refreshTokens).set({
          revokedAt: operationNow,
          revocationReason: 'EXPIRED',
        }).where(and(eq(refreshTokens.id, current.id), isNull(refreshTokens.revokedAt)))
        return { ok: false, reason: 'expired' }
      }
      if (current.user.id.toString() !== payload.id || current.user.tokenVersion !== payload.tokenVersion) {
        return { ok: false, reason: 'invalid' }
      }
      const sessionUser: SessionUser = {
        id: current.user.id.toString(),
        email: current.user.email,
        role: current.user.role,
        tokenVersion: current.user.tokenVersion,
      }
      return { ok: true, sessionUser, accessToken: await signToken(sessionUser, 'access') }
    })

    if (!outcome.ok) {
      if (outcome.reason === 'not-found') return fail(401, 'AUTH_TOKEN_NOT_FOUND', 'Token not found')
      if (outcome.reason === 'expired') return fail(401, 'AUTH_TOKEN_EXPIRED', 'Token expired')
      return fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
    }
    return outcome
  }

  const buildNativeTokenPair = async (user: typeof users.$inferSelect): Promise<{
    rawRefreshToken: string
    refreshExpiresAt: Date
    pair: NativeTokenPair
  }> => {
    const issuedAt = Math.floor(now().getTime() / 1000)
    const sessionUser: SessionUser = {
      id: user.id.toString(), email: user.email, role: user.role, tokenVersion: user.tokenVersion,
    }
    const [accessToken, refreshToken] = await Promise.all([
      signToken(sessionUser, 'access', issuedAt),
      signToken(sessionUser, 'refresh', issuedAt),
    ])
    const refreshExpiresAt = new Date((issuedAt + REFRESH_SECONDS) * 1000)
    return {
      rawRefreshToken: refreshToken,
      refreshExpiresAt,
      pair: nativeTokenPairSchema.parse({
        accessToken,
        refreshToken,
        accessTokenExpiresAt: new Date((issuedAt + ACCESS_SECONDS) * 1000).toISOString(),
        refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
        user: authUser(user),
      }),
    }
  }

  const refreshNativeSession = async (token: string): Promise<NativeRefreshOutcome> => {
    const payload = await parseToken(token, 'refresh', true)
    if (!payload) return { ok: false, reason: 'invalid' }

    const [stored] = await db.select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      clientType: refreshTokens.clientType,
      familyId: refreshTokens.familyId,
    }).from(refreshTokens)
      .where(eq(refreshTokens.token, hashRefreshToken(token)))
      .limit(1)

    if (!stored || stored.clientType !== 'NATIVE') return { ok: false, reason: 'not-found' }

    return db.transaction(async (tx): Promise<NativeRefreshOutcome> => {
      // Account-wide operations serialize before family-specific rotation.
      await tx.execute(userSessionLock(stored.userId))
      // Every mutation in one native family takes this transaction-scoped lock.
      // The post-lock read gets a fresh READ COMMITTED snapshot, so replay/logout
      // sees any descendant committed by the previous lock holder.
      await tx.execute(nativeFamilyLock(stored.familyId))
      const [current] = await tx.select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        clientType: refreshTokens.clientType,
        familyId: refreshTokens.familyId,
        deviceName: refreshTokens.deviceName,
        revokedAt: refreshTokens.revokedAt,
        expiresAt: refreshTokens.expiresAt,
        user: users,
      }).from(refreshTokens)
        .innerJoin(users, eq(users.id, refreshTokens.userId))
        .where(eq(refreshTokens.id, stored.id))
        .limit(1)

      if (!current || current.clientType !== 'NATIVE') return { ok: false, reason: 'not-found' }
      if (current.revokedAt) {
        // This update is part of the transaction, so the family revocation is
        // committed before the caller maps replay to its 401 response.
        await tx.update(refreshTokens).set({
          revokedAt: now(), revocationReason: 'REUSE_DETECTED',
        }).where(and(
          eq(refreshTokens.userId, current.userId),
          eq(refreshTokens.familyId, current.familyId),
          eq(refreshTokens.clientType, 'NATIVE'),
          isNull(refreshTokens.revokedAt),
        ))
        return { ok: false, reason: 'revoked' }
      }

      const operationNow = now()
      // Database expiry is authoritative. This branch intentionally follows
      // replay detection so an expired rotated ancestor still revokes its family.
      if (current.expiresAt <= operationNow) {
        await tx.update(refreshTokens).set({
          revokedAt: operationNow, revocationReason: 'EXPIRED',
        }).where(and(eq(refreshTokens.id, current.id), isNull(refreshTokens.revokedAt)))
        return { ok: false, reason: 'expired' }
      }
      if (current.user.tokenVersion !== payload.tokenVersion || current.user.id.toString() !== payload.id) {
        return { ok: false, reason: 'revoked' }
      }

      const replacementMaterial = await buildNativeTokenPair(current.user)
      await tx.update(refreshTokens).set({
        revokedAt: operationNow, revocationReason: 'ROTATED',
      }).where(and(eq(refreshTokens.id, current.id), isNull(refreshTokens.revokedAt)))
      const [replacement] = await tx.insert(refreshTokens).values({
        token: hashRefreshToken(replacementMaterial.rawRefreshToken),
        userId: current.userId,
        clientType: 'NATIVE',
        familyId: current.familyId,
        deviceName: current.deviceName,
        parentId: current.id,
        expiresAt: replacementMaterial.refreshExpiresAt,
      }).returning({ id: refreshTokens.id })
      if (!replacement) throw new Error('Refresh replacement insert returned no row')
      await tx.update(refreshTokens).set({ replacementId: replacement.id })
        .where(eq(refreshTokens.id, current.id))
      return { ok: true, pair: replacementMaterial.pair }
    })
  }

  const logoutNativeSession = async (token: string): Promise<NativeLogoutOutcome> => {
    const [stored] = await db.select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      familyId: refreshTokens.familyId,
      clientType: refreshTokens.clientType,
    }).from(refreshTokens)
      .where(eq(refreshTokens.token, hashRefreshToken(token)))
      .limit(1)

    if (!stored) return { outcome: 'not-found' }
    if (stored.clientType !== 'NATIVE') return { outcome: 'not-native' }

    return db.transaction(async (tx): Promise<NativeLogoutOutcome> => {
      // Keep the same user-then-family lock order as refresh and account-wide
      // revocation, then reread state after both locks.
      await tx.execute(userSessionLock(stored.userId))
      await tx.execute(nativeFamilyLock(stored.familyId))
      const [current] = await tx.select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        familyId: refreshTokens.familyId,
        clientType: refreshTokens.clientType,
      }).from(refreshTokens)
        .where(eq(refreshTokens.id, stored.id))
        .limit(1)

      if (!current || current.clientType !== 'NATIVE') return { outcome: 'not-found' }
      const revoked = await tx.update(refreshTokens).set({
        revokedAt: now(), revocationReason: 'LOGOUT',
      }).where(and(
        eq(refreshTokens.userId, current.userId),
        eq(refreshTokens.familyId, current.familyId),
        eq(refreshTokens.clientType, 'NATIVE'),
        isNull(refreshTokens.revokedAt),
      )).returning({ id: refreshTokens.id })
      return revoked.length > 0 ? { outcome: 'revoked' } : { outcome: 'already-revoked' }
    })
  }

  const createLoginSession = async ({
    candidate,
    password,
    clientType,
    deviceName,
  }: {
    candidate: typeof users.$inferSelect
    password: string
    clientType: 'WEB' | 'NATIVE'
    deviceName?: string
  }) => db.transaction(async (tx) => {
    await tx.execute(userSessionLock(candidate.id))
    const [current] = await tx.select().from(users).where(eq(users.id, candidate.id)).limit(1)
    if (!current) return fail(401, 'AUTH_LOGIN_INVALID_CREDENTIALS', 'Invalid email or password')

    // Password mutation may have committed between the initial bcrypt check and
    // this lock. Re-check only when the stored hash changed.
    if (current.password !== candidate.password && !await bcrypt.compare(password, current.password)) {
      return fail(401, 'AUTH_LOGIN_INVALID_CREDENTIALS', 'Invalid email or password')
    }

    if (clientType === 'NATIVE') {
      const material = await buildNativeTokenPair(current)
      await tx.insert(refreshTokens).values({
        token: hashRefreshToken(material.rawRefreshToken),
        userId: current.id,
        clientType,
        familyId: randomUUID(),
        deviceName,
        expiresAt: material.refreshExpiresAt,
      })
      return { clientType, user: current, pair: material.pair } as const
    }

    const sessionUser: SessionUser = {
      id: current.id.toString(), email: current.email, role: current.role, tokenVersion: current.tokenVersion,
    }
    const [accessToken, refreshToken] = await Promise.all([
      signToken(sessionUser, 'access'), signToken(sessionUser, 'refresh'),
    ])
    await tx.insert(refreshTokens).values({
      token: hashRefreshToken(refreshToken),
      userId: current.id,
      clientType,
      familyId: randomUUID(),
      expiresAt: new Date(now().getTime() + REFRESH_SECONDS * 1000),
    })
    return { clientType, user: current, accessToken, refreshToken } as const
  })

  const logoutAllSessions = async (userId: bigint) => db.transaction(async (tx) => {
    await tx.execute(userSessionLock(userId))
    const [updated] = await tx.update(users).set({
      tokenVersion: sql`${users.tokenVersion} + 1`,
      updatedAt: now(),
    }).where(eq(users.id, userId)).returning({ tokenVersion: users.tokenVersion })
    if (!updated) return fail(404, 'USER_NOT_FOUND', 'User not found')
    await tx.update(refreshTokens).set({
      revokedAt: now(),
      revocationReason: 'LOGOUT_ALL',
    }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    return updated.tokenVersion
  })

  const changePassword = async (userId: bigint, currentPassword: string, newPassword: string) => {
    const [candidate] = await db.select({ password: users.password }).from(users)
      .where(eq(users.id, userId)).limit(1)
    if (!candidate) return fail(404, 'USER_NOT_FOUND', 'User not found')
    if (!await bcrypt.compare(currentPassword, candidate.password)) {
      return fail(401, 'AUTH_LOGIN_INVALID_CREDENTIALS', 'Invalid email or password')
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    return db.transaction(async (tx) => {
      await tx.execute(userSessionLock(userId))
      const [current] = await tx.select({ password: users.password }).from(users)
        .where(eq(users.id, userId)).limit(1)
      if (!current) return fail(404, 'USER_NOT_FOUND', 'User not found')
      if (current.password !== candidate.password && !await bcrypt.compare(currentPassword, current.password)) {
        return fail(401, 'AUTH_LOGIN_INVALID_CREDENTIALS', 'Invalid email or password')
      }
      await tx.update(users).set({
        password: hashedPassword,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: now(),
      }).where(eq(users.id, userId))
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
    })
  }

  return {
    authenticateAccess,
    authenticateSocketAccess: async (token: string) => {
      const payload = await verifyToken(token, 'access')
      const user = await findSessionUser(payload.id)
      if (!user || user.tokenVersion !== payload.tokenVersion) return fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
      return { ...user, expiresAt: new Date(payload.expiresAt * 1000) }
    },
    buildNativeTokenPair,
    changePassword,
    createLoginSession,
    logoutAllSessions,
    logoutNativeSession,
    refreshNativeSession,
    refreshWebSession,
    signToken,
    verifyRefreshToken: (token: string) => verifyToken(token, 'refresh', true),
  }
}
