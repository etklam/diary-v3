import { z } from 'zod'
import { TranslationProviderError, type ArticleTranslationLocale, type TranslationProvider, type TranslationProviderRequest, type TranslationProviderResult } from './types.js'

const EDGE_TRANSLATE_ENDPOINT = 'https://edge.microsoft.com/translate/translatetext'
const MAX_BLOCK_BYTES = 8_000
const MAX_BATCH_BYTES = 18_000
const MAX_BATCH_BLOCKS = 20
const MAX_TOTAL_BLOCKS = 240
const MAX_BATCHES = 16
const MAX_RESPONSE_BYTES = 256_000
const MAX_ATTEMPTS = 3
const MAX_AUTO_RETRY_AFTER_MS = 5_000
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1_000

const localeToEdge = {
  'zh-TW': 'zh-Hant',
  'zh-CN': 'zh-Hans',
  en: 'en',
} satisfies Record<ArticleTranslationLocale, string>

const edgeResponseSchema = z.array(z.object({
  translations: z.array(z.object({ text: z.string().min(1).max(32_000), to: z.string().optional() }).passthrough()).min(1),
}).passthrough()).max(MAX_BATCH_BLOCKS)

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
type Sleep = (delayMs: number, signal?: AbortSignal) => Promise<void>

export interface EdgeTranslationProviderOptions {
  timeoutMs?: number
  fetchImpl?: FetchLike
  sleep?: Sleep
}

function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new TranslationProviderError('TRANSLATION_PROVIDER_TIMEOUT'))
    const timer = setTimeout(resolve, delayMs)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new TranslationProviderError('TRANSLATION_PROVIDER_TIMEOUT'))
    }, { once: true })
  })
}

function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, Math.ceil(Number(value) * 1_000)))
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - now)) : null
}

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof TranslationProviderError) throw error
    throw new TranslationProviderError(signal.aborted ? 'TRANSLATION_PROVIDER_TIMEOUT' : 'TRANSLATION_PROVIDER_UNAVAILABLE')
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}

function batches(blocks: readonly string[]): string[][] {
  if (blocks.length > MAX_TOTAL_BLOCKS) throw new TranslationProviderError('TRANSLATION_INPUT_TOO_LARGE')
  const result: string[][] = []
  let current: string[] = []
  for (const block of blocks) {
    const bytes = Buffer.byteLength(block, 'utf8')
    if (bytes === 0 || bytes > MAX_BLOCK_BYTES) throw new TranslationProviderError('TRANSLATION_INPUT_TOO_LARGE')
    if (current.length >= MAX_BATCH_BLOCKS || Buffer.byteLength(JSON.stringify([...current, block]), 'utf8') > MAX_BATCH_BYTES) {
      result.push(current)
      current = []
    }
    current.push(block)
    if (Buffer.byteLength(JSON.stringify(current), 'utf8') > MAX_BATCH_BYTES) throw new TranslationProviderError('TRANSLATION_INPUT_TOO_LARGE')
  }
  if (current.length) result.push(current)
  if (result.length > MAX_BATCHES) throw new TranslationProviderError('TRANSLATION_INPUT_TOO_LARGE')
  return result
}

function batchUrl(sourceLocale: ArticleTranslationLocale, targetLocale: ArticleTranslationLocale): URL {
  const url = new URL(EDGE_TRANSLATE_ENDPOINT)
  url.searchParams.set('from', localeToEdge[sourceLocale])
  url.searchParams.set('to', localeToEdge[targetLocale])
  url.searchParams.set('isEnterpriseClient', 'false')
  return url
}

function abortSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  return AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(parent ? [parent] : [])])
}

