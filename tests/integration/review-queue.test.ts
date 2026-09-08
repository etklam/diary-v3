import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('queue') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, config: {
    jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })
async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-review-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return browser
}
function update(browser: BrowserSession, path: string, body: unknown, method = 'PATCH') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
async function diary(browser: BrowserSession, date: string, due: string | null) {
  const response = await browser.post('/api/diaries', { title: date, content: 'Private diary body', date, thesis: 'Original thesis', risk: 'Original risk', reviewDueAt: due })
  expect(response.status).toBe(201); return response.json()
}
async function queue(browser: BrowserSession, query = '') {
  const response = await browser.request('/api/reviews' + query); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); return response.json()
}
it('classifies mixed targets, excludes none/archived, and moves completed reviews without reflection leakage', async () => {
  const browser = await login(), other = await login()
  const overdue = await diary(browser, '2026-09-01', '2026-09-04T15:59:59.999Z')
  const today = await diary(browser, '2026-09-02', '2026-09-04T16:00:00Z')
  const upcoming = await diary(browser, '2026-09-03', '2026-09-05T16:00:00Z')
  const unscheduled = await diary(browser, '2026-09-04', null)
  await database.pool.query("update diaries set review_status = 'pending' where id = $1", [unscheduled.id])
  const none = await diary(browser, '2026-09-05', null)
  await diary(other, '2026-09-01', '2026-09-05T12:00:00Z')
  expect((await update(browser, '/api/stocks/AAPL/thesis', { status: 'ACTIVE', summary: 'Company thesis', whyIOwnIt: 'Reason', reviewDueAt: '2026-09-05T12:00:00Z' }, 'PUT')).status).toBe(200)
  let result = await queue(browser)
  expect(result.overdue.map((item: {id:string}) => item.id)).toEqual([overdue.id]); expect(result.today.map((item: {targetType:string}) => item.targetType)).toEqual(['diary','thesis'])
  expect(result.upcoming[0].id).toBe(upcoming.id); expect(result.unscheduled[0].id).toBe(unscheduled.id)
  expect(Object.values(result).flat().some(item => (item as {id:string}).id === none.id)).toBe(false)
  await update(browser, `/api/diaries/${today.id}/review`, { reviewOutcome: 'INTACT', reviewSummary: 'Private completed reflection' })
  await browser.post('/api/stocks/AAPL/thesis/reviews', { outcome: 'PARTIAL', portfolioDecision: 'REDUCE', whatChanged: 'Private company reflection' })
  result = await queue(browser)
  expect(result.today).toEqual([]); expect(result.completed).toHaveLength(2); expect(JSON.stringify(result)).not.toContain('Private')
  expect(result.completed.find((item: {targetType:string}) => item.targetType === 'thesis')).toMatchObject({ portfolioDecision: 'REDUCE', reviewOutcome: 'PARTIAL' })
})
it('uses half-open account-local midnight windows through spring and fall DST', async () => {
  for (const [instant, start, finish] of [['2026-03-08T12:00:00Z','2026-03-08T05:00:00Z','2026-03-09T04:00:00Z'],['2026-11-01T12:00:00Z','2026-11-01T04:00:00Z','2026-11-02T05:00:00Z']]) {
    clock = new Date(instant!); const browser = await login()
    expect((await update(browser, '/api/user/settings', { timezone: 'America/New_York' }, 'PUT')).status).toBe(200)
    const before = await diary(browser, '2026-01-01', new Date(new Date(start!).getTime() - 1).toISOString())
    const first = await diary(browser, '2026-01-02', start!), last = await diary(browser, '2026-01-03', new Date(new Date(finish!).getTime() - 1).toISOString()), next = await diary(browser, '2026-01-04', finish!)
    const result = await queue(browser)
    expect(result.overdue.map((row: {id:string}) => row.id)).toEqual([before.id]); expect(result.today.map((row: {id:string}) => row.id)).toEqual([first.id,last.id]); expect(result.upcoming[0].id).toBe(next.id)
  }
})
it('paginates each bucket deterministically and rejects invalid credentials and limits', async () => {
  const browser = await login(), ids = []
  for (let i = 1; i <= 5; i++) ids.push((await diary(browser, `2026-09-0${i}`, '2026-09-05T10:00:00Z')).id)
  expect((await queue(browser, '?page=1&limit=2')).today.map((row: {id:string}) => row.id)).toEqual(ids.slice(0,2))
  expect((await queue(browser, '?page=2&limit=2')).today.map((row: {id:string}) => row.id)).toEqual(ids.slice(2,4))
  expect((await queue(browser, '?page=3&limit=2')).today.map((row: {id:string}) => row.id)).toEqual(ids.slice(4))
  // Counts stay absolute across pages so navigation never reads as empty work.
  expect((await queue(browser, '?page=3&limit=2')).counts).toEqual({ overdue: 0, today: 5, upcoming: 0, unscheduled: 0, completed: 0 })
  expect((await browser.request('/api/reviews?limit=201')).status).toBe(400)
  expect((await browser.request('/api/reviews?target=company')).status).toBe(400)
  expect((await browser.request('/api/reviews', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await fetch(baseUrl+'/api/reviews')).status).toBe(401)
})
it('scopes items and counts to the requested target type', async () => {
  const browser = await login()
  await diary(browser, '2026-09-01', '2026-09-05T10:00:00Z')
  expect((await update(browser, '/api/stocks/AAPL/thesis', { status: 'ACTIVE', summary: 'Company thesis', whyIOwnIt: 'Reason', reviewDueAt: '2026-09-05T10:00:00Z' }, 'PUT')).status).toBe(200)
  const diaries = await queue(browser, '?target=diary')
  expect(diaries.today.map((row: {targetType:string}) => row.targetType)).toEqual(['diary'])
  expect(diaries.counts).toEqual({ overdue: 0, today: 1, upcoming: 0, unscheduled: 0, completed: 0 })
  const theses = await queue(browser, '?target=thesis')
  expect(theses.today.map((row: {targetType:string}) => row.targetType)).toEqual(['thesis'])
  expect(theses.counts.today).toBe(1)
  const both = await queue(browser)
  expect(both.today).toHaveLength(2); expect(both.counts.today).toBe(2)
})
it('reports absolute bucket totals beyond the page slice and caps diary stock symbols', async () => {
  const browser = await login()
  const post = async (extra: Record<string, unknown>) => {
    const response = await browser.post('/api/diaries', { title: 'Queue entry', content: 'Synthetic body', date: '2026-09-01', thesis: 'Original thesis', risk: 'Original risk', ...extra })
    expect(response.status).toBe(201); return response.json()
  }
  for (let i = 1; i <= 25; i++) await post({ title: `Overdue ${i}`, date: `2026-08-${String(i).padStart(2, '0')}`, reviewDueAt: '2026-09-04T10:00:00Z', ...(i === 1 ? { stockSymbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA'] } : {}) })
  await post({ title: 'Today', date: '2026-09-02', reviewDueAt: '2026-09-05T09:00:00Z' })
  await post({ title: 'Upcoming', date: '2026-09-03', reviewDueAt: '2026-09-06T09:00:00Z' })
  const unscheduled = await post({ title: 'Unscheduled', date: '2026-09-04', reviewDueAt: null })
  await database.pool.query("update diaries set review_status = 'pending' where id = $1", [unscheduled.id])
  const done = await post({ title: 'Done', date: '2026-09-05', reviewDueAt: '2026-09-04T10:00:00Z' })
  await update(browser, `/api/diaries/${done.id}/review`, { reviewOutcome: 'INTACT', reviewSummary: 'Private reflection' })
  expect((await update(browser, '/api/stocks/AAPL/thesis', { status: 'ACTIVE', summary: 'Company thesis', whyIOwnIt: 'Reason', reviewDueAt: '2026-09-04T10:00:00Z' }, 'PUT')).status).toBe(200)
  const first = await queue(browser, '?page=1&limit=20')
  expect(first.counts).toEqual({ overdue: 26, today: 1, upcoming: 1, unscheduled: 1, completed: 1 })
  expect(first.overdue).toHaveLength(20); expect(first.today).toHaveLength(1)
  expect(first.overdue[0].stockSymbols).toEqual(['AAPL', 'MSFT', 'NVDA'])
  expect(first.overdue.every((row: {targetType:string}) => row.targetType === 'diary')).toBe(true)
  // Page 2 holds the tail plus the thesis; buckets without a page still keep totals.
  const second = await queue(browser, '?page=2&limit=20')
  expect(second.counts).toEqual(first.counts)
  expect(second.overdue).toHaveLength(6)
  expect(second.today).toEqual([]); expect(second.upcoming).toEqual([]); expect(second.unscheduled).toEqual([]); expect(second.completed).toEqual([])
  const thesis = second.overdue.find((row: {targetType:string}) => row.targetType === 'thesis')
  expect(thesis.symbol).toBe('AAPL'); expect(thesis.stockSymbols).toBeUndefined()
  expect(second.overdue.find((row: {targetType:string}) => row.targetType === 'diary').stockSymbols).toEqual([])
})
it('classifies due instants by account-local days in Asia/Taipei, not UTC days', async () => {
  clock = new Date('2026-05-01T12:00:00Z') // 20:00 Taipei on 2026-05-01
  const browser = await login()
  expect((await update(browser, '/api/user/settings', { timezone: 'Asia/Taipei' }, 'PUT')).status).toBe(200)
  // 15:59Z is 23:59 Taipei on May 1 (today); 16:01Z is 00:01 on May 2 (upcoming).
  const lateToday = await diary(browser, '2026-05-01', '2026-05-01T15:59:00Z')
  const afterMidnight = await diary(browser, '2026-05-04', '2026-05-01T16:01:00Z')
  // 2026-04-30T23:59:59Z is still April 30 on UTC days but 07:59 Taipei on May 1.
  const utcBoundary = await diary(browser, '2026-05-03', '2026-04-30T23:59:59Z')
  const overdue = await diary(browser, '2026-04-30', '2026-04-30T15:59:00Z') // 23:59 Taipei on April 30
  const result = await queue(browser)
  expect(result.counts).toEqual({ overdue: 1, today: 2, upcoming: 1, unscheduled: 0, completed: 0 })
  expect(result.overdue.map((row: {id:string}) => row.id)).toEqual([overdue.id])
  expect(result.today.map((row: {id:string}) => row.id)).toEqual([utcBoundary.id, lateToday.id])
  expect(result.upcoming.map((row: {id:string}) => row.id)).toEqual([afterMidnight.id])
})
it('retains the latest 50 completed diaries and the first 100 active thesis candidates', async () => {
  const browser = await login()
  const me = await (await browser.request('/api/auth/me')).json(), owner = me.data.id
  const completed = await database.pool.query(`insert into diaries (user_id,date,title,content,review_status,reviewed_at,review_outcome,review_summary)
    select $1, date '2025-01-01' + n, 'Completed ' || n, 'Synthetic', 'reviewed', timestamptz '2026-01-01' + n * interval '1 minute', 'INTACT', 'Private reflection'
    from generate_series(1,51) n returning id,title`, [owner])
  await database.pool.query(`with symbols as (
    insert into stocks (symbol) select 'QUEUECAP' || n from generate_series(1,101) n on conflict (symbol) do update set symbol=excluded.symbol returning id,symbol
  ) insert into investment_theses (user_id,stock_id,status,summary,why_i_own_it,review_due_at)
    select $1,id,'ACTIVE','Synthetic','Reason',timestamptz '2099-01-01' + substring(symbol from 9)::integer * interval '1 day' from symbols`, [owner])
  const result = await queue(browser, '?limit=200')
  expect(result.completed).toHaveLength(50)
  expect(result.completed.some((item: {id:string}) => item.id === String(completed.rows.find(row => row.title === 'Completed 1').id))).toBe(false)
  expect(result.upcoming).toHaveLength(100)
  expect(result.upcoming.at(-1).symbol).toBe('QUEUECAP100')
  expect(JSON.stringify(result)).not.toContain('Private reflection')
})
