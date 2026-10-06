import { createHash, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import {
  guruAnalysisRuns,
  gurus,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshots,
  institutionalFilingArtifacts,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalManagers,
  institutionalSecurities,
  institutionalSecurityIdentifiers,
  institutionalSnapshotChangeEvents,
  users,
} from '@diary/db'
import { guruAnalysisResponseSchema } from '@diary/contracts'
import { guruAnalysisCaveatKeys } from '@diary/domain/guru-analysis'
import { runPendingGuruPortfolioAnalyticsOnce } from '../../apps/api/src/institutional/portfolio-analytics.js'
import { runPendingGuruConsensusRebuildOnce } from '../../apps/api/src/institutional/guru-consensus.js'
import { requestGuruAnalysis, runPendingGuruAnalysisInvalidationOnce } from '../../apps/api/src/guru-analysis/service.js'
import { runGuruAnalysisOnce } from '../../apps/api/src/guru-analysis/worker.js'
import { registerGuruAnalysisRoutes } from '../../apps/api/src/guru-analysis/routes.js'
import { encryptAiSecret } from '../../apps/api/src/ai-reports/secrets.js'
import type { AiTransport } from '../../apps/api/src/ai-reports/outbound-policy.js'
import { fail, validationError, type AppEnv } from '../../apps/api/src/app-context.js'
import { provisionTestDatabase } from '../support/database.js'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let clock: Date
let actorId: bigint
let securityId: bigint
let guru: typeof gurus.$inferSelect
let filingNumber = 1
let managerNumber = 940000

const statement = (overrides: Record<string, unknown> = {}) => ({ text: 'Synthetic statement.', kind: 'interpretation', factRefs: [], positionKeys: [], ...overrides })
const analysisPayload = {
  executiveSummary: [statement({ kind: 'fact', factRefs: ['portfolio.reportedValueUsd'] })],
  portfolioDirection: [], convictionPositions: [], newPositions: [], increasedPositions: [], reducedPositions: [],
  exitedPositions: [], sectorAndThemeChange: [], concentrationChange: [], turnoverInterpretation: [],
  historicalContext: [], consensusContext: [], risks: [statement()], takeaways: [statement()],
  caveatIds: [...guruAnalysisCaveatKeys],
}
const response = (content: unknown = analysisPayload) => ({
  status: 200, retryAfter: null,
  body: JSON.stringify({ id: 'synthetic-guru-request', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 420, completion_tokens: 90 } }),
})

function digest(value: string) { return createHash('sha256').update(value).digest('hex') }

beforeAll(() => {
  vi.stubEnv('AI_ENCRYPTION_ACTIVE_KEY', 'guru-analysis-fixture')
  vi.stubEnv('AI_ENCRYPTION_KEYS', JSON.stringify({ 'guru-analysis-fixture': Buffer.alloc(32, 7).toString('base64') }))
})
afterAll(() => vi.unstubAllEnvs())

beforeEach(async () => {
  database = await provisionTestDatabase('guru_analysis')
  clock = new Date('2026-08-15T12:00:00Z')
  const [actor] = await database.db.insert(users).values({ email: `${randomUUID()}@example.test`, password: 'synthetic-test-password', role: 'ADMIN' }).returning()
  actorId = actor!.id
  const [security] = await database.db.insert(institutionalSecurities).values({
    issuer: 'Synthetic Alpha Issuer', titleOfClass: 'Common Stock', securityType: 'EQUITY', sector: 'Technology', industry: 'Software',
    sourceUrl: 'https://issuer.example.test/security', sourceVerifiedBy: actorId, sourceVerifiedAt: clock,
  }).returning()
  securityId = security!.id
  await database.db.insert(institutionalSecurityIdentifiers).values({
    securityId, type: 'TICKER', value: 'SYN', validFrom: '2020-01-01', validTo: null,
    sourceUrl: 'https://issuer.example.test/ticker', sourceVerifiedBy: actorId, sourceVerifiedAt: clock, createdAt: clock,
  })
  const cik = String(managerNumber++).padStart(10, '0')
  const [manager] = await database.db.insert(institutionalManagers).values({ cik }).returning()
  const [profile] = await database.db.insert(gurus).values({
    managerId: manager!.id, slug: `analysis-guru-${cik}`, name: 'Synthetic Analysis Capital', managerName: 'Synthetic Analysis Management',
    styleTags: ['Value'], managerType: 'Hedge fund',
  }).returning()
  guru = profile!
  const provider = await database.pool.query(
    "insert into ai_provider_config_version(revision,status,display_name,base_url,model,encrypted_api_key,reservation_cost_cents,monthly_budget_cents,max_input_tokens,pricing_version,input_price_per_million_cents,output_price_per_million_cents) values (1,'published','Synthetic','https://api.deepseek.com','fixture-model',$1,10,1000,2000000,'fixture-price',100,200) returning id",
    [encryptAiSecret('synthetic-key', 'provider-api-key')],
  )
  await database.pool.query('update ai_runtime_state set generation_enabled=true,active_provider_config_id=$1,worker_heartbeat_at=$2', [provider.rows[0].id, clock])
})
afterEach(async () => { await database?.dispose() })

