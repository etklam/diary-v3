import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { crc32 } from 'node:zlib'
import type { SecFilingDocument } from '@diary/contracts/sec-filings'
import { SecProviderError } from './errors.js'

export const SEC_LIMITS = {
  documentBytes: 250 * 1024 * 1024,
  packageFiles: 200,
  packageBytes: 500 * 1024 * 1024,
  zipBytes: 550 * 1024 * 1024,
}

export type SecResourceLimits = Readonly<typeof SEC_LIMITS>

export function safeDownloadName(value: string): string {
  const safe = value.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 180)
  return safe || 'sec-document'
}

function sizeLimitError(code: 'SEC_FILE_TOO_LARGE' | 'SEC_PACKAGE_LIMIT_EXCEEDED', message: string): SecProviderError {
  return new SecProviderError(code, message, 413)
}

function defaultDocumentLimitError() {
  return sizeLimitError('SEC_FILE_TOO_LARGE', 'SEC document exceeds size limit')
}

function cancelResponse(response: Response) {
  if (!response.body) return
  void response.body.cancel().catch(() => {})
}

function contentLength(response: Response): number | null {
  const raw = response.headers.get('content-length')
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export interface ResponseStreamOptions {
  signal?: AbortSignal
  onTooLarge?: () => SecProviderError
  onChunk?: (chunk: Uint8Array) => void
}

/**
 * Convert an upstream body to a Node stream while enforcing actual bytes.
 * The transform rejects before forwarding the chunk that crosses the limit,
 * so a lying or missing Content-Length cannot exceed the configured budget.
 */
export function responseNodeStream(response: Response, maxBytes: number, options: ResponseStreamOptions = {}): Readable {
  if (!response.body) throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'SEC response body is empty', 502)
  const tooLarge = options.onTooLarge ?? defaultDocumentLimitError
  const length = contentLength(response)
  if (length !== null && length > maxBytes) {
    cancelResponse(response)
    throw tooLarge()
  }
  const source = Readable.fromWeb(response.body as never, { signal: options.signal })
  let received = 0
  const limiter = new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback) {
      received += chunk.byteLength
      if (received > maxBytes) {
        cancelResponse(response)
        callback(tooLarge())
      } else {
        options.onChunk?.(chunk)
        callback(null, chunk)
      }
    },
  })
  const forwardSourceError = (error: Error) => { if (!limiter.destroyed) limiter.destroy(error) }
  const forwardLimiterError = (error: Error) => { if (!source.destroyed) source.destroy(error) }
  // Keep both listeners for the lifetime of the bridge. A cancelled Web
  // response can report a second error after the pipeline has rejected; the
  // forwarding listeners prevent that late provider error becoming uncaught.
  source.on('error', forwardSourceError)
  limiter.on('error', forwardLimiterError)
  return source.pipe(limiter)
}

export interface SecTempWorkspace {
  directory: string
  cleanup: () => Promise<void>
}

export interface SecLifetime {
  signal: AbortSignal
  dispose: () => void
}

export function createSecLifetime(parent?: AbortSignal, timeoutMs = 5 * 60_000): SecLifetime {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort(parent?.reason)
  if (parent?.aborted) onParentAbort()
  else parent?.addEventListener('abort', onParentAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(new Error('SEC resource lifetime exceeded')), timeoutMs)
  let disposed = false
  return {
    signal: controller.signal,
    dispose: () => {
      if (disposed) return
      disposed = true
      clearTimeout(timeout)
      parent?.removeEventListener('abort', onParentAbort)
    },
  }
}

export async function createTempWorkspace(): Promise<SecTempWorkspace> {
  const directory = await mkdtemp(join(tmpdir(), 'sec-filings-'))
  let cleanupPromise: Promise<void> | undefined
  return {
    directory,
    cleanup: async () => {
      cleanupPromise ??= rm(directory, { recursive: true, force: true })
      await cleanupPromise
    },
  }
}

export interface StageDocumentOptions {
  signal?: AbortSignal
  maxBytes?: number
  onTooLarge?: () => SecProviderError
}

