import { createReadStream } from 'node:fs'
import { open, rm, stat, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import type { SecBatchMode, SecFilingDetail, SecFilingDocument } from '@diary/contracts/sec-filings'
import type { SecEdgarService } from './service.js'
import { SecProviderError } from './errors.js'
import {
  createTempWorkspace,
  createSecLifetime,
  SEC_LIMITS,
  safeDownloadName,
  stageDocument,
  streamStagedFile,
  type SecResourceLimits,
} from './download.js'

type ManifestEntry = { name: string; data: Uint8Array }
type CentralEntry = { name: Uint8Array; crc: number; size: number; offset: number }

function limitsWith(overrides?: Partial<SecResourceLimits>): SecResourceLimits {
  return { ...SEC_LIMITS, ...overrides }
}

function u16(value: number): Uint8Array { const output = new Uint8Array(2); new DataView(output.buffer).setUint16(0, value, true); return output }
function u32(value: number): Uint8Array { const output = new Uint8Array(4); new DataView(output.buffer).setUint32(0, value >>> 0, true); return output }
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, item) => sum + item.byteLength, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const item of parts) { output.set(item, offset); offset += item.byteLength }
  return output
}

function packageLimitError() {
  return new SecProviderError('SEC_PACKAGE_LIMIT_EXCEEDED', 'SEC package exceeds resource limits', 413)
}

function documentLimitError() {
  return new SecProviderError('SEC_FILE_TOO_LARGE', 'SEC document exceeds size limit', 413)
}

function checkSignal(signal?: AbortSignal) {
  if (signal?.aborted) throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC request was cancelled', 503, true)
}

async function writeChunk(file: FileHandle, chunk: Uint8Array, state: { bytes: number }, limits: SecResourceLimits, signal?: AbortSignal) {
  checkSignal(signal)
  if (state.bytes + chunk.byteLength > limits.zipBytes) throw packageLimitError()
  let offset = 0
  while (offset < chunk.byteLength) {
    checkSignal(signal)
    let bytesWritten: number
    try {
      ({ bytesWritten } = await file.write(chunk, offset, chunk.byteLength - offset, state.bytes + offset))
    } catch (error) {
      if (error instanceof SecProviderError) throw error
      throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC package staging failed', 503, true)
    }
    if (bytesWritten <= 0) throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC package staging failed', 503, true)
    offset += bytesWritten
  }
  state.bytes += chunk.byteLength
}

function localHeader(name: Uint8Array, checksum: number, size: number): Uint8Array {
  return concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(size), u32(size), u16(name.byteLength), u16(0), name])
}

function centralHeader(entry: CentralEntry): Uint8Array {
  return concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(entry.crc), u32(entry.size), u32(entry.size), u16(entry.name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(entry.offset), entry.name])
}

function endRecord(entries: number, centralSize: number, centralOffset: number): Uint8Array {
  return concat([u32(0x06054b50), u16(0), u16(0), u16(entries), u16(entries), u32(centralSize), u32(centralOffset), u16(0)])
}

async function appendMemoryEntry(
  file: FileHandle,
  entry: ManifestEntry,
  state: { bytes: number },
  central: CentralEntry[],
  limits: SecResourceLimits,
  signal?: AbortSignal,
) {
  const name = new TextEncoder().encode(entry.name)
  const checksum = crc32(entry.data)
  const offset = state.bytes
  await writeChunk(file, localHeader(name, checksum, entry.data.byteLength), state, limits, signal)
  await writeChunk(file, entry.data, state, limits, signal)
  central.push({ name, crc: checksum, size: entry.data.byteLength, offset })
}

