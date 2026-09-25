import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  posts,
  researchArticleLinks,
  researchEvidenceSnapshots,
  researchInstrumentProfiles,
  researchRevisions,
  researchRuns,
  researchRuntimeState,
  type Database,
} from '@diary/db'
import { researchEvidenceManifestSchema, researchSourceRecordSchema, type ErrorCode } from '@diary/contracts'
import type { ResearchLatestCompletedSession } from './service.js'
import { researchQaApprovalIssue } from './qa.js'

export type ResearchTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export type ResearchPublicationIssue = {
  code: Extract<ErrorCode, 'RESEARCH_ARTICLE_FRESHNESS' | 'RESEARCH_ARTICLE_NOT_APPROVED' | 'RESEARCH_ARTICLE_PROVENANCE' | 'RESEARCH_QA_FAILED'>
  message: string
}

/** ponytail: one admin mutation lock; use finer locks only if measured contention requires it. */
export async function lockResearchMutation(tx: ResearchTransaction): Promise<void> {
  await tx.insert(researchRuntimeState).values({ singleton: 'default' }).onConflictDoNothing()
  await tx.select({ singleton: researchRuntimeState.singleton }).from(researchRuntimeState)
    .where(eq(researchRuntimeState.singleton, 'default')).for('update')
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}
function parsedJson(value: string): unknown {
  try { return JSON.parse(value) as unknown } catch { return null }
}
function issue(code: ResearchPublicationIssue['code'], message: string): ResearchPublicationIssue { return { code, message } }

/** Checks evidence integrity and review only; synthetic/publication-state gates remain mandatory in the caller. */
export function researchPublicationEvidenceIssue(input: {
  snapshot: Pick<typeof researchEvidenceSnapshots.$inferSelect, 'manifestJson' | 'barsJson' | 'sourcesJson' | 'metricsJson' | 'candidatesJson' | 'qaJson' | 'quality' | 'contentHash'>
  structured: unknown
}): ResearchPublicationIssue | null {
  const snapshot = input.snapshot
  const parsed = researchEvidenceManifestSchema.safeParse(parsedJson(snapshot.manifestJson))
  if (!parsed.success) return issue('RESEARCH_ARTICLE_PROVENANCE', 'Invalid evidence manifest')
  const manifest = parsed.data
  const hashable = {
    manifest, bars: parsedJson(snapshot.barsJson), sources: parsedJson(snapshot.sourcesJson),
    metrics: parsedJson(snapshot.metricsJson), candidates: parsedJson(snapshot.candidatesJson),
    qa: parsedJson(snapshot.qaJson), quality: snapshot.quality,
  }
  if (sha256(stableJson(hashable)) !== snapshot.contentHash) return issue('RESEARCH_ARTICLE_PROVENANCE', 'Stored research evidence failed integrity verification')
  const sourceResult = researchSourceRecordSchema.array().min(1).safeParse(hashable.sources)
  if (!sourceResult.success || sourceResult.data.some(source => source.use.publicationOfAnalysisAndExcerpts.status !== 'allowed')) {
    return issue('RESEARCH_ARTICLE_PROVENANCE', 'A source does not permit publication of analysis and excerpts')
  }
  const structured = input.structured
  const qa = structured && typeof structured === 'object' && 'qa' in structured ? structured.qa : null
  const qaProblem = researchQaApprovalIssue({ qa, structured, sources: sourceResult.data, frozenQa: hashable.qa })
  if (qaProblem) return issue('RESEARCH_QA_FAILED', qaProblem)
  return null
}

export async function researchPublicationFreshnessIssue(input: {
  symbol: string
  referenceSession: string
  now: Date
  latestCompletedSession?: ResearchLatestCompletedSession
}): Promise<ResearchPublicationIssue | null> {
  let current: Awaited<ReturnType<ResearchLatestCompletedSession>> = null
  try {
    if (input.latestCompletedSession) current = await input.latestCompletedSession({ symbol: input.symbol, exchangeTimezone: 'America/New_York', asOf: input.now, referenceSession: input.referenceSession })
  } catch { /* A calendar failure cannot make an article publishable. */ }
  if (!current || !current.calendarVersion || !current.verifiedSourceId || current.session !== input.referenceSession) {
    return issue('RESEARCH_ARTICLE_FRESHNESS', 'Current verified calendar coverage is required for publication')
  }
  return null
}