export function createEdgeTranslationProvider(options: EdgeTranslationProviderOptions = {}): TranslationProvider {
  const timeoutMs = options.timeoutMs ?? 8_000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 30_000) throw new TranslationProviderError('TRANSLATION_CONFIGURATION_INVALID')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const wait = options.sleep ?? sleep

  const provider: TranslationProvider = {
    id: 'edge',
    name: 'Microsoft Edge Translate (Experimental)',
    async translate(request: TranslationProviderRequest): Promise<TranslationProviderResult> {
      if (request.articleAccess !== 'PUBLIC') throw new TranslationProviderError('TRANSLATION_PRIVACY_RESTRICTED')
      if (request.sourceLocale === request.targetLocale || !(request.sourceLocale in localeToEdge) || !(request.targetLocale in localeToEdge)) {
        throw new TranslationProviderError('TRANSLATION_CONFIGURATION_INVALID')
      }
      const chunks = batches(request.blocks)
      const translations: string[] = []
      for (const chunk of chunks) {
        translations.push(...await translateBatch(chunk, request, fetchImpl, wait, timeoutMs))
      }
      return { translations, provider: 'edge', model: null, usage: { calls: chunks.length } }
    },
  }
  return provider
}

async function translateBatch(
  blocks: string[],
  request: TranslationProviderRequest,
  fetchImpl: FetchLike,
  wait: Sleep,
  timeoutMs: number,
): Promise<string[]> {
  const url = batchUrl(request.sourceLocale, request.targetLocale)
  const body = JSON.stringify(blocks)
  let lastFailure: TranslationProviderError = new TranslationProviderError('TRANSLATION_PROVIDER_UNAVAILABLE')
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const signal = abortSignal(timeoutMs, request.signal)
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal,
      })
    } catch {
      if (request.signal?.aborted) throw new TranslationProviderError('TRANSLATION_PROVIDER_TIMEOUT')
      lastFailure = new TranslationProviderError(signal.aborted ? 'TRANSLATION_PROVIDER_TIMEOUT' : 'TRANSLATION_PROVIDER_UNAVAILABLE')
      if (attempt + 1 >= MAX_ATTEMPTS) throw lastFailure
      await wait(Math.min(2_000, 250 * (2 ** attempt)), request.signal)
      continue
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new TranslationProviderError('TRANSLATION_PROVIDER_REJECTED')
    }
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
      lastFailure = new TranslationProviderError('TRANSLATION_RATE_LIMITED', retryAfterMs)
      if (attempt + 1 >= MAX_ATTEMPTS || retryAfterMs === null || retryAfterMs > MAX_AUTO_RETRY_AFTER_MS) throw lastFailure
      await wait(retryAfterMs, request.signal)
      continue
    }
    if (response.status === 408 || response.status >= 500) {
      lastFailure = new TranslationProviderError(response.status === 408 ? 'TRANSLATION_PROVIDER_TIMEOUT' : 'TRANSLATION_PROVIDER_UNAVAILABLE')
      if (attempt + 1 >= MAX_ATTEMPTS) throw lastFailure
      await wait(Math.min(2_000, 250 * (2 ** attempt)), request.signal)
      continue
    }
    if (response.status < 200 || response.status >= 300) throw new TranslationProviderError('TRANSLATION_PROVIDER_REJECTED')
    const responseText = await readBoundedBody(response, signal)
    let parsed: z.infer<typeof edgeResponseSchema>
    try { parsed = edgeResponseSchema.parse(JSON.parse(responseText)) }
    catch { throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID') }
    if (parsed.length !== blocks.length) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
    const results = parsed.map(item => item.translations[0]!.text)
    if (results.some(text => Buffer.byteLength(text, 'utf8') > MAX_BLOCK_BYTES * 2)) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
    return results
  }
  throw lastFailure
}

export const edgeTranslationProtocol = {
  endpoint: EDGE_TRANSLATE_ENDPOINT,
  sourceAndTargetQuery: 'from, to, isEnterpriseClient=false',
  requestBody: 'JSON array of strings',
  responseShape: 'Array of objects containing translations[].text',
  experimental: true,
} as const
