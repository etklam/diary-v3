import { describe, expect, it } from 'vitest'
import { buildSecUrls, SecEdgarClient } from '../../apps/api/src/sec-edgar/client.js'
import { SecRequestQueue } from '../../apps/api/src/sec-edgar/queue.js'
import { createSecFixtureService } from '../../apps/api/src/sec-edgar/service.js'

const accession = '0000000001-24-000001'
const submissionsUrl = buildSecUrls.submissions('1')

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function submissions(files: string[] = []) {
  return {
    cik: '0000000001', name: 'Synthetic Holdings', tickers: ['SYN'], exchanges: ['NYSE'],
    filings: {
      recent: {
        accessionNumber: [accession], filingDate: ['2024-04-01'], reportDate: ['2023-12-31'],
        acceptanceDateTime: ['2024-04-01 12:00:00'], form: ['10-K'], primaryDocument: ['synthetic.htm'],
        primaryDocDescription: ['Annual report'], fileNumber: ['1'], filmNumber: [null], items: [null], size: [12],
      },
      files: files.map(name => ({ name })),
    },
  }
}

function indexJson() {
  return { directory: { item: [{ name: 'synthetic.htm', size: 12 }] } }
}

function indexHtml() {
  return '<table><tr><td>1</td><td>Annual report</td><td>synthetic.htm</td><td>10-K</td></tr></table>'
}

describe('SEC EDGAR cancellation boundaries', () => {
  it('removes an aborted queue waiter before its operation starts', async () => {
    const queue = new SecRequestQueue({ concurrency: 1, minIntervalMs: 0 })
    let release!: () => void
    const first = queue.run(() => new Promise<void>(resolve => { release = resolve }))
    await expect.poll(() => typeof release).toBe('function')

    const controller = new AbortController()
    let started = 0
    const queued = queue.run(async () => { started += 1 }, controller.signal)
    await wait(0)
    controller.abort()
    await expect(queued).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE' })
    expect(started).toBe(0)

    release()
    await first
  })

  it('keeps a cancelled start-gate waiter chained behind the current gate', async () => {
    let now = 0
    const sleeps: Array<() => void> = []
    const queue = new SecRequestQueue({
      concurrency: 2,
      minIntervalMs: 10,
      now: () => now,
      sleep: () => new Promise<void>(resolve => { sleeps.push(resolve) }),
    })
    await queue.run(async () => {})
    const first = queue.run(async () => { now += 1 })
    await expect.poll(() => sleeps).toHaveLength(1)

    const controller = new AbortController()
    const second = queue.run(async () => {}, controller.signal)
    await wait(0)
    controller.abort()
    const third = queue.run(async () => { now += 1 })
    await expect(second).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE' })
    expect(sleeps).toHaveLength(1)

    sleeps[0]!()
    await first
    await expect.poll(() => sleeps).toHaveLength(2)
    let thirdDone = false
    void third.then(() => { thirdDone = true })
    await wait(0)
    expect(thirdDone).toBe(false)
    sleeps[1]!()
    await third
  })

  it('starts the client timeout before queue acquisition', async () => {
    const blockers: Array<() => void> = []
    let cancelledBodies = 0
    let calls = 0
    const client = new SecEdgarClient({
      userAgent: 'Diary synthetic sec@example.test', minIntervalMs: 0, timeoutMs: 25, streamTimeoutMs: 25,
      fetchFn: async () => new Promise<Response>(resolve => {
        calls += 1
        blockers.push(() => resolve(new Response(new ReadableStream<Uint8Array>({
          pull: () => new Promise<void>(() => {}),
          cancel() { cancelledBodies += 1 },
        }))))
      }),
    })
    const first = client.getStream(buildSecUrls.directory())
    const second = client.getStream(buildSecUrls.submissions('1'))
    await expect.poll(() => calls).toBe(2)

    await expect(client.getStream(buildSecUrls.historicalSegment('CIK0000000001-submissions-001.json'))).rejects.toMatchObject({
      code: 'SEC_UPSTREAM_UNAVAILABLE',
    })
    expect(calls).toBe(2)

    blockers.forEach(release => release())
    await expect(first).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE' })
    await expect(second).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE' })
    expect(cancelledBodies).toBe(2)
  })

  it('applies the client deadline to a returned document body', async () => {
    let cancelled = false
    const client = new SecEdgarClient({
      userAgent: 'Diary synthetic sec@example.test', minIntervalMs: 0, streamTimeoutMs: 20,
      fetchFn: async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array([1])) },
        pull: () => new Promise<void>(() => {}),
        cancel() { cancelled = true },
      })),
    })
    const response = await client.getStream(buildSecUrls.directory())
    const reader = response.body!.getReader()
    await expect(reader.read()).resolves.toMatchObject({ done: false })
    await expect(reader.read()).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE' })
    expect(cancelled).toBe(true)
    await reader.cancel().catch(() => undefined)
  })

  it('lets an aborted service caller leave a shared metadata fill for another caller', async () => {
    let release!: () => void
    let started!: () => void
    const start = new Promise<void>(resolve => { started = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    let submissionsCalls = 0
    const service = createSecFixtureService({
      async getJson<T>(url: string): Promise<T> {
        if (url === submissionsUrl) {
          submissionsCalls += 1
          started()
          await gate
          return submissions() as T
        }
        if (url.endsWith('/index.json')) return indexJson() as T
        throw new Error(`unexpected fixture URL: ${url}`)
      },
      async getText(): Promise<string> { return indexHtml() },
    })
    const controller = new AbortController()
    const first = service.getFilingDetail('1', accession, controller.signal)
    const second = service.getFilingDetail('1', accession)
    await start
    controller.abort()
    await expect(first).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE' })
    expect(submissionsCalls).toBe(1)

    release()
    await expect(second).resolves.toMatchObject({ value: { filing: { accession } } })
  })

  it('does not begin the next historical segment after the caller aborts', async () => {
    const firstSegment = 'CIK0000000001-submissions-001.json'
    const secondSegment = 'CIK0000000001-submissions-002.json'
    let release!: () => void
    let started!: () => void
    const start = new Promise<void>(resolve => { started = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    let secondCalls = 0
    const service = createSecFixtureService({
      async getJson<T>(url: string): Promise<T> {
        if (url === submissionsUrl) return submissions([firstSegment, secondSegment]) as T
        if (url === buildSecUrls.historicalSegment(firstSegment)) {
          started()
          await gate
          return {} as T
        }
        if (url === buildSecUrls.historicalSegment(secondSegment)) {
          secondCalls += 1
          return {} as T
        }
        throw new Error(`unexpected fixture URL: ${url}`)
      },
      async getText(): Promise<string> { return indexHtml() },
    })
    const controller = new AbortController()
    const listing = service.listFilings('1', { limit: 100 }, controller.signal)
    await start
    controller.abort()
    await expect(listing).rejects.toMatchObject({ code: 'SEC_UPSTREAM_UNAVAILABLE' })
    expect(secondCalls).toBe(0)

    release()
    await wait(0)
    expect(secondCalls).toBe(0)
  })
})
