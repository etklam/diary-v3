import { tradePlanInputSchema } from '@diary/contracts/trade-plan'

export const tradePlanFields = [
  'symbol', 'status', 'setupType', 'entryPrice', 'entryZoneLow', 'entryZoneHigh',
  'stopLoss', 'targetPrice', 'maxPositionSize', 'diaryId', 'invalidationCondition', 'notes',
] as const

export type TradePlanField = typeof tradePlanFields[number]
export type TradePlanForm = Record<TradePlanField, string>

/** Keep draft comparison aligned with the server's canonical decimal contract. */
export function normalizeTradePlanForm(form: TradePlanForm) {
  const input = Object.fromEntries(tradePlanFields.map(key => [
    key,
    form[key] === '' && key !== 'symbol' && key !== 'status' ? null : form[key],
  ]))
  const parsed = tradePlanInputSchema.safeParse(input)
  if (!parsed.success) return { valid: false as const, value: input }
  return { valid: true as const, value: parsed.data }
}

export function sameTradePlanForm(left: TradePlanForm, right: TradePlanForm) {
  const a = normalizeTradePlanForm(left)
  const b = normalizeTradePlanForm(right)
  return a.valid && b.valid
    ? JSON.stringify(a.value) === JSON.stringify(b.value)
    : tradePlanFields.every(key => left[key] === right[key])
}

export function tradePlanDraftKey(accountId: string | null, planId: string | undefined) {
  if (!accountId) return null
  return `trade-plan-draft:${accountId}:${planId ?? 'new'}`
}

export function formFromTradePlan(plan?: Partial<Record<TradePlanField, string | null>>): TradePlanForm {
  return Object.fromEntries(tradePlanFields.map(key => [
    key,
    plan?.[key] ?? (key === 'status' ? 'draft' : ''),
  ])) as TradePlanForm
}
