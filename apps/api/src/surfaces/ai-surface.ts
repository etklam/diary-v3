import type { Hono } from 'hono'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { registerAiAdminRoutes } from '../ai-reports/admin-routes.js'
import { AiReportService } from '../ai-reports/report-service.js'
import { registerAiReportRoutes } from '../ai-reports/routes.js'
import { registerSharedPromptRoutes } from '../shared-prompts/routes.js'
import type { AiTransport } from '../ai-reports/outbound-policy.js'
import type { SurfaceContext } from './context.js'

interface AiSurfaceDependencies {
  aiTransport?: AiTransport
}

/**
 * Manual AI reports, their operator configuration, and the shared prompt
 * library. The report service is composed here rather than in the root because
 * nothing outside this surface uses it.
 */
export function registerAiSurface(
  app: Hono<AppEnv>,
  { db, now, consume }: SurfaceContext,
  { aiTransport }: AiSurfaceDependencies,
) {
  const service = new AiReportService({ db, now })
  registerAiReportRoutes(app, { db, now, service, fail, validationError, parseJson, consume })
  registerAiAdminRoutes(app, { db, now, transport: aiTransport, fail, validationError, parseJson })
  registerSharedPromptRoutes(app, { db, now, transport: aiTransport, fail, validationError, parseJson })
}
