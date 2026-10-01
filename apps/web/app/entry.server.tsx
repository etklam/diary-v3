import { PassThrough, Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createReadableStreamFromReadable } from '@react-router/node';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext } from 'react-router';
import { canonicalOrigin } from './site-origin';

const direction = '<!-- THESIS: Keep original decisions and later evidence legible. OWN-WORLD: Cold white, ink green, flat agenda rows, system sans. STORY: Record today, revisit later. FIRST VIEWPORT: 216px navigation, task heading, one writing action; narrow screens stack. FORM: Decision agenda, candidate 4, seed 4587f8b7. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->';
export const streamTimeout = 5_000;

function applySecurityHeaders(headers: Headers): void {
  if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', "frame-ancestors 'self'");
  if (!headers.has('X-Frame-Options')) headers.set('X-Frame-Options', 'SAMEORIGIN');
  if (!headers.has('X-Content-Type-Options')) headers.set('X-Content-Type-Options', 'nosniff');
  if (!headers.has('Referrer-Policy')) headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
}

/**
 * The ingress serves the apex and the `www.` host from the same backend, so
 * without this the two hosts are separate sites: cookies are host-only, which
 * splits one account into two sessions, and every page self-canonicalizes into
 * duplicate search index entries.
 *
 * The redirect is keyed on the hostname alone. TLS terminates at the ingress,
 * so the scheme this process observes is always `http` and comparing origins
 * would redirect to itself forever. Redirecting the document is enough: the
 * app never runs on `www.`, so its API, data, and asset requests never
 * originate there either.
 */
function canonicalHostRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (!url.hostname.startsWith('www.') || url.hostname.length <= 4) return undefined;
  const origin = canonicalOrigin(request.url);
  if (!origin) return undefined;
  return new Response(null, {
    status: 301,
    headers: { Location: `${origin}${url.pathname}${url.search}`, 'Cache-Control': 'public, max-age=3600' },
  });
}

export default function handleRequest(request: Request, status: number, headers: Headers, context: EntryContext): Promise<Response> | Response {
  const redirect = canonicalHostRedirect(request);
  if (redirect) return redirect;
  applySecurityHeaders(headers);
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let prefix = '';
    let inserted = false;
    const decoder = new StringDecoder('utf8');
    // Preserve the direction comment without interrupting Router's hydration stream.
    const withDirection = new Transform({
      transform(chunk, _encoding, callback) {
        if (inserted) { callback(null, decoder.write(chunk)); return; }
        prefix += decoder.write(chunk);
        if (prefix.includes('<body>')) {
          inserted = true;
          callback(null, prefix.replace('<body>', `<body>${direction}`));
          prefix = '';
        } else callback();
      },
      flush(callback) { prefix += decoder.end(); if (prefix) this.push(prefix); callback(); },
    });
    const timeout = setTimeout(() => abort(), streamTimeout + 1000);
    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={context} url={request.url} />, {
      onShellReady() {
        shellRendered = true;
        const body = new PassThrough({ final(callback) { clearTimeout(timeout); callback(); } });
        headers.set('Content-Type', 'text/html; charset=utf-8');
        body.pipe(withDirection);
        pipe(body);
        resolve(new Response(createReadableStreamFromReadable(withDirection), { status, headers }));
      },
      onShellError(error) { clearTimeout(timeout); reject(error); },
      onError(error) { status = 500; if (shellRendered) console.error(error); },
    });
  });
}
