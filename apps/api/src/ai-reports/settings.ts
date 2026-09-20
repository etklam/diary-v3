import { and, asc, desc, eq, isNull, max, or, sql } from 'drizzle-orm'
import {
  aiAdminAuditEvents,
  aiPromptVersions,
  aiProviderConfigVersions,
  aiReportAttempts,
  aiReports,
  aiRuntimeState,
  type Database,
} from '@diary/db'
import type { AiProviderDraft } from '@diary/contracts/admin-ai'
import { defaultAiPrompts, validateAiTemplate } from './prompt-renderer.js'
import { encryptAiSecret } from './secrets.js'
import { validateBaseUrl } from './outbound-policy.js'
import { lockAiGlobal, lockAiOwner } from './job-store.js'
import { recordUserQuotaUsage, releaseUserQuota } from './quota.js'
import { releaseGlobalAiBudget, settleGlobalAiBudget } from './budget.js'

type ProviderRow = typeof aiProviderConfigVersions.$inferSelect
type PromptRow = typeof aiPromptVersions.$inferSelect

const REPORT_TYPES = ['weekly', 'monthly'] as const
type ReportType = (typeof REPORT_TYPES)[number]

function instant(value: Date | null): string | null {
  return value?.toISOString() ?? null
}

function recipientIdentity(input: Pick<ProviderRow, 'providerType' | 'protocol' | 'baseUrl' | 'recipientName' | 'disclosureVersion' | 'disclosureText'>): string {
  return [input.providerType, input.protocol, input.baseUrl.replace(/\/+$/, ''), input.recipientName, input.disclosureVersion, input.disclosureText].join('\u0000')
}

function bucketMonth(value: Date): string {
  return `${value.toISOString().slice(0, 7)}-01`
}

function providerHasPassedTest(row: Pick<ProviderRow, 'lastTestStatus' | 'lastTestedAt' | 'createdAt'>): boolean {
  return row.lastTestStatus === 'passed' && row.lastTestedAt !== null && row.lastTestedAt.getTime() >= row.createdAt.getTime()
}

async function assertPricingCurrencyCompatible(
  tx: Pick<Database, 'execute' | 'select'>,
  active: ProviderRow | null,
  nextCurrency: string,
  now: Date,
) {
  const month = bucketMonth(now)
  const attempts = await tx.select({ pricingCurrency: aiReportAttempts.pricingCurrency })
    .from(aiReportAttempts)
    .where(eq(aiReportAttempts.reservationBucketMonth, month))
  // A null historical currency is also unsafe to mix: it cannot prove that
  // the next charge belongs to the same monetary bucket.
  if (attempts.some(attempt => attempt.pricingCurrency === null || attempt.pricingCurrency !== nextCurrency)) {
    throw new Error('AI_PRICING_CURRENCY_CONFLICT')
  }
  const result = await tx.execute(sql`
    select coalesce(reserved_cost_cents, 0)::bigint as reserved_cost_cents,
           coalesce(estimated_cost_cents, 0)::bigint as estimated_cost_cents,
           coalesce(reserved, 0)::bigint as reserved,
           consumed::bigint as consumed
    from ai_usage_bucket
    where scope = 'global' and user_id is null and bucket_month = ${month}::date
    limit 1
  `)
  const row = result.rows[0] as { reserved_cost_cents?: string | number; estimated_cost_cents?: string | number; reserved?: string | number; consumed?: string | number } | undefined
  const bucketHasUsage = Number(row?.reserved_cost_cents ?? 0) > 0
    || Number(row?.estimated_cost_cents ?? 0) > 0
    || Number(row?.reserved ?? 0) > 0
    || Number(row?.consumed ?? 0) > 0
  if (bucketHasUsage && (attempts.length === 0 || (active !== null && active.pricingCurrency !== nextCurrency))) {
    throw new Error('AI_PRICING_CURRENCY_CONFLICT')
  }
}

function serializePrompt(row: PromptRow | null) {
  if (!row) return null
  return {
    id: row.id.toString(),
    reportType: row.reportType,
    revision: row.revision,
    template: row.template,
    status: row.status,
    isDefault: row.isDefault,
    createdBy: row.createdBy?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    publishedAt: instant(row.publishedAt),
  }
}

