import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createSocketServer } from '../apps/api/src/socket-server';
import { createAuthSessionService } from '../apps/api/src/auth-session';
import { dismissDiaryAlert } from '../apps/api/src/alerts';
import { createAlertPusher, findUpcomingAlerts } from '../apps/api/src/alert-pusher';
import { createPriceAlertChecker } from '../apps/api/src/price-alert-checker';
import { createApp } from '../apps/api/src/app';
import { provisionTestDatabase } from '../tests/support/database';
import { createMarketData, MarketDataError } from '../apps/api/src/market-data';
import { buildSecUrls } from '../apps/api/src/sec-edgar/client';
import { createSecFixtureService } from '../apps/api/src/sec-edgar/service';
import { e2eBaseURL } from '../tests/support/e2e-origin';
import { runAiReportOnce } from '../apps/api/src/ai-reports/worker';
import type { AiTransport } from '../apps/api/src/ai-reports/outbound-policy';
import { ResearchStudioService, runResearchOnce } from '../apps/api/src/research-studio/service';
import { createSyntheticResearchFixture } from '../tests/support/research-fixtures';
import { z } from 'zod';

// This disposable browser harness never calls an external AI provider.
process.env.AI_ENCRYPTION_ACTIVE_KEY = 'e2e-fixture';
process.env.AI_ENCRYPTION_KEYS = JSON.stringify({ 'e2e-fixture': Buffer.alloc(32, 7).toString('base64') });
const aiTransport: AiTransport = async request => {
  const messages = z.object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) }).safeParse(request.body);
  const userMessage = messages.success ? messages.data.messages.find(message => message.role === 'user') : null;
  const projection = userMessage ? z.object({ report_context: z.object({ sources: z.array(z.object({ alias: z.string() })) }) }).safeParse(JSON.parse(userMessage.content)) : null;
  const sourceIds = projection?.success ? projection.data.report_context.sources.slice(0, 1).map(source => source.alias) : [];
  const item = { text: 'The saved synthetic record describes a decision to review. Compare the original reasoning with the recorded outcome and note which assumptions still need evidence.', sourceIds, metricRefs: [], evidenceLevel: 'recorded' };
  return {
  status: 200,
  retryAfter: null,
  body: JSON.stringify(request.path === 'models' ? { data: [{ id: 'synthetic-review-model' }] } : {
    id: 'synthetic-browser-review',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      summary: sourceIds.length ? [item] : [], decisionReview: sourceIds.length ? [item] : [], positionReview: [], marketReflection: [],
      disciplineChecks: [], nextPeriodFocus: [], limitations: ['Synthetic browser fixture; no investment advice.'],
    }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }),
  };
};

