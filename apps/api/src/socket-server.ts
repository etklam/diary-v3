import type { PriceAlertHint } from './price-alert-checker.js'
import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { serializedIdSchema } from '@diary/contracts'
import { allowedSocketOrigin, websocketAccessToken } from './websocket-auth.js'
import type { AlertHint } from './alert-pusher.js'
export type SocketSession = { id: string; tokenVersion: number; expiresAt: Date }
export function createSocketServer(httpServer: HttpServer, dependencies: {
  webOrigin: string; production: boolean
  authenticate: (token: string) => Promise<SocketSession>
  dismiss: (userId: string, alertId: string) => Promise<void>
}) {
  const allowed = (origin: string | undefined) => allowedSocketOrigin(origin, dependencies.webOrigin, dependencies.production)
  let revocationEpoch = 0
  const io = new Server(httpServer, {
    serveClient: false, path: '/socket.io/', maxHttpBufferSize: 16_384,
    cors: { origin: (origin, callback) => callback(null, allowed(origin)), credentials: true },
    allowRequest: (request, callback) => callback(null, allowed(request.headers.origin)),
  })
  io.use(async (socket, next) => {
    const epoch = revocationEpoch
    try {
      const token = websocketAccessToken(socket.handshake)
      if (!token) return next(new Error('Authentication required'))
      const session = await dependencies.authenticate(token)
      if (epoch !== revocationEpoch || session.expiresAt.getTime() <= Date.now()) return next(new Error('Invalid token'))
      socket.data = { session, token, epoch }
      next()
    } catch { next(new Error('Invalid token')) }
  })
  io.on('connection', socket => {
    const session = socket.data.session as SocketSession
    // A revoke may commit after middleware resolved but before registration.
    if (socket.data.epoch !== revocationEpoch || session.expiresAt.getTime() <= Date.now()) { socket.disconnect(true); return }
    socket.join(`user:${session.id}`)
    socket.emit('connection:success', { socketId: socket.id, userId: session.id })
    const timer = setTimeout(() => socket.disconnect(true), Math.min(2_147_483_647, session.expiresAt.getTime() - Date.now()))
    timer.unref?.()
    socket.on('disconnect', () => clearTimeout(timer))
    socket.on('ping', () => socket.emit('pong'))
    socket.on('alert:dismiss', async (input: unknown) => {
      const parsed = serializedIdSchema.safeParse(input)
      if (!parsed.success) { socket.emit('alert:error', { message: 'Invalid alert id' }); return }
      try {
        const current = await dependencies.authenticate(socket.data.token)
        if (!socket.connected || current.id !== session.id || current.tokenVersion !== session.tokenVersion) { socket.disconnect(true); return }
      } catch { socket.disconnect(true); return }
      try {
        await dependencies.dismiss(session.id, parsed.data)
        if (socket.connected) socket.emit('alert:dismissed', { alertId: parsed.data })
      } catch { if (socket.connected) socket.emit('alert:error', { message: 'Unable to dismiss reminder', alertId: parsed.data }) }
    })
  })
  function revokeUser(userId: string) {
    revocationEpoch++
    io.in(`user:${userId}`).disconnectSockets(true)
  }
  function emitToUser(userId: string, ...[event, payload]: ['alert:triggered', AlertHint] | ['price-alert:triggered', PriceAlertHint]) {
    let emitted = false
    for (const socket of io.sockets.sockets.values()) {
      const session = socket.data.session as SocketSession
      if (session.id !== userId) continue
      if (session.expiresAt.getTime() <= Date.now()) { socket.disconnect(true); continue }
      socket.emit(event, payload); emitted = true
    }
    return emitted
  }
  return { io, revokeUser, emitToUser, close: () => new Promise<void>(resolve => io.close(() => resolve())) }
}