export function serializeProvider(row: ProviderRow | null) {
  if (!row) return null
  return {
    id: row.id.toString(),
    revision: row.revision,
    status: row.status,
    displayName: row.displayName,
    providerType: row.providerType,
    protocol: row.protocol,
    baseUrl: row.baseUrl,
    model: row.model,
    thinking: row.thinking,
    maxInputTokens: row.maxInputTokens,
    maxOutputTokens: row.maxOutputTokens,
    timeoutMs: row.timeoutMs,
    monthlyBudgetCents: row.monthlyBudgetCents,
    hasApiKey: Boolean(row.encryptedApiKey),
    recipientRevision: row.recipientRevision,
    recipientName: row.recipientName,
    disclosureVersion: row.disclosureVersion,
    disclosureText: row.disclosureText,
    pricingCurrency: row.pricingCurrency,
    pricingVersion: row.pricingVersion,
    inputPricePerMillionCents: row.inputPricePerMillionCents,
    outputPricePerMillionCents: row.outputPricePerMillionCents,
    reservationCostCents: row.reservationCostCents,
    lastTestedAt: instant(row.lastTestedAt),
    lastTestStatus: row.lastTestStatus === 'passed' || row.lastTestStatus === 'failed' ? row.lastTestStatus : null,
    createdAt: row.createdAt.toISOString(),
    publishedAt: instant(row.publishedAt),
  }
}

export async function ensureAiRuntime(db: Database, now: Date) {
  const [row] = await db.insert(aiRuntimeState).values({ singleton: 'default', updatedAt: now }).onConflictDoNothing().returning()
  if (row) return row
  const [existing] = await db.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
  return existing!
}

export async function ensureDefaultAiPrompts(db: Database, now: Date) {
  for (const reportType of REPORT_TYPES) {
    const [current] = await db.select({ id: aiPromptVersions.id })
      .from(aiPromptVersions)
      .where(and(eq(aiPromptVersions.reportType, reportType), eq(aiPromptVersions.isDefault, true)))
      .limit(1)
    if (current) continue
    await db.insert(aiPromptVersions).values({
      reportType,
      revision: 1,
      template: defaultAiPrompts[reportType],
      status: 'draft',
      isDefault: true,
      createdAt: now,
    }).onConflictDoNothing()
  }
}

async function activeProvider(tx: Pick<Database, 'select'>) {
  const [runtime] = await tx.select({ activeProviderConfigId: aiRuntimeState.activeProviderConfigId })
    .from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
  if (!runtime?.activeProviderConfigId) return null
  const [row] = await tx.select().from(aiProviderConfigVersions).where(eq(aiProviderConfigVersions.id, runtime.activeProviderConfigId)).limit(1)
  return row ?? null
}

async function latestProvider(tx: Pick<Database, 'select'>, status?: 'draft' | 'published') {
  const [row] = await tx.select().from(aiProviderConfigVersions)
    .where(status ? eq(aiProviderConfigVersions.status, status) : undefined)
    .orderBy(desc(aiProviderConfigVersions.revision)).limit(1)
  return row ?? null
}

async function activePrompt(tx: Pick<Database, 'select'>, reportType: ReportType) {
  const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
  const id = reportType === 'weekly' ? runtime?.activeWeeklyPromptId : runtime?.activeMonthlyPromptId
  if (!id) return null
  const [row] = await tx.select().from(aiPromptVersions).where(eq(aiPromptVersions.id, id)).limit(1)
  return row ?? null
}

async function latestPrompt(tx: Pick<Database, 'select'>, reportType: ReportType, status?: 'draft' | 'published') {
  const [row] = await tx.select().from(aiPromptVersions)
    .where(and(eq(aiPromptVersions.reportType, reportType), status ? eq(aiPromptVersions.status, status) : undefined))
    .orderBy(desc(aiPromptVersions.revision)).limit(1)
  return row ?? null
}

async function writeAudit(tx: Pick<Database, 'insert'>, input: {
  actorUserId: bigint
  action: string
  targetType: string
  targetId?: string | null
  summary: string
  createdAt: Date
}) {
  await tx.insert(aiAdminAuditEvents).values({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    summary: input.summary,
    createdAt: input.createdAt,
  })
}

