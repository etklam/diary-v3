import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiReportService } from '../../apps/api/src/ai-reports/report-service'
import { claimNextAiReport, admitAiReportDispatch } from '../../apps/api/src/ai-reports/job-store'
import { purgeExpiredAiReportBodies, runAiReportOnce } from '../../apps/api/src/ai-reports/worker'
import { encryptAiSecret } from '../../apps/api/src/ai-reports/secrets'
import { updateGenerationEnabled } from '../../apps/api/src/ai-reports/settings'
import { AiProviderError, type AiTransport } from '../../apps/api/src/ai-reports/outbound-policy'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let service: AiReportService
let owner: bigint
let diary: bigint
let clock: Date
const period = { periodType: 'weekly' as const, periodStart: '2026-09-14' }
const analysis = { summary: [], decisionReview: [], positionReview: [], marketReflection: [], disciplineChecks: [], nextPeriodFocus: [], limitations: ['Synthetic report'] }
const response = (content: unknown = analysis) => ({ status: 200, retryAfter: null, body: JSON.stringify({ id: 'synthetic-request', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }) })
beforeAll(() => {
  vi.stubEnv('AI_ENCRYPTION_ACTIVE_KEY', 'jobs-fixture')
  vi.stubEnv('AI_ENCRYPTION_KEYS', JSON.stringify({ 'jobs-fixture': Buffer.alloc(32, 9).toString('base64') }))
})
afterAll(() => vi.unstubAllEnvs())
beforeEach(async () => {
  database = await provisionTestDatabase('ai_jobs')
  clock = new Date('2026-09-21T12:00:00Z')
  const user = await database.pool.query("insert into users(email,password,timezone,locale) values ('jobs@example.test','synthetic','UTC','en') returning id")
  owner = BigInt(user.rows[0].id)
  const source = await database.pool.query("insert into diaries(user_id,title,content,date) values ($1,'Synthetic decision','Recorded a planned decision.','2026-09-15') returning id", [owner])
  diary = BigInt(source.rows[0].id)
  await database.pool.query('update ai_user_access set enabled=true,monthly_quota=10 where user_id=$1', [owner])
  await database.pool.query("insert into ai_user_consent(user_id,recipient_revision,disclosure_version,accepted_at) values ($1,1,'v1',$2)", [owner, clock])
  const provider = await database.pool.query("insert into ai_provider_config_version(revision,status,display_name,base_url,model,encrypted_api_key,reservation_cost_cents,monthly_budget_cents,max_input_tokens,pricing_version,input_price_per_million_cents,output_price_per_million_cents) values (1,'published','Synthetic','https://api.deepseek.com','fixture-model',$1,10,1000,64000,'fixture-price',100,200) returning id", [encryptAiSecret('synthetic-key', 'provider-api-key')])
  const prompt = await database.pool.query("insert into ai_prompt_version(report_type,revision,template,status,published_at) values ('weekly',1,'Review only the saved synthetic context.','published',$1) returning id", [clock])
  await database.pool.query('update ai_runtime_state set generation_enabled=true,active_provider_config_id=$1,active_weekly_prompt_id=$2,worker_heartbeat_at=$3', [provider.rows[0].id, prompt.rows[0].id, clock])
  service = new AiReportService({ db: database.db, now: () => clock })
})
afterEach(async () => { await database?.dispose() })

async function request() {
  const preview = await service.preview(owner, period)
  return { ...period, confirmedRecipientRevision: 1, previewFingerprint: preview.previewFingerprint }
}
async function queue(key = randomUUID()) { return service.generate(owner, key, await request()) }
async function bucket(scope = 'user') {
  return (await database.pool.query('select reserved,consumed,released,unknown,estimated_cost_cents from ai_usage_bucket where scope=$1 order by bucket_month', [scope])).rows
}
function worker(transport: AiTransport) { return runAiReportOnce({ db: database.db, service, now: () => clock, transport, workerId: 'synthetic-worker' }) }
async function anotherOwner() {
  const inserted = await database.pool.query("insert into users(email,password,timezone,locale) values ($1,'synthetic','UTC','en') returning id", [`${randomUUID()}@example.test`])
  const id = BigInt(inserted.rows[0].id)
  await database.pool.query("insert into diaries(user_id,title,content,date) values ($1,'Other synthetic','Saved record','2026-09-15')", [id])
  await database.pool.query('update ai_user_access set enabled=true where user_id=$1', [id])
  await database.pool.query("insert into ai_user_consent(user_id,recipient_revision,disclosure_version,accepted_at) values ($1,1,'v1',$2)", [id, clock])
  const preview = await service.preview(id, period)
  const queued = await service.generate(id, randomUUID(), { ...period, confirmedRecipientRevision: 1, previewFingerprint: preview.previewFingerprint })
  return { id, reportId: BigInt(queued.data.id) }
}

