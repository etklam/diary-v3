import { z } from 'zod'
import { calendarDateSchema } from './common.js'

export const holidayCountryCodeSchema = z.string()
  .regex(/^[A-Za-z]{2}$/, 'countryCode must be two ASCII letters')
  .transform(value => value.toUpperCase())

export const holidayQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  countryCode: holidayCountryCodeSchema,
}).strict()

export const holidaySchema = z.object({
  date: calendarDateSchema,
  localName: z.string().min(1).max(1_000),
  name: z.string().min(1).max(1_000),
  countryCode: holidayCountryCodeSchema,
  fixed: z.boolean().optional(),
  global: z.boolean().optional(),
  counties: z.array(z.string().min(1).max(32)).max(100).nullable().optional(),
  launchYear: z.number().int().min(0).max(2100).nullable().optional(),
  types: z.array(z.string().min(1).max(64)).max(20).optional(),
}).strict()

export const holidayResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(holidaySchema).max(500),
}).strict()

export type HolidayQuery = z.output<typeof holidayQuerySchema>
export type Holiday = z.output<typeof holidaySchema>
export type HolidayResponse = z.output<typeof holidayResponseSchema>