/**
 * Cancel work pinned to a superseded immutable config.
 *
 * A dispatched provider call has already crossed the billing boundary. Fence
 * its report immediately, retain the cancelled attempt briefly as an
 * in-flight slot, and settle its conservative cost exactly once. The shared
 * live-call counter uses the attempt's cancellation timestamp while an abort
 * reaches the transport.
 */
async function cancelPendingFor(
  tx: Pick<Database, 'select' | 'update' | 'execute'>,
  predicate: ReturnType<typeof and>,
  now: Date,
) {
  const state = and(
    predicate,
    or(eq(aiReports.status, 'queued'), eq(aiReports.status, 'running')),
    isNull(aiReports.deletedAt),
  )
  const owners = await tx.select({ userId: aiReports.userId }).from(aiReports).where(state)
  for (const userId of [...new Set(owners.map(row => row.userId.toString()))].sort()) {
    await lockAiOwner(tx, BigInt(userId))
  }
  const rows = await tx.select({ id: aiReports.id, userId: aiReports.userId, createdAt: aiReports.createdAt, dispatchedAt: aiReports.dispatchedAt, reservationBucketMonth: aiReports.reservationBucketMonth, reservationCostCents: aiReports.reservationCostCents })
    .from(aiReports).where(state).orderBy(asc(aiReports.userId), asc(aiReports.id)).for('update')
  for (const row of rows) {
    await tx.update(aiReports).set({
      status: 'cancelled',
      errorCode: 'AI_CONFIG_CHANGED',
      finishedAt: now,
      leaseToken: null,
      workerId: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
    }).where(and(eq(aiReports.id, row.id), or(eq(aiReports.status, 'queued'), eq(aiReports.status, 'running'))))
    if (!row.dispatchedAt) {
      await releaseUserQuota(tx, { userId: row.userId, bucketMonth: bucketMonth(row.createdAt), reservationCostCents: 0 })
      if (row.reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents })
    } else {
      const [attempt] = await tx.update(aiReportAttempts).set({
        status: 'cancelled',
        errorCode: 'AI_CONFIG_CHANGED',
        finishedAt: now,
      }).where(and(eq(aiReportAttempts.reportId, row.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
      if (attempt) {
        if (row.reservationCostCents > 0) {
          await settleGlobalAiBudget(tx, {
            month: row.reservationBucketMonth,
            reservationCostCents: row.reservationCostCents,
            actualCostCents: null,
            inputTokens: null,
            outputTokens: null,
          })
        }
        await recordUserQuotaUsage(tx, {
          userId: row.userId,
          bucketMonth: bucketMonth(row.createdAt),
          reservationCostCents: 0,
        }, { unknown: true })
      }
    }
  }
  return rows.length
}

export async function readAiSettings(db: Database, now: Date) {
  await ensureAiRuntime(db, now)
  await ensureDefaultAiPrompts(db, now)
  const [runtime] = await db.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
  // Every version is immutable, so old unpublished drafts remain in the
  // table after a newer version is published. Read the highest revision across
  // statuses; selecting draft rows alone would return a stale OCC revision.
  const provider = await latestProvider(db) ?? await activeProvider(db)
  const weekly = await latestPrompt(db, 'weekly') ?? await activePrompt(db, 'weekly')
  const monthly = await latestPrompt(db, 'monthly') ?? await activePrompt(db, 'monthly')
  const workerAvailable = Boolean(runtime?.workerHeartbeatAt && now.getTime() - runtime.workerHeartbeatAt.getTime() <= 60_000)
  return {
    runtime: {
      generationEnabled: Boolean(runtime?.generationEnabled),
      workerAvailable,
      workerHeartbeatAt: instant(runtime?.workerHeartbeatAt ?? null),
    },
    provider: serializeProvider(provider),
    prompts: { weekly: serializePrompt(weekly), monthly: serializePrompt(monthly) },
  }
}

export async function updateGenerationEnabled(db: Database, input: { enabled: boolean; actorUserId: bigint; now: Date }) {
  await ensureAiRuntime(db, input.now)
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).for('update')
    if (!runtime) throw new Error('AI_NOT_CONFIGURED')
    if (runtime.generationEnabled === input.enabled) return runtime
    if (!input.enabled) await cancelPendingFor(tx, isNull(aiReports.deletedAt), input.now)
    const [updated] = await tx.update(aiRuntimeState).set({ generationEnabled: input.enabled, updatedAt: input.now })
      .where(eq(aiRuntimeState.singleton, 'default')).returning()
    if (!updated) throw new Error('AI_NOT_CONFIGURED')
    await writeAudit(tx, {
      actorUserId: input.actorUserId,
      action: input.enabled ? 'runtime.generation.enabled' : 'runtime.generation.disabled',
      targetType: 'runtime',
      targetId: 'default',
      summary: input.enabled ? 'AI generation enabled' : 'AI generation disabled and pending work cancelled',
      createdAt: input.now,
    })
    return updated
  })
}