describe('AI durable jobs with disposable PostgreSQL', () => {
  it('dispatches once, reuses success without charging, and keeps same-key replay stable after source edits', async () => {
    const key = randomUUID()
    const input = await request()
    const queued = await service.generate(owner, key, input)
    const transport = vi.fn(async () => response())
    expect(await worker(transport)).toMatchObject({ status: 'succeeded' })
    expect((await service.detail(owner, BigInt(queued.data.id))).analysis).toEqual(analysis)
    const reused = await service.generate(owner, randomUUID(), input)
    expect(reused).toMatchObject({ reused: true, data: { id: queued.data.id } })
    await database.pool.query("update diaries set content='Edited synthetic source' where id=$1", [diary])
    expect(await service.generate(owner, key, input)).toMatchObject({ reused: true, data: { id: queued.data.id, sourceState: 'changed' } })
    await expect(service.generate(owner, key, { ...input, locale: 'zh-TW' })).rejects.toMatchObject({ code: 'AI_IDEMPOTENCY_CONFLICT' })
    expect(await worker(transport)).toEqual({ status: 'idle' })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(await bucket()).toMatchObject([{ consumed: 1, reserved: 0 }])
    await database.pool.query('update ai_user_access set enabled=false where user_id=$1', [owner])
    await expect(service.generate(owner, key, input)).rejects.toMatchObject({ code: 'AI_ACCESS_DENIED' })
  })

  it('deduplicates concurrent same-key submissions and rejects another active job', async () => {
    const input = await request()
    const key = randomUUID()
    const results = await Promise.all(Array.from({ length: 10 }, () => service.generate(owner, key, input)))
    expect(new Set(results.map(result => result.data.id)).size).toBe(1)
    expect(results.filter(result => !result.reused)).toHaveLength(1)
    await expect(service.generate(owner, randomUUID(), input)).rejects.toMatchObject({ code: 'AI_REPORT_ALREADY_RUNNING' })
    expect(await bucket()).toMatchObject([{ reserved: 1, consumed: 0 }])
  })

  it('rejects stale previews and a zero global budget without reserving quota', async () => {
    const input = await request()
    await database.pool.query("update diaries set content='Changed before confirmation' where id=$1", [diary])
    await expect(service.generate(owner, randomUUID(), input)).rejects.toMatchObject({ code: 'AI_PREVIEW_CHANGED' })
    await database.pool.query('update ai_provider_config_version set monthly_budget_cents=0')
    await expect(queue()).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED' })
    expect((await bucket()).every(row => row.reserved === 0 && row.consumed === 0)).toBe(true)
  })

  it('allows cancellation after revoke without returning report content and releases an undispatched reservation once', async () => {
    const queued = await queue()
    await database.pool.query('update ai_user_access set enabled=false where user_id=$1', [owner])
    expect(await service.cancel(owner, BigInt(queued.data.id))).toEqual({ id: queued.data.id, status: 'cancelled' })
    expect(await bucket()).toMatchObject([{ reserved: 0, consumed: 0, released: 1 }])
    expect(await bucket('global')).toMatchObject([{ reserved: 0, consumed: 0, released: 1 }])
    const transport = vi.fn(async () => response())
    expect(await worker(transport)).toEqual({ status: 'idle' })
    expect(transport).not.toHaveBeenCalled()
    await service.delete(owner, BigInt(queued.data.id))
    expect(await bucket()).toMatchObject([{ released: 1 }])
  })

  it.each(['cancel', 'withdraw', 'disable', 'source-delete', 'report-delete', 'account-delete'] as const)('fences late provider success after %s and never retries the paid request', async action => {
    const queued = await queue()
    let mutationError: unknown
    const transport = vi.fn(async () => {
      try {
      if (action === 'cancel') await service.cancel(owner, BigInt(queued.data.id))
      if (action === 'withdraw') await service.revokeConsent(owner)
      if (action === 'disable') await updateGenerationEnabled(database.db, { enabled: false, actorUserId: owner, now: clock })
      if (action === 'source-delete') await database.pool.query('delete from diaries where id=$1', [diary])
      if (action === 'report-delete') await service.delete(owner, BigInt(queued.data.id))
      if (action === 'account-delete') await database.pool.query('delete from users where id=$1', [owner])
      } catch (error) { mutationError = error; throw error }
      return response()
    })
    expect(await worker(transport)).toMatchObject({ status: 'failed' })
    expect(await worker(transport)).toEqual({ status: 'idle' })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(mutationError).toBeUndefined()
    const rows = (await database.pool.query('select status,analysis_json,input_snapshot_encrypted from ai_report where id=$1', [queued.data.id])).rows
    if (action === 'account-delete') expect(rows.length).toBe(0)
    else {
      expect(rows[0].status).toBe('cancelled')
      expect(rows[0].analysis_json).toBeNull()
      if (action.endsWith('delete')) expect(rows[0].input_snapshot_encrypted).toBeNull()
      expect(await bucket()).toMatchObject([{ consumed: 1, reserved: 0 }])
    }
    expect(await bucket('global')).toMatchObject([{ consumed: 1, estimated_cost_cents: 10 }])
    expect(await bucket('global')).toMatchObject([{ unknown: 1 }])
  })

  it('charges invalid output exactly once and stores no raw provider body', async () => {
    const queued = await queue()
    const transport = vi.fn(async () => response({ privateRawPayload: 'INVALID_SYNTHETIC_CONTENT' }))
    expect(await worker(transport)).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID' })
    expect(await worker(transport)).toEqual({ status: 'idle' })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(await bucket()).toMatchObject([{ consumed: 1, reserved: 0 }])
    const row = (await database.pool.query('select * from ai_report where id=$1', [queued.data.id])).rows[0]
    expect(JSON.stringify(row)).not.toContain('INVALID_SYNTHETIC_CONTENT')
    expect(row.analysis_json).toBeNull()
    expect(await bucket('global')).toMatchObject([{ unknown: 1 }])
  })

  it('records missing usage as unknown after a dispatched timeout', async () => {
    await queue()
    expect(await worker(async () => { throw new AiProviderError('AI_PROVIDER_TIMEOUT') })).toMatchObject({ status: 'failed', errorCode: 'AI_PROVIDER_TIMEOUT' })
    expect(await bucket('global')).toMatchObject([{ consumed: 1, unknown: 1, estimated_cost_cents: 10 }])
    expect(await bucket()).toMatchObject([{ consumed: 1, unknown: 1 }])
  })

  it('fences a late response after the durable call deadline without settling twice', async () => {
    const queued = await queue()
    const result = await worker(async () => {
      clock = new Date(clock.getTime() + 126_000)
      await claimNextAiReport(database.db, 'deadline-sweeper', clock)
      return response()
    })
    expect(result).toMatchObject({ status: 'failed' })
    const row = (await database.pool.query('select status,analysis_json from ai_report where id=$1', [queued.data.id])).rows[0]
    expect(row.status).toBe('failed')
    expect(row.analysis_json).toBeNull()
    expect(await bucket('global')).toMatchObject([{ consumed: 1, unknown: 1, estimated_cost_cents: 10 }])
    expect(await bucket()).toMatchObject([{ consumed: 1, unknown: 1 }])
  })

  it.each(['source', 'account'] as const)('releases queued reservations when deleting the %s', async target => {
    await queue()
    if (target === 'source') await database.pool.query('delete from diaries where id=$1', [diary])
    else await database.pool.query('delete from users where id=$1', [owner])
    expect(await bucket('global')).toMatchObject([{ reserved: 0, consumed: 0, released: 1 }])
    const transport = vi.fn(async () => response())
    expect(await worker(transport)).toEqual({ status: 'idle' })
    expect(transport).not.toHaveBeenCalled()
  })

  it('purges derived successful content and source references when the source is deleted', async () => {
    const queued = await queue()
    expect(await worker(async () => response())).toMatchObject({ status: 'succeeded' })
    await database.pool.query('delete from diaries where id=$1', [diary])
    const row = (await database.pool.query('select source_state,analysis_json,metrics_json,input_snapshot_encrypted from ai_report where id=$1', [queued.data.id])).rows[0]
    expect(row).toEqual({ source_state: 'invalidated', analysis_json: null, metrics_json: '[]', input_snapshot_encrypted: null })
    expect((await database.pool.query('select count(*)::int as count from ai_report_source where report_id=$1', [queued.data.id])).rows[0].count).toBe(0)
    await expect(service.detail(owner, BigInt(queued.data.id))).rejects.toMatchObject({ code: 'SYS_NOT_FOUND' })
  })

  it.each(['grant', 'provider', 'consent'] as const)('does not dispatch when %s changes after submission', async change => {
    await queue()
    if (change === 'grant') await database.pool.query('update ai_user_access set enabled=false where user_id=$1', [owner])
    if (change === 'provider') await database.pool.query('update ai_runtime_state set active_provider_config_id=null')
    if (change === 'consent') await service.revokeConsent(owner)
    const transport = vi.fn(async () => response())
    await worker(transport)
    expect(transport).not.toHaveBeenCalled()
    expect(await bucket()).toMatchObject([{ reserved: 0, consumed: 0, released: 1 }])
    expect(await bucket('global')).toMatchObject([{ reserved: 0, consumed: 0, released: 1 }])
  })

  it.each([0, 1])('enforces shared global capacity with %i manual attempts and owner-scopes report reads', async manual => {
    const first = await queue()
    const others: bigint[] = []
    for (let index = 0; index < 2; index++) {
      const inserted = await database.pool.query("insert into users(email,password,timezone,locale) values ($1,'synthetic','UTC','en') returning id", [`owner-${index}@example.test`])
      const id = BigInt(inserted.rows[0].id)
      others.push(id)
      await database.pool.query("insert into diaries(user_id,title,content,date) values ($1,'Other synthetic','Saved record','2026-09-15')", [id])
      await database.pool.query('update ai_user_access set enabled=true where user_id=$1', [id])
      await database.pool.query("insert into ai_user_consent(user_id,recipient_revision,disclosure_version,accepted_at) values ($1,1,'v1',$2)", [id, clock])
      const preview = await service.preview(id, period)
      await service.generate(id, randomUUID(), { ...period, confirmedRecipientRevision: 1, previewFingerprint: preview.previewFingerprint })
    }
    await expect(service.detail(others[0]!, BigInt(first.data.id))).rejects.toMatchObject({ code: 'SYS_NOT_FOUND' })
    if (manual) await database.pool.query("insert into ai_report_attempt(user_id,status,dispatched_at,slot_expires_at,reservation_bucket_month) values ($1,'dispatched',$2,$3,'2026-09-01')", [owner, clock, new Date(clock.getTime() + 125_000)])
    const claims = await Promise.all(['a', 'b', 'c'].map(id => claimNextAiReport(database.db, id, clock)))
    const admissions = await Promise.all(claims.filter(row => row !== null).map(row => admitAiReportDispatch(database.db, { reportId: row.id, leaseToken: row.leaseToken!, now: clock, reservation: { userId: row.userId, bucketMonth: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents } })))
    expect(admissions.filter(value => value === true)).toHaveLength(2 - manual)
    expect((await database.pool.query('select count(*)::int as count from ai_report_attempt where slot_released_at is null')).rows[0].count).toBe(2)
  })

  it('creates an explicitly confirmed revision after cooldown and preserves the previous report', async () => {
    const first = await queue()
    await worker(async () => response())
    await expect(service.generate(owner, randomUUID(), { ...await request(), regenerateFromReportId: first.data.id })).rejects.toMatchObject({ code: 'AI_REPORT_ALREADY_RUNNING' })
    clock = new Date(clock.getTime() + 61_000)
    await database.pool.query('update ai_runtime_state set worker_heartbeat_at=$1', [clock])
    const revision = await service.generate(owner, randomUUID(), { ...await request(), regenerateFromReportId: first.data.id })
    expect(revision.data).toMatchObject({ revision: 2, status: 'queued' })
    expect(revision.data.id).not.toBe(first.data.id)
    await worker(async () => response())
    expect((await service.detail(owner, BigInt(first.data.id))).status).toBe('succeeded')
    expect((await service.detail(owner, BigInt(revision.data.id))).regeneratedFromReportId).toBe(first.data.id)
    expect(await bucket()).toMatchObject([{ consumed: 2 }])
  })

  it.each([
    { periodType: 'weekly' as const, periodStart: '2026-09-21' },
    { periodType: 'monthly' as const, periodStart: '2026-09-01' },
  ])('rejects regeneration for a different canonical period (%s)', async mismatchedPeriod => {
    const first = await queue()
    await worker(async () => response())
    clock = new Date(clock.getTime() + 61_000)
    await database.pool.query('update ai_runtime_state set worker_heartbeat_at=$1', [clock])
    if (mismatchedPeriod.periodType === 'monthly') {
      await database.pool.query("insert into ai_prompt_version(report_type,revision,template,status,published_at) values ('monthly',1,'Review only the saved synthetic context.','published',$1)", [clock])
    }
    const originalInput = await request()
    await expect(service.generate(owner, randomUUID(), {
      ...mismatchedPeriod,
      confirmedRecipientRevision: 1,
      previewFingerprint: originalInput.previewFingerprint,
      regenerateFromReportId: first.data.id,
    })).rejects.toMatchObject({ code: 'AI_CONFIG_CHANGED', statusCode: 409 })
    expect((await database.pool.query('select count(*)::int as count from ai_report')).rows[0].count).toBe(1)
    expect(await bucket()).toMatchObject([{ consumed: 1, reserved: 0 }])
  })

  it('retains call capacity after cancellation until the actual transports finish', async () => {
    const first = await queue()
    const second = await anotherOwner()
    await anotherOwner()
    let release!: () => void
    const hold = new Promise<void>(resolve => { release = resolve })
    let calls = 0
    const blockedTransport = vi.fn(async () => {
      calls++
      await hold
      return response()
    })
    const running = Promise.all([worker(blockedTransport), worker(blockedTransport)])
    try {
      await expect.poll(() => calls).toBe(2)
      await service.cancel(owner, BigInt(first.data.id))
      await service.cancel(second.id, second.reportId)
      // Advance beyond a heuristic abort grace while the transports remain
      // pending. A durable slot must describe the actual call lifetime.
      clock = new Date(clock.getTime() + 20_000)
      const thirdTransport = vi.fn(async () => response())
      expect(await worker(thirdTransport)).toEqual({ status: 'idle' })
      expect(thirdTransport).not.toHaveBeenCalled()
    } finally {
      release()
      await running
    }
    expect(await worker(async () => response())).toMatchObject({ status: 'succeeded' })
  })

  it('reclaims only an undispatched expired lease and fences an admitted expired attempt without redispatch', async () => {
    const queued = await queue()
    const first = await claimNextAiReport(database.db, 'first', clock, 1000)
    expect(first?.id.toString()).toBe(queued.data.id)
    clock = new Date(clock.getTime() + 2000)
    const second = await claimNextAiReport(database.db, 'second', clock, 1000)
    expect(second?.leaseToken).not.toBe(first?.leaseToken)
    expect(await admitAiReportDispatch(database.db, { reportId: first!.id, leaseToken: first!.leaseToken!, now: clock, reservation: { userId: owner, bucketMonth: '2026-09-01', reservationCostCents: 10 } })).toBe(false)
    expect(await admitAiReportDispatch(database.db, { reportId: second!.id, leaseToken: second!.leaseToken!, now: clock, reservation: { userId: owner, bucketMonth: '2026-09-01', reservationCostCents: 10 } })).toBe(true)
    clock = new Date(clock.getTime() + 2000)
    expect(await claimNextAiReport(database.db, 'third', clock)).toBeNull()
    const row = (await database.pool.query('select status,error_code from ai_report where id=$1', [queued.data.id])).rows[0]
    expect(row).toEqual({ status: 'failed', error_code: 'AI_PROVIDER_OUTCOME_UNKNOWN' })
    expect(await bucket()).toMatchObject([{ consumed: 1, unknown: 1 }])
  })

  it('settles in the admission month and expires only the encrypted snapshot after seven days', async () => {
    clock = new Date('2026-09-30T23:59:59Z')
    await database.pool.query('update ai_runtime_state set worker_heartbeat_at=$1', [clock])
    const queued = await queue()
    expect(await worker(async () => { clock = new Date('2026-10-01T00:00:01Z'); return response() })).toMatchObject({ status: 'succeeded' })
    const months = (await database.pool.query("select bucket_month::text from ai_usage_bucket where scope='global'")).rows
    expect(months).toEqual([{ bucket_month: '2026-09-01' }])
    clock = new Date('2026-10-09T00:00:01Z')
    await database.pool.query('update ai_runtime_state set generation_enabled=false')
    await purgeExpiredAiReportBodies(database.db, clock)
    const row = (await database.pool.query('select input_snapshot_encrypted,analysis_json from ai_report where id=$1', [queued.data.id])).rows[0]
    expect(row.input_snapshot_encrypted).toBeNull()
    expect(JSON.parse(row.analysis_json)).toEqual(analysis)
    expect((await service.detail(owner, BigInt(queued.data.id))).analysis).toEqual(analysis)
    await service.delete(owner, BigInt(queued.data.id))
    clock = new Date(clock.getTime() + 25 * 3600_000)
    await purgeExpiredAiReportBodies(database.db, clock)
    expect((await database.pool.query('select count(*)::int as count from ai_report_request')).rows[0].count).toBe(0)
  })
})
