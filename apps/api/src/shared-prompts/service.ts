import { and, desc, eq, isNull, max, sql } from 'drizzle-orm'
import { aiAdminAuditEvents, aiPromptVersions, aiRuntimeState, sharedPromptStates, sharedPromptVersions, type Database, type DatabaseTx } from '@diary/db'
import { sharedPromptKeySchema, type SharedPromptKey } from '@diary/contracts/shared-prompts'
import { lockAiGlobal } from '../ai-reports/job-store.js'
import { ensureAiRuntime } from '../ai-reports/settings.js'
import { legacyReportTypeFor, promptDefinition, validateRegisteredPromptTemplate } from './registry.js'

type Version = typeof sharedPromptVersions.$inferSelect
const serialize = (row: Version) => ({ ...row, id: row.id.toString(), legacyPromptId: row.legacyPromptId?.toString() ?? null, createdBy: row.createdBy?.toString() ?? null, createdAt: row.createdAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null })
export class PromptRegistryError extends Error {
  constructor(readonly code: 'conflict' | 'missing' | 'test-required' | 'invalid') { super(code) }
}
export async function resolveSharedPrompt(db: Pick<Database, 'select'>, key: SharedPromptKey) {
  const definition = promptDefinition(key)
  const [state] = await db.select().from(sharedPromptStates).where(eq(sharedPromptStates.key, key)).limit(1)
  const [version] = state?.activeVersionId ? await db.select().from(sharedPromptVersions).where(and(eq(sharedPromptVersions.key, key), eq(sharedPromptVersions.id, state.activeVersionId), isNull(sharedPromptVersions.archivedAt))).limit(1) : []
  if (version) {
    try { validateRegisteredPromptTemplate(key, version.template); return { definition, source: 'override' as const, version, template: version.template } } catch { /* Invalid historical overrides use the code-owned fallback. */ }
  }
  return { definition, source: 'system-default' as const, version: null, template: definition.template }
}
export async function listSharedPrompts(db: Database) {
  return { data: await Promise.all(sharedPromptKeySchema.options.map(async key => {
    const resolved = await resolveSharedPrompt(db, key)
    const [state] = await db.select().from(sharedPromptStates).where(eq(sharedPromptStates.key, key)).limit(1)
    const versions = await db.select().from(sharedPromptVersions).where(eq(sharedPromptVersions.key, key)).orderBy(desc(sharedPromptVersions.revision))
    return { systemDefault: resolved.definition, revision: state?.revision ?? 0, activeVersionId: state?.activeVersionId?.toString() ?? null, effectiveSource: resolved.source, versions: versions.map(serialize) }
  })) }
}
export async function writePromptAudit(db: Pick<Database, 'insert'>, input: { key: SharedPromptKey; actorUserId: bigint; action: string; versionId?: bigint | null; now: Date; summary?: string }) {
  await db.insert(aiAdminAuditEvents).values({ actorUserId: input.actorUserId, action: `registry.${input.action}`, targetType: input.key, targetId: input.versionId?.toString() ?? null, summary: input.summary ?? `Prompt ${input.action}`, createdAt: input.now })
}
async function lockState(tx: DatabaseTx, key: SharedPromptKey, expectedRevision: number, now: Date) {
  await lockAiGlobal(tx)
  await tx.insert(sharedPromptStates).values({ key, updatedAt: now }).onConflictDoNothing()
  const [state] = await tx.select().from(sharedPromptStates).where(eq(sharedPromptStates.key, key)).for('update')
  if (!state || state.revision !== expectedRevision) throw new PromptRegistryError('conflict')
  return state
}
async function findVersion(db: Pick<Database, 'select'>, key: SharedPromptKey, versionId: string | undefined) {
  if (!versionId) throw new PromptRegistryError('missing')
  const [version] = await db.select().from(sharedPromptVersions).where(and(eq(sharedPromptVersions.key, key), eq(sharedPromptVersions.id, BigInt(versionId)), isNull(sharedPromptVersions.archivedAt))).limit(1)
  if (!version) throw new PromptRegistryError('missing')
  return version
}
export async function selectedSharedPrompt(db: Database, key: SharedPromptKey, versionId?: string) {
  if (!versionId) return { definition: promptDefinition(key), source: 'system-default' as const, version: null, template: promptDefinition(key).template }
  const version = await findVersion(db, key, versionId)
  validateRegisteredPromptTemplate(key, version.template)
  return { definition: promptDefinition(key), source: 'override' as const, version, template: version.template }
}
async function insertVersion(tx: DatabaseTx, input: { key: SharedPromptKey; name: string; template: string; actorUserId: bigint; now: Date; revision: number }) {
  validateRegisteredPromptTemplate(input.key, input.template)
  // Legacy report jobs continue to pin their original table and IDs.
  const reportType = legacyReportTypeFor(input.key)
  let legacyPromptId: bigint | null = null
  if (reportType) {
  const [latest] = await tx.select({ revision: max(aiPromptVersions.revision) }).from(aiPromptVersions).where(eq(aiPromptVersions.reportType, reportType))
  const [legacy] = await tx.insert(aiPromptVersions).values({ reportType, revision: (latest?.revision ?? 0) + 1, template: input.template, isDefault: false, status: 'draft', createdBy: input.actorUserId, createdAt: input.now }).returning()
  legacyPromptId = legacy!.id
  }
  const [version] = await tx.insert(sharedPromptVersions).values({ ...input, createdBy: input.actorUserId, createdAt: input.now, legacyPromptId }).returning()
  return version!
}
export async function saveSharedPrompt(db: Database, input: { key: SharedPromptKey; name: string; template: string; actorUserId: bigint; expectedRevision: number; now: Date }) {
  validateRegisteredPromptTemplate(input.key, input.template)
  await ensureAiRuntime(db, input.now)
  return db.transaction(async tx => {
    const state = await lockState(tx, input.key, input.expectedRevision, input.now)
    const version = await insertVersion(tx, { ...input, revision: state.revision + 1 })
    await tx.update(sharedPromptStates).set({ revision: state.revision + 1, updatedAt: input.now }).where(eq(sharedPromptStates.key, input.key))
    await writePromptAudit(tx, { ...input, action: 'edit', versionId: version.id })
    return serialize(version)
  })
}
async function useLegacyPrompt(tx: DatabaseTx, key: SharedPromptKey, version: Version | null, actorUserId: bigint, now: Date) {
  const reportType = legacyReportTypeFor(key)
  if (!reportType) return
  let legacyId = version?.legacyPromptId
  if (!legacyId) {
    const [latest] = await tx.select({ revision: max(aiPromptVersions.revision) }).from(aiPromptVersions).where(eq(aiPromptVersions.reportType, reportType))
    const [legacy] = await tx.insert(aiPromptVersions).values({ reportType, revision: (latest?.revision ?? 0) + 1, template: promptDefinition(key).template, isDefault: true, status: 'published', createdBy: actorUserId, createdAt: now, publishedAt: now }).returning()
    legacyId = legacy!.id
  } else {
    await tx.update(aiPromptVersions).set({ status: 'published', publishedAt: now }).where(eq(aiPromptVersions.id, legacyId))
  }
  await tx.update(aiRuntimeState).set({ ...(reportType === 'weekly' ? { activeWeeklyPromptId: legacyId } : { activeMonthlyPromptId: legacyId }), updatedAt: now }).where(eq(aiRuntimeState.singleton, 'default'))
}
export async function actOnSharedPrompt(db: Database, input: { key: SharedPromptKey; action: 'create-from-default' | 'duplicate' | 'activate' | 'rollback' | 'archive' | 'disable'; versionId?: string; expectedRevision: number; actorUserId: bigint; now: Date }) {
  await ensureAiRuntime(db, input.now)
  return db.transaction(async tx => {
    const state = await lockState(tx, input.key, input.expectedRevision, input.now)
    let version = input.action === 'disable' || input.action === 'create-from-default' ? null : await findVersion(tx, input.key, input.versionId)
    let activeVersionId = state.activeVersionId
    if (input.action === 'create-from-default' || input.action === 'duplicate') {
      version = await insertVersion(tx, { ...input, name: version ? `${version.name.slice(0, 110)} (copy)` : 'Custom prompt', template: version?.template ?? promptDefinition(input.key).template, revision: state.revision + 1 })
    } else if (input.action === 'activate' || input.action === 'rollback') {
      validateRegisteredPromptTemplate(input.key, version!.template)
      const [passed] = await tx.select({ id: aiAdminAuditEvents.id }).from(aiAdminAuditEvents).where(and(eq(aiAdminAuditEvents.targetType, input.key), eq(aiAdminAuditEvents.targetId, version!.id.toString()), eq(aiAdminAuditEvents.action, 'registry.test.passed'))).limit(1)
      const [migrated] = await tx.select({ id: aiAdminAuditEvents.id }).from(aiAdminAuditEvents).where(and(eq(aiAdminAuditEvents.targetType, input.key), eq(aiAdminAuditEvents.targetId, version!.id.toString()), eq(aiAdminAuditEvents.action, 'registry.migrate'))).limit(1)
      if (!passed && !migrated) throw new PromptRegistryError('test-required')
      activeVersionId = version!.id
      await useLegacyPrompt(tx, input.key, version, input.actorUserId, input.now)
    } else if (input.action === 'disable') {
      activeVersionId = null
      await useLegacyPrompt(tx, input.key, null, input.actorUserId, input.now)
    } else if (input.action === 'archive') {
      if (state.activeVersionId === version!.id) throw new PromptRegistryError('invalid')
      await tx.update(sharedPromptVersions).set({ archivedAt: input.now }).where(eq(sharedPromptVersions.id, version!.id))
    }
    await tx.update(sharedPromptStates).set({ revision: state.revision + 1, activeVersionId, updatedAt: input.now }).where(eq(sharedPromptStates.key, input.key))
    await writePromptAudit(tx, { ...input, action: input.action === 'disable' ? 'deactivate' : input.action === 'create-from-default' || input.action === 'duplicate' ? 'create' : input.action, versionId: version?.id ?? null })
    return version ? serialize(version) : null
  })
}
export async function readPromptAudit(db: Database, key: SharedPromptKey) {
  const rows = await db.select().from(aiAdminAuditEvents).where(and(eq(aiAdminAuditEvents.targetType, key), sql`${aiAdminAuditEvents.action} like 'registry.%'`)).orderBy(desc(aiAdminAuditEvents.id)).limit(100)
  return { data: rows.map(row => ({ id: row.id.toString(), actorUserId: row.actorUserId?.toString() ?? null, action: row.action, versionId: row.targetId, summary: row.summary, createdAt: row.createdAt.toISOString() })) }
}

