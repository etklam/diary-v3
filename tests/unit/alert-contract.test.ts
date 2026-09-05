import { expect, it } from 'vitest'
import { createOpenApiDocument } from '@diary/contracts/openapi'
import { alertCreateRequestSchema, alertCreateRequestWireOpenApiSchema, alertCreateRequestWireSchema } from '@diary/contracts/alerts'

it('keeps canonical alerts strict while normalizing the frozen snake_case aliases', () => {
  const canonical = {
    diaryId: '12',
    message: 'Review the thesis',
    triggerAt: '2026-03-02T09:00:00.000Z',
    recurringMode: 'WEEK' as const,
  }
  expect(alertCreateRequestSchema.parse(canonical)).toEqual(canonical)

  expect(alertCreateRequestWireSchema.parse({
    diary_id: 12,
    message: 'Review the thesis',
    trigger_at: new Date('2026-03-02T09:00:00.000Z'),
    recurring_mode: 'MONTH',
    ignored: true,
  })).toEqual({
    diaryId: '12',
    message: 'Review the thesis',
    triggerAt: '2026-03-02T09:00:00.000Z',
    recurringMode: 'MONTH',
  })
})

it('preserves snake_case precedence and nullish fallback from the frozen handler', () => {
  const validTrigger = '2026-03-02T09:00:00.000Z'
  expect(alertCreateRequestWireSchema.safeParse({
    diary_id: 'bad-id',
    diaryId: '12',
    message: 'Snake value wins',
    trigger_at: 'not-a-date',
    triggerAt: validTrigger,
    recurring_mode: 'WEEK',
    recurringMode: 'MONTH',
  }).success).toBe(false)

  expect(alertCreateRequestWireSchema.parse({
    diary_id: null,
    diaryId: '12',
    message: 'Camel fallback',
    trigger_at: null,
    triggerAt: validTrigger,
    recurring_mode: null,
    recurringMode: 'MONTH',
  })).toEqual({ diaryId: '12', message: 'Camel fallback', triggerAt: validTrigger, recurringMode: 'MONTH' })

  expect(alertCreateRequestWireSchema.parse({ diary_id: '12', message: 'Default now' })).toEqual({
    diaryId: '12',
    message: 'Default now',
    triggerAt: undefined,
    recurringMode: undefined,
  })
  expect(alertCreateRequestWireSchema.safeParse({ diary_id: '12', message: 'Null without fallback', triggerAt: null, recurring_mode: null }).success).toBe(false)
})

it('documents canonical and retained alias bodies in the OpenAPI contract', () => {
  const mixed = {
    diaryId: null,
    diary_id: '12',
    message: 'Mixed aliases',
    triggerAt: null,
    trigger_at: '2026-03-02T09:00:00.000Z',
    recurringMode: null,
    recurring_mode: 'WEEK',
  }
  expect(alertCreateRequestWireOpenApiSchema.safeParse(mixed).success).toBe(true)
  expect(alertCreateRequestWireOpenApiSchema.safeParse({ diaryId: '12', message: 'Default trigger' }).success).toBe(true)
  expect(alertCreateRequestWireOpenApiSchema.safeParse({ diary_id: '12', message: 'Null fallback', trigger_at: null, triggerAt: '2026-03-02T09:00:00.000Z', recurring_mode: null, recurringMode: 'WEEK' }).success).toBe(true)
  expect(alertCreateRequestWireOpenApiSchema.safeParse({ diary_id: '12', message: 'Null without fallback', triggerAt: null, recurring_mode: null }).success).toBe(false)
  expect(alertCreateRequestWireOpenApiSchema.safeParse({ message: 'Missing Diary' }).success).toBe(false)
  expect(alertCreateRequestWireOpenApiSchema.safeParse({ diaryId: '12', message: 'Bad mode', recurring_mode: 'YEAR' }).success).toBe(false)
  expect(alertCreateRequestWireSchema.safeParse({ diary_id: '12', message: 'Bad mode', recurring_mode: 'YEAR' }).success).toBe(false)

  const document = createOpenApiDocument()
  const body = document.paths?.['/api/alerts']?.post?.requestBody
  const schema = body && 'content' in body ? body.content?.['application/json']?.schema : undefined
  expect(schema && 'allOf' in schema ? schema.allOf : undefined).toHaveLength(4)
  const serialized = JSON.stringify(schema)
  for (const field of ['diaryId', 'diary_id', 'triggerAt', 'trigger_at', 'recurringMode', 'recurring_mode']) {
    expect(serialized).toContain(field)
  }
})
