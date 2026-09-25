import { createDatabase } from '@diary/db'
import { purgeAbandonedResearchPreparation } from '../apps/api/src/research-studio/retention.js'

const rawDays = process.env.RESEARCH_PREPARATION_RETENTION_DAYS?.trim()
if (!rawDays) {
  console.log(JSON.stringify({ operation: 'research_preparation_retention', enabled: false, deletedRunIds: [] }))
} else {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const database = createDatabase(databaseUrl)
  try {
    const result = await purgeAbandonedResearchPreparation({ db: database.db, retentionDays: Number(rawDays) })
    console.log(JSON.stringify({ operation: 'research_preparation_retention', ...result }))
  } finally { await database.pool.end() }
}
