import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { diaries, diaryStocks, alerts, schema, stocks, transactions, users, type Database } from '../../packages/db/src'
import { readDiaryByDate, readDiaryDetail } from '../../apps/api/src/diary-read'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>

beforeAll(async () => { database = await provisionTestDatabase('diary_read') })
afterAll(async () => { await database?.dispose() })

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function queryText(args: readonly unknown[]): string {
  const first = args[0]
  if (typeof first === 'string') return first
  if (first && typeof first === 'object' && 'text' in first) return String(first.text)
  return ''
}

async function createGatedReader() {
  const pool = new pg.Pool({ connectionString: database.url, max: 1 })
  const initialDiaryRead = deferred<void>()
  const releaseAssociations = deferred<void>()
  const connect = pool.connect.bind(pool)
  ;(pool as unknown as { connect: () => Promise<pg.PoolClient> }).connect = async () => {
    const client = await connect()
    const query = client.query.bind(client)
    let diaryRead = false
    ;(client as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query = async (...args) => {
      const text = queryText(args)
      if (!diaryRead && /from\s+"diaries"/i.test(text) && /limit/i.test(text)) {
        const result = await query(...args as Parameters<typeof client.query>)
        diaryRead = true
        initialDiaryRead.resolve()
        return result
      }
      if (diaryRead) await releaseAssociations.promise
      return query(...args as Parameters<typeof client.query>)
    }
    return client
  }
  return {
    db: drizzle(pool, { schema }),
    initialDiaryRead: initialDiaryRead.promise,
    releaseAssociations: releaseAssociations.resolve,
    close: () => pool.end(),
  }
}

async function seedDiary(date: string) {
  const [user] = await database.db.insert(users).values({
    email: `${date}-${Date.now()}@example.test`,
    password: 'synthetic-password',
  }).returning({ id: users.id })
  const [diary] = await database.db.insert(diaries).values({
    userId: user!.id,
    date,
    title: 'Before',
    content: 'Before content',
  }).returning({ id: diaries.id })
  await database.db.insert(transactions).values({
    diaryId: diary!.id,
    userId: user!.id,
    symbol: 'OLD',
    type: 'BUY',
    quantity: '1',
    price: '10',
    tradeDate: new Date(`${date}T09:00:00.000Z`),
  })
  return { diaryId: diary!.id, userId: user!.id }
}

async function writeConcurrentUpdate(diaryId: bigint, userId: bigint, date: string) {
  await database.db.transaction(async tx => {
    await tx.update(diaries).set({ title: 'After', content: 'After content', updatedAt: new Date() }).where(and(
      eq(diaries.id, diaryId), eq(diaries.userId, userId),
    ))
    await tx.insert(transactions).values({
      diaryId,
      userId,
      symbol: 'NEW',
      type: 'BUY',
      quantity: '2',
      price: '20',
      tradeDate: new Date(`${date}T10:00:00.000Z`),
    })
  })
}

describe('Diary read snapshots through real PostgreSQL', () => {
  it.each([
    ['detail', readDiaryDetail],
    ['by-date', (_db: Database, id: bigint, userId: bigint, date: string) => readDiaryByDate(_db, date, userId)],
  ] as const)('keeps the %s projection on one snapshot across scalar and association updates', async (_name, read) => {
    const date = _name === 'detail' ? '2026-12-01' : '2026-12-02'
    const { diaryId, userId } = await seedDiary(date)
    const reader = await createGatedReader()
    const pending = _name === 'detail'
      ? read(reader.db, diaryId, userId)
      : read(reader.db, diaryId, userId, date)
    try {
      await reader.initialDiaryRead
      await writeConcurrentUpdate(diaryId, userId, date)
      reader.releaseAssociations()
      const snapshot = await pending
      if (!snapshot) throw new Error('Snapshot read unexpectedly returned no Diary')
      if (!snapshot.transactions) throw new Error('Snapshot read unexpectedly omitted transactions')
      expect(snapshot).toMatchObject({ id: diaryId.toString(), title: 'Before', content: 'Before content' })
      expect(snapshot.transactions.map(row => row.symbol)).toEqual(['OLD'])

      const latest = _name === 'detail'
        ? await readDiaryDetail(database.db, diaryId, userId)
        : await readDiaryByDate(database.db, date, userId)
      if (!latest) throw new Error('Latest read unexpectedly returned no Diary')
      if (!latest.transactions) throw new Error('Latest read unexpectedly omitted transactions')
      expect(latest).toMatchObject({ id: diaryId.toString(), title: 'After', content: 'After content' })
      expect(latest.transactions.map(row => row.symbol)).toEqual(['OLD', 'NEW'])
    } finally {
      reader.releaseAssociations()
      await reader.close()
    }
  })

  it('loads multiple representative associations with one bounded query per association', async () => {
    const date = '2026-12-03'
    const { diaryId, userId } = await seedDiary(date)
    await database.db.insert(transactions).values([1, 2].map(index => ({
      diaryId,
      userId,
      symbol: `OLD${index}`,
      type: 'BUY' as const,
      quantity: '1',
      price: '10',
      tradeDate: new Date(`${date}T${String(index + 9).padStart(2, '0')}:00:00.000Z`),
    })))
    const [firstStock, secondStock] = await database.db.insert(stocks).values([
      { symbol: `BOUND${Date.now()}A` },
      { symbol: `BOUND${Date.now()}B` },
    ]).returning({ id: stocks.id })
    await database.db.insert(diaryStocks).values([
      { diaryId, stockId: firstStock!.id },
      { diaryId, stockId: secondStock!.id },
    ])
    await database.db.insert(alerts).values([
      { diaryId, message: 'First alert', triggerAt: new Date(`${date}T12:00:00.000Z`) },
      { diaryId, message: 'Second alert', triggerAt: new Date(`${date}T13:00:00.000Z`) },
    ])

    const queries: string[] = []
    const observed = drizzle(database.pool, { schema, logger: { logQuery(query) { queries.push(query) } } })
    const result = await readDiaryDetail(observed, diaryId, userId)
    expect(result?.transactions).toHaveLength(3)
    expect(result?.stockSymbols).toHaveLength(2)
    expect(result?.alerts).toHaveLength(2)
    const count = (table: string) => queries.filter(query => query.toLowerCase().includes(`from "${table}"`)).length
    expect(count('transactions')).toBe(1)
    expect(count('trade_plans')).toBe(1)
    expect(count('diary_stocks')).toBe(1)
    expect(count('alerts')).toBe(1)
  })
})
