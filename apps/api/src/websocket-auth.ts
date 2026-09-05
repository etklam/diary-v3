/** Explicit credentials take precedence over cookies; malformed input never falls back. */
export function websocketAccessToken(handshake: {
  auth?: unknown
  headers: { authorization?: string | string[]; cookie?: string | string[] }
}): string | undefined {
  const auth = handshake.auth
  if (auth !== undefined && (auth === null || typeof auth !== 'object' || Array.isArray(auth))) throw new Error('Invalid authentication input')
  const hasToken = auth !== undefined && Object.hasOwn(auth, 'token')
  const token = hasToken ? Reflect.get(auth as object, 'token') : undefined
  const authorization = handshake.headers.authorization
  if (hasToken && authorization !== undefined) throw new Error('Ambiguous credentials')
  if (hasToken) {
    if (typeof token !== 'string' || !token || /\s/.test(token)) throw new Error('Invalid token')
    return token
  }
  if (authorization !== undefined) {
    if (typeof authorization !== 'string') throw new Error('Invalid authorization header')
    const match = /^Bearer ([^\s]+)$/i.exec(authorization)
    if (!match) throw new Error('Invalid authorization header')
    return match[1]
  }
  const cookie = handshake.headers.cookie
  if (cookie === undefined) return undefined
  if (typeof cookie !== 'string') throw new Error('Invalid cookie header')
  const values = cookie.split(';').map(part => part.trim()).filter(part => part.startsWith('access-token='))
  if (values.length > 1) throw new Error('Ambiguous access cookies')
  if (!values.length) return undefined
  const value = decodeURIComponent(values[0]!.slice('access-token='.length))
  if (!value || /\s/.test(value)) throw new Error('Invalid access cookie')
  return value
}
function originUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined
    return url
  } catch { return undefined }
}
export function allowedSocketOrigin(origin: string | undefined, configured: string, production: boolean) {
  // Native clients may omit Origin; access-token verification is still required.
  if (origin === undefined) return true
  const candidate = originUrl(origin)
  if (!candidate) return false
  if (!production && ['localhost', '127.0.0.1'].includes(candidate.hostname)) return true
  const site = originUrl(configured)
  if (!site) return false
  if (site.origin === candidate.origin) return true
  // Preserve the frozen site's www/apex alias, with its configured scheme/port.
  site.hostname = site.hostname.startsWith('www.') ? site.hostname.slice(4) : `www.${site.hostname}`
  return site.origin === candidate.origin
}
