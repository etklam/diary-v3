import { expect, it } from 'vitest'
import { invitePartnerSchema, updatePartnerSharingSchema } from '@diary/contracts/partners'
it('normalizes invitation email and accepts only explicit self-sharing changes', () => {
 expect(invitePartnerSchema.parse({ partnerEmail: '  PERSON@Example.test  ' })).toEqual({ partnerEmail: 'person@example.test' })
 expect(updatePartnerSharingSchema.parse({ shareDiaries: false })).toEqual({ shareDiaries: false })
 for (const input of [{}, { shareDiaries: 'true' }, { partnerSharesDiaries: true }, { shareDiaries: true, userId: '42' }]) expect(updatePartnerSharingSchema.safeParse(input).success).toBe(false)
})
