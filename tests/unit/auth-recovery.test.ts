import { describe, expect, it } from 'vitest';
import { recoveryPathOffered } from '../../apps/web/app/auth-recovery';

// Ticket 109 ruling: the sign-in page offers recovery when a recovery path
// exists in either form. The support route is the one an operator configures
// when account email is off, and `ui-ux-audit-regressions.spec.ts` pins that it
// stays discoverable; the case this file owns is the one an end-to-end run
// cannot reach, because the harness always configures a support route.
describe('sign-in recovery link', () => {
  it('is offered when account email can deliver a reset', () => {
    expect(recoveryPathOffered({ passwordRecoveryAvailable: true }, null)).toBe(true);
  });

  it('is offered when a support route exists even though email recovery is off', () => {
    expect(recoveryPathOffered({ passwordRecoveryAvailable: false }, 'https://support.example.test/account-recovery')).toBe(true);
  });

  it('is not offered when neither path exists, because the destination can do nothing', () => {
    expect(recoveryPathOffered({ passwordRecoveryAvailable: false }, null)).toBe(false);
    expect(recoveryPathOffered({ passwordRecoveryAvailable: false }, '')).toBe(false);
  });

  it('is withheld while capabilities are unknown and no support route is configured', () => {
    expect(recoveryPathOffered(null, null)).toBe(false);
    expect(recoveryPathOffered(null, 'https://support.example.test/account-recovery')).toBe(true);
  });
});
