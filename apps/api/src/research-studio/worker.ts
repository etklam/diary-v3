import { setTimeout as delay } from 'node:timers/promises'
import type { ResearchStudioService } from './service.js'

export type ResearchWorkerOptions = {
  pollMs?: number
  signal?: AbortSignal
}

export async function runResearchWorker(service: ResearchStudioService, options: ResearchWorkerOptions = {}): Promise<void> {
  const pollMs = options.pollMs ?? 1_000
  if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new RangeError('Research worker poll interval must be 250–60000 ms')
  while (!options.signal?.aborted) {
    await service.runOnce()
    if (options.signal?.aborted) break
    try { await delay(pollMs, undefined, { signal: options.signal }) }
    catch (error) {
      if (options.signal?.aborted) break
      throw error
    }
  }
}
