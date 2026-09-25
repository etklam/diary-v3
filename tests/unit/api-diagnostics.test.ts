import { describe, expect, it } from 'vitest'
import { safeErrorContext } from '../../apps/api/src/diagnostics'

describe('API diagnostics', () => {
  it('keeps only safe classification and stack function names', () => {
    const sqlParam = 'SQL_PARAM_SENTINEL'
    const privateArticle = 'PRIVATE_ARTICLE_TEXT_SENTINEL'
    const privateDiary = 'PRIVATE_DIARY_TEXT_SENTINEL'
    const token = 'TOKEN_SENTINEL'
    const error = new Error(`query UPDATE posts params ${sqlParam} article ${privateArticle} diary ${privateDiary} token ${token}`)
    Object.assign(error, {
      name: 'PrivateArticleError',
      cause: { code: '23505', query: 'UPDATE posts SET content = $1', params: [sqlParam, privateDiary], token },
    })
    error.stack = `Error: ${sqlParam} ${privateArticle} ${privateDiary} ${token}\n    at syntheticQuery (/tmp/query-fixture.ts:1:1)\n    at ${token} (/tmp/token-fixture.ts:2:2)`

    const context = safeErrorContext(error)
    const serialized = JSON.stringify(context)

    expect(context).toMatchObject({ errorName: 'Error', errorCode: '23505', stackFrames: ['at syntheticQuery'] })
    expect(serialized).not.toContain(sqlParam)
    expect(serialized).not.toContain(privateArticle)
    expect(serialized).not.toContain(privateDiary)
    expect(serialized).not.toContain(token)
  })

  it('does not emit an arbitrary error code or message', () => {
    const token = 'TOKEN_SENTINEL'
    const context = safeErrorContext({ code: token, message: `private diary ${token}` })

    expect(context).toEqual({ errorName: 'UnknownError' })
  })

  it('can retain a safe provider fallback while excluding the original error', () => {
    const context = safeErrorContext(new Error('private article body'), { fallbackCode: 'TRANSLATION_PROVIDER_TIMEOUT' })

    expect(context).toMatchObject({ errorName: 'Error', errorCode: 'TRANSLATION_PROVIDER_TIMEOUT' })
    expect(JSON.stringify(context)).not.toContain('private article body')
  })
})
