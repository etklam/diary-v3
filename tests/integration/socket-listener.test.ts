import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { io, type Socket } from 'socket.io-client'
import { createSocketServer } from '../../apps/api/src/socket-server'
let runtime: ReturnType<typeof createSocketServer> | undefined
const clients: Socket[] = []
function socketEvent(socket: Socket, event: string) { return new Promise<unknown[]>(resolve => socket.once(event, (...args: unknown[]) => resolve(args))) }
afterEach(async () => { for (const client of clients.splice(0)) client.disconnect(); await runtime?.close() })
async function setup() {
  const server = createServer((_request, response) => response.end('Synthetic listener'))
  const authenticate = vi.fn(async (token: string) => {
    if (!['owner', 'other'].includes(token)) throw new Error('Invalid')
    return { id: token === 'owner' ? '1' : '2', tokenVersion: 0, expiresAt: new Date(Date.now() + 60_000) }
  })
  const dismiss = vi.fn(async (_userId: string, _alertId: string) => {})
  runtime = createSocketServer(server, { webOrigin: 'https://diary.example.test', production: true, authenticate, dismiss })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  function client(options: Parameters<typeof io>[1]) { const socket = io(url, { autoConnect: false, reconnection: false, timeout: 1500, ...options }); clients.push(socket); return socket }
  return { client, authenticate, dismiss }
}
it('uses a real websocket handshake, isolates hints and revokes only the target account', async () => {
  const { client } = await setup()
  const owner = client({ transports: ['websocket'], auth: { token: 'owner' } }), other = client({ transports: ['websocket'], auth: { token: 'other' } })
  const connected = Promise.all([socketEvent(owner, 'connection:success'), socketEvent(other, 'connection:success')]); owner.connect(); other.connect()
  expect((await connected)[0]![0]).toMatchObject({ userId: '1' })
  const hint = { id: '8', message: 'Synthetic', triggerAt: new Date().toISOString(), diary: { id: '3', title: 'Synthetic' } }
  const incoming = socketEvent(owner, 'alert:triggered'), leaked = vi.fn(); other.on('alert:triggered', leaked)
  expect(runtime!.emitToUser('1', 'alert:triggered', hint)).toBe(true); expect((await incoming)[0]).toEqual(hint)
  const disconnected = socketEvent(owner, 'disconnect'); runtime!.revokeUser('1'); await disconnected
  expect(other.connected).toBe(true); expect(leaked).not.toHaveBeenCalled(); expect(runtime!.emitToUser('1', 'alert:triggered', hint)).toBe(false)
})
it('accepts cookie polling but denies hostile origins and malformed native auth', async () => {
  const { client } = await setup()
  const cookie = client({ transports: ['polling'], extraHeaders: { cookie: 'access-token=owner', origin: 'https://diary.example.test' } })
  const ready = socketEvent(cookie, 'connect'); cookie.connect(); await ready
  const rejectedOptions: Parameters<typeof io>[1][] = [
    { transports: ['websocket'], auth: { token: 'owner' }, extraHeaders: { origin: 'https://evil.test' } },
    { transports: ['websocket'], auth: { token: 42 }, extraHeaders: { cookie: 'access-token=owner' } },
  ]
  for (const options of rejectedOptions) {
    const bad = client(options), rejected = socketEvent(bad, 'connect_error'); bad.connect(); await rejected; expect(bad.connected).toBe(false)
  }
})
it('validates dismissal input and rechecks credentials before owner-scoped mutation', async () => {
  const { client, authenticate, dismiss } = await setup()
  const socket = client({ auth: { token: 'owner' }, transports: ['websocket'] }), ready = socketEvent(socket, 'connect'); socket.connect(); await ready
  const invalid = socketEvent(socket, 'alert:error'); socket.emit('alert:dismiss', { id: '8' }); await invalid; expect(dismiss).not.toHaveBeenCalled()
  const done = socketEvent(socket, 'alert:dismissed'); socket.emit('alert:dismiss', '8'); expect((await done)[0]).toEqual({ alertId: '8' }); expect(dismiss).toHaveBeenCalledWith('1', '8')
  authenticate.mockRejectedValueOnce(new Error('Revoked'))
  const disconnected = socketEvent(socket, 'disconnect'); socket.emit('alert:dismiss', '9'); await disconnected; expect(dismiss).toHaveBeenCalledTimes(1)
})

it('rejects a handshake whose authentication completes after account revocation', async () => {
  const { client, authenticate } = await setup()
  let complete!: (value: Awaited<ReturnType<typeof authenticate>>) => void
  let entered!: () => void
  const authenticating = new Promise<void>(resolve => { entered = resolve })
  authenticate.mockImplementationOnce(() => { entered(); return new Promise(resolve => { complete = resolve }) })
  const socket = client({ auth: { token: 'owner' }, transports: ['websocket'] })
  const connected = vi.fn(); socket.on('connection:success', connected)
  const rejected = socketEvent(socket, 'connect_error'); socket.connect(); await authenticating
  runtime!.revokeUser('1')
  complete({ id: '1', tokenVersion: 0, expiresAt: new Date(Date.now() + 60_000) })
  await rejected
  expect(socket.connected).toBe(false); expect(connected).not.toHaveBeenCalled()
  expect(runtime!.io.sockets.sockets.size).toBe(0)
})

it('disconnects at token expiry and rejects sessions already expired during handshake', async () => {
  const { client, authenticate } = await setup()
  authenticate.mockImplementationOnce(async () => ({ id: '1', tokenVersion: 0, expiresAt: new Date(Date.now() + 500) }))
  const socket = client({ auth: { token: 'owner' }, transports: ['websocket'] })
  const ready = socketEvent(socket, 'connection:success'), disconnected = socketEvent(socket, 'disconnect')
  socket.connect(); await ready; await disconnected
  expect(socket.connected).toBe(false)
  expect(runtime!.emitToUser('1', 'alert:triggered', { id: '9', message: 'After expiry', triggerAt: new Date().toISOString(), diary: { id: '3', title: 'Synthetic' } })).toBe(false)
  authenticate.mockResolvedValueOnce({ id: '1', tokenVersion: 0, expiresAt: new Date(Date.now() - 1) })
  const rejected = socketEvent(socket, 'connect_error'); socket.connect(); await rejected
  expect(socket.connected).toBe(false)
})
