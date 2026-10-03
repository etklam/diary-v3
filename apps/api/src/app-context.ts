/**
 * Request-scoped primitives every route module shares: the Hono environment,
 * the structured API error and the small parsing/identity helpers built on it.
 *
 * This module imports nothing from `app.ts`, so route modules can depend on the
 * environment type without the cycle that importing it from `app.ts` created.
 */
import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { getConnInfo } from '@hono/node-server/conninfo'
import { MAX_SERIALIZED_ID, serializedIdSchema, type ErrorCode } from '@diary/contracts'
import type { Context } from 'hono'
import type { z } from 'zod'
import type { SessionUser } from './auth-session.js'
import { RequestBodyLimitError } from './request-body-limit.js'

export const CSRF_COOKIE = 'csrf-token'
export const CSRF_HEADER = 'x-csrf-token'

/** Endpoints that establish or discard credentials, so they predate a CSRF token. */
export const PUBLIC_STATE_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/registration/request',
  '/api/auth/registration/complete',
  '/api/auth/password-reset/request',
  '/api/auth/password-reset/complete',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/native/login',
  '/api/auth/native/refresh',
  '/api/auth/native/logout',
])

export interface ApiConfig {
  jwtSecret: string
  nodeEnv: 'development' | 'test' | 'production'
  trustProxy: boolean
  webOrigin: string
  secUserAgent?: string
}

export type AuthTransport = 'cookie' | 'bearer' | 'api-key'

export interface AppEnv {
  Variables: {
    requestId: string
    user: SessionUser
    apiKey: { id: string; userId: string; label: string; scope: 'DIARY_CREATE' | 'AGENT_WRITE' }
    authTransport: AuthTransport
    rateLimitRetryAfterSeconds: number | undefined
    rateLimitBackendUnavailable: boolean | undefined
  }
}

export interface ErrorDetail {
  field?: string
  message?: string
  value?: unknown
}

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] | null = null,
  ) {
    super(message)
  }
}

export function fail(status: number, code: ErrorCode, message: string, details: ErrorDetail[] | null = null): never {
  throw new ApiError(status, code, message, details)
}

export function validationError(error: z.ZodError): never {
  fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  })))
}

export async function parseJson<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  try {
    const result = schema.safeParse(await c.req.json())
    if (!result.success) validationError(result.error)
    return result.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof RequestBodyLimitError) throw error
    fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ message: 'Request body must be valid JSON' }])
  }
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: unknown }
  const direct = candidate.code === '23505' && (!constraint || candidate.constraint === constraint)
  return direct || (candidate.cause !== undefined && isUniqueViolation(candidate.cause, constraint))
}

export function instant(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

export function databaseId(value: string): bigint | undefined {
  if (!serializedIdSchema.safeParse(value).success
    || value.length > MAX_SERIALIZED_ID.length
    || (value.length === MAX_SERIALIZED_ID.length && value > MAX_SERIALIZED_ID)) return undefined
  return BigInt(value)
}

export function resolveClientIp(trustProxy: boolean, forwardedFor: string | undefined, remoteAddress: string | undefined): string {
  const trusted = trustProxy ? forwardedFor?.split(',').at(-1)?.trim() : undefined
  if (trusted && isIP(trusted)) return trusted
  return remoteAddress ?? 'unknown'
}

export function clientIp(c: Context<AppEnv>, trustProxy: boolean): string {
  let remoteAddress: string | undefined
  try { remoteAddress = getConnInfo(c).remote.address } catch { remoteAddress = undefined }
  return resolveClientIp(trustProxy, c.req.header('x-forwarded-for'), remoteAddress)
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
