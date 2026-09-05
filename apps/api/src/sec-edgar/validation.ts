import { z } from 'zod'

const cikSchema = z.string().trim().regex(/^\d{1,10}$/)
const accessionSchema = z.string().trim().regex(/^\d{10}-\d{2}-\d{6}$/)
const basenameSchema = z.string().min(1).max(255).refine((value) => {
  if (!/^[\x20-\x7E]+$/.test(value)) return false
  if (value === '.' || value === '..') return false
  if (value.includes('/') || value.includes('\\') || value.includes('\0') || value.includes('%')) return false
  return value === value.split('/').pop()
}, 'Unsafe SEC document basename')

export const strictDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Invalid calendar date')

export function canonicalizeCik(input: string): string {
  return cikSchema.parse(input).padStart(10, '0')
}

export function archiveCik(input: string): string {
  return String(Number(canonicalizeCik(input)))
}

export function parseAccession(input: string): { accession: string; directory: string } {
  const accession = accessionSchema.parse(input)
  return { accession, directory: accession.replaceAll('-', '') }
}

export function parseDocumentBasename(input: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(input)
  } catch {
    throw new z.ZodError([])
  }
  if (decoded !== input) throw new z.ZodError([])
  return basenameSchema.parse(input)
}

export function normalizeTickerQuery(input: string): string {
  return z.string().trim().min(1).max(120).parse(input).normalize('NFKC').toUpperCase()
}

export const companySearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(10),
})

export const filingListQuerySchema = z.object({
  forms: z.string().max(200).optional(),
  filedFrom: strictDateSchema.optional(),
  filedTo: strictDateSchema.optional(),
  periodFrom: strictDateSchema.optional(),
  periodTo: strictDateSchema.optional(),
  amendments: z.enum(['include', 'exclude', 'only']).default('include'),
  cursor: z.string().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).superRefine((value, context) => {
  if (value.filedFrom && value.filedTo && value.filedFrom > value.filedTo) context.addIssue({ code: 'custom', message: 'filedFrom must be before filedTo' })
  if (value.periodFrom && value.periodTo && value.periodFrom > value.periodTo) context.addIssue({ code: 'custom', message: 'periodFrom must be before periodTo' })
})

export const batchQuerySchema = z.object({
  cik: z.string(),
  accessions: z.union([z.string(), z.array(z.string())]).transform(value => Array.isArray(value) ? value : [value]),
  mode: z.enum(['primary', 'complete']),
}).superRefine((value, context) => {
  if (value.accessions.length < 1 || value.accessions.length > 10 || new Set(value.accessions).size !== value.accessions.length) {
    context.addIssue({ code: 'custom', message: 'accessions must contain 1 to 10 unique values' })
  }
})
