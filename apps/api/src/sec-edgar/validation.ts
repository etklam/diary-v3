import { z } from 'zod'

const cikSchema = z.string().trim().regex(/^\d{1,10}$/)
const accessionSchema = z.string().trim().regex(/^\d{10}-\d{2}-\d{6}$/)
const basenameSchema = z.string().min(1).max(255).refine((value) => {
  if (!/^[\x20-\x7E]+$/.test(value)) return false
  if (value === '.' || value === '..') return false
  if (value.includes('/') || value.includes('\\') || value.includes('\0') || value.includes('%')) return false
  return value === value.split('/').pop()
}, 'Unsafe SEC document basename')

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
