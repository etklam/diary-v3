import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApiClient, createNativeSession, NO_AUTOMATIC_SESSION_RETRY_HEADER } from '@diary/api-client'
import { apiErrorResponseSchema, createDiaryRequestSchema, diaryResponseSchema, type NativeSession } from '@diary/contracts'
import { companyHubResponseSchema } from '@diary/contracts/company-hub'
import { diaryListResponseSchema } from '@diary/contracts/diary-list'
import { diaryReviewResponseSchema, structuredReviewInputSchema } from '@diary/contracts/review'
import { diarySummaryListResponseSchema } from '@diary/contracts/diary-summary'
import { reviewGroupsResponseSchema } from '@diary/contracts/review-queue'
import { createApp } from '../../apps/api/src/app'
import { createMarketData } from '../../apps/api/src/market-data'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date

beforeAll(async () => { database = await provisionTestDatabase('native_api_acceptance') })
beforeEach(async () => {
  clock = new Date('2026-09-13T12:00:00.000Z')
  const app = createApp({ db: database.db, now: () => clock, marketData: createMarketData({
    now: () => clock,
    timeoutMs: 50,
    upstream: {
      quote: async symbol => ({
        symbol, regularMarketPrice: 140, regularMarketPreviousClose: 135,
        currency: 'USD', marketState: 'REGULAR', regularMarketTime: clock,
      }),
      chart: async () => ({ quotes: [] }),
    },
  }), config: {
    jwtSecret: 'native-api-acceptance-test-secret-over-32-characters',
    nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

function memoryStorage() {
  let value: NativeSession | null = null
  return {
    storage: {
      get: () => value,
      set: (session: NativeSession) => { value = session },
      clear: () => { value = null },
    },
    read: () => value,
  }
}

async function register() {
  const credentials = { email: `${randomUUID()}@example.test`, password: 'native-acceptance-password-123' }
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials),
  })
  expect(response.status).toBe(200)
  return credentials
}

describe('native API acceptance against PostgreSQL', () => {
  it('restores native auth, retries writes only after user action, persists Review, and isolates accounts', async () => {
    const accountA = await register()
    const storageA = memoryStorage()
    let online = true
    let failNextTimelineRead = false
    let dropNextDiaryResponseAfterCommit = false
    let diaryWriteAttempts = 0
    let timelineReadAttempts = 0
    const transport: typeof fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const isDiaryWrite = new URL(request.url).pathname === '/api/diaries' && request.method === 'POST'
      const isTimelineRead = new URL(request.url).pathname === '/api/diaries/summary' && request.method === 'GET'
      if (isTimelineRead) {
        timelineReadAttempts++
        if (failNextTimelineRead) {
          failNextTimelineRead = false
          throw new TypeError('Network unavailable during Timeline read')
        }
      }
      if (isDiaryWrite) {
        diaryWriteAttempts++
        if (!online) throw new TypeError('Network unavailable')
      }
      const response = await fetch(request)
      if (isDiaryWrite && dropNextDiaryResponseAfterCommit && response.ok) {
        dropNextDiaryResponseAfterCommit = false
        await response.body?.cancel().catch(() => {})
        throw new TypeError('Connection lost after the API committed the Diary')
      }
      return response
    }
    const nativeA = createNativeSession({ baseUrl, storage: storageA.storage, fetch: transport })
    const apiA = createApiClient({ baseUrl, fetch: nativeA.fetch })

    const loginA = await nativeA.login(accountA)
    expect(loginA.user.email).toBe(accountA.email)
    expect(storageA.read()?.refreshToken).toBe(loginA.refreshToken)
    const restoredNativeA = createNativeSession({ baseUrl, storage: storageA.storage, fetch: transport })
    const restoredApiA = createApiClient({ baseUrl, fetch: restoredNativeA.fetch })
    const restoredA = await restoredApiA.GET('/api/auth/me')
    expect(restoredA.response.status).toBe(200)
    expect(restoredA.data?.data.id).toBe(loginA.user.id)
    const restoredSession = storageA.read()
    failNextTimelineRead = true
    await expect(apiA.GET('/api/diaries/summary', {
      params: { query: { page: 1, limit: 20 } },
    })).rejects.toThrow('Network unavailable during Timeline read')
    expect(timelineReadAttempts).toBe(1)
    expect(storageA.read()).toEqual(restoredSession)

    const body = createDiaryRequestSchema.parse({
      title: 'A native proof decision',
      content: 'Markdown stays Markdown.\n\nThe saved draft must survive a failed request.',
      date: '2026-09-13',
      tags: ['native-proof'],
      stockSymbols: ['NVDA'],
      reviewDueAt: clock.toISOString(),
    })
    const draftSnapshot = structuredClone(body)
    online = false
    await expect(apiA.POST('/api/diaries', {
      body,
      headers: { [NO_AUTOMATIC_SESSION_RETRY_HEADER]: '1' },
    })).rejects.toThrow('Network unavailable')
    expect(diaryWriteAttempts).toBe(1)
    expect(body).toEqual(draftSnapshot)
    expect(storageA.read()).not.toBeNull()
    const emptyTimeline = diaryListResponseSchema.parse((await apiA.GET('/api/diaries', {
      params: { query: { page: 1, limit: 20 } },
    })).data)
    expect(emptyTimeline.pagination.total).toBe(0)

    online = true
    const uncertainBody = createDiaryRequestSchema.parse({
      title: 'A committed Diary with a lost response',
      content: 'The API accepts this write, but the native transport loses the response.',
      date: '2026-09-12',
      tags: ['native-proof', 'lost-response'],
      stockSymbols: [],
    })
    const uncertainDraftSnapshot = structuredClone(uncertainBody)
    dropNextDiaryResponseAfterCommit = true
    await expect(apiA.POST('/api/diaries', {
      body: uncertainBody,
      headers: { [NO_AUTOMATIC_SESSION_RETRY_HEADER]: '1' },
    })).rejects.toThrow('Connection lost after the API committed the Diary')
    expect(diaryWriteAttempts).toBe(2)
    expect(uncertainBody).toEqual(uncertainDraftSnapshot)
    const committedAfterLostResponse = await database.pool.query(
      'SELECT title, content FROM diaries WHERE user_id = $1 AND title = $2',
      [loginA.user.id, uncertainBody.title],
    )
    expect(committedAfterLostResponse.rows).toEqual([{ title: uncertainBody.title, content: uncertainBody.content }])
    const visibleAfterLostResponse = diaryListResponseSchema.parse((await apiA.GET('/api/diaries', {
      params: { query: { page: 1, limit: 20 } },
    })).data)
    expect(visibleAfterLostResponse.data.map(row => row.title)).toContain(uncertainBody.title)

    const expiringSession = storageA.read()!
    clock = new Date(clock.getTime() + 61 * 60_000)
    const unauthorizedWrite = await apiA.POST('/api/diaries', {
      body,
      headers: { [NO_AUTOMATIC_SESSION_RETRY_HEADER]: '1' },
    })
    expect(unauthorizedWrite.response.status).toBe(401)
    expect(apiErrorResponseSchema.parse(unauthorizedWrite.error).data.code).toBe('AUTH_TOKEN_INVALID')
    expect(diaryWriteAttempts).toBe(3)
    expect(body).toEqual(draftSnapshot)
    expect(storageA.read()).toEqual(expiringSession)
    const refreshRowsBeforeExplicitRetry = await database.pool.query(
      'SELECT id FROM refresh_tokens WHERE user_id = $1', [loginA.user.id],
    )
    expect(refreshRowsBeforeExplicitRetry.rows).toHaveLength(1)

    const writesBeforeRelogin = await database.pool.query(
      'SELECT count(*)::int AS count FROM diaries WHERE user_id = $1', [loginA.user.id],
    )
    expect(writesBeforeRelogin.rows[0].count).toBe(1)
    await nativeA.logout()
    expect(storageA.read()).toBeNull()
    const revokedFamily = await database.pool.query(
      'SELECT revocation_reason FROM refresh_tokens WHERE token = $1',
      [createHash('sha256').update(expiringSession.refreshToken).digest('hex')],
    )
    expect(revokedFamily.rows[0].revocation_reason).toBe('LOGOUT')

    const reloginA = await nativeA.login(accountA)
    expect(reloginA.user.id).toBe(loginA.user.id)
    const confirmedA = await apiA.GET('/api/auth/me')
    expect(confirmedA.response.status).toBe(200)
    expect(confirmedA.data?.data.id).toBe(loginA.user.id)
    const createdResult = await apiA.POST('/api/diaries', {
      body,
      headers: { [NO_AUTOMATIC_SESSION_RETRY_HEADER]: '1' },
    })
    expect(createdResult.response.status).toBe(201)
    expect(diaryWriteAttempts).toBe(4)
    const created = diaryResponseSchema.parse(createdResult.data)

    const detailResult = await apiA.GET('/api/diaries/{id}', { params: { path: { id: created.id } } })
    const detail = diaryResponseSchema.parse(detailResult.data)
    expect(detail).toMatchObject({ id: created.id, userId: loginA.user.id, content: body.content, date: body.date, stockSymbols: ['NVDA'] })

    const timelineResult = await apiA.GET('/api/diaries/summary', {
      params: { query: { page: 1, limit: 20 } },
    })
    const timeline = diarySummaryListResponseSchema.parse(timelineResult.data)
    expect(timeline.data.map(row => row.id)).toContain(created.id)

    const companyResult = await apiA.GET('/api/stocks/{symbol}/hub', { params: { path: { symbol: 'NVDA' } } })
    const company = companyHubResponseSchema.parse(companyResult.data)
    expect(company.company.symbol).toBe('NVDA')
    expect(company.position).toMatchObject({ price: 140, quoteStatus: 'priced' })
    expect(company.relatedDiaries).toContainEqual(expect.objectContaining({ id: created.id, relation: 'explicit_context' }))

    const queueBefore = reviewGroupsResponseSchema.parse((await apiA.GET('/api/reviews', {
      params: { query: { target: 'diary' } },
    })).data)
    expect([...queueBefore.today, ...queueBefore.upcoming].some(row => row.targetType === 'diary' && row.id === created.id)).toBe(true)

    const reviewInput = structuredReviewInputSchema.parse({
      reviewOutcome: 'PARTIAL', reviewSummary: 'The signal was useful, but the position was early.',
    })
    const reviewWrite = await apiA.PATCH('/api/diaries/{id}/review', {
      params: { path: { id: created.id } }, body: reviewInput,
      headers: { [NO_AUTOMATIC_SESSION_RETRY_HEADER]: '1' },
    })
    expect(reviewWrite.response.status).toBe(200)
    expect(diaryReviewResponseSchema.parse(reviewWrite.data).reviewSummary).toBe(reviewInput.reviewSummary)
    const persistedReview = await apiA.GET('/api/diaries/{id}/review', { params: { path: { id: created.id } } })
    expect(diaryReviewResponseSchema.parse(persistedReview.data)).toMatchObject({
      id: created.id, reviewStatus: 'reviewed', reviewOutcome: 'PARTIAL',
      reviewSummary: reviewInput.reviewSummary,
    })
    const queueAfter = reviewGroupsResponseSchema.parse((await apiA.GET('/api/reviews', {
      params: { query: { target: 'diary' } },
    })).data)
    expect(queueAfter.completed.some(row => row.targetType === 'diary' && row.id === created.id)).toBe(true)

    const oldAccessToken = storageA.read()!.accessToken
    await nativeA.logout()
    expect(storageA.read()).toBeNull()
    expect((await apiA.GET('/api/auth/me')).response.status).toBe(401)
    // The app drops the credential on logout; a copied access token stays valid until expiry.
    expect((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${oldAccessToken}` } })).status).toBe(200)
    clock = new Date(clock.getTime() + 61 * 60_000)
    const expiredAccess = await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${oldAccessToken}` } })
    expect(expiredAccess.status).toBe(401)
    expect(apiErrorResponseSchema.parse(await expiredAccess.json()).data.code).toBe('AUTH_TOKEN_INVALID')

    const accountB = await register()
    const storageB = memoryStorage()
    const nativeB = createNativeSession({ baseUrl, storage: storageB.storage })
    const apiB = createApiClient({ baseUrl, fetch: nativeB.fetch })
    const loginB = await nativeB.login(accountB)
    expect(loginB.user.id).not.toBe(loginA.user.id)
    const adminPostWrite = await nativeB.fetch(new Request(`${baseUrl}/api/blog`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))
    expect(adminPostWrite.status).toBe(403)
    expect(apiErrorResponseSchema.parse(await adminPostWrite.json()).data.code).toBe('AUTH_FORBIDDEN')
    const timelineB = diaryListResponseSchema.parse((await apiB.GET('/api/diaries', {
      params: { query: { page: 1, limit: 20 } },
    })).data)
    expect(timelineB.data).toEqual([])
    expect(timelineB.pagination.total).toBe(0)
    expect((await apiB.GET('/api/diaries/{id}', { params: { path: { id: created.id } } })).response.status).toBe(404)
    const queueB = reviewGroupsResponseSchema.parse((await apiB.GET('/api/reviews', {
      params: { query: { target: 'diary' } },
    })).data)
    expect(queueB.counts).toEqual({ overdue: 0, today: 0, upcoming: 0, unscheduled: 0, completed: 0 })
    const companyB = companyHubResponseSchema.parse((await apiB.GET('/api/stocks/{symbol}/hub', {
      params: { path: { symbol: 'NVDA' } },
    })).data)
    expect(companyB.relatedDiaries).toEqual([])
    expect(JSON.stringify(companyB)).not.toContain(created.title)
    await nativeB.logout()
  })
})