export async function saveProviderDraft(db: Database, input: AiProviderDraft & { actorUserId: bigint; now: Date }) {
  if (input.reservationCostCents <= 0) throw new Error('AI_PROVIDER_RESERVATION_REQUIRED')
  if (input.inputPricePerMillionCents !== null && input.outputPricePerMillionCents !== null) {
    const pricedBound = Math.ceil(input.maxInputTokens * input.inputPricePerMillionCents / 1_000_000)
      + Math.ceil(input.maxOutputTokens * input.outputPricePerMillionCents / 1_000_000)
    if (input.reservationCostCents < pricedBound) throw new Error('AI_PROVIDER_RESERVATION_TOO_LOW')
  }
  const normalizedUrl = validateBaseUrl(input.baseUrl).href.replace(/\/$/, '')
  return db.transaction(async tx => {
    // Keep the lock order global -> runtime -> owner for every config mutation.
    await lockAiGlobal(tx)
    const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).for('update')
    if (!runtime) throw new Error('AI_NOT_CONFIGURED')
    const [latestRevision] = await tx.select({ value: max(aiProviderConfigVersions.revision) }).from(aiProviderConfigVersions)
    if (Number(latestRevision?.value ?? 0) !== input.expectedRevision) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    const [current] = await tx.select().from(aiProviderConfigVersions).orderBy(desc(aiProviderConfigVersions.revision)).limit(1)
    const active = runtime.activeProviderConfigId
      ? (await tx.select().from(aiProviderConfigVersions).where(eq(aiProviderConfigVersions.id, runtime.activeProviderConfigId)).limit(1))[0]
      : null
    await assertPricingCurrencyCompatible(tx, active ?? null, input.pricingCurrency, input.now)
    const candidate = { ...input, baseUrl: normalizedUrl }
    const candidateIdentity = recipientIdentity({
      providerType: candidate.providerType,
      protocol: candidate.protocol,
      baseUrl: candidate.baseUrl,
      recipientName: candidate.recipientName,
      disclosureVersion: candidate.disclosureVersion,
      disclosureText: candidate.disclosureText,
    })
    const recipientChanged = !current || recipientIdentity(current) !== candidateIdentity
    const activeRecipientChanged = !active || recipientIdentity(active) !== candidateIdentity
    const recipientRevision = active
      ? active.recipientRevision + (activeRecipientChanged ? 1 : 0)
      : current
        ? current.recipientRevision + (recipientChanged ? 1 : 0)
        : 1
    // A keep request never carries a key across a changed recipient. The
    // resulting draft is deliberately unusable until an administrator replaces
    // the key for the new endpoint.
    const encryptedApiKey = input.apiKeyAction === 'replace'
      ? encryptAiSecret(input.apiKey!, 'provider-api-key')
      : input.apiKeyAction === 'keep' && !recipientChanged
        ? current?.encryptedApiKey ?? null
        : null
    const [created] = await tx.insert(aiProviderConfigVersions).values({
      revision: input.expectedRevision + 1,
      status: 'draft',
      displayName: input.displayName,
      providerType: input.providerType,
      protocol: input.protocol,
      baseUrl: normalizedUrl,
      model: input.model,
      thinking: input.thinking,
      maxInputTokens: input.maxInputTokens,
      maxOutputTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
      monthlyBudgetCents: input.monthlyBudgetCents,
      recipientName: input.recipientName,
      disclosureVersion: input.disclosureVersion,
      disclosureText: input.disclosureText,
      pricingCurrency: input.pricingCurrency,
      pricingVersion: input.pricingVersion,
      inputPricePerMillionCents: input.inputPricePerMillionCents,
      outputPricePerMillionCents: input.outputPricePerMillionCents,
      reservationCostCents: input.reservationCostCents,
      encryptedApiKey,
      // The envelope contains the self-describing key version. The legacy
      // integer column cannot represent versions such as "k2" truthfully.
      secretKeyVersion: null,
      recipientRevision,
      lastTestedAt: null,
      lastTestStatus: null,
      createdBy: input.actorUserId,
      createdAt: input.now,
    }).returning()
    if (!created) throw new Error('AI_NOT_CONFIGURED')
    await writeAudit(tx, { actorUserId: input.actorUserId, action: 'provider.draft', targetType: 'provider', targetId: created.id.toString(), summary: 'Provider draft updated', createdAt: input.now })
    return created
  })
}