async function appendStagedEntry(
  file: FileHandle,
  entry: { name: string; path: string; size: number; crc: number },
  state: { bytes: number },
  central: CentralEntry[],
  limits: SecResourceLimits,
  signal?: AbortSignal,
) {
  const name = new TextEncoder().encode(entry.name)
  const offset = state.bytes
  await writeChunk(file, localHeader(name, entry.crc, entry.size), state, limits, signal)
  const source = createReadStream(entry.path, { highWaterMark: 64 * 1024, signal })
  let size = 0
  try {
    for await (const chunk of source) {
      const value = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
      size += value.byteLength
      await writeChunk(file, value, state, limits, signal)
    }
  } catch (error) {
    if (error instanceof SecProviderError) throw error
    if (signal?.aborted) throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC request was cancelled', 503, true)
    throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC package staging failed', 503, true)
  }
  if (size !== entry.size) throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC staged document changed during packaging', 503, true)
  central.push({ name, crc: entry.crc, size, offset })
}

export function selectPackageDocuments(detail: SecFilingDetail, includes: string[]): SecFilingDocument[] {
  const selected = new Map<string, SecFilingDocument>()
  const add = (document: SecFilingDocument) => selected.set(document.basename, document)
  const choices = includes.length ? includes : ['all']
  for (const choice of choices) {
    for (const document of detail.documents) {
      if (choice === 'all' || choice === 'primary' && document.isPrimary || choice === 'complete' && document.classification === 'complete-submission' || choice === 'xbrl' && document.isXbrl || choice === 'exhibits' && document.isExhibit || choice === 'pdf' && document.isPdf) add(document)
    }
  }
  return [...selected.values()]
}

export function enforceManifestLimits(documents: SecFilingDocument[], limits: SecResourceLimits = SEC_LIMITS): void {
  if (documents.length === 0) throw new SecProviderError('SEC_DOCUMENT_NOT_FOUND', 'No matching SEC documents', 404)
  if (documents.some(document => document.size > limits.documentBytes)) throw documentLimitError()
  const bytes = documents.reduce((sum, item) => sum + item.size, 0)
  if (documents.length > limits.packageFiles || bytes > limits.packageBytes) throw packageLimitError()
}

export interface SecPackageResult {
  filename: string
  contentType: 'application/zip'
  path: string
  size: number
  cleanup: () => Promise<void>
  body: ReadableStream<Uint8Array>
}

export interface SecPackageOptions {
  signal?: AbortSignal
  limits?: Partial<SecResourceLimits>
  onClosed?: () => void
  timeoutMs?: number
  /** Internal failure-injection seam for resource lifecycle tests. */
  openFile?: (path: string) => Promise<FileHandle>
}

async function buildPackage(
  service: SecEdgarService,
  filename: string,
  manifest: ManifestEntry,
  documents: Array<{ name: string; document: SecFilingDocument; cik: string; accession: string }>,
  options: SecPackageOptions,
): Promise<SecPackageResult> {
  const limits = limitsWith(options.limits)
  enforceManifestLimits(documents.map(item => item.document), limits)
  const lifetime = createSecLifetime(options.signal, options.timeoutMs)
  let workspace: Awaited<ReturnType<typeof createTempWorkspace>> | undefined
  let file: FileHandle | undefined
  const state = { bytes: 0 }
  const central: CentralEntry[] = []
  try {
    const currentWorkspace = await createTempWorkspace()
    workspace = currentWorkspace
    const zipPath = join(currentWorkspace.directory, 'package.zip')
    file = await (options.openFile ? options.openFile(zipPath) : open(zipPath, 'wx', 0o600))
    await appendMemoryEntry(file, manifest, state, central, limits, lifetime.signal)
    let actualDocumentBytes = 0
    for (const [index, item] of documents.entries()) {
      checkSignal(lifetime.signal)
      const remaining = limits.packageBytes - actualDocumentBytes
      if (remaining < 0) throw packageLimitError()
      const opened = await service.openDocument(item.cik, item.accession, item.document.basename, lifetime.signal)
      const staged = await stageDocument(currentWorkspace.directory, index, item.document, opened.response, {
        signal: lifetime.signal,
        maxBytes: Math.min(limits.documentBytes, remaining),
        onTooLarge: () => remaining < limits.documentBytes ? packageLimitError() : documentLimitError(),
      })
      actualDocumentBytes += staged.size
      try {
        // Append one file at a time so the temporary document can be removed
        // before the next resource is staged.
        await appendStagedEntry(file, { name: item.name, path: staged.path, size: staged.size, crc: staged.crc32 }, state, central, limits, lifetime.signal)
      } finally {
        await rm(staged.path, { force: true })
      }
    }
    const centralOffset = state.bytes
    for (const entry of central) await writeChunk(file, centralHeader(entry), state, limits, lifetime.signal)
    await writeChunk(file, endRecord(central.length, state.bytes - centralOffset, centralOffset), state, limits, lifetime.signal)
    await file.close()
    file = undefined
    const size = state.bytes
    const actualZipSize = (await stat(zipPath)).size
    if (actualZipSize !== size || actualZipSize > limits.zipBytes) throw packageLimitError()
    const resourceCleanup = async () => { lifetime.dispose(); await currentWorkspace.cleanup() }
    const resource = { path: zipPath, size: actualZipSize, cleanup: resourceCleanup }
    const body = streamStagedFile(resource, { signal: lifetime.signal, onClosed: options.onClosed, timeoutMs: options.timeoutMs })
    const cleanup = async () => { await body.cancel().catch(() => {}); await resourceCleanup() }
    return { filename, contentType: 'application/zip', ...resource, cleanup, body }
  } catch (error) {
    lifetime.dispose()
    await file?.close().catch(() => {})
    if (workspace) await workspace.cleanup().catch(() => {})
    if (error instanceof SecProviderError) throw error
    throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC package staging failed', 503, true)
  }
}

