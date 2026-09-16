export class MarketDataError extends Error {
  constructor(message: string, readonly kind: 'unavailable' | 'not-found' | 'rate-limited' | 'timeout' | 'overloaded' | 'cancelled' = 'unavailable') {
    super(message)
  }
}

type YahooQueueOptions = {
  attemptTimeoutMs?: number
  queueWaitTimeoutMs?: number
  overallTimeoutMs?: number
}

type Consumer<T> = {
  settled: boolean
  resolve(value: T): void
  reject(error: unknown): void
  signal?: AbortSignal
  onAbort?: () => void
}

type Job<T> = {
  key: string
  fetcher: (signal: AbortSignal) => Promise<T>
  controller: AbortController
  consumers: Set<Consumer<T>>
  state: 'queued' | 'active' | 'settled'
  slotHeld: boolean
  queueTimer?: ReturnType<typeof setTimeout>
  overallTimer?: ReturnType<typeof setTimeout>
}

const CANCELLED = () => new MarketDataError('Market request cancelled', 'cancelled')

function cancellationReason(signal: AbortSignal) {
  return signal.reason instanceof MarketDataError ? signal.reason : CANCELLED()
}

function retryable(error: unknown) {
  if (error instanceof MarketDataError) return error.kind !== 'not-found' && error.kind !== 'cancelled'
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return !message.includes('not found') && !message.includes('invalid symbol')
}

