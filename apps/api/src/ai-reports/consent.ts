/** The consent facts the gate needs, satisfied by any `ai_user_consent` projection. */
export interface AiConsentState {
  acceptedAt: Date | null
  revokedAt: Date | null
  recipientRevision: number
}

/**
 * The single consent gate for AI report generation: consent must be accepted,
 * not revoked, and pinned to the recipient revision the caller is about to use.
 * Dispatch admission, the worker and the report service all enforce this, so
 * the rule lives here rather than being restated at each call site.
 */
export function aiConsentIsValid(consent: AiConsentState | null | undefined, recipientRevision: number): boolean {
  if (!consent?.acceptedAt) return false
  if (consent.revokedAt) return false
  return consent.recipientRevision === recipientRevision
}
