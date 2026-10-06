import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'

export const sharedPromptKeySchema = z.enum(['ai-report.weekly', 'ai-report.monthly', 'guru.analysis'])
export const sharedPromptVersionSchema = z.object({
  id: serializedIdSchema, key: sharedPromptKeySchema, revision: z.number().int().positive(),
  name: z.string().min(1).max(120), template: z.string().max(12_000),
  legacyPromptId: serializedIdSchema.nullable(), archivedAt: utcInstantSchema.nullable(),
  createdBy: serializedIdSchema.nullable(), createdAt: utcInstantSchema,
}).strict()
export const sharedPromptDefaultSchema = z.object({
  key: sharedPromptKeySchema, systemVersion: z.string(), template: z.string(), guardrails: z.string(),
  allowedVariables: z.array(z.string()), outputSchema: z.record(z.string(), z.unknown()),
  modelSettings: z.object({ thinking: z.literal('disabled'), maxOutputTokens: z.number().int().positive() }).strict(),
  sampleInput: z.record(z.string(), z.unknown()),
}).strict()
export const sharedPromptItemSchema = z.object({
  systemDefault: sharedPromptDefaultSchema, revision: z.number().int().nonnegative(),
  activeVersionId: serializedIdSchema.nullable(), effectiveSource: z.enum(['system-default', 'override']),
  versions: z.array(sharedPromptVersionSchema),
}).strict()
export const sharedPromptListSchema = z.object({ data: z.array(sharedPromptItemSchema) }).strict()
export const sharedPromptSaveSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), name: z.string().trim().min(1).max(120),
  template: z.string().trim().min(1).max(12_000),
}).strict()
export const sharedPromptActionSchema = z.object({
  action: z.enum(['create-from-default', 'duplicate', 'activate', 'rollback', 'archive', 'disable']),
  expectedRevision: z.number().int().nonnegative(), versionId: serializedIdSchema.optional(),
}).strict()
export const sharedPromptPlaygroundSchema = z.object({ versionId: serializedIdSchema.optional(), mode: z.enum(['preview', 'test']) }).strict()
export const sharedPromptPlaygroundResponseSchema = z.object({
  key: sharedPromptKeySchema, systemVersion: z.string(), source: z.enum(['system-default', 'override']),
  versionId: serializedIdSchema.nullable(), sampleInput: z.record(z.string(), z.unknown()),
  variables: z.record(z.string(), z.string()), renderedPrompts: z.array(z.object({ role: z.enum(['system', 'user']), content: z.string() }).strict()),
  outputSchema: z.record(z.string(), z.unknown()), validation: z.enum(['not-run', 'passed']),
  provider: z.string().nullable(), model: z.string().nullable(), output: z.unknown(),
  usage: z.object({ scope: z.literal('test'), attemptId: serializedIdSchema.nullable(), inputTokens: z.number().nullable(), outputTokens: z.number().nullable(), latencyMs: z.number().nullable() }).strict(),
}).strict()
export const sharedPromptAuditSchema = z.object({ data: z.array(z.object({
  id: serializedIdSchema, actorUserId: serializedIdSchema.nullable(), action: z.string(),
  versionId: serializedIdSchema.nullable(), summary: z.string(), createdAt: utcInstantSchema,
}).strict()) }).strict()
export type SharedPromptKey = z.infer<typeof sharedPromptKeySchema>
export type SharedPromptItem = z.infer<typeof sharedPromptItemSchema>
export type SharedPromptVersion = z.infer<typeof sharedPromptVersionSchema>
