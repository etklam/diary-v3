import { createMarketData, createYahooUpstream } from './market-data/index.js'
import { createServer } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { createApp, type AppDependencies } from './app.js'

/** One HTTP listener per API process. */
export function createApiRuntime(dependencies: AppDependencies) {
  const marketData = dependencies.marketData ?? createMarketData({
    upstream: createYahooUpstream(),
    now: dependencies.now,
  })
  const app = createApp({ ...dependencies, marketData })
  const server = createServer(getRequestListener(app.fetch))
  let closing: Promise<void> | undefined

  function close() {
    closing ??= new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve()
        return
      }
      server.close(error => error ? reject(error) : resolve())
    })
    return closing
  }

  return { app, server, close }
}
