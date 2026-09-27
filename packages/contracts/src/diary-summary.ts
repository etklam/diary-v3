import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './index.js'

/** Bounded discovery item for Library/Timeline/Overview. Content and every
 * private Review text field stay out of the payload by construction; the
 * excerpt is generated server-side by diaryExcerpt, so it never exceeds
 * maxLength + one ellipsis code unit. */
export const diarySummarySchema = z.object({
  id: serializedIdSchema,
  date: calendarDateSchema,
  title: z.string(),
  excerpt: z.string().max(241),
  tags: z.array(z.string()).max(3),
  stockSymbols: z.array(z.string()).max(10),
  createdVia: z.enum(['WEB', 'API_KEY', 'TELEGRAM_BOT']),
  reviewStatus: z.enum(['none', 'pending', 'reviewed']),
  reviewDueAt: utcInstantSchema.nullable(),
  reviewOutcome: z.enum(['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR']).nullable(),
  transactionCount: z.number().int().nonnegative(),
  alertCount: z.number().int().nonnegative(),
  searchSnippet: z.object({
    source: z.enum(['title', 'content', 'thesis', 'risk', 'execution', 'tag', 'symbol']),
    // Search is capped at 500 input code units; a bounded context may add at
    // most one ellipsis on each side of a long match.
    text: z.string().max(502),
    matchStart: z.number().int().min(0),
    matchEnd: z.number().int().min(0),
  }).strict().superRefine((snippet, context) => {
    if (snippet.matchStart >= snippet.matchEnd || snippet.matchEnd > snippet.text.length) context.addIssue({ code: 'custom', message: 'Search match offsets must be inside the snippet' })
  }).nullable().optional(),
}).strict()

export const diarySummaryListResponseSchema = z.object({
  data: z.array(diarySummarySchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()
export type DiarySummary = z.infer<typeof diarySummarySchema>
