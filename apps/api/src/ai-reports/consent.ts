import { eq } from 'drizzle-orm'
import { aiUserConsents, type Database } from '@diary/db'

export async function readAiConsent(db: Database, userId: bigint) {
  const [row] = await db.select().from(aiUserConsents).where(eq(aiUserConsents.userId, userId)).limit(1)
  return row ?? null
}

export async function acceptAiConsent(db: Database, input: { userId: bigint; recipientRevision: number; disclosureVersion: string; now: Date }) {
  const [row] = await db.insert(aiUserConsents).values({
    userId: input.userId,
    recipientRevision: input.recipientRevision,
    disclosureVersion: input.disclosureVersion,
    acceptedAt: input.now,
    revokedAt: null,
    updatedAt: input.now,
  }).onConflictDoUpdate({
    target: aiUserConsents.userId,
    set: { recipientRevision: input.recipientRevision, disclosureVersion: input.disclosureVersion, acceptedAt: input.now, revokedAt: null, updatedAt: input.now },
  }).returning()
  return row
}

export async function revokeAiConsent(db: Database, userId: bigint, now: Date) {
  const [row] = await db.update(aiUserConsents).set({ revokedAt: now, updatedAt: now }).where(eq(aiUserConsents.userId, userId)).returning()
  return row ?? null
}
