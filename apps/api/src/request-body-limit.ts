import type { MiddlewareHandler } from 'hono'

export const MAX_API_BODY_BYTES = 8 * 1024 * 1024

export class RequestBodyLimitError extends Error {
  constructor() {
    super('Request body exceeds the configured limit.')
    this.name = 'RequestBodyLimitError'
  }
}

function boundedBodyStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  onUse: () => void,
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let size = 0
  let released = false
  let cancelled = false
  const release = () => {
    if (released || !reader) return
    released = true
    reader.releaseLock()
  }
  const cancelSource = (reason?: unknown): Promise<void> => {
    if (cancelled) return Promise.resolve()
    cancelled = true
    try {
      const cancellation = reader ? reader.cancel(reason) : body.cancel(reason)
      release()
      return cancellation.catch(() => undefined)
    } catch {
      // The source may already be closed or cancelled; the limiter still
      // releases its reader lock below.
      release()
      return Promise.resolve()
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      onUse()
      try {
        reader ??= body.getReader()
        const { done, value } = await reader.read()
        if (done) {
          release()
          controller.close()
          return
        }
        size += value.byteLength
        if (size > maxBytes) {
          void cancelSource()
          controller.error(new RequestBodyLimitError())
          return
        }
        controller.enqueue(value)
      } catch (error) {
        release()
        controller.error(error)
      }
    },
    cancel(reason) {
      onUse()
      return cancelSource(reason)
    },
  }, { highWaterMark: 0 })
}

function lazyBoundedRequest(raw: Request, maxBytes: number): Request {
  if (!raw.body) return raw

  let bounded: ReadableStream<Uint8Array> | undefined
  let used = false
  // Request.clone() tees the current body stream. Resolve it at consumption
  // time so a clone made before reading is wrapped on its own tee branch.
  const body = () => bounded ??= boundedBodyStream(raw.body!, maxBytes, () => { used = true })
  const response = () => new Response(body(), { headers: raw.headers })
  const clone = () => {
    // A reader held by the bounded wrapper makes the logical request body
    // unusable for cloning, matching native Request.clone() semantics.
    if (bounded?.locked || used || raw.bodyUsed) throw new TypeError('unusable')
    const cloned = raw.clone()
    // clone() tees and replaces the target request body. Discard the wrapper
    // around the pre-tee stream before the next property access.
    bounded = undefined
    return lazyBoundedRequest(cloned, maxBytes)
  }

  // Constructing a new Request with a replacement stream causes the runtime
  // to pull the stream once. A proxy preserves Request's brand and metadata
  // while deferring creation of the bounded stream until a consumer asks for
  // the body.
  return new Proxy(raw, {
    get(target, property) {
      if (property === 'body') return body()
      if (property === 'bodyUsed') return used || target.bodyUsed
      if (property === 'json') return () => response().json()
      if (property === 'text') return () => response().text()
      if (property === 'arrayBuffer') return () => response().arrayBuffer()
      if (property === 'bytes') return () => response().bytes()
      if (property === 'blob') return () => response().blob()
      if (property === 'formData') return () => response().formData()
      if (property === 'clone') return clone
      return Reflect.get(target, property, target)
    },
  })
}

export function requestBodyLengthLimit(maxBytes = MAX_API_BODY_BYTES): MiddlewareHandler {
  return async (c, next) => {
    const body = c.req.raw.body
    const declaredLength = c.req.raw.headers.get('content-length')
    const length = declaredLength === null ? Number.NaN : Number(declaredLength)
    if (Number.isFinite(length) && length > maxBytes) {
      void body?.cancel().catch(() => undefined)
      throw new RequestBodyLimitError()
    }
    return next()
  }
}

/** Wrap API bodies with a lazy byte bound so auth and rate limits run first. */
export function requestBodyLimit(maxBytes = MAX_API_BODY_BYTES): MiddlewareHandler {
  return async (c, next) => {
    const raw = c.req.raw
    if (!raw.body) return next()

    c.req.raw = lazyBoundedRequest(raw, maxBytes)
    return next()
  }
}
