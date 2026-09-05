import type { SecBatchMode, SecFilingDetail, SecFilingDocument } from '@diary/contracts/sec-filings'
import type { SecEdgarService } from './service.js'
import { SecProviderError } from './errors.js'
import { readResponseBytes, SEC_LIMITS, safeDownloadName } from './download.js'

type ZipEntry = { name: string; data: Uint8Array }

/* Small stored ZIP writer. SEC packages are bounded before this point; using
 * method 0 keeps the provider boundary dependency-free and easy to audit. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const value of bytes) {
    crc ^= value
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
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

function createZip(entries: ZipEntry[]): Uint8Array {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name)
    const data = entry.data
    const crc = crc32(data)
    const header = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.byteLength), u32(data.byteLength), u16(name.byteLength), u16(0), name])
    local.push(header, data)
    const directory = concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.byteLength), u32(data.byteLength), u16(name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name])
    central.push(directory)
    offset += header.byteLength + data.byteLength
  }
  const centralBytes = concat(central)
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.byteLength), u32(offset), u16(0)])
  const output = concat([...local, centralBytes, end])
  if (output.byteLength > SEC_LIMITS.zipBytes) throw new SecProviderError('SEC_PACKAGE_LIMIT_EXCEEDED', 'ZIP output exceeds limit', 413)
  return output
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

export function enforceManifestLimits(documents: SecFilingDocument[]): void {
  if (documents.length === 0) throw new SecProviderError('SEC_DOCUMENT_NOT_FOUND', 'No matching SEC documents', 404)
  const bytes = documents.reduce((sum, item) => sum + item.size, 0)
  if (documents.length > SEC_LIMITS.packageFiles || bytes > SEC_LIMITS.packageBytes) throw new SecProviderError('SEC_PACKAGE_LIMIT_EXCEEDED', 'SEC package exceeds resource limits', 413)
}

export interface SecPackageResult { filename: string; contentType: 'application/zip'; body: Uint8Array }

async function packageEntries(service: SecEdgarService, documents: SecFilingDocument[], cik: string, accession: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = []
  for (const document of documents) {
    const opened = await service.openDocument(cik, accession, document.basename)
    const body = await readResponseBytes(opened.response, SEC_LIMITS.documentBytes)
    entries.push({ name: safeDownloadName(document.basename), data: body })
    if (entries.reduce((sum, entry) => sum + entry.data.byteLength, 0) > SEC_LIMITS.packageBytes) throw new SecProviderError('SEC_PACKAGE_LIMIT_EXCEEDED', 'SEC package exceeds resource limits', 413)
  }
  return entries
}

export async function buildSingleFilingPackage(service: SecEdgarService, cik: string, accession: string, includes: string[]): Promise<SecPackageResult> {
  const detailResult = await service.getFilingDetail(cik, accession)
  const documents = selectPackageDocuments(detailResult.value, includes)
  enforceManifestLimits(documents)
  const manifest = { source: 'SEC EDGAR', createdAt: new Date().toISOString(), company: detailResult.value.company, filing: detailResult.value.filing, files: documents.map(({ basename, size, classification }) => ({ basename, size, classification })) }
  const entries = [{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) }, ...(await packageEntries(service, documents, cik, accession))]
  return { filename: safeDownloadName(`${detailResult.value.company.tickers[0] ?? cik}_${detailResult.value.filing.form}_${accession}.zip`), contentType: 'application/zip', body: createZip(entries) }
}

export async function buildBatchPackage(service: SecEdgarService, cik: string, accessions: string[], mode: SecBatchMode): Promise<SecPackageResult> {
  const resolved: Array<{ detail: SecFilingDetail; document: SecFilingDocument }> = []
  for (const accession of accessions) {
    const detail = await service.getFilingDetail(cik, accession)
    const document = mode === 'primary' ? detail.value.documents.find(item => item.isPrimary) : detail.value.documents.find(item => item.classification === 'complete-submission')
    if (!document) throw new SecProviderError('SEC_DOCUMENT_NOT_FOUND', `Required ${mode} document is unavailable`, 404)
    resolved.push({ detail: detail.value, document })
  }
  enforceManifestLimits(resolved.map(item => item.document))
  const entries: ZipEntry[] = [{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify({ source: 'SEC EDGAR', createdAt: new Date().toISOString(), cik, mode, filings: resolved.map(item => ({ filing: item.detail.filing, document: { basename: item.document.basename, size: item.document.size } })) }, null, 2)) }]
  for (const [index, item] of resolved.entries()) {
    const opened = await service.openDocument(cik, item.detail.filing.accession, item.document.basename)
    entries.push({ name: safeDownloadName(`${String(index + 1).padStart(3, '0')}-${item.detail.company.tickers[0] ?? cik}_${item.detail.filing.form}_${item.detail.filing.filingDate}_${item.detail.filing.accession}_${item.document.basename}`), data: await readResponseBytes(opened.response, SEC_LIMITS.documentBytes) })
    if (entries.reduce((sum, entry) => sum + entry.data.byteLength, 0) > SEC_LIMITS.packageBytes) throw new SecProviderError('SEC_PACKAGE_LIMIT_EXCEEDED', 'SEC package exceeds resource limits', 413)
  }
  return { filename: safeDownloadName(`${resolved[0]?.detail.company.tickers[0] ?? cik}_sec-filings_${mode}.zip`), contentType: 'application/zip', body: createZip(entries) }
}