/** The caller holds lockResearchMutation and writes the Post in this same transaction. */
export async function researchPublicationIssue(input: {
  db: ResearchTransaction
  postId: bigint
  title?: string
  content?: string
  now: Date
  latestCompletedSession?: ResearchLatestCompletedSession
}): Promise<ResearchPublicationIssue | null> {
  const tx = input.db
  const [post] = await tx.select().from(posts).where(eq(posts.id, input.postId)).for('update')
  const [link] = await tx.select().from(researchArticleLinks).where(eq(researchArticleLinks.postId, input.postId)).for('update')
  // Only server-owned links identify research articles; ordinary writes cannot create or remove them.
  if (!link) return null
  if (!post) return issue('RESEARCH_ARTICLE_PROVENANCE', 'The linked article is unavailable')
  const [run] = await tx.select().from(researchRuns).where(eq(researchRuns.id, link.runId)).for('update')
  const [revision] = await tx.select().from(researchRevisions).where(and(eq(researchRevisions.id, link.revisionId), eq(researchRevisions.runId, link.runId))).for('update')
  const [snapshot] = await tx.select().from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, link.runId), eq(researchEvidenceSnapshots.contentHash, link.evidenceHash))).for('update')
  if (!run || !revision || !snapshot || run.linkedPostId !== post.id || run.evidenceHash !== link.evidenceHash) {
    return issue('RESEARCH_ARTICLE_PROVENANCE', 'Research approval and evidence links are incomplete')
  }
  const titleHash = sha256(input.title ?? post.title)
  const bodyHash = sha256(input.content ?? post.content)
  if (link.titleHash !== titleHash || revision.titleHash !== titleHash || link.bodyHash !== bodyHash || revision.bodyHash !== bodyHash || sha256(revision.content) !== bodyHash) {
    return issue('RESEARCH_ARTICLE_NOT_APPROVED', 'Article title and body must match the exact approved revision')
  }
  if (revision.reviewStatus !== 'APPROVED' || !revision.approvedAt || !revision.approvedBySnapshot || run.reviewStatus !== 'APPROVED' || run.currentRevision !== revision.revision) {
    return issue('RESEARCH_ARTICLE_NOT_APPROVED', 'Research article approval is missing or stale')
  }
  const manifestResult = researchEvidenceManifestSchema.safeParse(parsedJson(snapshot.manifestJson))
  if (!manifestResult.success || manifestResult.data.synthetic) return issue('RESEARCH_ARTICLE_PROVENANCE', 'Synthetic or invalid evidence cannot be published')
  const manifest = manifestResult.data
  if (run.quality !== 'FULL' || !link.referenceSession || run.referenceSession !== link.referenceSession || manifest.referenceSession !== link.referenceSession || manifest.closeRows < 260 || manifest.completeOhlcRows < 150 || manifest.volumeRows < 21 || manifest.missingSessions.length > 0) {
    return issue('RESEARCH_ARTICLE_FRESHNESS', 'Research evidence is incomplete or stale')
  }
  const evidenceProblem = researchPublicationEvidenceIssue({ snapshot, structured: parsedJson(revision.structuredJson) })
  if (evidenceProblem) return evidenceProblem
  const [instrument] = await tx.select({ symbol: researchInstrumentProfiles.symbol }).from(researchInstrumentProfiles).where(eq(researchInstrumentProfiles.id, run.instrumentProfileId))
  if (!instrument) return issue('RESEARCH_ARTICLE_PROVENANCE', 'Research instrument is unavailable')
  return researchPublicationFreshnessIssue({ symbol: instrument.symbol, referenceSession: link.referenceSession, now: input.now, latestCompletedSession: input.latestCompletedSession })
}

export function hashResearchArticleTitle(title: string): string { return sha256(title) }
export function hashResearchArticleBody(content: string): string { return sha256(content) }
