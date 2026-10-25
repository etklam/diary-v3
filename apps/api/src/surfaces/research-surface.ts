import type { Hono } from 'hono'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { registerResearchRoutes } from '../research-studio/routes.js'
import type {
  ResearchEvidenceProvider,
  ResearchLatestCompletedSession,
  ResearchTransport,
} from '../research-studio/service.js'
import type { OfficialResearchSourceInput } from '../research-studio/sources.js'
import type { SurfaceContext } from './context.js'

interface ResearchSurfaceDependencies {
  transport: ResearchTransport
  evidenceProvider: ResearchEvidenceProvider
  latestCompletedSession: ResearchLatestCompletedSession
  allowSyntheticEvidence: boolean
  researchOfficialSources?: readonly OfficialResearchSourceInput[]
}

/**
 * Research Studio. Its evidence provider, transport and session resolver are
 * composed in the root because they are injectable for tests and because the
 * publishing surface shares the same session resolver.
 */
export function registerResearchSurface(
  app: Hono<AppEnv>,
  { db, now, consume }: SurfaceContext,
  {
    transport,
    evidenceProvider,
    latestCompletedSession,
    allowSyntheticEvidence,
    researchOfficialSources,
  }: ResearchSurfaceDependencies,
) {
  registerResearchRoutes(app, {
    db,
    now,
    transport,
    evidenceProvider,
    latestCompletedSession,
    allowSyntheticEvidence,
    officialSourcePolicies: researchOfficialSources?.map(source => source.policy),
    fail,
    validationError,
    parseJson,
    consume,
  })
}
