import type { PostAccess, PostStatus } from '@diary/contracts'

export type ArticleViewer = { role: 'USER' | 'ADMIN' } | undefined
export type ArticleReadDecision = 'FULL' | 'LOCKED' | 'NOT_FOUND'

export type ArticlePolicyInput = {
  status: PostStatus | string
  publishedAt: Date | null
  access: PostAccess | string
}

/**
 * The only route-level decision point for article publication and body access.
 * Unknown access values fail closed before an administrator preview is allowed.
 */
export function resolveArticleReadAccess(
  article: ArticlePolicyInput,
  viewer: ArticleViewer,
  options: { allowAdminPreview?: boolean } = {},
): ArticleReadDecision {
  if (article.access !== 'PUBLIC' && article.access !== 'MEMBER') return 'NOT_FOUND'
  if (options.allowAdminPreview && viewer?.role === 'ADMIN') return 'FULL'
  if (article.status !== 'PUBLISHED' || article.publishedAt === null) return 'NOT_FOUND'
  if (article.access === 'PUBLIC' || viewer !== undefined) return 'FULL'
  return 'LOCKED'
}

