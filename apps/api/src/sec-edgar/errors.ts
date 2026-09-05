import type { SecProviderErrorCode } from '@diary/contracts/sec-filings'

export class SecProviderError extends Error {
  constructor(
    public readonly code: SecProviderErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message)
  }
}
