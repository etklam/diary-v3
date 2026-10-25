/* global console, process, Response */

/**
 * Capacity evidence for the SEC metadata cache byte budget (ticket 131).
 *
 * The 2026-09-27 audit recorded that the metadata caches capped entry counts
 * and not retained bytes, and that the arithmetic exceeded the 768 MiB pod
 * limit, while refusing to claim a failure it had not measured. This runs the
 * measurement: a representative corpus of large metadata payloads driven
 * through the real service, reporting peak RSS and retained cache bytes both
 * with the budget enforced and with it effectively disabled.
 *
 * Usage: node --import tsx scripts/parity/performance-sec-metadata-cache.mjs
 */

import { createSecFixtureService } from '../../apps/api/src/sec-edgar/service.ts'
import { buildSecUrls } from '../../apps/api/src/sec-edgar/client.ts'

const COMPANIES = 120
const FILINGS_PER_COMPANY = 4
// Near the client's 5 MiB response ceiling, which is the worst case the audit
// used. Filing indexes retain JSON and rendered HTML together.
const INDEX_JSON_BYTES = 2 * 1024 * 1024
const INDEX_HTML_BYTES = 2 * 1024 * 1024
const SUBMISSIONS_FILLER_BYTES = 1024 * 1024

const filler = size => 'x'.repeat(size)

function accessionFor(company, index) {
  return `${String(company).padStart(10, '0')}-24-${String(index).padStart(6, '0')}`
}

function client() {
  const documents = Array.from({ length: 24 }, (_, index) => ({ name: `doc-${index}.htm`, size: 4096 }))
  return {
    async getJson(url) {
      if (url === buildSecUrls.directory()) {
        return {
          fields: ['cik', 'name', 'ticker', 'exchange'],
          data: Array.from({ length: COMPANIES }, (_, index) => [
            String(index + 1),
            `Synthetic Holdings ${index}`,
            `SY${index}`,
            'NYSE',
          ]),
        }
      }
      if (url.endsWith('/index.json')) {
        return { directory: { item: documents }, padding: filler(INDEX_JSON_BYTES) }
      }
      // Submissions payload for one company.
      const cik = url.match(/CIK(\d+)\.json/)?.[1] ?? '0000000001'
      const company = Number(cik)
      return {
        cik,
        name: `Synthetic Holdings ${company}`,
        tickers: [`SY${company}`],
        exchanges: ['NYSE'],
        padding: filler(SUBMISSIONS_FILLER_BYTES),
        filings: {
          recent: {
            accessionNumber: Array.from({ length: FILINGS_PER_COMPANY }, (_, index) => accessionFor(company, index)),
            filingDate: Array.from({ length: FILINGS_PER_COMPANY }, () => '2024-04-01'),
            reportDate: Array.from({ length: FILINGS_PER_COMPANY }, () => '2023-12-31'),
            acceptanceDateTime: Array.from({ length: FILINGS_PER_COMPANY }, () => '2024-04-01 12:00:00'),
            form: Array.from({ length: FILINGS_PER_COMPANY }, () => '10-K'),
            primaryDocument: Array.from({ length: FILINGS_PER_COMPANY }, () => 'doc-0.htm'),
            primaryDocDescription: Array.from({ length: FILINGS_PER_COMPANY }, () => 'Annual report'),
            fileNumber: Array.from({ length: FILINGS_PER_COMPANY }, () => '1'),
            filmNumber: Array.from({ length: FILINGS_PER_COMPANY }, () => null),
            items: Array.from({ length: FILINGS_PER_COMPANY }, () => null),
            size: Array.from({ length: FILINGS_PER_COMPANY }, () => 4096),
          },
        },
      }
    },
    async getText() {
      return `<table>${documents.map((doc, index) => `<tr><td>${index}</td><td>Document</td><td>${doc.name}</td><td>10-K</td></tr>`).join('')}</table>${filler(INDEX_HTML_BYTES)}`
    },
    async getStream() {
      return new Response('fixture', { headers: { 'content-type': 'text/plain' } })
    },
  }
}

async function drive(label, cacheMaxBytes) {
  const service = createSecFixtureService(client(), cacheMaxBytes)
  let peakRss = process.memoryUsage().rss
  let peakRetained = 0

  for (let company = 1; company <= COMPANIES; company += 1) {
    await service.listFilings(String(company), { limit: FILINGS_PER_COMPANY })
    for (let index = 0; index < FILINGS_PER_COMPANY; index += 1) {
      await service.getFilingDetail(String(company), accessionFor(company, index))
    }
    const usage = service.cacheUsage()
    peakRetained = Math.max(peakRetained, usage.retainedBytes)
    peakRss = Math.max(peakRss, process.memoryUsage().rss)
  }

  const usage = service.cacheUsage()
  return {
    label,
    maxBytes: usage.maxBytes,
    peakRetainedBytes: peakRetained,
    finalRetainedBytes: usage.retainedBytes,
    peakRssBytes: peakRss,
    caches: usage.caches,
  }
}

const mib = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MiB`

const corpus = {
  companies: COMPANIES,
  filingsPerCompany: FILINGS_PER_COMPANY,
  metadataReads: COMPANIES * (1 + FILINGS_PER_COMPANY),
  indexBytesEach: INDEX_JSON_BYTES + INDEX_HTML_BYTES,
  podMemoryLimitBytes: 768 * 1024 * 1024,
}

const enforced = await drive('budget enforced (default 64 MiB)', undefined)
// The pre-change behaviour: entry counts capped, retained bytes unbounded.
const unbounded = await drive('entry caps only (pre-131 behaviour)', 64 * 1024 * 1024 * 1024)

console.log(
  `corpus: ${corpus.companies} companies x ${corpus.filingsPerCompany} filings = ${corpus.metadataReads} metadata reads`,
)
console.log(
  `         each filing index retains ${mib(corpus.indexBytesEach)}; pod memory limit is ${mib(corpus.podMemoryLimitBytes)}\n`,
)
for (const run of [enforced, unbounded]) {
  console.log(run.label)
  console.log(`  ceiling              ${mib(run.maxBytes)}`)
  console.log(`  peak retained bytes  ${mib(run.peakRetainedBytes)}`)
  console.log(`  peak process RSS     ${mib(run.peakRssBytes)}`)
  console.log(
    `  entries at end       ${Object.entries(run.caches)
      .map(([name, value]) => `${name}=${value.entries}`)
      .join(' ')}`,
  )
  console.log('')
}

console.log(JSON.stringify({ recordedAt: new Date().toISOString(), corpus, runs: [enforced, unbounded] }, null, 2))
