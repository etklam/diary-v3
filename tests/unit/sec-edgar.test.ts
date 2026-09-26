import { describe, expect, it } from 'vitest'
import { readFile, readdir, stat, writeFile, type FileHandle } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { crc32 } from 'node:zlib'
import { buildSecUrls, SecEdgarClient } from '../../apps/api/src/sec-edgar/client.js'
import { SecProviderError } from '../../apps/api/src/sec-edgar/errors.js'
import { buildSingleFilingPackage, enforceManifestLimits } from '../../apps/api/src/sec-edgar/package.js'
import { acquireSecResourceSlot, activeSecResourceSlots, createTempWorkspace, SEC_LIMITS, stageDocument, streamStagedFile } from '../../apps/api/src/sec-edgar/download.js'
import type { SecFilingDocument } from '@diary/contracts/sec-filings'
import { createSecFixtureService } from '../../apps/api/src/sec-edgar/service.js'
import type { SecEdgarService } from '../../apps/api/src/sec-edgar/service.js'
import { canonicalizeCik, parseDocumentBasename } from '../../apps/api/src/sec-edgar/validation.js'

const accession = '0000000001-24-000001'
const directory = {
  fields: ['cik', 'name', 'ticker', 'exchange'],
  data: [['1', 'Synthetic Holdings', 'SYN', 'NYSE']],
}
const submissions = {
  cik: '0000000001', name: 'Synthetic Holdings', tickers: ['SYN'], exchanges: ['NYSE'],
  filings: { recent: {
    accessionNumber: [accession, '0000000001-24-000002'],
    filingDate: ['2024-04-01', '2024-03-01'], reportDate: ['2023-12-31', '2023-09-30'],
    acceptanceDateTime: ['2024-04-01 12:00:00', '2024-03-01 12:00:00'], form: ['10-K', '10-Q'],
    primaryDocument: ['syn-10k.htm', 'syn-10q.htm'], primaryDocDescription: ['Annual report', 'Quarterly report'],
    fileNumber: ['1', '1'], filmNumber: [null, null], items: [null, null], size: [120, 80],
  } },
}

function fixtureService() {
  return createSecFixtureService({
    async getJson<T>(url: string): Promise<T> {
      if (url === buildSecUrls.directory()) return directory as T
      if (url === buildSecUrls.submissions('1')) return submissions as T
      if (url.endsWith('/index.json')) return { directory: { item: [
        { name: 'syn-10k.htm', size: 12 },
        { name: '0000000001-24-000001.txt', size: 20 },
        { name: 'syn-data.xml', size: 10 },
      ] } } as T
      throw new Error(`unexpected fixture URL: ${url}`)
    },
    async getText(): Promise<string> { return '<table><tr><td>1</td><td>Annual report</td><td>syn-10k.htm</td><td>10-K</td></tr><tr><td>2</td><td>XBRL</td><td>syn-data.xml</td><td>EX-101</td></tr></table>' },
    async getStream(url: string): Promise<Response> { return new Response(`fixture:${url}`, { headers: { 'content-type': 'text/plain' } }) },
  })
}

function syntheticDocument(overrides: Partial<SecFilingDocument> = {}): SecFilingDocument {
  return {
    basename: 'synthetic.txt', description: null, type: 'TXT', sequence: null, size: 4,
    classification: 'other', isPrimary: false, isPdf: false, isXbrl: false, isExhibit: false, ...overrides,
  }
}

function streamedResponse(chunks: Uint8Array[], headers: HeadersInit = {}) {
  return new Response(Readable.toWeb(Readable.from(chunks)) as unknown as ReadableStream, { headers })
}

function readStoredZipEntries(body: Uint8Array) {
  const entries: Array<{ name: string; data: Uint8Array; crc: number }> = []
  let offset = 0
  while (offset + 4 <= body.byteLength && new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(offset, true) === 0x04034b50) {
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
    const checksum = view.getUint32(offset + 14, true)
    const size = view.getUint32(offset + 18, true)
    const nameSize = view.getUint16(offset + 26, true)
    const extraSize = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = Buffer.from(body.slice(nameStart, nameStart + nameSize)).toString('utf8')
    const dataStart = nameStart + nameSize + extraSize
    const data = body.slice(dataStart, dataStart + size)
    entries.push({ name, data, crc: checksum })
    offset = dataStart + size
  }
  return entries
}