/** Pin the effective registry prompt in the legacy table for existing report workers. */
export async function resolveReportPromptInTransaction(tx: DatabaseTx, reportType: 'weekly' | 'monthly', now: Date) {
  const key = `ai-report.${reportType}` as SharedPromptKey
  const resolved = await resolveSharedPrompt(tx, key)
  const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).for('update')
  if (!runtime) return null
  if (resolved.version?.legacyPromptId) {
    const [legacy] = await tx.select().from(aiPromptVersions).where(and(eq(aiPromptVersions.id, resolved.version.legacyPromptId), eq(aiPromptVersions.reportType, reportType), eq(aiPromptVersions.status, 'published'))).limit(1)
    if (legacy && legacy.template === resolved.template) return legacy
  }
  const activeId = reportType === 'weekly' ? runtime.activeWeeklyPromptId : runtime.activeMonthlyPromptId
  const [current] = activeId ? await tx.select().from(aiPromptVersions).where(and(eq(aiPromptVersions.id, activeId), eq(aiPromptVersions.status, 'published'), eq(aiPromptVersions.isDefault, true))).limit(1) : []
  if (current && current.template === resolved.definition.template) return current
  const [latest] = await tx.select({ revision: max(aiPromptVersions.revision) }).from(aiPromptVersions).where(eq(aiPromptVersions.reportType, reportType))
  const [fallback] = await tx.insert(aiPromptVersions).values({ reportType, revision: (latest?.revision ?? 0) + 1, template: resolved.definition.template, isDefault: true, status: 'published', createdAt: now, publishedAt: now }).returning()
  await tx.update(aiRuntimeState).set({ ...(reportType === 'weekly' ? { activeWeeklyPromptId: fallback!.id } : { activeMonthlyPromptId: fallback!.id }), updatedAt: now }).where(eq(aiRuntimeState.singleton, 'default'))
  return fallback!
}