async function publish(input: { periodEnd: string; quantity: string; reportedValue: string }) {
  const accession = `${String(guru.managerId).padStart(10, '0')}-26-${String(filingNumber++).padStart(6, '0')}`
  const sourceUrl = `https://www.sec.gov/fixture/${accession}`
  const [filing] = await database.db.insert(institutionalFilings).values({
    managerId: guru.managerId, accession, form: '13F-HR', isAmendment: false, filingDate: input.periodEnd,
    filedAt: clock, periodEnd: input.periodEnd, sourceUrl, status: 'READY', parserVersion: 'analysis-fixture-v1',
    parsedRowCount: 1, rejectedRowCount: 0,
  }).returning()
  const [document] = await database.db.insert(institutionalFilingDocuments).values({ filingId: filing!.id, basename: 'information.xml', sourceUrl, isPrimary: true }).returning()
  const body = `<fixture>${accession}</fixture>`
  const [artifact] = await database.db.insert(institutionalFilingArtifacts).values({
    documentId: document!.id, contentSha256: digest(body), artifactRef: `synthetic:${accession}`,
    rawContent: body, contentLength: BigInt(body.length), fetchedAt: clock,
  }).returning()
  const snapshotHash = digest(`${securityId}:${input.quantity}:${input.reportedValue}`)
  const [snapshot] = await database.db.insert(institutionalEffectiveSnapshots).values({
    managerId: guru.managerId, periodEnd: input.periodEnd, replayKey: digest(`replay:${snapshotHash}:${randomUUID()}`),
    snapshotHash, sourceManifestHash: digest(`manifest:${accession}`), resolverVersion: 'analysis-fixture-v1', holdingCount: 1, createdAt: clock,
  }).returning()
  await database.db.insert(institutionalEffectiveHoldings).values({
    snapshotId: snapshot!.id, ordinal: 0, sourceFilingId: filing!.id, sourceDocumentId: document!.id, sourceArtifactId: artifact!.id,
    sourceRowKey: digest(`row:${accession}`), sourceRowNumber: 1, securityId,
    mappingStatus: 'MATCHED', mappingVersion: 'analysis-fixture-v1', issuer: 'Synthetic Alpha Issuer', titleOfClass: 'Common Stock',
    cusip: null, figi: null, reportedValue: input.reportedValue, reportedValueUnit: 'USD', quantity: input.quantity,
    quantityType: 'SH', putCall: null, sourceData: { accession, sourceUrl },
  })
  await database.db.update(institutionalEffectiveSnapshotPublications)
    .set({ status: 'SUPERSEDED', active: false, updatedAt: clock })
    .where(eq(institutionalEffectiveSnapshotPublications.periodEnd, input.periodEnd))
  await database.db.insert(institutionalEffectiveSnapshotPublications).values({
    snapshotId: snapshot!.id, managerId: guru.managerId, periodEnd: input.periodEnd, status: 'READY', active: true, updatedAt: clock,
  })
  await database.db.insert(institutionalEffectivePeriodStates).values({
    managerId: guru.managerId, periodEnd: input.periodEnd, status: 'READY', reason: null,
    sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  }).onConflictDoUpdate({ target: [institutionalEffectivePeriodStates.managerId, institutionalEffectivePeriodStates.periodEnd], set: {
    status: 'READY', reason: null, sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  } })
  await database.db.insert(institutionalSnapshotChangeEvents).values({
    managerId: guru.managerId, periodEnd: input.periodEnd, snapshotId: snapshot!.id, createdAt: clock,
  })
}

