import type { Hono } from 'hono'
import type { AppEnv } from './app.js'
const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
export function registerDisciplineOg(app: Hono<AppEnv>) {
 app.get('/api/og/discipline.svg', c => {
  const title = [...(c.req.query('title') || '我的投資紀律')].slice(0, 64).join('')
  // Keep the single attribution line within the 1056px content width at 26px.
  const author = [...(c.req.query('author') || 'Anonymous')].slice(0, 32).join('')
  const rawCount = c.req.query('count') || '0', count = /^\d{1,7}$/.test(rawCount) ? rawCount : '0'
  // Separate lines prevent long CJK titles from running outside the image.
  const characters = [...title], lines = [characters.slice(0, 24).join(''), characters.slice(24, 48).join(''), characters.slice(48).join('')].filter(Boolean)
  c.header('Content-Type', 'image/svg+xml; charset=utf-8'); c.header('Cache-Control', 'public, max-age=3600')
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  c.header('X-Content-Type-Options', 'nosniff')
  return c.body(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f4f7f5"/><path d="M72 96H1128" stroke="#205a45" stroke-width="4"/><g fill="#172b23" font-family="sans-serif"><text x="72" y="160" font-size="24">diary-v3</text>${lines.map((line, index) => `<text x="72" y="${260 + index * 66}" font-size="42">${escapeXml(line)}</text>`).join('')}<text x="72" y="490" font-size="26">by ${escapeXml(author)}</text><text x="72" y="548" font-size="24">${count} trading principles</text></g></svg>`)
 })
}
