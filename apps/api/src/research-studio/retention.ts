import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { researchRuns, type Database } from '@diary/db'
import { lockResearchMutation } from './publication.js'

/** Prepared, never-dispatched work only; approval and dispatch audit trails are retained. */
export async function purgeAbandonedResearchPreparation(input: { db: Database; retentionDays?: number; now?: Date; batchSize?: number }) {
  if (input.retentionDays === undefined) return { enabled: false, deletedRunIds: [] as string[] }
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 3650) throw new Error('Research retention days must be an integer between 1 and 3650')
  const batchSize = input.batchSize ?? 100
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error('Research retention batch size must be between 1 and 1000')
  const cutoff = new Date((input.now ?? new Date()).getTime() - input.retentionDays * 86_400_000)
  return input.db.transaction(async tx => {
    await lockResearchMutation(tx)
    const rows = await tx.select({ id: researchRuns.id }).from(researchRuns).where(and(
      lt(researchRuns.updatedAt, cutoff),
      isNull(researchRuns.linkedPostId),
      isNull(researchRuns.handoffPostId),
      sql`${researchRuns.reviewStatus} <> 'APPROVED'`,
      sql`not exists (select 1 from research_attempt where run_id = ${researchRuns.id})`,
      sql`not exists (select 1 from research_article_link where run_id = ${researchRuns.id})`,
      sql`not exists (select 1 from research_revision where run_id = ${researchRuns.id} and (approved_at is not null or review_status = 'APPROVED'))`,
    )).orderBy(researchRuns.updatedAt, researchRuns.id).limit(batchSize).for('update')
    for (const row of rows) await tx.delete(researchRuns).where(eq(researchRuns.id, row.id))
    return { enabled: true, deletedRunIds: rows.map(row => String(row.id)) }
  })
}
