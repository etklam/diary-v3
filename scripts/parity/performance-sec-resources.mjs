/* global console, performance, process, ReadableStream, Response */

import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * Usage: node --import tsx scripts/parity/performance-sec-resources.mjs <path-to-package-module>
 * Run each implementation in a fresh Node process with the same synthetic fixture.
 */

const modulePath = process.argv[2]
if (!modulePath) throw new Error('Pass the SEC package module path')
const { buildSingleFilingPackage } = await import(pathToFileURL(modulePath).href)
const documentBytes = 32 * 1024 * 1024
const accession = '0000000001-24-000001'
const documents = Array.from({ length: 4 }, (_, index) => ({
  basename: `synthetic-${index}.txt`, size: documentBytes, classification: 'other',
  isPrimary: index === 0, isXbrl: false, isExhibit: false, isPdf: false,
}))
const service = {
  async getFilingDetail() {
    return { value: {
      company: { cik: '0000000001', name: 'Synthetic audit fixture', tickers: ['SYN'] },
      filing: { accession, form: '10-K', filingDate: '2026-01-01' },
      documents,
    } }
  },
  async openDocument(_cik, _accession, basename) {
    let remaining = documentBytes
    const document = documents.find(item => item.basename === basename)
    if (!document) throw new Error(`Unexpected synthetic document: ${basename}`)
    return { document, response: new Response(new ReadableStream({
      pull(controller) {
        if (remaining === 0) { controller.close(); return }
        const chunk = new Uint8Array(Math.min(64 * 1024, remaining)).fill(65)
        remaining -= chunk.length
        controller.enqueue(chunk)
      },
    }), { headers: { 'content-length': String(documentBytes), 'content-type': 'text/plain' } }) }
  },
}
const startedAt = performance.now()
const result = await buildSingleFilingPackage(service, '1', accession, ['all'])
const response = new Response(result.body)
const reader = response.body.getReader()
const hash = createHash('sha256')
let outputBytes = 0
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  outputBytes += value.byteLength
  hash.update(value)
}
await result.cleanup?.()
if (outputBytes < documentBytes * documents.length) throw new Error('ZIP did not contain all document bytes')
console.log(JSON.stringify({
  node: process.version, inputDocumentCount: documents.length, documentBytes,
  totalDocumentBytes: documentBytes * documents.length, outputBytes,
  elapsedMs: Math.round(performance.now() - startedAt),
  maxRssKiB: process.resourceUsage().maxRSS, outputSha256: hash.digest('hex'),
}))
