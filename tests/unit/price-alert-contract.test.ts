import { expect, it } from 'vitest'
import { createPriceAlertRequestSchema, updatePriceAlertRequestSchema, toPriceAlertResponse } from '@diary/contracts/price-alerts'
it('preserves decimal thresholds and validates source precision/type boundaries', () => {
  const input = { symbol: ' aapl ', type: 'PRICE_ABOVE', threshold: '999999.9999' }
  expect(createPriceAlertRequestSchema.parse(input)).toEqual({ ...input, symbol: 'AAPL' })
  expect(createPriceAlertRequestSchema.parse({ ...input, threshold: 12.5 }).threshold).toBe('12.5')
  for (const threshold of ['1000000', '1.00001', '1e3', '', '-1', NaN, Infinity]) expect(createPriceAlertRequestSchema.safeParse({ ...input, threshold }).success).toBe(false)
  expect(createPriceAlertRequestSchema.parse({ ...input, type: 'CHANGE_PERCENT', threshold: '-5' }).threshold).toBe('-5')
  expect(createPriceAlertRequestSchema.parse({ symbol: 'AAPL', type: 'MOVING_AVG', threshold: '20' })).toMatchObject({ threshold: '20' })
  expect(createPriceAlertRequestSchema.parse({ symbol: 'AAPL', type: 'MOVING_AVG', threshold: '50', movingAverageDirection: 'below' })).toMatchObject({ threshold: '50', movingAverageDirection: 'below' })
  expect(createPriceAlertRequestSchema.safeParse({ symbol: 'AAPL', type: 'MOVING_AVG', threshold: '21' }).success).toBe(false)
  expect(createPriceAlertRequestSchema.safeParse({ symbol: 'AAPL', type: 'PRICE_ABOVE', threshold: '20', movingAverageDirection: 'above' }).success).toBe(false)
})
it('requires coherent trigger state updates while allowing ordinary edits without a reset', () => {
  expect(updatePriceAlertRequestSchema.parse({ message: 'Changed' })).toEqual({ message: 'Changed' })
  expect(updatePriceAlertRequestSchema.parse({ isTriggered: false, triggeredAt: null })).toEqual({ isTriggered: false, triggeredAt: null })
  for (const body of [{}, { isTriggered: true }, { triggeredAt: null }, { isTriggered: true, triggeredAt: null }, { isTriggered: false, triggeredAt: '2026-01-01T00:00:00Z' }]) expect(updatePriceAlertRequestSchema.safeParse(body).success).toBe(false)
})
it('serializes IDs and thresholds without leaking owner identity', () => {
  const timestamp = new Date('2026-01-01T00:00:00.123Z')
  const result = toPriceAlertResponse({ id: 9007199254740993n, userId: 4n, symbol: 'AAPL', type: 'PRICE_BELOW', threshold: '0.0001', message: 'Synthetic', isTriggered: false, triggeredAt: null, createdAt: timestamp, updatedAt: timestamp })
  expect(result).toMatchObject({ id: '9007199254740993', threshold: '0.0001', movingAverageDirection: null, createdAt: timestamp.toISOString() })
  expect(toPriceAlertResponse({ id: 1n, symbol: 'AAPL', type: 'MOVING_AVG', threshold: '20', movingAverageDirection: null, message: 'Synthetic', isTriggered: false, triggeredAt: null, createdAt: timestamp, updatedAt: timestamp })).toMatchObject({ movingAverageDirection: 'above' })
  expect(result).not.toHaveProperty('userId')
})