async function waitForResourceCleanup() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (activeSecResourceSlots() === 0) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('SEC resource slot was not released')
}

describe('SEC EDGAR provider boundary', () => {
  it('canonicalizes identifiers and rejects traversal basenames', () => {
    expect(canonicalizeCik('1')).toBe('0000000001')
    expect(() => parseDocumentBasename('../secret.txt')).toThrow()
    expect(() => parseDocumentBasename('a%2Fb.txt')).toThrow()
    expect(buildSecUrls.document('1', accession, 'syn-10k.htm')).toContain('/1/000000000124000001/syn-10k.htm')
  })

  it('ranks company search and keeps cursor pagination tied to filters', async () => {
    const service = fixtureService()
    const search = await service.searchCompanies('syn', 10)
    expect(search.value[0]).toMatchObject({ cik: '0000000001', matchedBy: 'ticker' })
    const first = await service.listFilings('1', { forms: ['10-K'], limit: 1 })
    expect(first.value.filings).toHaveLength(1)
    expect(first.value.filings[0]?.acceptanceDateTime).toBe('2024-04-01 12:00:00')
    expect(first.value.nextCursor).toBeNull()
    await expect(service.listFilings('1', { forms: ['10-Q'], cursor: first.value.nextCursor ?? 'bad', limit: 1 })).rejects.toMatchObject({ code: 'SEC_VALIDATION_ERROR' })
  })

  it('builds classified document detail and a parseable stored ZIP', async () => {
    const service = fixtureService()
    const detail = await service.getFilingDetail('1', accession)
    expect(detail.value.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ basename: 'syn-10k.htm', isPrimary: true, classification: 'primary' }),
      expect.objectContaining({ basename: 'syn-data.xml', isXbrl: true, classification: 'xbrl' }),
    ]))
    const packaged = await buildSingleFilingPackage(service, '1', accession, ['primary'])
    try {
      const body = await readFile(packaged.path)
      expect(packaged.filename).toContain('SYN_10-K')
      expect(String.fromCharCode(...body.slice(0, 2))).toBe('PK')
      expect(body.toString('utf8')).toContain('manifest.json')
    } finally {
      await packaged.cleanup()
    }
  })

  it('writes stored ZIP entries incrementally with valid CRCs and cleans the staged file', async () => {
    const service = fixtureService()
    const packaged = await buildSingleFilingPackage(service, '1', accession, ['primary'], {
      limits: { documentBytes: 1024, packageBytes: 1024, zipBytes: 4096 },
    })
    const path = packaged.path
    try {
      const body = new Uint8Array(await new Response(packaged.body).arrayBuffer())
      const entries = readStoredZipEntries(body)
      expect(entries.map(entry => entry.name)).toEqual(['manifest.json', 'syn-10k.htm'])
      for (const entry of entries) expect(entry.crc).toBe(crc32(entry.data))
      expect(entries[1]?.data.byteLength).toBeGreaterThan(0)
    } finally {
      await packaged.cleanup()
    }
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('converts ZIP write and close failures into cleanup-safe provider errors', async () => {
    const failurePoints: Array<{ label: string; writeAt?: number; close?: boolean }> = [
      { label: 'manifest header', writeAt: 1 },
      { label: 'staged document', writeAt: 4 },
      { label: 'central directory', writeAt: 5 },
      { label: 'close', close: true },
    ]
    for (const failure of failurePoints) {
      let writes = 0
      let workspacePath = ''
      const openFile = async (path: string) => {
        workspacePath = dirname(path)
        return {
          async write(_chunk: Uint8Array, _offset: number, length: number) {
            writes += 1
            if (failure.writeAt === writes) throw new Error(`synthetic ${failure.label} write failure`)
            return { bytesWritten: length }
          },
          async close() {
            if (failure.close) throw new Error('synthetic close failure')
          },
        } as unknown as FileHandle
      }
      await expect(buildSingleFilingPackage(fixtureService(), '1', accession, ['primary'], { openFile })).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE', statusCode: 503, retryable: true })
      await expect(readdir(workspacePath)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('rejects announced and chunked document overflow before returning a response', async () => {
    const workspace = await createTempWorkspace()
    const document = syntheticDocument({ size: 5 })
    try {
      await expect(stageDocument(workspace.directory, 0, document, new Response('0123456789', { headers: { 'content-length': '10' } }), { maxBytes: 5 })).rejects.toMatchObject({ code: 'SEC_FILE_TOO_LARGE', statusCode: 413 })
      await expect(stageDocument(workspace.directory, 1, document, streamedResponse([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]), { maxBytes: 5 })).rejects.toMatchObject({ code: 'SEC_FILE_TOO_LARGE', statusCode: 413 })
      expect(await readdir(workspace.directory)).toEqual([])
    } finally {
      await workspace.cleanup()
    }
  })

  it('propagates upstream stream errors and aborts a stalled body without leaking staged files', async () => {
    const workspace = await createTempWorkspace()
    const document = syntheticDocument()
    try {
      const failed = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('synthetic upstream failure')) } })
      await expect(stageDocument(workspace.directory, 0, document, new Response(failed), { maxBytes: 32 })).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE', statusCode: 503, retryable: true })

      const controller = new AbortController()
      const stalled = new ReadableStream<Uint8Array>({
        start(stream) { stream.enqueue(new Uint8Array([1])) },
        pull: () => new Promise<void>(() => {}),
      })
      const pending = stageDocument(workspace.directory, 1, document, new Response(stalled), { maxBytes: 32, signal: controller.signal })
      setTimeout(() => controller.abort(), 10)
      await expect(pending).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE', statusCode: 503, retryable: true })
      expect(await readdir(workspace.directory)).toEqual([])
    } finally {
      await workspace.cleanup()
    }
  })

  it('enforces declared cumulative package limits before opening documents', () => {
    expect(() => enforceManifestLimits([syntheticDocument({ size: 7 }), syntheticDocument({ basename: 'second.txt', size: 6 })], { ...SEC_LIMITS, documentBytes: 10, packageBytes: 12 })).toThrowError(expect.objectContaining({ code: 'SEC_PACKAGE_LIMIT_EXCEEDED', statusCode: 413 }))
  })

  it('counts actual bytes cumulatively and permits a zero-byte trailing document at the cap', async () => {
    const base = fixtureService()
    const original = await base.getFilingDetail('1', accession)
    const documents = original.value.documents.slice(0, 2).map((document, index) => ({ ...document, basename: `synthetic-${index}.txt`, size: 2 }))
    let cancelled = 0
    let opens = 0
    const service = {
      async getFilingDetail() { return { ...original, value: { ...original.value, documents } } },
      async openDocument(_cik: string, _accession: string, basename: string) {
        opens += 1
        const document = documents.find(item => item.basename === basename) ?? documents[0]!
        const response = new Response(new ReadableStream<Uint8Array>({
          start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close() },
          cancel() { cancelled += 1 },
        }))
        return { detail: original.value, document, response }
      },
    } as unknown as SecEdgarService
    await expect(buildSingleFilingPackage(service, '1', accession, ['all'], { limits: { documentBytes: 4, packageBytes: 4, zipBytes: 1024 } })).rejects.toMatchObject({ code: 'SEC_PACKAGE_LIMIT_EXCEEDED', statusCode: 413 })
    expect(opens).toBe(2)
    expect(cancelled).toBe(1)

    const trailing = documents.map((document, index) => ({ ...document, size: index === 0 ? 2 : 0 }))
    const trailingService = {
      async getFilingDetail() { return { ...original, value: { ...original.value, documents: trailing } } },
      async openDocument(_cik: string, _accession: string, basename: string) {
        const document = trailing.find(item => item.basename === basename) ?? trailing[0]!
        const response = document.size === 0
          ? new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.close() } }))
          : new Response(new Uint8Array([1, 2]))
        return { detail: original.value, document, response }
      },
    } as unknown as SecEdgarService
    const packaged = await buildSingleFilingPackage(trailingService, '1', accession, ['all'], { limits: { documentBytes: 4, packageBytes: 2, zipBytes: 4096 } })
    await packaged.cleanup()

    const overflowingTrailingService = {
      async getFilingDetail() { return { ...original, value: { ...original.value, documents: trailing } } },
      async openDocument(_cik: string, _accession: string, basename: string) {
        const document = trailing.find(item => item.basename === basename) ?? trailing[0]!
        return { detail: original.value, document, response: new Response(new Uint8Array(document.size === 0 ? [1] : [1, 2])) }
      },
    } as unknown as SecEdgarService
    await expect(buildSingleFilingPackage(overflowingTrailingService, '1', accession, ['all'], { limits: { documentBytes: 4, packageBytes: 2, zipBytes: 4096 } })).rejects.toMatchObject({ code: 'SEC_PACKAGE_LIMIT_EXCEEDED', statusCode: 413 })
  })

  it('cleans a staged response and releases the resource slot when cancelled', async () => {
    const workspace = await createTempWorkspace()
    const path = `${workspace.directory}/staged.txt`
    await writeFile(path, 'synthetic body')
    const first = await acquireSecResourceSlot()
    const controller = new AbortController()
    const body = streamStagedFile({ path, size: 14, cleanup: workspace.cleanup }, { signal: controller.signal, onClosed: first.release, timeoutMs: 1000 })
    const reader = body.getReader()
    await reader.read()
    await reader.cancel()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(activeSecResourceSlots()).toBe(0)
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
    controller.abort()
  })

  it('cleans an unconsumed staged response after its lifetime timeout', async () => {
    const workspace = await createTempWorkspace()
    const path = `${workspace.directory}/staged-large.txt`
    await writeFile(path, Buffer.alloc(128 * 1024, 7))
    const lease = await acquireSecResourceSlot()
    streamStagedFile({ path, size: 128 * 1024, cleanup: workspace.cleanup }, { onClosed: lease.release, timeoutMs: 20 })
    await waitForResourceCleanup()
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(workspace.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cleans the staged response and releases its slot after full consumption', async () => {
    const workspace = await createTempWorkspace()
    const path = `${workspace.directory}/staged-complete.txt`
    await writeFile(path, Buffer.alloc(128 * 1024, 3))
    const lease = await acquireSecResourceSlot()
    const response = new Response(streamStagedFile({ path, size: 128 * 1024, cleanup: workspace.cleanup }, { onClosed: lease.release }))
    expect((await response.arrayBuffer()).byteLength).toBe(128 * 1024)
    await waitForResourceCleanup()
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(workspace.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('bounds concurrent resource-heavy guest requests and cancels queued work', async () => {
    const first = await acquireSecResourceSlot()
    const second = await acquireSecResourceSlot()
    const controller = new AbortController()
    const queued = acquireSecResourceSlot(controller.signal)
    controller.abort()
    await expect(queued).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE', statusCode: 503, retryable: true })
    expect(activeSecResourceSlots()).toBe(2)
    first.release(); second.release()
    expect(activeSecResourceSlots()).toBe(0)
  })

  it('keeps configuration failures explicit and fails closed', async () => {
    const service = (await import('../../apps/api/src/sec-edgar/service.js')).createUnavailableSecEdgarService()
    await expect(service.searchCompanies('syn', 10)).rejects.toBeInstanceOf(SecProviderError)
    await expect(service.searchCompanies('syn', 10)).rejects.toMatchObject({ code: 'SEC_CONFIG_MISSING', statusCode: 503 })
  })

  it('guards same-path redirects and rejects cross-host redirects', async () => {
    let calls = 0
    const client = new SecEdgarClient({
      userAgent: 'Diary synthetic sec@example.test', minIntervalMs: 0, sleep: async () => {},
      fetchFn: async (input) => {
        calls += 1
        if (calls === 1) return new Response(null, { status: 302, headers: { location: String(input) } })
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
      },
    })
    await expect(client.getJson(buildSecUrls.directory())).resolves.toEqual({ ok: true })
    expect(calls).toBe(2)
    const unsafe = new SecEdgarClient({
      userAgent: 'Diary synthetic sec@example.test', minIntervalMs: 0, sleep: async () => {},
      fetchFn: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example.test/redirect' } }),
    })
    await expect(unsafe.getJson(buildSecUrls.directory())).rejects.toMatchObject({ code: 'SEC_UNSAFE_REDIRECT' })
  })
})
