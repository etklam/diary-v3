import { SecProviderError } from './errors.js'

interface QueueOptions {
  concurrency?: number
  minIntervalMs?: number
  maxQueued?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export class SecRequestQueue {
  private active = 0
  private lastStartedAt = Number.NEGATIVE_INFINITY
  private readonly waiting: Array<() => void> = []
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

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      await this.waitForStartSlot()
      return await operation()
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }

  private async waitForStartSlot(): Promise<void> {
    let release!: () => void
    const previous = this.startGate
    this.startGate = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
      const wait = Math.max(0, this.lastStartedAt + this.minIntervalMs - this.now())
      if (wait > 0) await this.sleep(wait)
      this.lastStartedAt = this.now()
    } finally { release() }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.concurrency && this.waiting.length === 0) {
      this.active++
      return
    }
    if (this.waiting.length >= this.maxQueued) {
      throw new SecProviderError('SEC_QUEUE_FULL', 'SEC request queue is full', 503, true)
    }
    await new Promise<void>(resolve => this.waiting.push(resolve))
    this.active++
  }
}