const database = await provisionTestDatabase('diary_v3_e2e');
const { db } = database;
const cleanup = database.dispose;
const researchFixture = createSyntheticResearchFixture();
const secFixtureAccession = '0000000001-24-000001';
const secFixtureService = createSecFixtureService({
  async getJson<T>(url: string): Promise<T> {
    if (url === buildSecUrls.directory()) return ({ fields: ['cik', 'name', 'ticker', 'exchange'], data: [['1', 'Synthetic Holdings', 'SYN', 'NYSE']] } as T);
    if (url === buildSecUrls.submissions('1')) return ({ cik: '0000000001', name: 'Synthetic Holdings', tickers: ['SYN'], exchanges: ['NYSE'], filings: { recent: {
      accessionNumber: [secFixtureAccession], filingDate: ['2024-04-01'], reportDate: ['2023-12-31'], acceptanceDateTime: ['2024-04-01 12:00:00'], form: ['10-K'], primaryDocument: ['syn-10k.htm'], primaryDocDescription: ['Annual report'], fileNumber: ['1'], filmNumber: [null], items: [null], size: [120],
    } } } as T);
    if (url.endsWith('/index.json')) return ({ directory: { item: [{ name: 'syn-10k.htm', size: 120 }, { name: `${secFixtureAccession}.txt`, size: 240 }] } } as T);
    throw new Error(`unexpected SEC fixture URL: ${url}`);
  },
  async getText(): Promise<string> { return '<table><tr><td>1</td><td>Annual report</td><td>syn-10k.htm</td><td>10-K</td></tr></table>'; },
  async getStream(url: string): Promise<Response> { return new Response(`synthetic-sec-document:${url}`, { headers: { 'content-type': 'text/plain' } }); },
});
await database.pool.query("insert into users(email,password,role) values ($1,$2,'ADMIN')", ['etf-admin@example.test', await bcrypt.hash('synthetic-etf-admin-password', 4)]);
await database.pool.query("insert into users(email,password,role) values ($1,$2,'ADMIN')", ['rotation-admin@example.test', await bcrypt.hash('synthetic-rotation-admin-password', 4)]);
await database.pool.query("insert into users(email,password,role) values ($1,$2,'ADMIN')", ['ai-admin@example.test', await bcrypt.hash('synthetic-ai-admin-password', 4)]);
await database.pool.query("insert into users(email,password,role) values ($1,$2,'USER')", ['research-member@example.test', await bcrypt.hash('synthetic-research-member-password', 4)]);
try {
  const makeApp = () => {
    const quoteReads = new Map<string, number>();
    // 320 deterministic daily bars ending (not starting) at the fixture quote as-of date.
    const rotationHistory = Array.from({ length: 320 }, (_, index) => {
      const date = new Date('2026-09-04T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index - 319);
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
        if (symbol === 'EMPTY') return { quotes: [] };
        if (options.interval === '1d' && options.period1 < new Date('2026-01-02T00:00:00.000Z')) return { quotes: rotationHistory.map(row => ({ ...row, date: new Date(row.date) })) };
        if (options.interval === '1mo') return { quotes: [{ date: new Date('2026-01-01Z'), close: 100 }, { date: new Date('2026-02-01Z'), close: 102 }] };
        if (options.interval === '5m') return { quotes: [
          { date: new Date('2026-09-04T13:30:00Z'), open: 99.4, high: 105, low: 99, close: 104 },
          { date: new Date('2026-09-04T15:00:00Z'), open: 104, high: 110, low: 103, close: 110 },
        ] };
        return { quotes: [
          { date: new Date('2026-09-02T15:00:00Z'), close: 105 },
          { date: new Date('2026-09-03T15:00:00Z'), close: 108 },
          { date: new Date('2026-09-04T15:00:00Z'), close: 110 },
        ] };
      },
    } });
    return createApp({ db, databasePool: database.pool, aiTransport, marketData, secFilings: secFixtureService, researchEvidenceProvider: researchFixture.evidenceProvider, researchLatestCompletedSession: researchFixture.latestCompletedSession, researchTransport: researchFixture.transport, allowSyntheticEvidence: true, onAccountRevoked: id => sockets.revokeUser(id), holidays: { publicHolidays: async (year, countryCode) => [
      { date: `${year}-01-01`, countryCode, name: 'Synthetic new year', localName: 'Synthetic new year' },
      { date: `${year}-09-07`, countryCode, name: 'Synthetic September holiday', localName: 'Synthetic September holiday' },
    ] }, config: {
    jwtSecret: 'e2e-only-diary-secret-never-use-this-in-production',
    nodeEnv: 'test', trustProxy: false, webOrigin: e2eBaseURL,
    } });
  };
  const defaultApp = makeApp();
  const researchWorker = new ResearchStudioService({ db, evidenceProvider: researchFixture.evidenceProvider, latestCompletedSession: researchFixture.latestCompletedSession, transport: researchFixture.transport, allowSyntheticEvidence: true, workerId: 'synthetic-browser-research-worker' });
  const scenarios = new Map<string, ReturnType<typeof createApp>>();
  const server = createServer(getRequestListener((request, env) => {
    const scenario = request.headers.get('x-e2e-test-id');
    if (!scenario || !/^[0-9a-f-]{36}$/.test(scenario)) return defaultApp.fetch(request, env);
    let app = scenarios.get(scenario);
    if (!app) { app = makeApp(); scenarios.set(scenario, app); }
    return app.fetch(request, env);
  }));
  const auth = createAuthSessionService({ db, jwtSecret: 'e2e-only-diary-secret-never-use-this-in-production', fail: (_status, _code, message) => { throw new Error(message); } });
  const sockets = createSocketServer(server, { webOrigin: e2eBaseURL, production: false, authenticate: auth.authenticateSocketAccess, dismiss: async (userId, alertId) => { if (!await dismissDiaryAlert(db, BigInt(userId), BigInt(alertId))) throw new Error('Alert not found'); } });
  const pusher = createAlertPusher({ findUpcoming: (start, end) => findUpcomingAlerts(db, start, end), emitToUser: sockets.emitToUser, log: () => {} });
  const priceChecker = createPriceAlertChecker({ db, quote: async symbol => symbol === 'FOREGROUND' ? 110 : null, emit: (userId, payload) => sockets.emitToUser(userId, 'price-alert:triggered', payload), log: () => {} });
  // Only the synthetic FOREGROUND symbol is quoted by the price test scheduler.
  // Synthetic-only harness accelerates ticks; production keeps its 60-second interval.
  const ticks = setInterval(() => { void pusher.checkAndPushAlerts(); void priceChecker.checkPriceAlerts(); }, 1000);
  const aiAbort = new AbortController();
  let aiTick: Promise<unknown> | null = null;
  const aiTicks = setInterval(() => {
    if (aiTick) return;
    aiTick = runAiReportOnce({ db, workerId: 'synthetic-browser-worker', transport: aiTransport, signal: aiAbort.signal })
      .catch(error => console.error(error.message)).finally(() => { aiTick = null; });
  }, 250);
  let researchTick: Promise<unknown> | null = null;
  const researchTicks = setInterval(() => {
    if (researchTick) return;
    researchTick = runResearchOnce(researchWorker)
      .catch(error => console.error(error.message)).finally(() => { researchTick = null; });
  }, 250);
  server.listen(3201, '127.0.0.1');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    clearInterval(ticks);
    clearInterval(aiTicks);
    clearInterval(researchTicks);
    aiAbort.abort();
    void Promise.all([pusher.stop(), priceChecker.stop(), aiTick, researchTick]).then(() => sockets.close()).then(cleanup).catch(error => { console.error(error.message); process.exitCode = 1; });
  });
} catch (error) {
  await cleanup();
  throw error;
}