async function drain(run: () => Promise<unknown>) {
  for (let count = 0; count < 20; count += 1) if (!await run()) return
  throw new Error('QUEUE_DID_NOT_DRAIN')
}

async function preparedQuarters() {
  await publish({ periodEnd: '2026-03-31', quantity: '100', reportedValue: '1000' })
  await publish({ periodEnd: '2026-06-30', quantity: '150', reportedValue: '1500' })
  await drain(() => runPendingGuruPortfolioAnalyticsOnce(database.db, clock))
  await drain(() => runPendingGuruConsensusRebuildOnce(database.db, new Date(clock.getTime() + 1_000)))
}

function worker(transport: AiTransport) {
  return runGuruAnalysisOnce({ db: database.db, now: () => clock, transport, workerId: 'synthetic-guru-analysis-worker' })
}

function publicApp() {
  const app = new Hono<AppEnv>()
  registerGuruAnalysisRoutes(app, { db: database.db, now: () => clock, fail, validationError, parseJson: async () => { throw new Error('unused') } })
  return app
}

async function readPublic(period?: string) {
  const query = period ? `?period=${period}` : ''
  const response_ = await publicApp().request(`/api/gurus/${guru.slug}/analysis${query}`)
  expect(response_.status).toBe(200)
  return guruAnalysisResponseSchema.parse(await response_.json()).data
}

async function globalBudget() {
  return (await database.pool.query("select reserved,consumed,released,unknown,estimated_cost_cents from ai_usage_bucket where scope='global'")).rows
}

it('generates one auditable analysis per prepared quarter, reuses an unchanged input, and keeps facts apart from interpretation', async () => {
  await preparedQuarters()
  const queued = await requestGuruAnalysis(database.db, { guru, periodEnd: '2026-06-30', mode: 'generate', actorUserId: actorId, now: clock })
  expect(queued).toMatchObject({ reused: false, run: { status: 'queued', reason: 'INITIAL', promptSource: 'system-default', sourceState: 'current' } })
  expect(queued.run.context).toMatchObject({ contextVersion: 'guru-analysis-context-v1' })
  expect(JSON.stringify(queued.run.context)).not.toContain('<fixture>')

  const pending = await readPublic()
  expect(pending).toMatchObject({ state: 'QUEUED', analysis: null })
  expect(pending.facts.length).toBeGreaterThan(0)

  const transport = vi.fn(async () => response())
  expect(await worker(transport)).toMatchObject({ status: 'succeeded' })
  expect(transport).toHaveBeenCalledTimes(1)

  const ready = await readPublic()
  expect(ready).toMatchObject({
    state: 'READY', periodEnd: '2026-06-30',
    provenance: { status: 'succeeded', promptKey: 'guru.analysis', schemaVersion: 'guru-analysis-v1', inputTokens: 420, outputTokens: 90, model: 'fixture-model', provider: 'Synthetic' },
  })
  expect(ready.analysis?.executiveSummary[0]).toMatchObject({ kind: 'fact', factRefs: ['portfolio.reportedValueUsd'] })
  expect(ready.caveats.map(caveat => caveat.id)).toEqual([...guruAnalysisCaveatKeys])
  expect(ready.facts.some(fact => fact.id === 'portfolio.reportedValueUsd')).toBe(true)
  expect(ready.source).toMatchObject({ periodEnd: '2026-06-30' })

  const reused = await requestGuruAnalysis(database.db, { guru, periodEnd: '2026-06-30', mode: 'generate', actorUserId: actorId, now: clock })
  expect(reused).toMatchObject({ reused: true, run: { id: queued.run.id } })
  expect(await worker(transport)).toEqual({ status: 'idle' })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await globalBudget()).toMatchObject([{ reserved: 0, consumed: 1, unknown: 0 }])

  await expect(requestGuruAnalysis(database.db, { guru, periodEnd: '2026-06-30', mode: 'regenerate', actorUserId: actorId, now: clock }))
    .rejects.toMatchObject({ code: 'AI_REPORT_ALREADY_RUNNING' })
  const later = new Date(clock.getTime() + 120_000)
  const regenerated = await requestGuruAnalysis(database.db, { guru, periodEnd: '2026-06-30', mode: 'regenerate', actorUserId: actorId, now: later })
  expect(regenerated).toMatchObject({ reused: false, run: { reason: 'REGENERATION', status: 'queued' } })
  expect(await worker(transport)).toMatchObject({ status: 'succeeded' })
  expect(transport).toHaveBeenCalledTimes(2)
  expect((await database.db.select().from(guruAnalysisRuns).orderBy(asc(guruAnalysisRuns.id))).map(run => run.status)).toEqual(['succeeded', 'succeeded'])
})

