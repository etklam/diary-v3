import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { createMarketData } from '../../apps/api/src/market-data'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('partner_http') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, marketData: createMarketData({ now: () => clock, upstream: {
    quote: async symbol => ({ symbol, regularMarketPrice: 120, regularMarketPreviousClose: 100, regularMarketTime: clock, marketState: 'REGULAR' }),
    chart: async () => ({ quotes: [] }),
  } }), config: {
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
  return { browser, email: credentials.email }
}
function mutate(browser: BrowserSession, path: string, body: unknown = {}, method = 'PUT') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
it('invites, accepts and updates only each participant side before removal', async () => {
 const a = await login(), b = await login(), outsider = await login()
 expect((await a.browser.post('/api/partners', { partnerEmail: a.email })).status).toBe(400)
 const created = await a.browser.post('/api/partners', { partnerEmail: b.email.toUpperCase() }); expect(created.status).toBe(200)
 expect((await a.browser.post('/api/partners', { partnerEmail: b.email })).status).toBe(409)
 const { link } = await created.json(); expect(link).toMatchObject({ status: 'pending_outgoing', selfSharesDiaries: false, partnerSharesStockNotes: false })
 expect(link.partner).toEqual({ id: expect.any(String), email: b.email, name: null })
 expect((await (await b.browser.request('/api/partners')).json()).links[0].status).toBe('pending_incoming')
 expect((await a.browser.post(`/api/partners/${link.id}/accept`, {})).status).toBe(403)
 expect((await outsider.browser.post(`/api/partners/${link.id}/accept`, {})).status).toBe(403)
 expect((await mutate(a.browser, `/api/partners/${link.id}/sharing`, { shareDiaries: true })).status).toBe(409)
 expect((await b.browser.post(`/api/partners/${link.id}/accept`, {})).status).toBe(200)
 expect((await b.browser.post(`/api/partners/${link.id}/accept`, {})).status).toBe(403)
 const changes = await Promise.all([mutate(a.browser, `/api/partners/${link.id}/sharing`, { shareDiaries: true }), mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: true })])
 expect(changes.map(r => r.status)).toEqual([200,200])
 const listed = await a.browser.request('/api/partners'); expect(listed.headers.get('cache-control')).toBe('no-store')
 expect((await listed.json()).links[0]).toMatchObject({ status: 'connected', selfSharesDiaries: true, partnerSharesDiaries: false, selfSharesStockNotes: false, partnerSharesStockNotes: true })
 expect((await mutate(outsider.browser, `/api/partners/${link.id}/sharing`, { shareDiaries: true })).status).toBe(403)
 expect((await mutate(a.browser, `/api/partners/${link.id}/sharing`, { partnerSharesDiaries: true })).status).toBe(400)
 expect((await a.browser.post('/api/partners', { partnerEmail: outsider.email }, false)).status).toBe(403)
 expect((await fetch(`${baseUrl}/api/partners`)).status).toBe(401)
 expect((await mutate(outsider.browser, `/api/partners/${link.id}`, {}, 'DELETE')).status).toBe(403)
 expect((await mutate(a.browser, `/api/partners/${link.id}`, {}, 'DELETE')).status).toBe(200)
 expect((await (await a.browser.request('/api/partners')).json()).links).toEqual([])
 expect((await mutate(a.browser, `/api/partners/${link.id}/sharing`, { shareDiaries: true })).status).toBe(404)
})
it('concurrent reverse invitations yield one link and recipient-only acceptance has a single winner', async () => {
 const a = await login(), b = await login()
 const results = await Promise.all([a.browser.post('/api/partners', { partnerEmail: b.email }), b.browser.post('/api/partners', { partnerEmail: a.email })])
 expect(results.map(r => r.status).sort()).toEqual([200,409])
 const { link } = await results.find(r => r.status === 200)!.json()
 const incoming = (await (await a.browser.request('/api/partners')).json()).links[0].pendingIncoming ? a.browser : b.browser
 const accepted = await Promise.all([incoming.post(`/api/partners/${link.id}/accept`, {}), incoming.post(`/api/partners/${link.id}/accept`, {})])
 expect(accepted.map(r => r.status).sort()).toEqual([200,403])
 expect((await (await incoming.request('/api/partners')).json()).links).toHaveLength(1)
})
it('lists accepted relationships before newer pending invitations with stable viewer projections', async () => {
 const a = await login(), b = await login(), c = await login()
 const { link: accepted } = await (await a.browser.post('/api/partners', { partnerEmail: b.email })).json()
 await b.browser.post(`/api/partners/${accepted.id}/accept`, {})
 clock = new Date('2026-09-06T12:00:00Z')
 const { link: pending } = await (await c.browser.post('/api/partners', { partnerEmail: a.email })).json()
 const { links } = await (await a.browser.request('/api/partners')).json()
 expect(links.map((row: { id: string }) => row.id)).toEqual([accepted.id, pending.id])
 expect(links[0]).toMatchObject({ status: 'connected', partner: { email: b.email }, initiatedByCurrentUser: true })
 expect(links[1]).toMatchObject({ status: 'pending_incoming', partner: { email: c.email }, initiatedByCurrentUser: false })
 expect((await (await c.browser.request('/api/partners')).json()).links[0]).toMatchObject({ partner: { email: a.email }, status: 'pending_outgoing' })
})
it('shared notes require the other side flag and disappear after revocation or unlinking', async () => {
 const a = await login(), b = await login(), stranger = await login()
 const { link } = await (await a.browser.post('/api/partners', { partnerEmail: b.email })).json()
 const targetId = link.partner.id
 const note = await (await b.browser.post('/api/stocks/AAPL/notes', { title: 'Partner note', content: 'Allowed research only' })).json()
 const path = `/api/stocks/AAPL/notes?partnerId=${targetId}`
 expect((await a.browser.request(path)).status).toBe(403)
 await b.browser.post(`/api/partners/${link.id}/accept`, {})
 await mutate(a.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: true })
 expect((await a.browser.request(path)).status).toBe(403)
 await mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: true })
 const allowed = await a.browser.request(path); expect(allowed.status).toBe(200)
 const result = await allowed.json(); expect(result.data).toHaveLength(1); expect(result.data[0]).toMatchObject({ id: note.id, content: 'Allowed research only', isOwnedByViewer: false })
 expect(result.data[0]).not.toHaveProperty('userId'); expect(result.data[0]).not.toHaveProperty('email')
 expect((await mutate(a.browser, `/api/stocks/AAPL/notes/${note.id}`, { title: 'Intrusion' })).status).toBe(404)
 expect((await mutate(a.browser, `/api/stocks/AAPL/notes/${note.id}`, {}, 'DELETE')).status).toBe(404)
 expect((await stranger.browser.request(path)).status).toBe(403)
 await mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: false })
 expect((await a.browser.request(path)).status).toBe(403)
 expect((await a.browser.request(`/api/stocks/NEVEREXISTS/notes?partnerId=${targetId}`)).status).toBe(403)
 await mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: true })
 await mutate(b.browser, `/api/partners/${link.id}`, {}, 'DELETE')
 expect((await a.browser.request(path)).status).toBe(403)
})
it('company hub merges only authorized partner notes without partner private context', async () => {
 const a = await login(), b = await login()
 const { link } = await (await a.browser.post('/api/partners', { partnerEmail: b.email })).json()
 await a.browser.post('/api/stocks/AAPL/notes', { title: 'Owner note', content: 'Owner research', date: '2026-01-01T00:00:00Z' })
 await b.browser.post('/api/stocks/AAPL/notes', { title: 'Partner note', content: 'Shared research', date: '2026-02-01T00:00:00Z' })
 expect((await b.browser.post('/api/diaries', { date: '2026-02-01', title: 'Private partner diary', content: 'Private partner body', stockSymbols: ['AAPL'], transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-02-01T00:00:00Z' }] })).status).toBe(201)
 expect((await mutate(b.browser, '/api/stocks/AAPL/thesis', { status: 'ACTIVE', summary: 'Private partner thesis', whyIOwnIt: 'Private reason' })).status).toBe(200)
 expect((await b.browser.post('/api/stocks/AAPL/thesis/reviews', { outcome: 'PARTIAL', portfolioDecision: 'REDUCE', whatChanged: 'Private partner reflection' })).status).toBe(200)
 expect((await b.browser.post('/api/stocks/AAPL/evidence', { sourceType: 'MANUAL', summary: 'Private partner evidence', occurredAt: '2026-02-01T00:00:00Z' })).status).toBe(200)
 const hub = async () => { const response = await a.browser.request('/api/stocks/AAPL/hub'); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); return response.json() }
 expect((await hub()).notes).toHaveLength(1)
 await b.browser.post(`/api/partners/${link.id}/accept`, {})
 await mutate(a.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: true })
 expect((await hub()).notes).toHaveLength(1)
 await mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: true })
 const shared = await hub()
 expect(shared.notes).toHaveLength(2); expect(shared.notes[0]).toMatchObject({ title: 'Partner note', source: 'partner', sourceName: 'Partner' }); expect(shared.notes[1].source).toBe('owner')
 expect(JSON.stringify(shared)).not.toContain(b.email); expect(shared.relatedDiaries).toEqual([]); expect(shared.thesis).toBeNull()
 expect(shared.evidence).toEqual([]); expect(shared.reviews).toEqual([]); expect(shared.latestReview).toBeNull(); expect(shared.position).toMatchObject({ state: 'research_only', quantity: 0, totalCost: 0, averageCost: null }); expect(JSON.stringify(shared)).not.toContain('Private partner')
 for (let day = 2; day <= 12; day++) expect((await b.browser.post('/api/stocks/AAPL/notes', { title: `Recent ${day}`, content: 'Shared research', date: `2026-02-${String(day).padStart(2, '0')}T00:00:00Z` })).status).toBe(200)
 const bounded = await hub(); expect(bounded.notes).toHaveLength(10); expect(bounded.notes.map((note: { title: string }) => note.title)).toEqual(Array.from({ length: 10 }, (_, i) => `Recent ${12 - i}`))
 await mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: false })
 expect((await hub()).notes).toHaveLength(1)
 await mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: true })
 await mutate(b.browser, `/api/partners/${link.id}`, {}, 'DELETE')
 expect((await hub()).notes).toHaveLength(1)
})
it('compares civil dates with explicit privacy fields and live sharing permission', async () => {
 const a = await login(), b = await login(), outsider = await login()
 const compare = async (query = '') => a.browser.request(`/api/partners/compare${query}`)
 expect((await (await compare()).json()).compareDays).toEqual([])
 const { link } = await (await a.browser.post('/api/partners', { partnerEmail: b.email })).json()
 const query = `?partnerId=${link.partner.id}`
 expect((await compare(query)).status).toBe(409)
 await b.browser.post(`/api/partners/${link.id}/accept`, {})
 let partnerDiaryId = ''
 for (const [browser, date, title] of [[a.browser, '2026-03-08', 'Owner DST day'], [b.browser, '2026-03-08', 'Partner same day'], [b.browser, '2026-03-09', 'Partner only']] as const) {
  const diaryResponse = await browser.post('/api/diaries', { date, title, content: 'Shareable body', tags: ['research'], thesis: 'Private thesis', transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '1', price: '100', tradeDate: `${date}T00:00:00Z` }] })
  expect(diaryResponse.status).toBe(201)
  const diary = await diaryResponse.json() as { id: string }
  if (browser === b.browser && date === '2026-03-08') partnerDiaryId = diary.id
 }
 expect(partnerDiaryId).toBeTruthy()
 const alertResponse = await b.browser.post('/api/alerts', { diaryId: partnerDiaryId, message: 'Private partner reminder', triggerAt: '2026-03-08T09:00:00Z' })
 expect(alertResponse.status).toBe(200)
 expect((await (await b.browser.request('/api/alerts')).json()).map((alert: { message: string }) => alert.message)).toContain('Private partner reminder')
 await mutate(a.browser, `/api/partners/${link.id}/sharing`, { shareDiaries: true })
 let response = await compare(query); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store')
 let data = await response.json(); expect(data.compareDays).toHaveLength(1); expect(data.compareDays[0].partnerDiary).toBeNull()
 await mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareDiaries: true })
 response = await compare(query); data = await response.json()
 expect(data.compareDays.map((day: { dateKey: string }) => day.dateKey)).toEqual(['2026-03-09', '2026-03-08'])
 expect(data.compareDays[0].ownerDiary).toBeNull(); expect(data.compareDays[1].ownerDiary.title).toBe('Owner DST day'); expect(data.compareDays[1].partnerDiary.title).toBe('Partner same day')
 expect(Object.keys(data.compareDays[1].partnerDiary).sort()).toEqual(['id','title','content','tags','createdVia','createdByLabel','date','createdAt','updatedAt'].sort())
 expect(JSON.stringify(data)).not.toContain('Private thesis'); expect(JSON.stringify(data)).not.toContain('Private partner reminder'); expect(JSON.stringify(data)).not.toContain('email'); expect(JSON.stringify(data)).not.toContain('transactions')
 expect((await (await compare(query + '&limit=1')).json()).compareDays).toHaveLength(1)
 expect((await compare(query + '&limit=61')).status).toBe(400)
 expect((await outsider.browser.request(`/api/partners/compare${query}`)).status).toBe(404)
 await mutate(b.browser, `/api/partners/${link.id}/sharing`, { shareDiaries: false })
 expect((await (await compare(query)).json()).compareDays[0].partnerDiary).toBeNull()
 await mutate(b.browser, `/api/partners/${link.id}`, {}, 'DELETE')
 expect((await compare(query)).status).toBe(404)
 expect((await fetch(`${baseUrl}/api/partners/compare`)).status).toBe(401)
})
it('bounds the merged civil-day union and selects partners independently of timezone', async () => {
 const a = await login(), b = await login(), c = await login()
 const { link: first } = await (await a.browser.post('/api/partners', { partnerEmail: b.email })).json()
 await b.browser.post(`/api/partners/${first.id}/accept`, {})
 await mutate(b.browser, `/api/partners/${first.id}/sharing`, { shareDiaries: true })
 clock = new Date('2026-09-06T00:00:00Z')
 const { link: second } = await (await a.browser.post('/api/partners', { partnerEmail: c.email })).json()
 await c.browser.post(`/api/partners/${second.id}/accept`, {})
 await mutate(c.browser, `/api/partners/${second.id}/sharing`, { shareDiaries: true })
 expect((await mutate(a.browser, '/api/user/settings', { timezone: 'America/Los_Angeles' })).status).toBe(200)
 expect((await mutate(b.browser, '/api/user/settings', { timezone: 'Pacific/Kiritimati' })).status).toBe(200)
 for (let day = 0; day < 64; day++) {
  const date = new Date(Date.UTC(2026, 0, day + 1)).toISOString().slice(0, 10)
  expect((await (day % 2 ? a : b).browser.post('/api/diaries', { date, title: `Day ${day}`, content: 'Synthetic comparison' })).status).toBe(201)
 }
 const get = async (query = '') => { const response = await a.browser.request('/api/partners/compare' + query); expect(response.status).toBe(200); return response.json() }
 expect((await get()).selectedPartnerId).toBe(second.partner.id)
 const limited = await get(`?partnerId=${first.partner.id}`); expect(limited.compareDays).toHaveLength(20)
 const full = await get(`?partnerId=${first.partner.id}&limit=60`); expect(full.compareDays).toHaveLength(60)
 expect(full.compareDays[0].dateKey).toBe('2026-03-05'); expect(full.compareDays[59].dateKey).toBe('2026-01-05')
 expect(full.compareDays.every((day: { ownerDiary: unknown; partnerDiary: unknown }) => Boolean(day.ownerDiary) !== Boolean(day.partnerDiary))).toBe(true)
 await mutate(a.browser, '/api/user/settings', { timezone: 'Pacific/Honolulu' })
 expect((await get(`?partnerId=${first.partner.id}&limit=60`)).compareDays).toEqual(full.compareDays)
 for (const limit of ['0','1.5','nope','-1']) expect((await a.browser.request(`/api/partners/compare?limit=${limit}`)).status).toBe(400)
})
