import { expect, it } from 'vitest'
import { compareSecurityIdentity } from '../../apps/api/src/institutional/security-mapping.js'

it('uses only the active correction for a verified split conversion', () => {
  const events = [
    {
      id: 'split-original', kind: 'STOCK_SPLIT' as const, fromSecurityId: 'security-a', toSecurityId: 'security-a',
      effectiveOn: '2026-03-01', newSharesPerOldShare: '2', comparable: true,
    },
    {
      id: 'split-correction', supersedesEventId: 'split-original', kind: 'STOCK_SPLIT' as const,
      fromSecurityId: 'security-a', toSecurityId: 'security-a', effectiveOn: '2026-03-01',
      newSharesPerOldShare: '3', comparable: true,
    },
  ]

  expect(compareSecurityIdentity('security-a', 'security-a', '2026-02-28', '2026-03-02', events))
    .toEqual({ comparable: true, quantityFactor: '3', reason: 'VERIFIED_SPLIT_CONVERSION' })
})

it('compares share classes only through explicit conversion and rejects merger or spin-off links', () => {
  const classEvent = {
    id: 'class-link', kind: 'SHARE_CLASS_CONTINUITY' as const, fromSecurityId: 'class-a', toSecurityId: 'class-b',
    effectiveOn: '2026-01-01', newSharesPerOldShare: '1.25', comparable: true,
  }
  expect(compareSecurityIdentity('class-a', 'class-b', '2025-12-31', '2026-01-02', [classEvent]))
    .toEqual({ comparable: true, quantityFactor: '1.25', reason: 'VERIFIED_CLASS_CONVERSION' })
  expect(compareSecurityIdentity('class-a', 'class-c', '2025-12-31', '2026-01-02', [classEvent]))
    .toEqual({ comparable: false, quantityFactor: null, reason: 'NO_PROVEN_CONVERSION' })

  for (const kind of ['MERGER', 'SPIN_OFF'] as const) {
    expect(compareSecurityIdentity('class-a', 'class-b', '2025-12-31', '2026-01-02', [{
      kind, fromSecurityId: 'class-a', toSecurityId: 'class-b', effectiveOn: '2026-01-01',
      newSharesPerOldShare: null, comparable: false,
    }])).toEqual({ comparable: false, quantityFactor: null, reason: 'TRANSFORMATION_NON_COMPARABLE' })
  }
})