it('refuses an unprepared quarter, fails malformed output terminally, and never retries a dispatched call', async () => {
  await publish({ periodEnd: '2026-03-31', quantity: '100', reportedValue: '1000' })
  await expect(requestGuruAnalysis(database.db, { guru, periodEnd: '2026-03-31', mode: 'generate', actorUserId: actorId, now: clock }))
    .rejects.toMatchObject({ code: 'GURU_ANALYSIS_BLOCKED' })
  expect(await readPublic('2026-03-31')).toMatchObject({ state: 'BLOCKED_BY_COVERAGE', analysis: null })

  await drain(() => runPendingGuruPortfolioAnalyticsOnce(database.db, clock))
  await requestGuruAnalysis(database.db, { guru, periodEnd: '2026-03-31', mode: 'generate', actorUserId: actorId, now: clock })
  const malformed = vi.fn(async () => response({ executiveSummary: [statement({ factRefs: ['invented.metric'] })] }))
  expect(await worker(malformed)).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID' })
  expect(await worker(malformed)).toEqual({ status: 'idle' })
  expect(malformed).toHaveBeenCalledTimes(1)
  const [failed] = await database.db.select().from(guruAnalysisRuns)
  expect(failed).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID', result: null })
  expect(failed!.dispatchedAt).not.toBeNull()
  expect(await globalBudget()).toMatchObject([{ reserved: 0, consumed: 1, unknown: 1 }])
  expect(await readPublic('2026-03-31')).toMatchObject({ state: 'FAILED', analysis: null })
})

it('invalidates a published analysis when the prepared quarter is rebuilt and keeps it readable as an audit record', async () => {
  await preparedQuarters()
  await requestGuruAnalysis(database.db, { guru, periodEnd: '2026-06-30', mode: 'generate', actorUserId: actorId, now: clock })
  expect(await worker(vi.fn(async () => response()))).toMatchObject({ status: 'succeeded' })
  await drain(() => runPendingGuruAnalysisInvalidationOnce(database.db, clock))
  expect(await readPublic()).toMatchObject({ state: 'READY' })

  await publish({ periodEnd: '2026-06-30', quantity: '400', reportedValue: '4000' })
  await drain(() => runPendingGuruPortfolioAnalyticsOnce(database.db, clock))
  const outcome = await runPendingGuruAnalysisInvalidationOnce(database.db, clock)
  expect(outcome).toMatchObject({ status: 'PROCESSED', invalidated: 1 })
  const stale = await readPublic()
  expect(stale).toMatchObject({ state: 'STALE' })
  expect(stale.analysis).not.toBeNull()
  expect(stale.provenance).toMatchObject({ sourceState: 'invalidated' })
  const [run] = await database.db.select().from(guruAnalysisRuns)
  expect(run).toMatchObject({ sourceState: 'invalidated', invalidationReason: 'GURU_ANALYTICS_REBUILT' })

  // Invalidation never regenerates; the next generation is an explicit request.
  const next = await requestGuruAnalysis(database.db, { guru, periodEnd: '2026-06-30', mode: 'generate', actorUserId: actorId, now: new Date(clock.getTime() + 120_000) })
  expect(next).toMatchObject({ reused: false, run: { status: 'queued', reason: 'INITIAL' } })
})
