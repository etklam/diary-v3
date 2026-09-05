import { createServer as httpServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { createServer as viteServer } from 'vite'
import { io, type Socket } from 'socket.io-client'
import { expect, it } from 'vitest'
import { apiProxy } from '../../apps/web/proxy'
import { createSocketServer } from '../../apps/api/src/socket-server'
function event(socket: Socket, name: string) { return new Promise<unknown[]>(resolve => socket.once(name, (...args: unknown[]) => resolve(args))) }
it('proxies cookie-authenticated polling and websocket upgrades through the Web origin', async () => {
  const backend = httpServer((_request, response) => { response.setHeader('set-cookie', 'synthetic=ok; Path=/'); response.end('api proxy') })
  const sockets = createSocketServer(backend, {
    webOrigin: 'http://127.0.0.1', production: false,
    authenticate: async token => { if (token !== 'synthetic-access') throw new Error('Invalid'); return { id: '1', tokenVersion: 0, expiresAt: new Date(Date.now() + 60_000) } },
    dismiss: async () => {},
  })
  const clients: Socket[] = []
  let proxy: Awaited<ReturnType<typeof viteServer>> | undefined
  try {
    backend.listen(0, '127.0.0.1'); await once(backend, 'listening')
    proxy = await viteServer({ configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, proxy: apiProxy(`http://127.0.0.1:${(backend.address() as AddressInfo).port}`) } })
    await proxy.listen()
    const origin = `http://127.0.0.1:${(proxy.httpServer!.address() as AddressInfo).port}`
    const response = await fetch(`${origin}/api/health`)
    expect(await response.text()).toBe('api proxy'); expect(response.headers.get('set-cookie')).toContain('synthetic=ok')
    for (const transport of ['polling', 'websocket']) {
      const client = io(origin, { autoConnect: false, reconnection: false, transports: [transport], extraHeaders: { cookie: 'access-token=synthetic-access', origin } }); clients.push(client)
      const connected = event(client, 'connection:success'); client.connect(); expect((await connected)[0]).toMatchObject({ userId: '1' })
      const hint = event(client, 'alert:triggered')
      sockets.emitToUser('1', 'alert:triggered', { id: '1', message: 'Through proxy', triggerAt: new Date().toISOString(), diary: { id: '1', title: 'Synthetic' } })
      expect((await hint)[0]).toMatchObject({ message: 'Through proxy' }); client.disconnect()
    }
  } finally {
    clients.forEach(client => client.disconnect())
    await proxy?.close(); await sockets.close()
  }
})
