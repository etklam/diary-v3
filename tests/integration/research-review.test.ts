import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { posts, researchAttempts, researchRevisions, researchRuns, researchRuntimeState, users } from '@diary/db'
import { researchDraftSchema, researchQaGateSchema, type ResearchRevisionRequest } from '@diary/contracts'
import { purgeAbandonedResearchPreparation } from '../../apps/api/src/research-studio/retention'
import { ResearchStudioService } from '../../apps/api/src/research-studio/service'
import { createSyntheticResearchFixture } from '../support/research-fixtures'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let service: ResearchStudioService
let actorId: bigint
const now = new Date('2026-09-25T12:00:00.000Z')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

beforeAll(async () => {
  database = await provisionTestDatabase('research_review')
  const [actor] = await database.db.insert(users).values({ email: 'review@example.test', password: 'synthetic-not-a-login-hash', role: 'ADMIN' }).returning()
  actorId = actor!.id
  await database.db.insert(researchRuntimeState).values({ singleton: 'default', featureEnabled: true }).onConflictDoUpdate({ target: researchRuntimeState.singleton, set: { featureEnabled: true } })
  const fixture = createSyntheticResearchFixture()
  service = new ResearchStudioService({ db: database.db, now: () => now, evidenceProvider: fixture.evidenceProvider, latestCompletedSession: fixture.latestCompletedSession, allowSyntheticEvidence: true })
})
afterAll(async () => { await database?.dispose() })

async function seed() {
  const run = await service.prepare(actorId, { symbol: 'SOXX', asOf: '2026-09-05T23:30:00.000Z', synthetic: true })
  const claims = Array.from({ length: 10 }, (_, index) => ({ claimId: `SYNTHETIC_${index + 1}`, section: index + 1, text: 'Synthetic limitation; no current market claim.', type: 'inference' as const, sourceIds: [], metricPaths: [], zoneIds: [], planIds: [], status: 'LIMITED' as const }))
  const draft = researchDraftSchema.parse({ schemaVersion: 'research-draft-v1', title: `Synthetic review ${randomUUID()}`, sections: claims.map(claim => ({ section: claim.section, title: 'Synthetic section', content: claim.text, claimIds: [claim.claimId] })), claims, finalAnswers: claims.slice(0, 8).map(claim => ({ question: 'Synthetic question', answer: claim.text, claimIds: [claim.claimId] })), limitations: ['Synthetic fixture only; never publish.'] })
  const qa = run.evidence!.qa
  const content = 'Synthetic review body.'
  // Seed the output boundary independently of worker tests; all evidence remains synthetic.
  await database.db.insert(researchRevisions).values({ runId: BigInt(run.id), revision: 1, titleHash: hash(draft.title), bodyHash: hash(content), structuredJson: JSON.stringify({ ...draft, qa }), content, createdBy: actorId })
  await database.db.update(researchRuns).set({ executionStatus: 'DRAFT_READY', currentRevision: 1 }).where(eq(researchRuns.id, BigInt(run.id)))
  const detail = await service.detail(actorId, BigInt(run.id))
  const input: ResearchRevisionRequest = { expectedVersion: detail.version, expectedRevision: 1, structured: draft, content, qa: qa.map((gate, index) => index < 6 ? { ...gate, reviewerId: null, reviewedAt: null } : { ...gate, status: 'PASS', evidence: [`Human inspected ${gate.gateId} against this synthetic revision.`], reason: null, remediation: null, reviewerId: null, reviewedAt: null }) }
  return { id: BigInt(run.id), detail, input }
}

it('rejects forged computed gates, forged reviewer identity, copied machine notes and unchecked approval', async () => {
  const data = await seed()
  const computed = structuredClone(data.input); computed.qa[0]!.evidence = ['Forged computed evidence']
  await expect(service.createRevision(actorId, data.id, computed)).rejects.toMatchObject({ code: 'RESEARCH_QA_FAILED' })
  const forged = structuredClone(data.input); forged.qa[8]!.reviewerId = '999'
  await expect(service.createRevision(actorId, data.id, forged)).rejects.toMatchObject({ code: 'RESEARCH_QA_FAILED' })
  const copied = structuredClone(data.input); copied.qa[8]!.evidence = data.detail.evidence!.qa[8]!.evidence
  await expect(service.createRevision(actorId, data.id, copied)).rejects.toMatchObject({ code: 'RESEARCH_QA_FAILED' })
  await expect(service.approve(actorId, data.id, { expectedVersion: data.detail.version, revision: 1, bodyHash: data.detail.revisions[0]!.bodyHash })).rejects.toMatchObject({ code: 'RESEARCH_QA_FAILED' })
})