export async function buildSingleFilingPackage(service: SecEdgarService, cik: string, accession: string, includes: string[], options: SecPackageOptions = {}): Promise<SecPackageResult> {
  checkSignal(options.signal)
  const detailResult = await service.getFilingDetail(cik, accession, options.signal)
  checkSignal(options.signal)
  const documents = selectPackageDocuments(detailResult.value, includes)
  const manifest = { source: 'SEC EDGAR', createdAt: new Date().toISOString(), company: detailResult.value.company, filing: detailResult.value.filing, files: documents.map(({ basename, size, classification }) => ({ basename, size, classification })) }
  return buildPackage(service, safeDownloadName(`${detailResult.value.company.tickers[0] ?? cik}_${detailResult.value.filing.form}_${accession}.zip`), { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) }, documents.map(document => ({ name: safeDownloadName(document.basename), document, cik, accession })), options)
}

export async function buildBatchPackage(service: SecEdgarService, cik: string, accessions: string[], mode: SecBatchMode, options: SecPackageOptions = {}): Promise<SecPackageResult> {
  const resolved: Array<{ detail: SecFilingDetail; document: SecFilingDocument }> = []
  for (const accession of accessions) {
    checkSignal(options.signal)
    const detail = await service.getFilingDetail(cik, accession, options.signal)
    checkSignal(options.signal)
    const document = mode === 'primary' ? detail.value.documents.find(item => item.isPrimary) : detail.value.documents.find(item => item.classification === 'complete-submission')
    if (!document) throw new SecProviderError('SEC_DOCUMENT_NOT_FOUND', `Required ${mode} document is unavailable`, 404)
    resolved.push({ detail: detail.value, document })
  }
  const manifest = { source: 'SEC EDGAR', createdAt: new Date().toISOString(), cik, mode, filings: resolved.map(item => ({ filing: item.detail.filing, document: { basename: item.document.basename, size: item.document.size } })) }
  return buildPackage(service, safeDownloadName(`${resolved[0]?.detail.company.tickers[0] ?? cik}_sec-filings_${mode}.zip`), { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) }, resolved.map((item, index) => ({ name: safeDownloadName(`${String(index + 1).padStart(3, '0')}-${item.detail.company.tickers[0] ?? cik}_${item.detail.filing.form}_${item.detail.filing.filingDate}_${item.detail.filing.accession}_${item.document.basename}`), document: item.document, cik, accession: item.detail.filing.accession })), options)
}
