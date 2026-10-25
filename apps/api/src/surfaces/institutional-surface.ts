import type { Hono } from 'hono'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { registerAdminInstitutionalOperationRoutes } from '../institutional/admin-operations.js'
import { registerAdminSecurityMappingRoutes } from '../institutional/admin-security-mapping.js'
import type { SurfaceContext } from './context.js'

/** Operator control of 13F security mapping and institutional ingestion runs. */
export function registerInstitutionalSurface(app: Hono<AppEnv>, { db, now }: SurfaceContext) {
  registerAdminSecurityMappingRoutes(app, { db, now, fail, validationError, parseJson })
  registerAdminInstitutionalOperationRoutes(app, { db, now, fail, validationError, parseJson })
}