it('serializes competing revisions and approvals and retains server-stamped exact approval', async () => {
  const data = await seed()
  const race = await Promise.allSettled([service.createRevision(actorId, data.id, data.input), service.createRevision(actorId, data.id, data.input)])
  expect(race.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(race.filter(result => result.status === 'rejected')).toHaveLength(1)
  const detail = await service.detail(actorId, data.id)
  const latest = detail.revisions[0]!
  const reviewed = researchQaGateSchema.array().parse(latest.structured.qa)
  expect(reviewed.slice(6).every(gate => gate.reviewerId === String(actorId) && gate.reviewedAt === now.toISOString())).toBe(true)
  await expect(service.approve(actorId, data.id, { expectedVersion: detail.version, revision: 1, bodyHash: detail.revisions[1]!.bodyHash })).rejects.toMatchObject({ code: 'RESEARCH_REVISION_CONFLICT' })
  const approve = { expectedVersion: detail.version, revision: latest.revision, bodyHash: latest.bodyHash }
  const approvalRace = await Promise.allSettled([service.approve(actorId, data.id, approve), service.approve(actorId, data.id, approve)])
  expect(approvalRace.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const approved = await service.detail(actorId, data.id)
  expect(approved.revisions[0]).toMatchObject({ approvedBy: String(actorId), titleHash: hash(String(latest.structured.title)), reviewStatus: 'APPROVED' })
  const article = await service.handoff(actorId, data.id, { expectedVersion: approved.version, revision: latest.revision, bodyHash: latest.bodyHash, access: 'PUBLIC', category: 'technical', tags: [] })
  expect(article).toMatchObject({ status: 'DRAFT', access: 'MEMBER', created: true })
  const handed = await service.detail(actorId, data.id)
  expect(await service.handoff(actorId, data.id, { expectedVersion: handed.version, revision: latest.revision, bodyHash: latest.bodyHash, access: 'PUBLIC', category: 'technical', tags: [] })).toMatchObject({ postId: article.postId, created: false })
  // Simulate an editorial change; import must snapshot it and reset human review.
  await database.db.update(posts).set({ title: 'Edited synthetic title', content: 'Edited synthetic content.' }).where(eq(posts.id, BigInt(article.postId)))
  const imported = await service.importArticleRevision(actorId, data.id, { expectedVersion: handed.version })
  expect(imported).toMatchObject({ content: 'Edited synthetic content.', titleHash: hash('Edited synthetic title'), reviewStatus: 'DRAFT' })
  expect(researchQaGateSchema.array().parse(imported.structured.qa).slice(6).every(gate => gate.status === 'NOT_CHECKED' && gate.reviewerId === null)).toBe(true)
})

it('rechecks administrator access inside the mutation transaction', async () => {
  const data = await seed()
  const [member] = await database.db.insert(users).values({ email: `member-${randomUUID()}@example.test`, password: 'synthetic-not-a-login-hash', role: 'USER' }).returning()
  await expect(service.createRevision(member!.id, data.id, data.input)).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' })
})


it('keeps retention disabled by default and preserves dispatched, approved and linked provenance', async () => {
  const abandoned = await seed()
  const dispatched = await seed()
  const approved = await seed()
  const linked = await seed()
  const old = new Date('2026-01-01T00:00:00.000Z')
  for (const data of [abandoned, dispatched, approved, linked]) await database.db.update(researchRuns).set({ updatedAt: old }).where(eq(researchRuns.id, data.id))
  await database.db.insert(researchAttempts).values({ runId: dispatched.id, idempotencyKey: 'synthetic-retention-intent', idempotencyKeyHash: hash('synthetic-retention-intent'), dispatchStatus: 'DISPATCH_INTENT' })
  await database.db.update(researchRevisions).set({ reviewStatus: 'APPROVED', approvedBy: actorId, approvedBySnapshot: actorId, approvedAt: old }).where(eq(researchRevisions.runId, approved.id))
  const [post] = await database.db.insert(posts).values({ authorId: actorId, title: 'Synthetic retention draft', slug: 'synthetic-retention-draft', content: 'Synthetic content.', category: 'technical', status: 'DRAFT', access: 'MEMBER' }).returning()
  await database.db.update(researchRuns).set({ linkedPostId: post!.id }).where(eq(researchRuns.id, linked.id))
  expect(await purgeAbandonedResearchPreparation({ db: database.db, now })).toEqual({ enabled: false, deletedRunIds: [] })
  await expect(purgeAbandonedResearchPreparation({ db: database.db, now, retentionDays: 0 })).rejects.toThrow('retention days')
  expect(await purgeAbandonedResearchPreparation({ db: database.db, now, retentionDays: 30 })).toEqual({ enabled: true, deletedRunIds: [String(abandoned.id)] })
  for (const data of [dispatched, approved, linked]) expect((await database.db.select().from(researchRuns).where(eq(researchRuns.id, data.id))).length).toBe(1)
})

it('retains approval identity and detached handoff provenance after the approving author is deleted', async () => {
  const data = await seed()
  const [approver] = await database.db.insert(users).values({ email: `approver-${randomUUID()}@example.test`, password: 'synthetic-not-a-login-hash', role: 'ADMIN' }).returning()
  const reviewer = approver!.id
  const revision = await service.createRevision(reviewer, data.id, data.input)
  const detail = await service.detail(actorId, data.id)
  const approved = await service.approve(reviewer, data.id, { expectedVersion: detail.version, revision: revision.revision, bodyHash: revision.bodyHash })
  const article = await service.handoff(reviewer, data.id, { expectedVersion: approved.version, revision: revision.revision, bodyHash: revision.bodyHash, access: 'MEMBER', category: 'technical', tags: [] })
  await database.db.delete(users).where(eq(users.id, reviewer))
  const restored = await service.detail(actorId, data.id)
  expect(restored.revisions[0]).toMatchObject({ approvedBy: String(reviewer), reviewStatus: 'APPROVED' })
  expect(restored.linkedPostId).toBeNull()
  const [run] = await database.db.select().from(researchRuns).where(eq(researchRuns.id, data.id))
  expect(run!.handoffPostId).toBe(BigInt(article.postId))
  await expect(service.handoff(actorId, data.id, { expectedVersion: restored.version, revision: revision.revision, bodyHash: revision.bodyHash, access: 'MEMBER', category: 'technical', tags: [] })).rejects.toMatchObject({ code: 'RESEARCH_ARTICLE_PROVENANCE' })
})
