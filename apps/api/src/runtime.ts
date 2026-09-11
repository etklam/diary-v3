import { createPriceAlertChecker } from './price-alert-checker.js'
import { createMarketData, createYahooUpstream } from './market-data/index.js'
import { createServer } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { createApp, type AppDependencies } from './app.js'
import { createAuthSessionService } from './auth-session.js'
import { dismissDiaryAlert } from './alerts.js'
import { createSocketServer } from './socket-server.js'
import { createAlertPusher, findUpcomingAlerts } from './alert-pusher.js'
/** One HTTP listener and foreground reminder timer per API process. */
export function createApiRuntime(dependencies: Omit<AppDependencies, 'onAccountRevoked'>) {
  const { db, config } = dependencies
  const auth = createAuthSessionService({ db, jwtSecret: config.jwtSecret, now: dependencies.now,
    fail: (_status, _code, message) => { throw new Error(message) },
  })
  const marketData = dependencies.marketData ?? createMarketData({ upstream: createYahooUpstream(), now: dependencies.now })
  const app = createApp({ ...dependencies, marketData, onAccountRevoked: userId => sockets.revokeUser(userId) })
  const server = createServer(getRequestListener(app.fetch))
  const sockets = createSocketServer(server, {
    webOrigin: config.webOrigin, production: config.nodeEnv === 'production', authenticate: auth.authenticateSocketAccess,
    now: dependencies.now,
    dismiss: async (userId, alertId) => {
      if (!await dismissDiaryAlert(db, BigInt(userId), BigInt(alertId))) throw new Error('Alert not found')
    },
  })
  const pusher = createAlertPusher({
    findUpcoming: (start, end) => findUpcomingAlerts(db, start, end), emitToUser: sockets.emitToUser,
    now: dependencies.now,
    log: (context, result, error) => {
      if (result === 'failed') (dependencies.logger ?? console).error('Reminder push failed', { ...context, result, error: error instanceof Error ? error.name : 'Unknown' })
      else console.info(JSON.stringify({ ...context, result }))
    },
  })
  const priceChecker = createPriceAlertChecker({
    db, now: dependencies.now,
    quote: async (symbol, needsHistory) => {
      const quote = await marketData.quote(symbol, true)
      // A fallback cached price is useful for reading, not for a new trigger.
      if (quote.source === 'stale') return null
      let historicalCloses
      if (needsHistory) {
        try {
          const history = await marketData.historical(symbol, '1y', true)
          historicalCloses = history.source === 'stale' ? null : history.data
        } catch {
          historicalCloses = null
        }
      }
      return { currentPrice: quote.data.regularMarketPrice, previousClose: quote.data.previousClose, historicalCloses }
    },
    emit: (userId, payload) => { sockets.emitToUser(userId, 'price-alert:triggered', payload) },
    log: (context, error) => (dependencies.logger ?? console).error('Price reminder check failed', { ...context, error: error instanceof Error ? error.name : 'Unknown' }),
  })
  let closing: Promise<void> | undefined
  function close() {
    closing ??= (async () => { await Promise.all([pusher.stop(), priceChecker.stop()]); await sockets.close() })()
    return closing
  }
  return { app, server, sockets, pusher, priceChecker, close }
}
