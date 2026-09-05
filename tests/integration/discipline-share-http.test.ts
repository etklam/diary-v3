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
beforeAll(async () => { database = await provisionTestDatabase('discipline_share_http') })
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
const share = (contents: string[]) => JSON.stringify({ version: '1.0', type: 'trading-disciplines', disciplines: contents.map(content => ({ content })) })
it('exports private allowlisted content and imports duplicates in file order with append or replace', async () => {
 const owner = await login(), other = await login()
 expect((await owner.request('/api/discipline/export')).status).toBe(404)
 const first = await (await owner.post('/api/discipline', { content: 'Original' })).json()
 await database.pool.query("update users set name='Synthetic author' where id=(select user_id from disciplines where id=$1)", [first.id])
 const exported = await owner.request('/api/discipline/export?title=Unicode%20%26%20%E5%8E%9F%E5%89%87&includeAuthor=true')
 expect(exported.headers.get('cache-control')).toBe('no-store'); const result = await exported.json()
 expect(result.data).toMatchObject({ author: 'Synthetic author', title: 'Unicode & 原則', count: 1, disciplines: [{ content: 'Original', order: 0 }] })
 expect(JSON.parse(result.json)).toEqual(result.data); expect(result.json).not.toContain('userId'); expect(result.json).not.toContain('createdAt')
 expect((await (await owner.request('/api/discipline/export')).json()).data.author).toBe('Anonymous')
 const imported = await owner.post('/api/discipline/import', { json: share(['A', ' ', 'A', 'B 😀']) })
 expect(imported.status).toBe(200); expect(await imported.json()).toMatchObject({ imported: 3 })
 let rows = await (await owner.request('/api/discipline')).json(); expect(rows.map((r: { content: string }) => r.content)).toEqual(['Original', 'A', 'A', 'B 😀'])
 expect(rows.map((r: { order: number }) => r.order)).toEqual([0, 1, 2, 3])
 expect((await owner.post('/api/discipline/import', { json: share(['Replacement']), replaceExisting: true })).status).toBe(200)
 rows = await (await owner.request('/api/discipline')).json(); expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ content: 'Replacement', order: 0 })
 expect(await (await other.request('/api/discipline')).json()).toEqual([])
 expect((await owner.post('/api/discipline/import', { json: share(['x'.repeat(256)]), replaceExisting: true })).status).toBe(400)
 expect(await (await owner.request('/api/discipline')).json()).toEqual(rows)
 expect((await owner.post('/api/discipline/import', { json: result.json }, false)).status).toBe(403)
 expect((await fetch(`${baseUrl}/api/discipline/export`)).status).toBe(401)
})
it('rolls back replacement deletion when an imported row fails to persist', async () => {
 const owner = await login(); const original = await (await owner.post('/api/discipline', { content: 'Preserved original' })).json()
 await database.pool.query("CREATE FUNCTION synthetic_import_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.content = 'FAIL' THEN RAISE EXCEPTION 'Synthetic import failure'; END IF; RETURN NEW; END $$")
 await database.pool.query('CREATE TRIGGER synthetic_import_failure BEFORE INSERT ON disciplines FOR EACH ROW EXECUTE FUNCTION synthetic_import_failure()')
 try {
  expect((await owner.post('/api/discipline/import', { json: share(['Good', 'FAIL']), replaceExisting: true })).status).toBe(500)
  expect(await (await owner.request('/api/discipline')).json()).toEqual([original])
 } finally {
  await database.pool.query('DROP TRIGGER synthetic_import_failure ON disciplines'); await database.pool.query('DROP FUNCTION synthetic_import_failure()')
 }
})

it('renders bounded escaped OG text with safe public caching headers', async () => {
 const title = `<script>${'長標題'.repeat(40)}</script>`, author = `<img>${'作者'.repeat(60)}`
 const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
 const boundedAuthor = escape([...author].slice(0, 32).join('')), overBoundedAuthor = escape([...author].slice(0, 33).join(''))
 const response = await fetch(`${baseUrl}/api/og/discipline.svg?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&count=99999999`)
 expect(response.status).toBe(200)
 expect(response.headers.get('content-type')).toContain('image/svg+xml')
 expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
 expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
 const svg = await response.text()
 expect(svg).toContain('&lt;script&gt;')
 expect(svg).toContain('&lt;img&gt;')
 expect(svg).toContain(`by ${boundedAuthor}`)
 expect(svg).not.toContain(`by ${overBoundedAuthor}`)
 expect(svg).not.toContain('<script>')
 expect(svg).not.toContain('<img>')
 expect(svg).toContain('0 trading principles')
 expect(svg.length).toBeLessThan(5000)
})
