import { and, eq } from 'drizzle-orm'
import { aiAdminAuditEvents, sharedPromptStates, sharedPromptVersions, type aiPromptVersions, type DatabaseTx } from '@diary/db'

/** Mirror legacy publications without changing their existing prompt IDs. */
export async function mirrorLegacyPromptPublication(tx: DatabaseTx, prompt: typeof aiPromptVersions.$inferSelect, actorUserId: bigint, now: Date) {
  const key = `ai-report.${prompt.reportType}`
  await tx.insert(sharedPromptStates).values({ key, updatedAt: now }).onConflictDoNothing()
  const [state] = await tx.select().from(sharedPromptStates).where(eq(sharedPromptStates.key, key)).for('update')
  const revision = state!.revision + 1
  let versionId: bigint | null = null
  if (!prompt.isDefault) {
    const [existing] = await tx.select().from(sharedPromptVersions).where(and(eq(sharedPromptVersions.key, key), eq(sharedPromptVersions.legacyPromptId, prompt.id))).limit(1)
    if (existing?.archivedAt) throw new Error('AI_ADMIN_REVISION_CONFLICT')
    if (existing) versionId = existing.id
    else {
      const [created] = await tx.insert(sharedPromptVersions).values({ key, revision, name: 'AI Reports override', template: prompt.template, legacyPromptId: prompt.id, createdBy: actorUserId, createdAt: now }).returning()
      versionId = created!.id
    }
    await tx.insert(aiAdminAuditEvents).values({ actorUserId, action: 'registry.test.passed', targetType: key, targetId: versionId.toString(), summary: 'Preserved successful legacy prompt capability test', createdAt: now })
  }
  await tx.update(sharedPromptStates).set({ revision, activeVersionId: versionId, updatedAt: now }).where(eq(sharedPromptStates.key, key))
  await tx.insert(aiAdminAuditEvents).values({ actorUserId, action: versionId ? 'registry.activate' : 'registry.deactivate', targetType: key, targetId: versionId?.toString() ?? null, summary: 'Mirrored AI Reports prompt publication', createdAt: now })
}
