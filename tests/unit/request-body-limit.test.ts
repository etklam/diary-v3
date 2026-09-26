import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createApp as createApiApp } from '../../apps/api/src/app.js'
import type { Database } from '@diary/db'
import { MAX_API_BODY_BYTES, RequestBodyLimitError, requestBodyLengthLimit, requestBodyLimit } from '../../apps/api/src/request-body-limit.js'

function createBodyLimitApp() {
  const app = new Hono()
  app.use('*', requestBodyLengthLimit())
  app.use('*', requestBodyLimit())
  app.post('/', async c => c.text(await c.req.text()))
  app.onError((error, c) => error instanceof RequestBodyLimitError ? c.text('too-large', 413) : c.text('unexpected', 500))
  return app
}

function bodyRequest(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)
}

function createJsonBodyLimitApp() {
  const app = new Hono()
  app.use('*', requestBodyLengthLimit())
  app.use('*', requestBodyLimit())
  app.post('/', async c => c.json(await c.req.json()))
  app.onError((error, c) => error instanceof RequestBodyLimitError ? c.text('too-large', 413) : c.text('unexpected', 500))
  return app
}

describe('API request body limit', () => {
  it('accepts an exact 8 MiB UTF-8 diary body', async () => {
    const app = createBodyLimitApp()
    const prefix = '{"diary":{"title":"今日投資📈","content":"'
    const suffix = '"}}'
    const seed = '保留原始判斷。'
    const room = MAX_API_BODY_BYTES - Buffer.byteLength(prefix + seed + suffix, 'utf8')
    const body = prefix + seed + 'a'.repeat(room) + suffix
    expect(Buffer.byteLength(body, 'utf8')).toBe(MAX_API_BODY_BYTES)

    const response = await app.fetch(bodyRequest(body, { 'content-type': 'application/json' }))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body)
  })

  it('parses JSON at the exact byte boundary', async () => {
    const app = createJsonBodyLimitApp()
    const prefix = '{"content":"'
    const suffix = '"}'
    const room = MAX_API_BODY_BYTES - Buffer.byteLength(prefix + suffix, 'utf8')
    const body = prefix + 'a'.repeat(room) + suffix
    expect(Buffer.byteLength(body, 'utf8')).toBe(MAX_API_BODY_BYTES)

    const response = await app.fetch(bodyRequest(body, { 'content-type': 'application/json' }))
    expect(response.status).toBe(200)
    expect((await response.json()).content).toHaveLength(room)
  })

  it('accepts a typical 100-record batch without changing schema parsing', async () => {
    const app = createBodyLimitApp()
    const body = JSON.stringify({ records: Array.from({ length: 100 }, (_, index) => ({ index, note: `研究紀錄 ${index}` })) })
    const response = await app.fetch(bodyRequest(body, { 'content-type': 'application/json' }))
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()).records).toHaveLength(100)
  })

  it('cancels an unknown-length stream as soon as it crosses the cap', async () => {
    const app = createBodyLimitApp()
    let cancelled = false
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls === 1) controller.enqueue(new Uint8Array(MAX_API_BODY_BYTES))
        else controller.enqueue(new Uint8Array(1))
      },
      cancel() { cancelled = true },
    })
    const response = await app.fetch(bodyRequest(stream, { 'content-type': 'application/octet-stream' }))
    expect(response.status).toBe(413)
    expect(await response.text()).toBe('too-large')
    expect(cancelled).toBe(true)
  })

  it('does not pull or lock an unknown-length body before a rate-limit denial', async () => {
    const app = new Hono()
    app.use('*', requestBodyLengthLimit())
    app.use('*', requestBodyLimit())
    app.post('/', c => c.text('rate-limited', 429))

    let pulls = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(1))
      },
      cancel() { cancelled = true },
    }, { highWaterMark: 0 })
    const request = bodyRequest(stream, { 'content-type': 'application/octet-stream' })
    expect(request.body?.locked).toBe(false)

    const response = await app.fetch(request)
    expect(response.status).toBe(429)
    expect(pulls).toBe(0)
    expect(cancelled).toBe(false)
    expect(request.body?.locked).toBe(false)
  })

  it('preserves native clone semantics before the body is consumed', async () => {
    const app = new Hono()
    app.use('*', requestBodyLengthLimit())
    app.use('*', requestBodyLimit())
    app.post('/', async c => {
      void c.req.raw.body
      const clone = c.req.raw.clone()
      return c.json({ cloned: await clone.text(), original: await c.req.raw.text() })
    })

    const response = await app.fetch(bodyRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('cloneable-body'))
        controller.close()
      },
    }, { highWaterMark: 0 }), { 'content-type': 'text/plain' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cloned: 'cloneable-body', original: 'cloneable-body' })
  })

  it('rejects clone after the bounded body is locked or consumed', async () => {
    const app = new Hono()
    app.use('*', requestBodyLimit())
    app.post('/locked', c => {
      const reader = c.req.raw.body!.getReader()
      try {
        c.req.raw.clone()
        return c.text('unexpected')
      } catch (error) {
        return c.json({ name: error instanceof Error ? error.name : '', message: error instanceof Error ? error.message : '' })
      } finally {
        reader.releaseLock()
      }
    })
    app.post('/consumed', async c => {
      await c.req.raw.text()
      try {
        c.req.raw.clone()
        return c.text('unexpected')
      } catch (error) {
        return c.json({ name: error instanceof Error ? error.name : '', message: error instanceof Error ? error.message : '' })
      }
    })

    const request = (path: string) => new Request(`https://example.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('clone-rejection-body'))
          controller.close()
        },
      }, { highWaterMark: 0 }),
      duplex: 'half',
    } as RequestInit)
    const locked = await app.fetch(request('/locked'))
    const consumed = await app.fetch(request('/consumed'))
    for (const response of [locked, consumed]) {
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ name: 'TypeError', message: 'unusable' })
    }
  })

  it('checks actual bytes when a declared length is smaller than the stream', async () => {
    const app = createBodyLimitApp()
    let cancelled = false
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls === 1) controller.enqueue(new Uint8Array(MAX_API_BODY_BYTES))
        else controller.enqueue(new Uint8Array(1))
      },
      cancel() { cancelled = true },
    })
    const response = await app.fetch(bodyRequest(stream, { 'content-length': '1' }))
    expect(response.status).toBe(413)
    expect(cancelled).toBe(true)
  })

  it('rejects a declared oversized body before reading it', async () => {
    const app = createBodyLimitApp()
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.close() },
    })
    const response = await app.fetch(bodyRequest(stream, {
      'content-type': 'application/json',
      'content-length': String(MAX_API_BODY_BYTES + 1),
    }))
    expect(response.status).toBe(413)
    expect(await response.text()).toBe('too-large')
  })

  it('uses the API error envelope and preserves request IDs', async () => {
    const app = createApiApp({
      db: {} as Database,
      config: { jwtSecret: 'synthetic-body-limit-secret-with-over-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'https://example.test' },
    })
    const response = await app.fetch(new Request('https://example.test/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'body-limit.test' },
      body: 'x'.repeat(MAX_API_BODY_BYTES + 1),
    }))
    expect(response.status).toBe(413)
    expect(response.headers.get('x-request-id')).toBe('body-limit.test')
    expect(await response.json()).toMatchObject({ statusCode: 413, data: { code: 'SYS_VALIDATION_ERROR', requestId: 'body-limit.test' } })
  })

  it('maps a chunked overflow to the canonical API 413 response', async () => {
    const app = createApiApp({
      db: {} as Database,
      config: { jwtSecret: 'synthetic-body-limit-secret-with-over-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'https://example.test' },
    })
    let pulls = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(pulls === 1 ? MAX_API_BODY_BYTES : 1))
      },
      cancel() { cancelled = true },
    }, { highWaterMark: 0 })
    const response = await app.fetch(new Request('https://example.test/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'body-limit.chunked' },
      body: stream,
      duplex: 'half',
    } as RequestInit))
    expect(response.status).toBe(413)
    expect(cancelled).toBe(true)
    expect(await response.json()).toMatchObject({ statusCode: 413, data: { code: 'SYS_VALIDATION_ERROR', requestId: 'body-limit.chunked' } })
  })

  it('lets the public rate limit reject an unknown-length body before any pull', async () => {
    const app = createApiApp({
      db: {} as Database,
      config: { jwtSecret: 'synthetic-body-limit-secret-with-over-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'https://example.test' },
      rateLimiter: {
        mode: 'memory',
        backend: 'memory',
        degraded: false,
        ready: true,
        async consume() {
          return { allowed: false, limit: 1, remaining: 0, resetAt: Date.now() + 60_000, retryAfterMs: 60_000 }
        },
        async close() {},
      },
    })
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(1))
      },
    }, { highWaterMark: 0 })
    const request = new Request('https://example.test/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'body-limit.rate-limited' },
      body: stream,
      duplex: 'half',
    } as RequestInit)

    const response = await app.fetch(request)
    expect(response.status).toBe(429)
    expect(pulls).toBe(0)
    expect(request.body?.locked).toBe(false)
  })
})
