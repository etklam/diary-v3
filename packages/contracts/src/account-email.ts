import { z } from 'zod'
import { utcInstantSchema } from './common.js'

const locales = z.enum(['zh-TW', 'zh-CN', 'en'])
const bcryptPassword = z.string().max(72)
  .refine(value => new TextEncoder().encode(value).length <= 72, 'Password must be at most 72 UTF-8 bytes')

export const authCapabilitiesSchema = z.object({
  registrationMode: z.enum(['direct', 'email']),
  passwordRecoveryAvailable: z.boolean(),
}).strict()

export const accountEmailRequestSchema = z.object({
  email: z.email().max(255),
  locale: locales,
}).strict()

export const registrationCompleteRequestSchema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().max(100).optional(),
  password: bcryptPassword.min(8),
}).strict()

export const passwordResetCompleteRequestSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: bcryptPassword.min(8),
}).strict()

export const accountEmailMutationResponseSchema = z.object({ success: z.literal(true) }).strict()

export const emailSecuritySchema = z.enum(['tls', 'starttls', 'none'])
export const emailDeliveryStatusSchema = z.enum(['queued', 'running', 'sent', 'failed', 'cancelled'])
export const emailDeliveryKindSchema = z.enum(['registration_verification', 'password_reset', 'password_changed', 'admin_test'])

export const adminEmailSettingsSchema = z.object({
  enabled: z.boolean(),
  host: z.string().nullable(),
  port: z.number().int().min(1).max(65535).nullable(),
  security: emailSecuritySchema,
  authEnabled: z.boolean(),
  username: z.string().nullable(),
  passwordConfigured: z.boolean(),
  fromName: z.string().nullable(),
  fromEmail: z.string().nullable(),
  replyTo: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  testedRevision: z.number().int().nonnegative().nullable(),
  lastTestAt: utcInstantSchema.nullable(),
  lastTestStatus: z.enum(['passed', 'failed']).nullable(),
}).strict()

export const emailDeliveryHistoryItemSchema = z.object({
  id: z.string(),
  kind: emailDeliveryKindSchema,
  recipientMasked: z.string(),
  status: emailDeliveryStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  lastErrorCode: z.string().nullable(),
  createdAt: utcInstantSchema,
}).strict()

export const adminEmailSettingsResponseSchema = z.object({
  settings: adminEmailSettingsSchema,
  deliveries: emailDeliveryHistoryItemSchema.array().max(50),
}).strict()

export const adminEmailSettingsUpdateSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  host: z.string().trim().max(255).nullable(),
  port: z.number().int().min(1).max(65535).nullable(),
  security: emailSecuritySchema,
  authEnabled: z.boolean(),
  username: z.string().trim().max(255).nullable(),
  passwordAction: z.enum(['retain', 'replace', 'clear']),
  password: z.string().max(1000).optional(),
  fromName: z.string().trim().max(200).nullable(),
  fromEmail: z.email().max(255).nullable(),
  replyTo: z.email().max(255).nullable(),
}).strict().refine(value => value.passwordAction !== 'replace' || (value.password !== undefined && value.password.length > 0), {
  path: ['password'], message: 'A replacement password is required',
}).refine(value => value.passwordAction !== 'retain' || value.password === undefined, {
  path: ['password'], message: 'Do not send the existing password',
})

export const adminEmailTestRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  recipient: z.email().max(255),
}).strict()

export const adminEmailRevisionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
}).strict()

export const adminEmailTestResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  status: z.enum(['passed', 'failed']),
  testedAt: utcInstantSchema,
  errorCode: z.string().nullable(),
}).strict()

export type AdminEmailSettings = z.infer<typeof adminEmailSettingsSchema>
export type AdminEmailSettingsResponse = z.infer<typeof adminEmailSettingsResponseSchema>
export type EmailDeliveryHistoryItem = z.infer<typeof emailDeliveryHistoryItemSchema>
export type EmailDeliveryKind = z.infer<typeof emailDeliveryKindSchema>
