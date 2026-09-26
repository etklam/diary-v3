const minute = 60_000

// Keep enforcement values together so endpoint policy changes are reviewable.
export const RATE_LIMIT_POLICIES = {
  registerIp: { name: 'register', limit: 3, windowMs: minute },
  registerAccount: { name: 'register', limit: 3, windowMs: minute },
  loginIp: { name: 'login', limit: 5, windowMs: minute },
  loginAccount: { name: 'login', limit: 5, windowMs: minute },
  refreshIp: { name: 'refresh', limit: 10, windowMs: minute },
  refreshToken: { name: 'refresh', limit: 10, windowMs: minute },
  passwordIp: { name: 'password_change', limit: 3, windowMs: minute },
  passwordUser: { name: 'password_change', limit: 3, windowMs: minute },
  marketIp: { name: 'market', limit: 60, windowMs: minute },
  secMetadataIp: { name: 'sec_metadata', limit: 60, windowMs: minute },
  secDownloadIp: { name: 'sec_download', limit: 30, windowMs: minute },
  secPackageIp: { name: 'sec_package', limit: 10, windowMs: minute },
  secBatchIp: { name: 'sec_batch', limit: 5, windowMs: minute },
  apiKeyCreateUser: { name: 'api_key_create', limit: 60, windowMs: minute },
  apiKeyRequest: { name: 'api_key_request', limit: 120, windowMs: minute },
  aiReportGeneration: { name: 'ai_report_generation', limit: 6, windowMs: minute },
  researchPreparation: { name: 'research_generation', limit: 6, windowMs: minute },
  researchGeneration: { name: 'research_generation', limit: 6, windowMs: minute },
  articleTranslationQueue: { name: 'article_translation_queue', limit: 30, windowMs: minute },
  publicArticleSearchIp: { name: 'public_article_search', limit: 60, windowMs: minute },
} as const satisfies Record<string, { name: string; limit: number; windowMs: number }>

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES

export function rateLimitKey(policy: string, scope: string, identity: string): string {
  return `${policy}:${scope}:${identity}`
}
