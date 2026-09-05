import { expect, it } from 'vitest'
import { allowedSocketOrigin, websocketAccessToken } from '../../apps/api/src/websocket-auth'
it('accepts native auth/header credentials and web cookies with explicit precedence', () => {
  expect(websocketAccessToken({ auth: { token: 'native' }, headers: { cookie: 'access-token=web' } })).toBe('native')
  expect(websocketAccessToken({ headers: { authorization: 'bEaReR native', cookie: 'access-token=web' } })).toBe('native')
  expect(websocketAccessToken({ auth: {}, headers: { cookie: 'other=x; access-token=web%2Etoken' } })).toBe('web.token')
  expect(websocketAccessToken({ headers: {} })).toBeUndefined()
})
it('rejects ambiguous, malformed or empty credentials without falling back to a valid cookie', () => {
  for (const auth of [null, [], 'token', { token: null }, { token: 4 }, { token: '' }, { token: 'has space' }]) {
    expect(() => websocketAccessToken({ auth, headers: { cookie: 'access-token=valid' } })).toThrow()
  }
  expect(() => websocketAccessToken({ auth: { token: 'a' }, headers: { authorization: 'Bearer a' } })).toThrow('Ambiguous')
  for (const authorization of ['', 'Basic a', 'Bearer a b', ['Bearer a']]) expect(() => websocketAccessToken({ headers: { authorization, cookie: 'access-token=valid' } })).toThrow()
  for (const cookie of ['access-token=%ZZ', 'access-token=', 'access-token=a; access-token=b', ['access-token=a']]) expect(() => websocketAccessToken({ headers: { cookie } })).toThrow()
})
it('allows configured origin and source www alias while rejecting hostile or malformed origins', () => {
  const site = 'https://diary.example.test:8443'
  for (const origin of [undefined, site, 'https://www.diary.example.test:8443']) expect(allowedSocketOrigin(origin, site, true)).toBe(true)
  for (const origin of ['', 'null', 'http://diary.example.test:8443', 'https://diary.example.test', 'https://diary.example.test:8443.evil.test', 'https://user@diary.example.test:8443', `${site}/path`, `${site}?query=1`, `${site}#hash`, 'http://localhost:3200']) expect(allowedSocketOrigin(origin, site, true)).toBe(false)
  expect(allowedSocketOrigin('http://localhost:3200', site, false)).toBe(true)
  expect(allowedSocketOrigin('https://evil.test', site, false)).toBe(false)
})
