import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { authUserResponseSchema } from '@diary/contracts'
import { recentDiaryTagsResponseSchema } from '@diary/contracts/diary-tags'
import { diaries } from '@diary/db'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string
beforeAll(async () => { database = await provisionTestDatabase('diary_recent_tags') })
beforeEach(async () => {
  const app = createApp({ db: database.db, config: {
    jwtSecret: 'synthetic-recent-tags-key-with-32-chars', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-recent-tags-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  const response = await browser.post('/api/auth/login', credentials)
  const account = authUserResponseSchema.parse(await response.json())
  await browser.request('/api/auth/me')
  return { browser, id: BigInt(account.data.id) }
}

it('suggests the account own tags newest first, bounded, and never another owner tags', async () => {
  const a = await login(), b = await login()
  await database.db.insert(diaries).values([
    { userId: a.id, title: 'Oldest', content: 'x', date: '2026-01-01', tags: ['oldest', 'shared'] },
    { userId: a.id, title: 'Middle', content: 'x', date: '2026-02-01', tags: ['middle', 'shared'] },
    { userId: a.id, title: 'Newest', content: 'x', date: '2026-03-01', tags: ['newest', '  ', 'shared'] },
    { userId: b.id, title: 'Other owner', content: 'x', date: '2026-03-02', tags: ['other-owner'] },
  ])

  const response = await a.browser.request('/api/diaries/recent-tags')
  expect(response.status).toBe(200)
  const body = recentDiaryTagsResponseSchema.parse(await response.json())
  // Newest use first; a tag used repeatedly keeps its most recent position, and
  // a blank entry never becomes a suggestion.
  expect(body.tags.slice(0, 3)).toEqual(['newest', 'shared', 'middle'])
  expect(body.tags).toContain('oldest')
  expect(body.tags).not.toContain('other-owner')
  expect(body.tags).not.toContain('  ')

  const other = recentDiaryTagsResponseSchema.parse(await (await b.browser.request('/api/diaries/recent-tags')).json())
  expect(other.tags).toEqual(['other-owner'])

  // The suggestion list stays bounded however many tags the account has used.
  await database.db.insert(diaries).values(Array.from({ length: 12 }, (_, index) => ({
    userId: a.id, title: `Bulk ${index}`, content: 'x', date: `2026-04-${String(index + 1).padStart(2, '0')}`, tags: [`bulk-${index}`],
  })))
  const bounded = recentDiaryTagsResponseSchema.parse(await (await a.browser.request('/api/diaries/recent-tags')).json())
  expect(bounded.tags).toHaveLength(8)
  expect(bounded.tags[0]).toBe('bulk-11')

  const guest = new BrowserSession(baseUrl)
  expect((await guest.request('/api/diaries/recent-tags')).status).toBe(401)
})