/** One queue per application runtime; consumers share upstream work through the provider. */
export function createYahooQueue(options: number | YahooQueueOptions = {}) {
  const config = typeof options === 'number' ? { attemptTimeoutMs: options } : options
  const attemptTimeoutMs = config.attemptTimeoutMs ?? 10_000
  const queueWaitTimeoutMs = config.queueWaitTimeoutMs ?? 10_000
  const overallTimeoutMs = config.overallTimeoutMs ?? 45_000
  const maxConsumersPerJob = 256
  const inFlight = new Map<string, Job<unknown>>()
  const waiters: Job<unknown>[] = []
  const executions = new Set<Promise<void>>()
  let active = 0
  let closed = false
  let closing: Promise<void> | undefined

  function clearTimer(timer: ReturnType<typeof setTimeout> | undefined) {
    if (timer !== undefined) clearTimeout(timer)
  }

  function removeWaiter(job: Job<unknown>) {
    const index = waiters.indexOf(job)
    if (index !== -1) waiters.splice(index, 1)
  }

  function settle<T>(job: Job<T>, result: { ok: true; value: T } | { ok: false; error: unknown }) {
    if (job.state === 'settled') return
    const wasQueued = job.state === 'queued'
    job.state = 'settled'
    clearTimer(job.queueTimer)
    clearTimer(job.overallTimer)
    job.queueTimer = undefined
    job.overallTimer = undefined
    if (wasQueued) removeWaiter(job as Job<unknown>)
    if (inFlight.get(job.key) === job) inFlight.delete(job.key)
    for (const consumer of job.consumers) {
      if (consumer.settled) continue
      consumer.settled = true
      if (consumer.signal && consumer.onAbort) consumer.signal.removeEventListener('abort', consumer.onAbort)
      if (result.ok) consumer.resolve(result.value)
      else consumer.reject(result.error)
    }
    job.consumers.clear()
  }

  function abortJob<T>(job: Job<T>, error: unknown) {
    if (job.state === 'settled') return
    if (!job.controller.signal.aborted) job.controller.abort(error)
    settle(job, { ok: false, error })
  }

  function consumer<T>(job: Job<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(cancellationReason(signal))
    return new Promise<T>((resolve, reject) => {
      const entry: Consumer<T> = { settled: false, resolve, reject, signal }
      const onAbort = () => {
        if (entry.settled) return
        entry.settled = true
        signal?.removeEventListener('abort', onAbort)
        entry.reject(cancellationReason(signal!))
        job.consumers.delete(entry)
        if (job.consumers.size === 0) abortJob(job, CANCELLED())
      }
      if (signal) {
        entry.onAbort = onAbort
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      }
      if (!entry.settled) job.consumers.add(entry)
    })
  }

  async function abortableDelay(ms: number, signal: AbortSignal) {
    if (signal.aborted) throw cancellationReason(signal)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, ms)
      const abort = () => {
        clearTimeout(timer)
        reject(cancellationReason(signal))
      }
      signal.addEventListener('abort', abort, { once: true })
    })
  }

  async function attempt<T>(job: Job<T>) {
    if (job.controller.signal.aborted) throw cancellationReason(job.controller.signal)
    const controller = new AbortController()
    const onJobAbort = () => controller.abort(cancellationReason(job.controller.signal))
    job.controller.signal.addEventListener('abort', onJobAbort, { once: true })
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        const error = new MarketDataError('Yahoo request timed out', 'timeout')
        controller.abort(error)
        reject(error)
      }, attemptTimeoutMs)
    })
    const signal = job.controller.signal
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(cancellationReason(signal))
      else {
        onAbort = () => reject(cancellationReason(signal))
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
    try {
      let request: Promise<T>
      try { request = Promise.resolve(job.fetcher(controller.signal)) }
      catch (error) { request = Promise.reject(error) }
      return await Promise.race([request, deadline, aborted])
    } catch (error) {
      if (job.controller.signal.aborted) throw cancellationReason(job.controller.signal)
      throw error
    } finally {
      clearTimer(timeout)
      if (onAbort) signal.removeEventListener('abort', onAbort)
      job.controller.signal.removeEventListener('abort', onJobAbort)
    }
  }

  async function execute<T>(job: Job<T>) {
    try {
      for (let attemptNumber = 0; ; attemptNumber++) {
        try {
          const result = await attempt(job)
          settle(job, { ok: true, value: result })
          return
        } catch (error) {
          if (job.controller.signal.aborted || attemptNumber >= 2 || !retryable(error)) {
            settle(job, { ok: false, error })
            return
          }
          await abortableDelay(attemptNumber === 0 ? 500 : 1500, job.controller.signal)
        }
      }
    } catch (error) {
      settle(job, { ok: false, error })
    } finally {
      if (job.slotHeld) {
        job.slotHeld = false
        active--
        pump()
      }
    }
  }

  function pump() {
    while (!closed && active < 2 && waiters.length > 0) {
      const job = waiters.shift()!
      if (job.state !== 'queued') continue
      clearTimer(job.queueTimer)
      job.queueTimer = undefined
      job.state = 'active'
      job.slotHeld = true
      active++
      const execution = execute(job)
      executions.add(execution)
      void execution.finally(() => executions.delete(execution))
    }
  }

  function run<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (closed) return Promise.reject(CANCELLED())
    if (signal?.aborted) return Promise.reject(cancellationReason(signal))
    const existing = inFlight.get(key) as Job<T> | undefined
    if (existing) {
      if (existing.consumers.size >= maxConsumersPerJob) return Promise.reject(new MarketDataError('Market request has too many shared consumers', 'overloaded'))
      return consumer(existing, signal)
    }
    if (active >= 2 && waiters.length >= 256) return Promise.reject(new MarketDataError('Market request queue is full', 'overloaded'))

    const job: Job<T> = {
      key,
      fetcher,
      controller: new AbortController(),
      consumers: new Set(),
      state: 'queued',
      slotHeld: false,
    }
    inFlight.set(key, job as Job<unknown>)
    const result = consumer(job, signal)
    job.overallTimer = setTimeout(() => abortJob(job, new MarketDataError('Yahoo task timed out', 'timeout')), overallTimeoutMs)
    waiters.push(job as Job<unknown>)
    if (active >= 2) {
      job.queueTimer = setTimeout(() => abortJob(job, new MarketDataError('Yahoo queue wait timed out', 'timeout')), queueWaitTimeoutMs)
    }
    pump()
    return result
  }

  function close() {
    if (!closing) {
      closed = true
      const error = CANCELLED()
      for (const job of [...inFlight.values()]) abortJob(job, error)
      closing = Promise.all([...executions]).then(() => undefined)
    }
    return closing
  }

  return { run, close }
}
