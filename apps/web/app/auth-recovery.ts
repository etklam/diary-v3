/**
 * Whether the sign-in page offers a password recovery path.
 *
 * Recovery exists in two forms and the page must offer the link if either is
 * configured: the account-email reset flow (`passwordRecoveryAvailable`), and
 * the operator's own support route, which `/forgot-password` presents as "Get
 * sign-in help" when email delivery is off. Only when neither exists does the
 * link lead to a page that can do nothing for the reader — and then it is not
 * offered at all, rather than offered and marked, because a control that
 * announces it does not work is still a control.
 */
export function recoveryPathOffered(
  capability: { passwordRecoveryAvailable: boolean } | null,
  supportUrl: string | null | undefined,
) {
  return Boolean(supportUrl) || capability?.passwordRecoveryAvailable === true;
}
