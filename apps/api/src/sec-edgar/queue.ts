import { cancelledSecRequest, throwIfAborted, withAbort } from './abort.js'
import { SecProviderError } from './errors.js'

interface QueueOptions {
  concurrency?: number
  minIntervalMs?: number
  maxQueued?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

interface QueueWaiter {
  resolve: () => void
  reject: (error: unknown) => void
  signal?: AbortSignal
  onAbort: () => void
}

export class SecRequestQueue {
  private active = 0
  private lastStartedAt = Number.NEGATIVE_INFINITY
  private readonly waiting: QueueWaiter[] = []
  private startGate: Promise<void> = Promise.resolve()
  private readonly concurrency: number
  private readonly minIntervalMs: number
  private readonly maxQueued: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: QueueOptions = {}) {
    this.concurrency = options.concurrency ?? 2
    this.minIntervalMs = options.minIntervalMs ?? 125
    this.maxQueued = options.maxQueued ?? 200
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  }

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal)
    try {
      await this.waitForStartSlot(signal)
      throwIfAborted(signal)
      return await operation()
    } finally {
      this.release()
    }
  }

  private async waitForStartSlot(signal?: AbortSignal): Promise<void> {
    let release!: () => void
    const previous = this.startGate
    this.startGate = new Promise<void>(resolve => { release = resolve })
    let previousAcquired = false
    try {
      await withAbort(previous, signal)
      previousAcquired = true
      const wait = Math.max(0, this.lastStartedAt + this.minIntervalMs - this.now())
      if (wait > 0) await withAbort(this.sleep(wait), signal)
      throwIfAborted(signal)
      this.lastStartedAt = this.now()
    } finally {
      if (previousAcquired) release()
      else void previous.then(release, release)
    }
  }

  private async acquire(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    if (this.active < this.concurrency && this.waiting.length === 0) {
      this.active++
      return
    }
    if (this.waiting.length >= this.maxQueued) {
      throw new SecProviderError('SEC_QUEUE_FULL', 'SEC request queue is full', 503, true)
    }
    await new Promise<void>((resolve, reject) => {
      const waiter: QueueWaiter = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = this.waiting.indexOf(waiter)
          if (index < 0) return
          this.waiting.splice(index, 1)
          signal?.removeEventListener('abort', waiter.onAbort)
          reject(cancelledSecRequest())
        },
      }
      this.waiting.push(waiter)
      signal?.addEventListener('abort', waiter.onAbort, { once: true })
      if (signal?.aborted) waiter.onAbort()
    })
  }

  private release(): void {
    this.active--
    while (this.active < this.concurrency && this.waiting.length > 0) {
      const waiter = this.waiting.shift()!
      waiter.signal?.removeEventListener('abort', waiter.onAbort)
      if (waiter.signal?.aborted) {
        waiter.reject(cancelledSecRequest())
        continue
      }
      this.active++
      waiter.resolve()
      break
    }
  }
}
