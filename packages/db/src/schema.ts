/**
 * The schema, re-exported from its per-domain modules.
 *
 * Every `@diary/db` import and `drizzle.config.ts` keep pointing here, so the
 * decomposition is invisible outside this package. Migrations under
 * `packages/db/migrations/` are deliberately untouched.
 */

export * from './schema/account.js'
export * from './schema/diary.js'
export * from './schema/company.js'
export * from './schema/portfolio.js'
export * from './schema/review.js'
export * from './schema/practice.js'
export * from './schema/market.js'
export * from './schema/publishing.js'
export * from './schema/research.js'
export * from './schema/ai.js'
export * from './schema/mail.js'
export * from './schema/institutionalFilings.js'
export * from './schema/institutionalSecurities.js'
export * from './schema/institutionalSnapshots.js'
export * from './schema/guru.js'
export * from './schema/guruConsensus.js'
export * from './schema/guruNotifications.js'
export * from './schema/platform.js'
