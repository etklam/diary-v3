import { z } from 'zod'

export const MAX_SERIALIZED_ID = '9223372036854775807'
export const serializedIdSchema = z.string()
  .regex(/^[1-9]\d*$/, 'ID must be a positive decimal string')
  .max(19, 'ID exceeds the signed 64-bit range')
  .refine(
    (value) => value.length < MAX_SERIALIZED_ID.length || value <= MAX_SERIALIZED_ID,
    'ID exceeds the signed 64-bit range',
  )

export const calendarDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year!, month! - 1, day!))
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month! - 1
      && date.getUTCDate() === day
  }, 'Date must be a valid calendar date')

export const utcInstantSchema = z.iso.datetime({ offset: false })
  .refine((value) => value.endsWith('Z'), 'Instant must use UTC Z notation')
