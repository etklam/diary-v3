export const ARTICLE_TRANSLATION_LOCALES = ['zh-TW', 'zh-CN', 'en'] as const

export type ArticleTranslationLocale = typeof ARTICLE_TRANSLATION_LOCALES[number]
export type ArticleAccessLevel = 'PUBLIC' | 'MEMBER'
export type TranslationProviderId = 'edge' | 'ai'

export interface TranslationProviderRequest {
  sourceLocale: ArticleTranslationLocale
  targetLocale: ArticleTranslationLocale
  articleAccess: ArticleAccessLevel
  blocks: readonly string[]
  signal?: AbortSignal
}

export interface TranslationUsageMetadata {
  inputTokens?: number
  outputTokens?: number
  calls?: number
}

export interface TranslationProviderResult {
  translations: string[]
  provider: TranslationProviderId
  model: string | null
  usage: TranslationUsageMetadata | null
}

export interface TranslationProvider {
  readonly id: TranslationProviderId
  readonly name: string
  translate(request: TranslationProviderRequest): Promise<TranslationProviderResult>
}

export type TranslationProviderErrorCode =
  | 'TRANSLATION_CONFIGURATION_INVALID'
  | 'TRANSLATION_PROVIDER_DISABLED'
  | 'TRANSLATION_INPUT_TOO_LARGE'
  | 'TRANSLATION_PRIVACY_RESTRICTED'
  | 'TRANSLATION_PROVIDER_REJECTED'
  | 'TRANSLATION_PROVIDER_UNAVAILABLE'
  | 'TRANSLATION_PROVIDER_TIMEOUT'
  | 'TRANSLATION_RATE_LIMITED'
  | 'TRANSLATION_OUTPUT_INVALID'

export class TranslationProviderError extends Error {
  constructor(
    readonly code: TranslationProviderErrorCode,
    readonly retryAfterMs: number | null = null,
  ) {
    super(code)
    this.name = 'TranslationProviderError'
  }
}
