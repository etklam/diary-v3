import { holidayQuerySchema, holidayResponseSchema, holidaySchema, type Holiday } from '@diary/contracts/calendar'
import type { ErrorCode } from '@diary/contracts'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'

const upstreamHolidaySchema = holidaySchema.passthrough()
const upstreamHolidayListSchema = upstreamHolidaySchema.array().max(500)
const MAX_HOLIDAY_RESPONSE_BYTES = 1024 * 1024

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HOLIDAY_RESPONSE_BYTES) {
    throw new Error('Holiday upstream response exceeds 1 MiB')
  }
  if (!response.body) throw new Error('Holiday upstream response has no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_HOLIDAY_RESPONSE_BYTES) {
        await reader.cancel('Holiday upstream response exceeds 1 MiB')
        throw new Error('Holiday upstream response exceeds 1 MiB')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

export interface HolidayProvider {
  publicHolidays(year: number, countryCode: string): Promise<Holiday[]>
}

export function createNagerHolidayProvider(options: {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  baseUrl?: string
} = {}): HolidayProvider {
  const fetcher = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  const baseUrl = options.baseUrl ?? 'https://date.nager.at/api/v3/PublicHolidays/'
  return {
    async publicHolidays(year, countryCode) {
      const query = holidayQuerySchema.parse({ year, countryCode })
      const url = new URL(`${query.year}/${query.countryCode}`, baseUrl)
      const response = await fetcher(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`Holiday upstream returned HTTP ${response.status}`)
      const holidays = upstreamHolidayListSchema.parse(await readBoundedJson(response))
      if (holidays.some(holiday => holiday.countryCode !== query.countryCode
        || !holiday.date.startsWith(`${query.year}-`))) {
        throw new Error('Holiday upstream returned data outside the requested country/year')
      }
      return holidays
    },
  }
}

interface HolidayRouteDependencies {
  holidays: HolidayProvider
  fail(status: number, code: ErrorCode, message: string): never
  validationError(error: z.ZodError): never
}

export function registerHolidayRoutes(app: Hono<AppEnv>, dependencies: HolidayRouteDependencies) {
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value)
    if (!result.success) return dependencies.validationError(result.error)
    return result.data
  }
  app.get('/api/holidays', async (context: Context<AppEnv>) => {
    if (!context.get('user')) return dependencies.fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = parse(holidayQuerySchema, context.req.query())
    try {
      const data = await dependencies.holidays.publicHolidays(query.year, query.countryCode)
      return context.json(holidayResponseSchema.parse({ success: true, data }), 200)
    } catch {
      return dependencies.fail(502, 'SYS_EXTERNAL_SERVICE_ERROR', 'Failed to fetch holiday data')
    }
  })
}
