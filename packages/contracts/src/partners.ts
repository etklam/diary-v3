import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema, calendarDateSchema } from './common.js'
export const invitePartnerSchema = z.object({ partnerEmail: z.string().trim().toLowerCase().max(255).pipe(z.email()) }).strict()
export const updatePartnerSharingSchema = z.object({ shareDiaries: z.boolean().optional(), shareStockNotes: z.boolean().optional() }).strict().refine(value => value.shareDiaries !== undefined || value.shareStockNotes !== undefined, 'At least one sharing flag is required')
export const partnerLinkResponseSchema = z.object({
 id: serializedIdSchema, acceptedAt: utcInstantSchema.nullable(), createdAt: utcInstantSchema,
 partner: z.object({ id: serializedIdSchema, email: z.email(), name: z.string().nullable() }).strict(),
 status: z.enum(['connected', 'pending_incoming', 'pending_outgoing']),
 selfSharesDiaries: z.boolean(), partnerSharesDiaries: z.boolean(), selfSharesStockNotes: z.boolean(), partnerSharesStockNotes: z.boolean(),
 pendingIncoming: z.boolean(), pendingOutgoing: z.boolean(), initiatedByCurrentUser: z.boolean(),
}).strict()
export type PartnerLinkResponse = z.infer<typeof partnerLinkResponseSchema>

export const partnerListResponseSchema = z.object({ links: z.array(partnerLinkResponseSchema) }).strict()
export const partnerMutationResponseSchema = z.object({ link: partnerLinkResponseSchema }).strict()

export const partnerCompareQuerySchema = z.object({ partnerId: serializedIdSchema.optional(), limit: z.coerce.number().int().min(1).max(60).default(20) }).strict()
export const partnerDiarySchema = z.object({ id: serializedIdSchema, title: z.string(), content: z.string(), tags: z.array(z.string()), createdVia: z.enum(['WEB', 'API_KEY', 'TELEGRAM_BOT']), createdByLabel: z.string().nullable(), date: calendarDateSchema, createdAt: utcInstantSchema, updatedAt: utcInstantSchema }).strict()
const compareParticipantSchema = z.object({ id: serializedIdSchema, name: z.string().nullable() }).strict()
export const partnerCompareResponseSchema = z.object({
 owner: compareParticipantSchema, partner: compareParticipantSchema.nullable(), selectedPartnerId: serializedIdSchema.nullable(),
 links: z.array(partnerLinkResponseSchema.omit({ partner: true }).extend({ partner: compareParticipantSchema }).strict()),
 compareDays: z.array(z.object({ dateKey: calendarDateSchema, ownerDiary: partnerDiarySchema.nullable(), partnerDiary: partnerDiarySchema.nullable() }).strict()).max(60),
}).strict()
