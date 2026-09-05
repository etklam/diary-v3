import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createApp } from '../apps/api/src/app';
import { provisionTestDatabase } from '../tests/support/database';
import { createMarketData, MarketDataError } from '../apps/api/src/market-data';

const database = await provisionTestDatabase('diary_v3_e2e');
const { db } = database;
const cleanup = database.dispose;
await database.pool.query("insert into users(email,password,role) values ($1,$2,'ADMIN')", ['etf-admin@example.test', await bcrypt.hash('synthetic-etf-admin-password', 4)]);
await database.pool.query("insert into users(email,password,role) values ($1,$2,'ADMIN')", ['rotation-admin@example.test', await bcrypt.hash('synthetic-rotation-admin-password', 4)]);
try {
  const makeApp = () => {
    const quoteReads = new Map<string, number>();
    const rotationHistory = Array.from({ length: 320 }, (_, index) => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      const close = 100 + index * 0.05;
      return { date, open: close - 0.5, high: close + 1, low: close - 1, close, adjclose: close, volume: 1000 + index };
    });
    const marketData = createMarketData({ upstream: {
      quote: async symbol => {
        const reads = (quoteReads.get(symbol) ?? 0) + 1;
        quoteReads.set(symbol, reads);
        if (symbol === 'UNKNOWN' || (symbol === 'STALE' && reads > 1)) throw new MarketDataError('Synthetic unavailable quote', 'not-found');
        if (symbol === 'PARTIAL') return { symbol, regularMarketPrice: 90 };
        return { symbol, regularMarketPrice: 110, regularMarketPreviousClose: 100, currency: 'USD', marketState: 'REGULAR', regularMarketTime: new Date('2026-09-04T15:00:00Z') };
      },
      chart: async (symbol, options) => {
        if (symbol === 'UNKNOWN' || symbol === 'HISTFAIL') throw new MarketDataError('Synthetic unavailable history', 'not-found');
        if (options.interval === '1d' && options.period1 < new Date('2026-01-02T00:00:00.000Z')) return { quotes: rotationHistory.map(row => ({ ...row, date: new Date(row.date) })) };
        if (options.interval === '1mo') return { quotes: [{ date: new Date('2026-01-01Z'), close: 100 }, { date: new Date('2026-02-01Z'), close: 102 }] };
        if (options.interval === '5m') return { quotes: [
          { date: new Date('2026-09-04T13:30:00Z'), open: 99.4, high: 105, low: 99, close: 104 },
          { date: new Date('2026-09-04T15:00:00Z'), open: 104, high: 110, low: 103, close: 110 },
        ] };
        return { quotes: symbol === 'EMPTY' ? [] : [
          { date: new Date('2026-09-02T15:00:00Z'), close: 105 },
          { date: new Date('2026-09-03T15:00:00Z'), close: 108 },
          { date: new Date('2026-09-04T15:00:00Z'), close: 110 },
        ] };
      },
    } });
    return createApp({ db, databasePool: database.pool, marketData, holidays: { publicHolidays: async (year, countryCode) => [
      { date: `${year}-01-01`, countryCode, name: 'Synthetic new year', localName: 'Synthetic new year' },
      { date: `${year}-09-07`, countryCode, name: 'Synthetic September holiday', localName: 'Synthetic September holiday' },
    ] }, config: {
    jwtSecret: 'e2e-only-diary-secret-never-use-this-in-production',
    nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1:3200',
    } });
  };
  const defaultApp = makeApp();
  const scenarios = new Map<string, ReturnType<typeof createApp>>();
  const server = createServer(getRequestListener((request, env) => {
    const scenario = request.headers.get('x-e2e-test-id');
    if (!scenario || !/^[0-9a-f-]{36}$/.test(scenario)) return defaultApp.fetch(request, env);
    let app = scenarios.get(scenario);
    if (!app) { app = makeApp(); scenarios.set(scenario, app); }
    return app.fetch(request, env);
  }));
  server.listen(3201, '127.0.0.1');
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await cleanup();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    void shutdown().catch(error => { console.error(error.message); process.exitCode = 1; });
  });
} catch (error) {
  await cleanup();
  throw error;
}
