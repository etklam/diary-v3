import { z } from 'zod'
import { disciplineContentSchema } from './discipline.js'
import { utcInstantSchema } from './common.js'

const metadata = { title: z.string().optional(), author: z.string().optional(), description: z.string().optional() }
export const disciplineShareSchema = z.object({
  version: z.literal('1.0'), type: z.literal('trading-disciplines'), ...metadata,
  disciplines: z.array(z.object({ content: disciplineContentSchema, order: z.number().int() }).strict()),
  exportedAt: utcInstantSchema, count: z.number().int().nonnegative(),
}).strict()
export const importDisciplineRequestSchema = z.object({ json: z.string().min(1), replaceExisting: z.boolean().optional().default(false) }).strict()
export const importDisciplineResponseSchema = z.object({ success: z.literal(true), imported: z.number().int().positive(), message: z.string() }).strict()
export const exportDisciplineQuerySchema = z.object({ title: z.string().optional(), description: z.string().optional(), includeAuthor: z.enum(['true', 'false']).optional() }).strict()
export const exportDisciplineResponseSchema = z.object({ success: z.literal(true), data: disciplineShareSchema, json: z.string() }).strict()
export type DisciplineShareData = z.infer<typeof disciplineShareSchema>
/** Import keeps source array order and duplicate content; blank/malformed rows are skipped. */
export function parseDisciplineShare(json: string) {
  const source = z.object({ version: z.literal('1.0'), type: z.literal('trading-disciplines'), ...metadata, disciplines: z.array(z.unknown()) }).parse(JSON.parse(json))
  const candidates = source.disciplines.flatMap(row => {
    if (!row || typeof row !== 'object' || !('content' in row) || typeof row.content !== 'string' || !row.content.trim()) return []
    return [{ content: row.content.trim() }]
  })
  // As in the source API, oversized nonempty content rejects the whole import.
  const disciplines = z.array(z.object({ content: disciplineContentSchema })).min(1).parse(candidates)
  return { title: source.title || 'Trading Disciplines', author: source.author, description: source.description, disciplines: disciplines.map((row, order) => ({ ...row, order })), count: disciplines.length }
}
export function createDisciplineShare(rows: readonly { content: string; order: number }[], options: { title?: string; description?: string; author?: string }, exportedAt: string): DisciplineShareData {
  const clean = [...rows].sort((a, b) => a.order - b.order).map(({ content, order }) => ({ content, order }))
  return disciplineShareSchema.parse({ version: '1.0', type: 'trading-disciplines', title: options.title || 'My Trading Disciplines', author: options.author || 'Anonymous', description: options.description, disciplines: clean, exportedAt, count: clean.length })
}

/** Frozen URL format: Base64 of URI-encoded UTF-8 JSON, not Base64 of raw JSON. */
export function encodeDisciplineShare(data: DisciplineShareData): string {
  return btoa(encodeURIComponent(JSON.stringify(disciplineShareSchema.parse(data), null, 2)))
}
export function decodeDisciplineShare(value: string): string {
  const json = decodeURIComponent(atob(value))
  parseDisciplineShare(json)
  return json
}
export function disciplineShareUrl(data: DisciplineShareData, baseUrl: string, publicPage = true): string {
  const url = new URL(publicPage ? '/discipline/share' : '/discipline', baseUrl)
  url.searchParams.set('import', encodeDisciplineShare(data))
  return url.toString()
}
