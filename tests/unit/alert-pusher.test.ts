import { afterEach, expect, it, vi } from 'vitest'
import { createAlertPusher } from '../../apps/api/src/alert-pusher'
const row = { id: 1n, message: 'Synthetic reminder', triggerAt: new Date('2026-09-05T12:00:00Z'), diary: { id: 2n, title: 'Synthetic decision', userId: 3n } }
afterEach(() => vi.useRealTimers())
it('uses the frozen 65-second window and isolates offline or failed emits without mutating state', async () => {
  const findUpcoming = vi.fn().mockResolvedValue([row, { ...row, id: 2n }, { ...row, id: 3n }])
  const emitToUser = vi.fn().mockReturnValueOnce(false).mockImplementationOnce(() => { throw new Error('Synthetic transport failure') }).mockReturnValue(true)
  const log = vi.fn(), now = () => new Date('2026-09-05T12:00:00Z')
  const pusher = createAlertPusher({ findUpcoming, emitToUser, log, now })
  await pusher.checkAndPushAlerts()
  expect(findUpcoming).toHaveBeenCalledWith(now(), new Date('2026-09-05T12:01:05Z'))
  expect(emitToUser).toHaveBeenCalledTimes(3)
  expect(emitToUser).toHaveBeenNthCalledWith(1, '3', 'alert:triggered', { id: '1', message: row.message, triggerAt: row.triggerAt.toISOString(), diary: { id: '2', title: row.diary.title } })
  expect(log.mock.calls.map(call => call[1])).toEqual(['offline', 'failed', 'emitted'])
  expect(new Set(log.mock.calls.map(call => call[0].jobId)).size).toBe(1)
  expect(log.mock.calls[0]![0]).toMatchObject({ operation: 'alert_push', userId: '3', alertId: '1' })
  await pusher.stop()
})
it('starts once, coalesces slow ticks and waits for shutdown without emitting stale results', async () => {
  vi.useFakeTimers()
  let resolve!: (rows: typeof row[]) => void
  const findUpcoming = vi.fn(() => new Promise<typeof row[]>(done => { resolve = done }))
  const emitToUser = vi.fn(), pusher = createAlertPusher({ findUpcoming, emitToUser, log: vi.fn() })
  pusher.start(); pusher.start()
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(180_000)
  expect(findUpcoming).toHaveBeenCalledTimes(1)
  const stopping = pusher.stop(); expect(vi.getTimerCount()).toBe(0)
  resolve([row]); await stopping
  expect(emitToUser).not.toHaveBeenCalled()
  pusher.start(); expect(findUpcoming).toHaveBeenCalledTimes(2)
  resolve([]); await pusher.stop()
})
it('records query failure with a job id and permits the next tick', async () => {
  const findUpcoming = vi.fn().mockRejectedValueOnce(new Error('Synthetic DB failure')).mockResolvedValue([]), log = vi.fn()
  const pusher = createAlertPusher({ findUpcoming, emitToUser: vi.fn(), log })
  await pusher.checkAndPushAlerts(); await pusher.checkAndPushAlerts()
  expect(findUpcoming).toHaveBeenCalledTimes(2)
  expect(log).toHaveBeenCalledWith({ operation: 'alert_scheduler_tick', jobId: expect.any(String) }, 'failed', expect.any(Error))
  await pusher.stop()
})