export async function markProviderTest(db: Database, input: { revision: number; passed: boolean; actorUserId: bigint; now: Date }) {
  const [row] = await db.update(aiProviderConfigVersions).set({ lastTestedAt: input.now, lastTestStatus: input.passed ? 'passed' : 'failed' })
    .where(and(eq(aiProviderConfigVersions.revision, input.revision), eq(aiProviderConfigVersions.status, 'draft'))).returning()
  if (!row) throw new Error('AI_ADMIN_REVISION_CONFLICT')
  await writeAudit(db, { actorUserId: input.actorUserId, action: input.passed ? 'provider.test.passed' : 'provider.test.failed', targetType: 'provider', targetId: row.id.toString(), summary: input.passed ? 'Synthetic provider capability test passed' : 'Synthetic provider capability test failed', createdAt: input.now })
  return row
}

/** Record a prompt capability result only while that immutable draft is still publishable. */
export async function markPromptTest(db: Database, input: { reportType: ReportType; revision: number; passed: boolean; actorUserId: bigint; now: Date }) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [row] = await tx.select({ id: aiPromptVersions.id }).from(aiPromptVersions)
      .where(and(eq(aiPromptVersions.reportType, input.reportType), eq(aiPromptVersions.revision, input.revision), eq(aiPromptVersions.status, 'draft')))
      .for('update')
    if (!row) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    await writeAudit(tx, {
      actorUserId: input.actorUserId,
      action: input.passed ? 'prompt.test.passed' : 'prompt.test.failed',
      targetType: 'prompt',
      targetId: row.id.toString(),
      summary: input.passed ? 'Synthetic prompt capability test passed' : 'Synthetic prompt capability test failed',
      createdAt: input.now,
    })
    return row
  })
}

export async function publishProvider(db: Database, input: { expectedRevision: number; actorUserId: bigint; now: Date }) {
  await ensureAiRuntime(db, input.now)
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).for('update')
    const [draft] = await tx.select().from(aiProviderConfigVersions).where(and(eq(aiProviderConfigVersions.revision, input.expectedRevision), eq(aiProviderConfigVersions.status, 'draft'))).for('update')
    if (!runtime || !draft) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    const [latestRevision] = await tx.select({ value: max(aiProviderConfigVersions.revision) }).from(aiProviderConfigVersions)
    if (Number(latestRevision?.value ?? 0) !== input.expectedRevision) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    if (!providerHasPassedTest(draft)) throw new Error('AI_PROVIDER_TEST_REQUIRED')
    if (draft.monthlyBudgetCents < draft.reservationCostCents) throw new Error('AI_PROVIDER_BUDGET_TOO_LOW')
    const oldProviderId = runtime.activeProviderConfigId
    const oldProvider = oldProviderId
      ? (await tx.select().from(aiProviderConfigVersions).where(eq(aiProviderConfigVersions.id, oldProviderId)).limit(1))[0] ?? null
      : null
    await assertPricingCurrencyCompatible(tx, oldProvider, draft.pricingCurrency, input.now)
    const [row] = await tx.update(aiProviderConfigVersions).set({ status: 'published', publishedAt: input.now }).where(eq(aiProviderConfigVersions.id, draft.id)).returning()
    if (!row) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    await tx.update(aiRuntimeState).set({ activeProviderConfigId: row.id, updatedAt: input.now }).where(eq(aiRuntimeState.singleton, 'default'))
    if (oldProviderId && oldProviderId !== row.id) await cancelPendingFor(tx, eq(aiReports.providerConfigVersionId, oldProviderId), input.now)
    await writeAudit(tx, { actorUserId: input.actorUserId, action: 'provider.publish', targetType: 'provider', targetId: row.id.toString(), summary: 'Provider configuration published', createdAt: input.now })
    return row
  })
}

