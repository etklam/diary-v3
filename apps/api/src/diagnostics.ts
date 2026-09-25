const POSTGRES_ERROR_CODE = /^[0-9A-Z]{5}$/
const SAFE_CONNECTION_ERROR_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED'])
const SAFE_PROVIDER_ERROR_CODES = new Set([
  'TRANSLATION_CONFIGURATION_INVALID', 'TRANSLATION_PROVIDER_DISABLED', 'TRANSLATION_INPUT_TOO_LARGE',
  'TRANSLATION_PRIVACY_RESTRICTED', 'TRANSLATION_PROVIDER_REJECTED', 'TRANSLATION_PROVIDER_UNAVAILABLE',
  'TRANSLATION_PROVIDER_TIMEOUT', 'TRANSLATION_RATE_LIMITED', 'TRANSLATION_OUTPUT_INVALID',
])
const SENSITIVE_ERROR_MARKER = /(?:authorization|cookie|password|private|secret|sentinel|token)/i

type SafeErrorContextOptions = {
  fallbackCode?: string
  codeField?: 'errorCode' | 'databaseCode'
  includeStack?: boolean
}

/**
 * Read a bounded error code from an error and its causes without inspecting
 * messages, query text, parameters, or other provider supplied fields.
 */
export function errorCode(error: unknown): string | undefined {
  const seen = new Set<object>()
  let current = error
  for (let depth = 0; depth < 6 && current && typeof current === 'object' && !seen.has(current); depth += 1) {
    seen.add(current)
    if ('code' in current && typeof (current as { code?: unknown }).code === 'string') {
      return (current as { code: string }).code
    }
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined
  }
  return undefined
}

function safeCode(code: string | undefined): string | undefined {
  if (!code) return undefined
  if (POSTGRES_ERROR_CODE.test(code) || SAFE_CONNECTION_ERROR_CODES.has(code) || SAFE_PROVIDER_ERROR_CODES.has(code)) return code
  return undefined
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError'
  const name = error.name
  if (!/^[A-Za-z][A-Za-z0-9]*(?:Error|Exception)$/.test(name) || SENSITIVE_ERROR_MARKER.test(name)) return 'Error'
  return name.slice(0, 80)
}

function safeStackFrames(error: unknown): string[] | undefined {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return undefined
  const frames = error.stack.split('\n')
    .filter(frame => /^\s*at\s/.test(frame))
    .slice(0, 12)
    .map(frame => frame.trim())
    .map(frame => {
      const match = /^at\s+(?:(?:async|new)\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/.exec(frame)
      const functionName = match?.[1]
      if (!functionName || SENSITIVE_ERROR_MARKER.test(functionName)) return null
      return `at ${functionName}`
    })
    .filter((frame): frame is string => frame !== null)
  return frames.length ? frames : undefined
}

/**
 * Return fields safe to attach to a structured error log. The error itself is
 * never returned, and messages, SQL, parameters, request bodies, and tokens
 * are intentionally excluded.
 */
export function safeErrorContext(error: unknown, options: SafeErrorContextOptions = {}): Record<string, unknown> {
  const rawCode = errorCode(error)
  const classifiedCode = safeCode(rawCode) ?? safeCode(options.fallbackCode)
  const context: Record<string, unknown> = { errorName: safeErrorName(error) }
  if (classifiedCode && options.codeField !== 'databaseCode') context.errorCode = classifiedCode
  if (classifiedCode && options.codeField === 'databaseCode' && POSTGRES_ERROR_CODE.test(classifiedCode)) context.databaseCode = classifiedCode
  if (options.includeStack !== false) {
    const stackFrames = safeStackFrames(error)
    if (stackFrames) context.stackFrames = stackFrames
  }
  return context
}
