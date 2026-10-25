import type { Hono } from 'hono'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { registerAdminGuruRoutes } from '../admin-gurus.js'
import { registerAdminUserRoutes } from '../admin-users.js'
import type { SurfaceContext } from './context.js'

interface AdminSurfaceDependencies {
  onAccountRevoked?: (userId: string) => void
}

/**
 * Operator administration of accounts and Guru profiles. Account revocation
 * reaches the realtime layer through the callback the root supplies, which is
 * why it is a dependency here rather than something this surface can reach.
 */
export function registerAdminSurface(
  app: Hono<AppEnv>,
  { db, now }: SurfaceContext,
  { onAccountRevoked }: AdminSurfaceDependencies,
) {
  registerAdminUserRoutes(app, { db, now, onAccountRevoked, fail, validationError, parseJson })
  registerAdminGuruRoutes(app, { db, now, fail, validationError, parseJson })
}
