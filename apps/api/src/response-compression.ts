import type { MiddlewareHandler } from 'hono'
import { parseAccept } from 'hono/utils/accept'
import { COMPRESSIBLE_CONTENT_TYPE_REGEX } from 'hono/utils/compress'

/**
 * Response compression for the API.
 *
 * No layer in front of this process compresses: neither the compose nginx nor
 * the production Traefik Ingress declares it, and the apex domain is not served
 * through a CDN. So JSON leaves here at full size — a year of daily closes is
 * 12,217 bytes raw and 2,072 gzipped.
 *
 * This exists instead of `hono/compress` for one reason: that middleware can
 * only apply its size threshold to a response that declares a
 * `Content-Length`, and Hono's `json()`/`text()` helpers do not. Every small
 * response would then be encoded at a loss — a 15-byte health probe comes back
 * as 35 bytes, and an error body grows by a quarter. Reading up to the
 * threshold is what makes the threshold real. Negotiation and the compressible
 * type list are Hono's own, so this does not fork those rules.
 */

/** Encodings this process will produce, in the order it prefers them. */
const ENCODINGS = ['gzip', 'deflate'] as const
type Encoding = (typeof ENCODINGS)[number]

/**
 * Smallest body worth encoding. Below roughly this size gzip's framing cancels
 * any saving, and the CPU is spent either way.
 */
export const COMPRESSION_THRESHOLD_BYTES = 1024

const noTransformPattern = /(?:^|,)\s*no-transform\s*(?:,|$)/i
const varyAcceptEncodingPattern = /(?:^|,)\s*accept-encoding\s*(?:,|$)/i

/** Highest-quality encoding the client will take, by the `Accept-Encoding` grammar. */
function selectEncoding(header: string | undefined): Encoding | undefined {
  if (header === undefined) return undefined
  const accepted = parseAccept(header)
  const wildcard = accepted.find(entry => entry.type === '*')?.q
  let best: { encoding: Encoding; quality: number } | undefined
  for (const encoding of ENCODINGS) {
    const explicit = accepted.find(entry => entry.type.toLowerCase() === encoding)
    const quality = explicit ? explicit.q : (wildcard ?? 0)
    if (quality === 1) return encoding
    if (quality > 0 && (best === undefined || quality > best.quality)) best = { encoding, quality }
  }
  return best?.encoding
}

/**
 * Whether this response may be re-encoded at all. `no-transform` is the
 * standard opt-out and the one the SEC download routes rely on: they stream a
 * staged file under a computed `Content-Length`, so their bytes must arrive
 * unchanged. Content-type filtering alone would not protect them, because a
 * single filing document carries whatever type the upstream sent.
 */
function isTransformable(response: Response, method: string): boolean {
  if (method === 'HEAD') return false
  // 206 ranges count the unencoded bytes; 204 and 304 carry no body to encode.
  if (response.status === 204 || response.status === 304 || response.status === 206) return false
  if (response.headers.has('Content-Encoding') || response.headers.has('Transfer-Encoding')) return false
  if (response.body === null) return false
  const cacheControl = response.headers.get('Cache-Control')
  if (cacheControl !== null && noTransformPattern.test(cacheControl)) return false
  const contentType = response.headers.get('Content-Type')
  return contentType !== null && COMPRESSIBLE_CONTENT_TYPE_REGEX.test(contentType)
}

function joinChunks(chunks: readonly Uint8Array<ArrayBuffer>[], total: number): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}

export function responseCompression(threshold = COMPRESSION_THRESHOLD_BYTES): MiddlewareHandler {
  return async (context, next) => {
    await next()
    if (!isTransformable(context.res, context.req.method)) return

    // A cache that stored this response must know it varies by encoding, which
    // holds whether or not this particular client negotiated one.
    const vary = context.res.headers.get('Vary')
    if (vary !== '*' && !(vary !== null && varyAcceptEncodingPattern.test(vary))) {
      context.header('Vary', vary === null ? 'Accept-Encoding' : `${vary}, Accept-Encoding`)
    }

    const encoding = selectEncoding(context.req.header('Accept-Encoding'))
    if (encoding === undefined) return

    // A declared length settles the threshold without reading anything. Guard
    // the absent header explicitly: `Number(null)` is 0, which would read as a
    // body too small to encode.
    const declaredLength = context.res.headers.get('Content-Length')
    if (declaredLength !== null && Number(declaredLength) < threshold) return

    const body = context.res.body
    if (body === null) return

    // Read only as far as the threshold. A body that ends inside it is replayed
    // verbatim; a larger one streams through the encoder from where this
    // stopped, so no response is ever buffered whole.
    // `CompressionStream` writes exactly `BufferSource`, which admits no
    // SharedArrayBuffer-backed view — and a response body never yields one.
    const reader = (body as ReadableStream<Uint8Array<ArrayBuffer>>).getReader()
    const peeked: Uint8Array<ArrayBuffer>[] = []
    let peekedBytes = 0
    while (peekedBytes < threshold) {
      const { done, value } = await reader.read()
      if (done) {
        const complete = joinChunks(peeked, peekedBytes)
        context.res = new Response(complete, context.res)
        context.res.headers.set('Content-Length', String(peekedBytes))
        return
      }
      peeked.push(value)
      peekedBytes += value.byteLength
    }

    const replayed = new ReadableStream<BufferSource>({
      start(controller) {
        for (const chunk of peeked) controller.enqueue(chunk)
      },
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) controller.close()
        else controller.enqueue(value)
      },
      cancel(reason) {
        return reader.cancel(reason)
      },
    })

    context.res = new Response(replayed.pipeThrough(new CompressionStream(encoding)), context.res)
    // The encoded length is not known until the stream ends, and a weak ETag is
    // what an encoded variant of the same entity is entitled to.
    context.res.headers.delete('Content-Length')
    context.res.headers.set('Content-Encoding', encoding)
    const etag = context.res.headers.get('ETag')
    if (etag !== null && !etag.startsWith('W/')) context.res.headers.set('ETag', `W/${etag}`)
  }
}
