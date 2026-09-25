import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Database } from '@diary/db'
import { registerPortfolioAttentionRoutes } from '../../apps/api/src/portfolio-attention'
import type { AppEnv } from '../../apps/api/src/app'

describe('Portfolio Overview diagnostics', () => {
  it('logs safe section context without serializing the failed database error', async () => {
    const sqlParam = 'SQL_PARAM_SENTINEL'
    const privateArticle = 'PRIVATE_ARTICLE_TEXT_SENTINEL'
    const privateDiary = 'PRIVATE_DIARY_TEXT_SENTINEL'
    const token = 'TOKEN_SENTINEL'
    const error = new Error(`query SELECT ${sqlParam} ${privateArticle} ${privateDiary} ${token}`)
    Object.assign(error, { cause: { code: '42P01', query: 'SELECT $1', params: [sqlParam] } })
    const db = {
      transaction() {
        throw error
      },
    } as unknown as Database
    const logs: Array<{ message: string; context: Record<string, unknown> }> = []
    const app = new Hono<AppEnv>()
    app.use('*', async (c, next) => {
      c.set('requestId', 'overview-request-1')
      c.set('user', { id: '1', email: 'synthetic@example.test', role: 'USER', tokenVersion: 0 })
      await next()
    })
    registerPortfolioAttentionRoutes(app, {
      db,
      now: () => new Date('2026-09-25T12:00:00.000Z'),
      market: {} as never,
      fail: ((status: number, code: never, message: string) => { throw new Error(`${status}:${code}:${message}`) }) as never,
      validationError: (() => { throw new Error('unexpected validation') }) as never,
      logger: { error(message, context) { logs.push({ message, context }) } },
    })

    const response = await app.request('http://localhost/api/portfolio/overview')
    const body = await response.json() as { valuation: unknown; attention: unknown }
    const serialized = JSON.stringify(logs)

    expect(response.status).toBe(200)
    expect(body.valuation).toMatchObject({ status: 'failed' })
    expect(body.attention).toMatchObject({ status: 'failed' })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.context).toMatchObject({
      operation: 'portfolio_overview',
      stage: 'snapshot',
      section: 'snapshot',
      requestId: 'overview-request-1',
      errorCode: '42P01',
    })
    expect(logs[0]?.context).not.toHaveProperty('error')
    expect(serialized).not.toContain(sqlParam)
    expect(serialized).not.toContain(privateArticle)
    expect(serialized).not.toContain(privateDiary)
    expect(serialized).not.toContain(token)
  })
})
