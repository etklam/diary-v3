import type { Hono } from 'hono'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { registerActivityTimelineRoute } from '../activity-timeline.js'
import { registerDiaryReviewRoutes } from '../diary-review.js'
import { registerDiarySavedViewRoutes } from '../diary-saved-views.js'
import { registerDisciplineOg } from '../discipline-og.js'
import { registerEvidenceRoutes } from '../evidence.js'
import { registerInvestmentThesisRoutes } from '../investment-thesis.js'
import { registerReviewQueueRoute } from '../review-queue.js'
import { registerStockNoteRoutes } from '../stock-notes.js'
import { registerTradePlanRoutes } from '../trade-plans.js'
import { registerWatchlistRoutes } from '../watchlist.js'
import type { SurfaceContext } from './context.js'

/**
 * Everything built on a judgment the reader wrote: reviews, saved views, trade
 * plans, the watchlist and its evidence, stock notes, theses, the review queue
 * and the activity timeline. The diary read/write routes themselves stay in the
 * composition root with the auth surface, because they register after it.
 */
export function registerDiarySurface(app: Hono<AppEnv>, { db, now }: SurfaceContext) {
  registerDiaryReviewRoutes(app, { db, now, fail, validationError, parseJson })
  registerDiarySavedViewRoutes(app, { db, now, fail, validationError, parseJson })
  registerTradePlanRoutes(app, { db, now, fail, validationError, parseJson })
  registerWatchlistRoutes(app, { db, now, fail, validationError, parseJson })
  registerEvidenceRoutes(app, { db, now, fail, validationError, parseJson })
  registerStockNoteRoutes(app, { db, now, fail, validationError, parseJson })
  registerInvestmentThesisRoutes(app, { db, now, fail, validationError, parseJson })
  registerReviewQueueRoute(app, { db, now, fail, validationError })
  registerActivityTimelineRoute(app, { db, fail, validationError })
  // Owns its own cache policy and needs no shared dependency.
  registerDisciplineOg(app)
}
