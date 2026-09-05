import { expect, it } from 'vitest'
import { writeDisciplineSchema, reorderDisciplinesSchema, disciplineResponseSchema } from '@diary/contracts/discipline'
it('trims content, enforces source length and rejects duplicate or unsafe reorder values', () => {
  expect(writeDisciplineSchema.parse({ content: '  原則  ' })).toEqual({ content: '原則' })
  for (const content of ['', '  ', 'x'.repeat(256)]) expect(writeDisciplineSchema.safeParse({ content }).success).toBe(false)
  expect(writeDisciplineSchema.parse({ content: 'x'.repeat(255) }).content).toHaveLength(255)
  expect(reorderDisciplinesSchema.parse([{ id: '9007199254740993', order: -1 }])).toHaveLength(1)
  for (const rows of [[], [{ id: '1', order: 0 }, { id: '1', order: 1 }], [{ id: '1', order: 2147483648 }], [{ id: '1', order: 0.5 }]]) expect(reorderDisciplinesSchema.safeParse(rows).success).toBe(false)
  expect(disciplineResponseSchema.safeParse({ id: '1', content: '原則', order: 0, createdAt: '2026-01-01T00:00:00Z', userId: '2' }).success).toBe(false)
})
