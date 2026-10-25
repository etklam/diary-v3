import type { Hono } from 'hono'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { registerArticleTranslationRoutes } from '../article-translations/routes.js'
import { registerPostRoutes } from '../posts.js'
import type { ResearchLatestCompletedSession } from '../research-studio/service.js'
import type { SurfaceContext } from './context.js'

interface PublishingSurfaceDependencies {
  latestCompletedSession: ResearchLatestCompletedSession
}

/**
 * The public article surface and its translations. Both take the latest
 * completed US-equity session, because a published article's figures are stated
 * as of a session rather than as of now.
 */
export function registerPublishingSurface(
  app: Hono<AppEnv>,
  { db, now, logger, consume, clientIp }: SurfaceContext,
  { latestCompletedSession }: PublishingSurfaceDependencies,
) {
  registerPostRoutes(app, {
    db,
    now,
    latestCompletedSession,
    logger,
    fail,
    validationError,
    parseJson,
    consume,
    clientIp,
  })
  registerArticleTranslationRoutes(app, { db, now, latestCompletedSession, fail, validationError, parseJson, consume })
}
