import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'

export const ALERT_RECURRING_MODES = ['WEEK', 'MONTH'] as const
export const alertRecurringModeSchema = z.enum(ALERT_RECURRING_MODES)

export const alertDraftSchema = z.object({
  message: z.string().trim().min(1).max(500),
  triggerAt: utcInstantSchema,
  recurringMode: alertRecurringModeSchema.optional(),
}).strict()

export const alertCreateRequestSchema = z.object({
  diaryId: serializedIdSchema,
  ...alertDraftSchema.shape,
}).strict()

// The frozen standalone handler accepted any JSON string/number here and let
// the ownership query decide whether the referenced Diary exists.
const legacyAlertIdSchema = z.union([z.string(), z.number()])
const legacyTriggerAtSchema = z.union([z.string(), z.date()]).refine(
  value => !Number.isNaN(new Date(value).getTime()),
  'trigger_at must be a valid date',
)

/**
 * Standalone Alert input retained from the frozen handler. The source accepts
 * both camelCase and snake_case keys, choosing the snake_case value whenever
 * it is non-nullish. Missing triggerAt defaults to the request timestamp in
 * the API route; this schema keeps it optional so that behavior is preserved.
 */
export const alertCreateRequestWireSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object') return value
  const body = value as Record<string, unknown>
  return {
    diaryId: body.diary_id ?? body.diaryId,
    message: body.message,
    triggerAt: body.trigger_at ?? body.triggerAt,
    recurringMode: body.recurring_mode ?? body.recurringMode,
  }
}, z.object({
  diaryId: legacyAlertIdSchema,
  message: z.string().trim().min(1).max(500),
  triggerAt: legacyTriggerAtSchema.optional(),
  recurringMode: alertRecurringModeSchema.optional(),
})).transform(value => ({
  diaryId: typeof value.diaryId === 'number' ? String(value.diaryId) : value.diaryId,
  message: value.message,
  triggerAt: value.triggerAt instanceof Date ? value.triggerAt.toISOString() : value.triggerAt,
  recurringMode: value.recurringMode,
}))

/**
 * JSON documentation for the actual standalone wire body. Both spellings may
 * be mixed in one request. At least one Diary key must contain an ID; the
 * runtime adapter then applies snake_case ?? camelCase per field, with null
 * falling back when the camel pair exists and a missing trigger defaulting in
 * the API route. An effective null remains invalid.
 */
const alertCreateRequestWireIdOpenApiSchema = z.union([
  z.object({ diaryId: legacyAlertIdSchema, diary_id: legacyAlertIdSchema.nullable().optional() }).passthrough(),
  z.object({ diaryId: legacyAlertIdSchema.nullable().optional(), diary_id: legacyAlertIdSchema }).passthrough(),
])

const alertCreateRequestWireTriggerOpenApiSchema = z.union([
  z.object({ triggerAt: z.string().optional(), trigger_at: z.string().optional() }).passthrough(),
  z.object({ triggerAt: z.string(), trigger_at: z.string().nullable().optional() }).passthrough(),
  z.object({ triggerAt: z.string().nullable().optional(), trigger_at: z.string() }).passthrough(),
])

const alertCreateRequestWireRecurringOpenApiSchema = z.union([
  z.object({ recurringMode: alertRecurringModeSchema.optional(), recurring_mode: alertRecurringModeSchema.optional() }).passthrough(),
  z.object({ recurringMode: alertRecurringModeSchema, recurring_mode: alertRecurringModeSchema.nullable().optional() }).passthrough(),
  z.object({ recurringMode: alertRecurringModeSchema.nullable().optional(), recurring_mode: alertRecurringModeSchema }).passthrough(),
])

export const alertCreateRequestWireOpenApiSchema = z.intersection(
  z.intersection(
    z.object({ message: z.string().trim().min(1).max(500) }).passthrough(),
    alertCreateRequestWireIdOpenApiSchema,
  ),
  z.intersection(alertCreateRequestWireTriggerOpenApiSchema, alertCreateRequestWireRecurringOpenApiSchema),
)

// Keep the previous export name for callers that only need the operation body.
export const alertCreateRequestOpenApiSchema = alertCreateRequestWireOpenApiSchema

export const alertDiaryReferenceSchema = z.object({
  id: serializedIdSchema,
  title: z.string(),
}).strict()

export const alertResponseSchema = z.object({
  id: serializedIdSchema,
  diaryId: serializedIdSchema,
  message: z.string(),
  triggerAt: utcInstantSchema,
  isDismissed: z.boolean(),
  recurringMode: alertRecurringModeSchema.nullable(),
  parentId: serializedIdSchema.nullable(),
  instanceNumber: z.number().int().positive(),
  isPaused: z.boolean(),
  createdAt: utcInstantSchema,
  diary: alertDiaryReferenceSchema.nullable(),
}).strict()

export const ALERT_MAX_ITEMS = 100
export const alertListResponseSchema = z.array(alertResponseSchema).max(ALERT_MAX_ITEMS)

export type AlertRecurringMode = z.infer<typeof alertRecurringModeSchema>
export type AlertDraft = z.infer<typeof alertDraftSchema>
export type AlertCreateRequest = z.infer<typeof alertCreateRequestSchema>
export type AlertCreateRequestWire = z.infer<typeof alertCreateRequestWireSchema>
export type AlertResponse = z.infer<typeof alertResponseSchema>
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function toAlertResponse(row: {
  id: bigint
  diaryId: bigint
  message: string
  triggerAt: Date | string
  isDismissed?: boolean
  recurringMode?: AlertRecurringMode | string | null
  parentId?: bigint | null
  instanceNumber?: number | null
  isPaused?: boolean
  createdAt: Date | string
  diary?: { id: bigint; title: string } | null
}): AlertResponse {
  return alertResponseSchema.parse({
    id: String(row.id),
    diaryId: String(row.diaryId),
    message: row.message,
    triggerAt: iso(row.triggerAt),
    isDismissed: row.isDismissed ?? false,
    recurringMode: row.recurringMode ?? null,
    parentId: row.parentId === undefined || row.parentId === null ? null : String(row.parentId),
    instanceNumber: row.instanceNumber ?? 1,
    isPaused: row.isPaused ?? false,
    createdAt: iso(row.createdAt),
    diary: row.diary ? { id: String(row.diary.id), title: row.diary.title } : null,
  })
}
