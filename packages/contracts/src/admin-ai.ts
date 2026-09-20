import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'
import { aiReportTypeSchema } from './ai-reports.js'

export const aiProviderTypeSchema = z.literal('deepseek')
export const aiProviderProtocolSchema = z.literal('chat_completions')
export const aiThinkingSchema = z.enum(['enabled', 'disabled'])
export const aiConfigStatusSchema = z.enum(['draft', 'published'])

const baseProviderFields = {
  displayName: z.string().trim().min(1).max(120),
  providerType: aiProviderTypeSchema,
  protocol: aiProviderProtocolSchema,
  baseUrl: z.url({ protocol: /^https$/ }).max(500),
  model: z.string().trim().min(1).max(200),
  thinking: aiThinkingSchema,
  maxInputTokens: z.number().int().positive().max(200_000),
  maxOutputTokens: z.number().int().positive().max(32_000),
  timeoutMs: z.number().int().min(1_000).max(300_000),
  monthlyBudgetCents: z.number().int().nonnegative().max(2_147_483_647),
  recipientName: z.string().trim().min(1).max(200),
  disclosureVersion: z.string().trim().min(1).max(80),
  disclosureText: z.string().trim().min(1).max(10_000).default('Your saved journal records will be processed by the configured AI provider to create a private review report.'),
  pricingCurrency: z.string().trim().length(3),
  pricingVersion: z.string().trim().min(1).max(80).nullable(),
  inputPricePerMillionCents: z.number().int().nonnegative().nullable(),
  outputPricePerMillionCents: z.number().int().nonnegative().nullable(),
  reservationCostCents: z.number().int().nonnegative(),
}

export const aiProviderDraftSchema = z.object({
  ...baseProviderFields,
  apiKeyAction: z.enum(['keep', 'replace', 'clear']),
  apiKey: z.string().min(1).max(500).optional(),
  expectedRevision: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.apiKeyAction === 'replace' && !value.apiKey) context.addIssue({ code: 'custom', path: ['apiKey'], message: 'API key is required when replacing the key' })
  if (value.apiKeyAction !== 'replace' && value.apiKey !== undefined) context.addIssue({ code: 'custom', path: ['apiKey'], message: 'API key is only accepted with replace action' })
})

export const aiProviderSettingsSchema = z.object({
  id: serializedIdSchema,
  revision: z.number().int().nonnegative(),
  status: aiConfigStatusSchema,
  ...baseProviderFields,
  hasApiKey: z.boolean(),
  recipientRevision: z.number().int().positive(),
  lastTestedAt: utcInstantSchema.nullable(),
  lastTestStatus: z.enum(['passed', 'failed']).nullable(),
  createdAt: utcInstantSchema,
  publishedAt: utcInstantSchema.nullable(),
}).strict()

export const aiProviderPublishSchema = z.object({ expectedRevision: z.number().int().nonnegative() }).strict()
export const aiProviderTestSchema = z.object({ expectedRevision: z.number().int().nonnegative() }).strict()

export const aiPromptTypeSchema = aiReportTypeSchema
export const aiPromptDraftSchema = z.object({
  template: z.string().trim().min(1).max(100_000),
  expectedRevision: z.number().int().nonnegative(),
}).strict()
export const aiPromptVersionSchema = z.object({
  id: serializedIdSchema,
  reportType: aiPromptTypeSchema,
  revision: z.number().int().positive(),
  template: z.string().max(100_000),
  status: aiConfigStatusSchema,
  isDefault: z.boolean(),
  createdBy: serializedIdSchema.nullable(),
  createdAt: utcInstantSchema,
  publishedAt: utcInstantSchema.nullable(),
}).strict()

export const aiAccessListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(255).optional(),
}).strict()
export const aiAccessItemSchema = z.object({
  userId: serializedIdSchema,
  email: z.email(),
  name: z.string().nullable(),
  enabled: z.boolean(),
  monthlyQuota: z.number().int().nonnegative(),
  grantedAt: utcInstantSchema.nullable(),
  revokedAt: utcInstantSchema.nullable(),
}).strict()
export const aiAccessUpdateSchema = z.object({
  enabled: z.boolean(),
  monthlyQuota: z.number().int().nonnegative().max(10_000),
}).strict()
export const aiAccessListResponseSchema = z.object({ data: z.array(aiAccessItemSchema), nextCursor: z.string().max(200).nullable() }).strict()

export const aiAdminUsageQuerySchema = z.object({
  month: calendarDateSchema.optional(),
  userId: serializedIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()
export const aiAdminUsageItemSchema = z.object({
  userId: serializedIdSchema.nullable(),
  month: calendarDateSchema,
  pricingCurrency: z.string().trim().length(3).nullable(),
  reserved: z.number().int().nonnegative(),
  reservedCostCents: z.number().int().nonnegative(),
  consumed: z.number().int().nonnegative(),
  released: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  estimatedCostCents: z.number().int().nonnegative().nullable(),
}).strict()
export const aiAdminUsageResponseSchema = z.object({ data: z.array(aiAdminUsageItemSchema) }).strict()

export const aiAdminAuditQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()
export const aiAdminAuditEventSchema = z.object({
  id: serializedIdSchema,
  actorUserId: serializedIdSchema.nullable(),
  action: z.string().regex(/^[a-z][a-z0-9_.-]{1,80}$/),
  targetType: z.string().regex(/^[a-z][a-z0-9_.-]{1,80}$/),
  targetId: z.string().max(100).nullable(),
  summary: z.string().max(500),
  createdAt: utcInstantSchema,
}).strict()
export const aiAdminAuditResponseSchema = z.object({ data: z.array(aiAdminAuditEventSchema), nextCursor: z.string().max(200).nullable() }).strict()

export const aiAdminRuntimeStateSchema = z.object({
  generationEnabled: z.boolean(),
  workerAvailable: z.boolean(),
  workerHeartbeatAt: utcInstantSchema.nullable(),
}).strict()
export const aiAdminRuntimeUpdateSchema = z.object({ generationEnabled: z.boolean() }).strict()

export const aiAdminSettingsResponseSchema = z.object({
  runtime: aiAdminRuntimeStateSchema,
  provider: aiProviderSettingsSchema.nullable(),
  prompts: z.object({ weekly: aiPromptVersionSchema.nullable(), monthly: aiPromptVersionSchema.nullable() }).strict(),
}).strict()

export type AiProviderDraft = z.infer<typeof aiProviderDraftSchema>
export type AiProviderSettings = z.infer<typeof aiProviderSettingsSchema>
export type AiPromptVersion = z.infer<typeof aiPromptVersionSchema>
export type AiAccessItem = z.infer<typeof aiAccessItemSchema>
export type AiAdminRuntimeUpdate = z.infer<typeof aiAdminRuntimeUpdateSchema>
