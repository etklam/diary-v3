/**
 * Canonical absolute origin for crawler-visible URLs.
 *
 * Two request properties cannot be trusted for this. TLS terminates at the
 * ingress, so the Express adapter reports `http:` for a request the browser
 * made over HTTPS; and the production ingress serves both the apex and the
 * `www.` host, so the request hostname is not a stable site identity. Both are
 * normalized here so canonical links, locale alternates, and the sitemap agree
 * no matter which host or scheme served the request.
 *
 * The apex is the canonical host: the ingress redirects `www.` to it and the
 * release manifests pin the apex as the production hostname. Loopback hosts
 * keep their original scheme and port so local development and the browser
 * fixtures still produce reachable URLs.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

export function canonicalOrigin(requestUrl: string): string {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return ''
  }
  if (url.hostname.startsWith('www.') && url.hostname.length > 4) url.hostname = url.hostname.slice(4)
  if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) {
    url.protocol = 'https:'
    // `origin` would otherwise keep an explicit `:80` that no longer applies.
    if (url.port === '80') url.port = ''
  }
  return url.origin
}
