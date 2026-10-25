import type { Hono } from 'hono'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { registerAchievementRoutes } from '../achievements.js'
import { registerAgentStockRoutes } from '../agent-stocks.js'
import { registerAlertRoutes } from '../alerts.js'
import { registerApiKeyRoutes } from '../api-keys.js'
import { registerDisciplineRoutes } from '../discipline.js'
import { registerGoalRoutes } from '../goals.js'
import { registerPartnerRoutes } from '../partners.js'
import { registerPriceAlertRoutes } from '../price-alerts.js'
import type { SurfaceContext } from './context.js'

/**
 * What an account owns about its own practice: agent access and API keys,
 * partner links, trading principles, achievements, goals and both reminder
 * kinds. API keys are the only registrar here that throttles, because minting a
 * credential is the one costly write.
 */
export function registerAccountSurface(app: Hono<AppEnv>, { db, now, consume }: SurfaceContext) {
  registerAgentStockRoutes(app, { db, now, fail, validationError, parseJson })
  registerApiKeyRoutes(app, { db, now, fail, validationError, parseJson, consume })
  registerPartnerRoutes(app, { db, now, fail, validationError, parseJson })
  registerDisciplineRoutes(app, { db, now, fail, validationError, parseJson })
  registerAchievementRoutes(app, { db, now, fail, validationError, parseJson })
  registerGoalRoutes(app, { db, now, fail, validationError, parseJson })
  registerPriceAlertRoutes(app, { db, now, fail, validationError, parseJson })
  registerAlertRoutes(app, { db, now, fail, validationError, parseJson })
}
