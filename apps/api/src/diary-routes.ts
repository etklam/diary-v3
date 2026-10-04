/**
 * Diary reading and authoring: the API-key agent entry point, the owner CRUD
 * routes, and the discovery feeds. Route order matters — the literal
 * `/api/diaries/summary` and `/api/diaries/by-date` segments register before
 * `/api/diaries/:id` so the parameterized route cannot swallow them.
 */
import {
  createDiaryRequestSchema,
  deleteDiaryResponseSchema,
  diaryByDateQuerySchema,
  serializedIdSchema,
  updateDiaryRequestSchema,
  updateDiaryV2RequestSchema,
  type UpdateDiaryRequest,
} from '@diary/contracts'
import { diaryActivityQuerySchema } from '@diary/contracts/diary-activity'
import { diaryListQuerySchema } from '@diary/contracts/diary-list'
import { diarySummaryListResponseSchema } from '@diary/contracts/diary-summary'
import type { Database } from '@diary/db'
import { currentUtcDate } from '@diary/domain'
import type { Context, Hono } from 'hono'
import {
  databaseId,
  fail,
  isUniqueViolation,
  parseJson,
  validationError,
  type AppEnv,
} from './app-context.js'
import { createDiary, deleteDiary, serializeDiary, updateDiary } from './diary.js'
import { diaryActivity } from './diary-activity.js'
import { recentDiaryTags } from './diary-tags.js'
import { listDiaries, listDiarySummaries } from './diary-list.js'
import { readDiaryByDate, readDiaryDetail } from './diary-read.js'
import { DiaryStockLimitError } from './diary-stocks.js'
import { LedgerValidationError } from './ledger.js'
import { listLinkedTradePlans } from './trade-plans.js'

export function registerDiaryRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
}) {
  const { db, now } = dependencies

  app.post('/api/agent/diaries', async c => {
    const key = c.get('apiKey')
    if (!key) fail(401, 'AUTH_TOKEN_INVALID', 'API key required')
    const input = await parseJson(c, createDiaryRequestSchema)
    if (input.appendToToday) fail(400, 'SYS_VALIDATION_ERROR', 'appendToToday is not available for API key diary creation')
    const diaryDate = input.date ?? currentUtcDate(now())
    try {
      const result = await createDiary(db, BigInt(key.userId), input, diaryDate, now, { createdVia: 'API_KEY', createdByLabel: key.label })
      c.header('Cache-Control', 'no-store')
      return c.json(serializeDiary(result.diary, false, result.transactions, [], result.stockSymbols, result.alerts), 201)
    } catch (error) {
      if (isUniqueViolation(error, 'diaries_user_date_key')) fail(409, 'DIARY_ALREADY_EXISTS', `Diary already exists for ${diaryDate}`)
      if (error instanceof LedgerValidationError) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'transactions', message: error.message }])
      throw error
    }
  })

  app.post('/api/diaries', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const input = await parseJson(c, createDiaryRequestSchema)
    const diaryDate = input.date ?? currentUtcDate(now())
    try {
      const result = await createDiary(db, BigInt(session.id), input, diaryDate, now)
      return c.json(serializeDiary(result.diary, false, result.transactions, [], result.stockSymbols, result.alerts), 201)
    } catch (error) {
      if (isUniqueViolation(error, 'diaries_user_date_key')) fail(409, 'DIARY_ALREADY_EXISTS', `Diary already exists for ${diaryDate}`)
      if (error instanceof DiaryStockLimitError) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'stockSymbols', message: error.message }])
      if (error instanceof LedgerValidationError) {
        fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'transactions', message: error.message }])
      }
      throw error
    }
  })

  app.get('/api/diaries', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = diaryListQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    return c.json(await listDiaries(db, BigInt(session.id), query.data, now()))
  })

  app.get('/api/diaries/activity', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = diaryActivityQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    return c.json(await diaryActivity(db, BigInt(session.id), query.data.dateFrom, query.data.dateTo))
  })

  app.get('/api/diaries/by-date', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = diaryByDateQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    return c.json(await readDiaryByDate(db, query.data.date, BigInt(session.id)), 200)
  })

  // Tag suggestions for both authoring paths; registered before
  // '/api/diaries/:id' so the parameterized route never swallows the literal.
  app.get('/api/diaries/recent-tags', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    return c.json(await recentDiaryTags(db, BigInt(session.id)))
  })

  // Summary discovery feed; registered before '/api/diaries/:id' so the
  // parameterized route never swallows the literal 'summary' segment.
  app.get('/api/diaries/summary', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = diaryListQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    const includeSearchSnippet = c.req.header('x-diary-search-snippet') === '1'
    return c.json(diarySummaryListResponseSchema.parse(await listDiarySummaries(db, BigInt(session.id), query.data, now(), includeSearchSnippet)))
  })

  app.get('/api/diaries/:id', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const id = c.req.param('id')
    if (!serializedIdSchema.safeParse(id).success) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'id', message: 'Invalid id', value: id }])
    const parsedId = databaseId(id)
    if (parsedId === undefined) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
    const diary = await readDiaryDetail(db, parsedId, BigInt(session.id))
    if (!diary) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
    return c.json(diary, 200)
  })

  const updateDiaryRoute = async (c: Context<AppEnv>, input: UpdateDiaryRequest) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const id = c.req.param('id') ?? ''
    if (!serializedIdSchema.safeParse(id).success) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'id', message: 'Invalid id', value: id }])
    const parsedId = databaseId(id)
    if (parsedId === undefined) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
    try {
      const result = await updateDiary(db, parsedId, BigInt(session.id), input, now())
      if (!result) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
      if ('conflict' in result && result.conflict) fail(409, 'DIARY_REVISION_CONFLICT', 'Diary changed after it was loaded. Reload the latest version before saving.')
      const planRows = await listLinkedTradePlans(db, BigInt(session.id), [result.diary.id])
      return c.json(serializeDiary(result.diary, true, result.transactions, planRows, result.stockSymbols, result.alerts), 200)
    } catch (error) {
      if (isUniqueViolation(error, 'diaries_user_date_key')) {
        fail(409, 'DIARY_ALREADY_EXISTS', `Diary already exists for ${input.date}`)
      }
      if (error instanceof LedgerValidationError) {
        fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'transactions', message: error.message }])
      }
      throw error
    }
  }

  app.put('/api/diaries/:id', async c => updateDiaryRoute(c, await parseJson(c, updateDiaryRequestSchema)))
  app.put('/api/v2/diaries/:id', async c => updateDiaryRoute(c, await parseJson(c, updateDiaryV2RequestSchema)))

  app.delete('/api/diaries/:id', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const id = c.req.param('id')
    if (!serializedIdSchema.safeParse(id).success) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'id', message: 'Invalid id', value: id }])
    const parsedId = databaseId(id)
    if (parsedId === undefined) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
    try {
      if (!await deleteDiary(db, parsedId, BigInt(session.id))) {
        fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
      }
    } catch (error) {
      if (error instanceof LedgerValidationError) {
        fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'transactions', message: error.message }])
      }
      throw error
    }
    return c.json(deleteDiaryResponseSchema.parse({ success: true }), 200)
  })
}