export async function stageDocument(
  directory: string,
  index: number,
  document: SecFilingDocument,
  response: Response,
  options: StageDocumentOptions = {},
): Promise<{ path: string; name: string; size: number; crc32: number }> {
  const maxBytes = options.maxBytes ?? SEC_LIMITS.documentBytes
  const tooLarge = options.onTooLarge ?? defaultDocumentLimitError
  if (document.size > maxBytes) {
    cancelResponse(response)
    throw tooLarge()
  }
  const name = `${String(index + 1).padStart(3, '0')}-${safeDownloadName(document.basename)}`
  const path = join(directory, name)
  let checksum = 0
  try {
    const source = responseNodeStream(response, maxBytes, { signal: options.signal, onTooLarge: tooLarge, onChunk: chunk => { checksum = crc32(chunk, checksum) } })
    let destination: ReturnType<typeof createWriteStream>
    try {
      destination = createWriteStream(path, { flags: 'wx', mode: 0o600 })
    } catch (error) {
      source.destroy(error as Error)
      throw error
    }
    if (options.signal) await pipeline(source, destination, { signal: options.signal })
    else await pipeline(source, destination)
    const actualSize = (await stat(path)).size
    if (actualSize > maxBytes) throw tooLarge()
    return { path, name, size: actualSize, crc32: checksum }
  } catch (error) {
    await rm(path, { force: true })
    if (error instanceof SecProviderError) throw error
    if (options.signal?.aborted) throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC document stream cancelled', 503, true)
    throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC document stream failed', 503, true)
  }
}

export interface SecFileResource {
  path: string
  size: number
  cleanup: () => Promise<void>
}

/**
 * Return a bounded-memory response body for a staged file. Cleanup and slot
 * release are tied to stream completion, errors, cancellation, or request abort.
 */
export function streamStagedFile(resource: SecFileResource, options: { signal?: AbortSignal; onClosed?: () => void; timeoutMs?: number } = {}): ReadableStream<Uint8Array> {
  const source = createReadStream(resource.path, { highWaterMark: 64 * 1024 })
  let finalized = false
  const timeout = setTimeout(() => source.destroy(new Error('SEC staged response timeout')), options.timeoutMs ?? 5 * 60_000)
  const finalize = () => {
    if (finalized) return
    finalized = true
    clearTimeout(timeout)
    void resource.cleanup().catch(() => {}).finally(() => {
      try { options.onClosed?.() } catch { /* cleanup callbacks must not escape the stream */ }
    })
  }
  source.once('end', finalize)
  source.once('error', finalize)
  source.once('close', finalize)
  if (options.signal) {
    const abort = () => source.destroy(options.signal?.reason instanceof Error ? options.signal.reason : new Error('SEC request cancelled'))
    if (options.signal.aborted) abort()
    else options.signal.addEventListener('abort', abort, { once: true })
    source.once('close', () => options.signal?.removeEventListener('abort', abort))
  }
  return Readable.toWeb(source, { strategy: { highWaterMark: 64 * 1024, size: chunk => chunk.byteLength } }) as unknown as ReadableStream<Uint8Array>
}

export interface SecResourceLease {
  release: () => void
}

const RESOURCE_CONCURRENCY = 2
const RESOURCE_MAX_WAITERS = 32
let activeResources = 0
const resourceWaiters: Array<{ resolve: (lease: SecResourceLease) => void; reject: (error: unknown) => void; signal?: AbortSignal; onAbort: () => void }> = []

function cancelledResourceRequest() {
  return new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC request was cancelled', 503, true)
}

function createLease(): SecResourceLease {
  let released = false
  return {
    release: () => {
      if (released) return
      released = true
      activeResources--
      while (resourceWaiters.length > 0 && activeResources < RESOURCE_CONCURRENCY) {
        const waiter = resourceWaiters.shift()!
        waiter.signal?.removeEventListener('abort', waiter.onAbort)
        activeResources++
        waiter.resolve(createLease())
      }
    },
  }
}

export function acquireSecResourceSlot(signal?: AbortSignal): Promise<SecResourceLease> {
  if (signal?.aborted) return Promise.reject(cancelledResourceRequest())
  if (activeResources < RESOURCE_CONCURRENCY) {
    activeResources++
    return Promise.resolve(createLease())
  }
  if (resourceWaiters.length >= RESOURCE_MAX_WAITERS) return Promise.reject(new SecProviderError('SEC_QUEUE_FULL', 'SEC resource queue is full', 503, true))
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const index = resourceWaiters.findIndex(waiter => waiter.onAbort === onAbort)
      if (index >= 0) resourceWaiters.splice(index, 1)
      reject(cancelledResourceRequest())
    }
    resourceWaiters.push({ resolve, reject, signal, onAbort })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function activeSecResourceSlots(): number {
  return activeResources
}