export async function updatePromptDraft(db: Database, input: { reportType: ReportType; template: string; actorUserId: bigint; expectedRevision: number; now: Date }) {
  validateAiTemplate(input.template)
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).for('update')
    if (!runtime) throw new Error('AI_NOT_CONFIGURED')
    const [latestRevision] = await tx.select({ value: max(aiPromptVersions.revision) }).from(aiPromptVersions).where(eq(aiPromptVersions.reportType, input.reportType))
    if (Number(latestRevision?.value ?? 0) !== input.expectedRevision) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    const [row] = await tx.insert(aiPromptVersions).values({
      reportType: input.reportType,
      revision: input.expectedRevision + 1,
      template: input.template,
      status: 'draft',
      isDefault: false,
      createdBy: input.actorUserId,
      createdAt: input.now,
    }).returning()
    if (!row) throw new Error('AI_NOT_CONFIGURED')
    await writeAudit(tx, { actorUserId: input.actorUserId, action: 'prompt.draft', targetType: 'prompt', targetId: row.id.toString(), summary: `Prompt ${input.reportType} draft updated`, createdAt: input.now })
    return row
  })
}

export async function publishPrompt(db: Database, input: { reportType: ReportType; revision: number; actorUserId: bigint; now: Date }) {
  await ensureAiRuntime(db, input.now)
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).for('update')
    const [draft] = await tx.select().from(aiPromptVersions).where(and(eq(aiPromptVersions.reportType, input.reportType), eq(aiPromptVersions.revision, input.revision), eq(aiPromptVersions.status, 'draft'))).for('update')
    if (!runtime || !draft) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    const [latestRevision] = await tx.select({ value: max(aiPromptVersions.revision) }).from(aiPromptVersions).where(eq(aiPromptVersions.reportType, input.reportType))
    if (Number(latestRevision?.value ?? 0) !== input.revision) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    const [test] = await tx.select({ id: aiAdminAuditEvents.id }).from(aiAdminAuditEvents)
      .where(and(eq(aiAdminAuditEvents.action, 'prompt.test.passed'), eq(aiAdminAuditEvents.targetId, draft.id.toString())))
      .orderBy(desc(aiAdminAuditEvents.id)).limit(1)
    if (!test) throw new Error('AI_PROMPT_TEST_REQUIRED')
    const oldPromptId = input.reportType === 'weekly' ? runtime.activeWeeklyPromptId : runtime.activeMonthlyPromptId
    const [row] = await tx.update(aiPromptVersions).set({ status: 'published', publishedAt: input.now }).where(eq(aiPromptVersions.id, draft.id)).returning()
    if (!row) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    await tx.update(aiRuntimeState).set({ ...(input.reportType === 'weekly' ? { activeWeeklyPromptId: row.id } : { activeMonthlyPromptId: row.id }), updatedAt: input.now }).where(eq(aiRuntimeState.singleton, 'default'))
    if (oldPromptId && oldPromptId !== row.id) await cancelPendingFor(tx, eq(aiReports.promptVersionId, oldPromptId), input.now)
    await writeAudit(tx, { actorUserId: input.actorUserId, action: 'prompt.publish', targetType: 'prompt', targetId: row.id.toString(), summary: `Prompt ${input.reportType} published`, createdAt: input.now })
    return row
  })
}

export async function restoreDefaultPrompt(db: Database, input: { reportType: ReportType; actorUserId: bigint; expectedRevision: number; now: Date }) {
  validateAiTemplate(defaultAiPrompts[input.reportType])
  return updatePromptDraft(db, { ...input, template: defaultAiPrompts[input.reportType] })
}

export async function listPromptVersions(db: Database, reportType?: ReportType) {
  const rows = await db.select().from(aiPromptVersions)
    .where(reportType ? eq(aiPromptVersions.reportType, reportType) : undefined)
    .orderBy(desc(aiPromptVersions.reportType), desc(aiPromptVersions.revision))
  return rows.map(serializePrompt)
}

export { providerHasPassedTest }
