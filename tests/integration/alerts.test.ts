import { findUpcomingAlerts } from '../../apps/api/src/alert-pusher'
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
beforeAll(async () => { database = await provisionTestDatabase('alerts') })
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
async function diary(browser: BrowserSession, date = '2026-01-01') {
  const response = await browser.post('/api/diaries', { title: 'Reminder diary', content: 'Private body', date }); expect(response.status).toBe(201); return response.json()
}
function mutate(browser: BrowserSession, path: string, body: unknown = {}, method = 'PUT') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
async function list(browser: BrowserSession) { const response = await browser.request('/api/alerts'); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); return response.json() }
it('creates past/future single alerts, sorts by instant/id, dismisses idempotently and isolates owners', async () => {
  const browser = await login(), other = await login(), source = await diary(browser)
  const input = { diaryId: source.id, message: 'Revisit hypothesis', triggerAt: '2020-01-01T00:00:00.123Z' }
  const first = await browser.post('/api/alerts', input); expect(first.status).toBe(200); const alert = await first.json()
  expect(alert).toMatchObject({ diaryId: source.id, triggerAt: input.triggerAt, recurringMode: null, parentId: null, instanceNumber: 1, isDismissed: false, diary: { id: source.id, title: 'Reminder diary' } })
  const second = await (await browser.post('/api/alerts', { ...input, message: 'Same-time second' })).json()
  expect((await list(browser)).map((row:{id:string})=>row.id)).toEqual([alert.id,second.id]); expect(await list(other)).toEqual([])
  expect((await other.post('/api/alerts', input)).status).toBe(404); expect((await mutate(other, `/api/alerts/${alert.id}/dismiss`)).status).toBe(404)
  for (let i=0;i<2;i++) expect((await mutate(browser, `/api/alerts/${alert.id}/dismiss`)).status).toBe(200)
  expect((await list(browser)).map((row:{id:string})=>row.id)).toEqual([second.id])
  const legacy = await browser.post('/api/alerts', { diary_id: source.id, message: 'Legacy', trigger_at: input.triggerAt })
  expect(legacy.status).toBe(200)
  expect(await legacy.json()).toMatchObject({ diaryId: source.id, message: 'Legacy', triggerAt: input.triggerAt })
  expect((await browser.request('/api/alerts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})).status).toBe(403)
  expect((await fetch(baseUrl+'/api/alerts')).status).toBe(401); expect((await browser.request('/api/alerts',{headers:{authorization:'Bearer invalid'}})).status).toBe(401)
  expect((await mutate(browser, `/api/diaries/${source.id}`, {}, 'DELETE')).status).toBe(200); expect(await list(browser)).toEqual([])
})

it('keeps standalone Alert alias precedence, null fallback and missing-trigger defaults', async () => {
  const browser = await login(), source = await diary(browser)
  const triggerAt = '2026-03-02T09:00:00.000Z'

  const canonical = await browser.post('/api/alerts', { diaryId: source.id, message: 'Canonical', triggerAt })
  expect(canonical.status).toBe(200)
  expect(await canonical.json()).toMatchObject({ diaryId: source.id, message: 'Canonical', triggerAt })

  const conflict = await browser.post('/api/alerts', {
    diary_id: source.id,
    diaryId: '999999',
    message: 'Snake value wins',
    trigger_at: triggerAt,
    triggerAt: 'not-a-date',
    recurring_mode: 'WEEK',
    recurringMode: 'MONTH',
  })
  expect(conflict.status).toBe(200)
  expect(await conflict.json()).toMatchObject({ diaryId: source.id, recurringMode: 'WEEK' })

  const fallback = await browser.post('/api/alerts', {
    diary_id: null,
    diaryId: source.id,
    message: 'Camel fallback',
    trigger_at: null,
    triggerAt,
    recurring_mode: null,
    recurringMode: 'MONTH',
  })
  expect(fallback.status).toBe(200)
  expect(await fallback.json()).toMatchObject({ diaryId: source.id, recurringMode: 'MONTH' })

  const defaulted = await browser.post('/api/alerts', { diary_id: source.id, message: 'Default trigger' })
  expect(defaulted.status).toBe(200)
  expect(await defaulted.json()).toMatchObject({ diaryId: source.id, triggerAt: clock.toISOString(), recurringMode: null })

  const invalidSnake = await browser.post('/api/alerts', {
    diary_id: source.id,
    diaryId: source.id,
    message: 'Invalid snake trigger',
    trigger_at: 'not-a-date',
    triggerAt,
  })
  expect(invalidSnake.status).toBe(400)
})

it('materializes local 09:00 series, dismisses a child alone then the root together, and enforces same Diary parents', async () => {
  const browser=await login(), source=await diary(browser), other=await diary(browser,'2026-01-02')
  expect((await mutate(browser,'/api/user/settings',{timezone:'America/New_York'})).status).toBe(200)
  const response=await browser.post('/api/alerts',{diaryId:source.id,message:'Week reminders',triggerAt:'2026-03-07T12:00:00Z',recurringMode:'WEEK'});expect(response.status).toBe(200);const root=await response.json()
  expect(root.parentId).toBe(root.id);expect(root.triggerAt).toBe('2026-03-09T13:00:00.000Z');const items=await list(browser);expect(items).toHaveLength(5);expect(items.map((row:{instanceNumber:number})=>row.instanceNumber)).toEqual([1,2,3,4,5])
  expect((await mutate(browser,`/api/alerts/${items[1].id}/dismiss`)).status).toBe(200);expect(await list(browser)).toHaveLength(4)
  await expect(database.pool.query("insert into alerts (diary_id,message,trigger_at,recurring_mode,parent_id,instance_number) values ($1,'Bad parent',now(),'WEEK',$2,6)",[other.id,root.id])).rejects.toMatchObject({code:'23503'})
  expect((await mutate(browser,`/api/alerts/${root.id}/dismiss`)).status).toBe(200);expect(await list(browser)).toEqual([])
  await database.pool.query('update alerts set is_dismissed=false where id=$1',[items[2].id]);expect(await list(browser)).toEqual([])
  const empty=await browser.post('/api/alerts',{diaryId:source.id,message:'Month ends on weekend',triggerAt:'2026-05-31T12:00:00Z',recurringMode:'MONTH'});expect(empty.status).toBe(200);expect(await empty.json()).toBeNull()
})
it('rolls back the entire series on child failure and caps active reads at 100', async () => {
  const browser=await login(), source=await diary(browser)
  await database.pool.query("create function reject_alert_child() returns trigger language plpgsql as $$ begin if new.instance_number=2 then raise exception 'synthetic child failure'; end if; return new; end $$")
  await database.pool.query('create trigger reject_alert_child before insert on alerts for each row execute function reject_alert_child()')
  try { expect((await browser.post('/api/alerts',{diaryId:source.id,message:'Atomic series',triggerAt:'2026-03-02T12:00:00Z',recurringMode:'WEEK'})).status).toBe(500);expect((await database.pool.query('select count(*)::int as count from alerts where diary_id=$1',[source.id])).rows[0].count).toBe(0) }
  finally { await database.pool.query('drop trigger reject_alert_child on alerts');await database.pool.query('drop function reject_alert_child()') }
  const inserted=await database.pool.query("insert into alerts (diary_id,message,trigger_at) select $1,'Reminder '||n,timestamptz '2026-01-01' from generate_series(1,101) n returning id",[source.id])
  const result=await list(browser);expect(result).toHaveLength(100);expect(result.map((row:{id:string})=>row.id)).toEqual(inserted.rows.slice(0,100).map(row=>String(row.id)))
})

it('writes Diary reminders atomically, appends, preserves omission and replaces explicit arrays', async () => {
  const browser = await login(), other = await login()
  const draft = { message: 'Initial reminder', triggerAt: '2026-03-02T09:00:00.123Z' }
  const body = { title: 'With reminders', content: 'Original content', date: '2026-03-02' }
  const created = await browser.post('/api/diaries', { ...body, alerts: [draft] })
  expect(created.status).toBe(201)
  const source = await created.json()
  expect(source.alerts).toHaveLength(1)
  expect(source.alerts[0]).toMatchObject(draft)
  const appended = await browser.post('/api/diaries', { ...body, content: 'Append content', appendToToday: true, alerts: [{ ...draft, message: 'Appended reminder' }] })
  expect(appended.status).toBe(201)
  expect((await appended.json()).alerts).toHaveLength(2)
  const preserved = await mutate(browser, `/api/diaries/${source.id}`, { title: body.title, content: 'Edited content' })
  expect(preserved.status).toBe(200)
  expect((await preserved.json()).alerts).toHaveLength(2)
  for (const path of [`/api/diaries/${source.id}`, '/api/diaries/by-date?date=2026-03-02']) {
    const response = await browser.request(path)
    expect(response.status).toBe(200)
    expect((await response.json()).alerts).toHaveLength(2)
  }
  expect((await (await browser.request('/api/diaries')).json()).data[0].alerts).toHaveLength(2)
  expect((await other.request(`/api/diaries/${source.id}`)).status).toBe(404)
  expect((await mutate(other, `/api/diaries/${source.id}`, { ...body, alerts: [] })).status).toBe(404)
  expect((await mutate(browser, `/api/diaries/${source.id}`, { ...body, alerts: Array.from({ length: 51 }, () => draft) })).status).toBe(400)
  const replaced = await mutate(browser, `/api/diaries/${source.id}`, { ...body, alerts: [{ ...draft, id: source.alerts[0].id, recurringMode: 'WEEK' }] })
  expect(replaced.status).toBe(200)
  const series = (await replaced.json()).alerts
  expect(series).toHaveLength(5)
  expect(series[0].id).not.toBe(source.alerts[0].id)
  expect(series.every((row: { parentId: string }) => row.parentId === series[0].id)).toBe(true)
  const cleared = await mutate(browser, `/api/diaries/${source.id}`, { ...body, alerts: [] })
  expect(cleared.status).toBe(200)
  expect((await cleared.json()).alerts).toEqual([])
  expect(await list(browser)).toEqual([])
})

it('rolls back Diary content, ledger and previous reminders if replacement persistence fails', async () => {
  const browser = await login(), source = await diary(browser)
  const original = await (await browser.post('/api/alerts', { diaryId: source.id, message: 'Keep me', triggerAt: '2026-01-01T09:00:00Z' })).json()
  await database.pool.query("create function reject_diary_alert() returns trigger language plpgsql as $$ begin if new.message='Reject me' then raise exception 'synthetic alert failure'; end if; return new; end $$")
  await database.pool.query('create trigger reject_diary_alert before insert on alerts for each row execute function reject_diary_alert()')
  const failing = {
    title: 'Uncommitted title', content: 'Uncommitted content',
    alerts: [{ message: 'Reject me', triggerAt: '2026-01-02T09:00:00Z' }],
    transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '2', price: '10', tradeDate: '2026-01-01T00:00:00Z' }],
  }
  try {
    expect((await mutate(browser, `/api/diaries/${source.id}`, failing)).status).toBe(500)
    expect((await browser.post('/api/diaries', { ...failing, date: '2026-01-01', appendToToday: true })).status).toBe(500)
    expect((await browser.post('/api/diaries', { ...failing, date: '2026-01-02' })).status).toBe(500)
    const persisted = await (await browser.request(`/api/diaries/${source.id}`)).json()
    expect(persisted.title).toBe(source.title)
    expect(persisted.content).toBe(source.content)
    expect(persisted.transactions).toEqual([])
    expect(persisted.alerts.map((row: { id: string }) => row.id)).toEqual([original.id])
    expect(await (await browser.request('/api/diaries/by-date?date=2026-01-02')).json()).toBeNull()
  } finally {
    await database.pool.query('drop trigger reject_diary_alert on alerts')
    await database.pool.query('drop function reject_diary_alert()')
  }
})

it('serializes concurrent Diary appends without losing reminder collections', async () => {
  const browser = await login(), source = await diary(browser)
  const responses = await Promise.all([1, 2, 3].map(index => browser.post('/api/diaries', {
    title: source.title, content: `Append ${index}`, date: '2026-01-01', appendToToday: true,
    alerts: [{ message: `Reminder ${index}`, triggerAt: '2026-01-02T09:00:00Z' }],
  })))
  expect(responses.map(response => response.status)).toEqual([201, 201, 201])
  const persisted = await (await browser.request(`/api/diaries/${source.id}`)).json()
  expect(persisted.alerts.map((row: { message: string }) => row.message).sort()).toEqual(['Reminder 1', 'Reminder 2', 'Reminder 3'])
  for (const index of [1, 2, 3]) expect(persisted.content).toContain(`Append ${index}`)
})

it('queries the half-open pusher window with parent dismissal protection and no delivery writes', async () => {
  const browser = await login(), source = await diary(browser)
  const instants = ['2090-01-01T11:59:59.999Z', '2090-01-01T12:00:00.000Z', '2090-01-01T12:01:04.999Z', '2090-01-01T12:01:05.000Z']
  const ids: string[] = []
  for (const triggerAt of instants) {
    const response = await browser.post('/api/alerts', { diaryId: source.id, message: 'Boundary reminder', triggerAt })
    expect(response.status).toBe(200); ids.push((await response.json()).id)
  }
  const inserted = await database.pool.query("insert into alerts (diary_id,message,trigger_at,recurring_mode,is_dismissed) values ($1,'Dismissed root','2090-01-01T12:00:00Z','WEEK',true) returning id", [source.id])
  const rootId = inserted.rows[0].id
  await database.pool.query('update alerts set parent_id=id where id=$1', [rootId])
  await database.pool.query("insert into alerts (diary_id,message,trigger_at,recurring_mode,parent_id,instance_number) values ($1,'Hidden child','2090-01-01T12:00:00Z','WEEK',$2,2)", [source.id, rootId])
  const start = new Date('2090-01-01T12:00:00Z'), end = new Date('2090-01-01T12:01:05Z')
  const before = await database.pool.query('select id,is_dismissed from alerts where diary_id=$1 order by id', [source.id])
  for (let tick = 0; tick < 2; tick++) {
    const hints = (await findUpcomingAlerts(database.db, start, end)).filter(row => String(row.diary.id) === source.id)
    expect(hints.map(row => String(row.id))).toEqual(ids.slice(1, 3))
    expect(hints[0]!.diary.title).toBe(source.title)
  }
  expect((await database.pool.query('select id,is_dismissed from alerts where diary_id=$1 order by id', [source.id])).rows).toEqual(before.rows)
})
