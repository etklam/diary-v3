import { sql } from 'drizzle-orm'
import type { Database } from '@diary/db'

type Executor = Pick<Database, 'execute'>
export interface AiBudgetReservation { month: string; reservationCostCents: number }
function validateReservation(input: AiBudgetReservation) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(input.month) || !Number.isSafeInteger(input.reservationCostCents) || input.reservationCostCents <= 0 || input.reservationCostCents > 2_147_483_647) throw new Error('AI_INVALID_BUDGET_RESERVATION')
}

/** Call within a transaction after the global AI lock, before any owner lock. */
export async function reserveGlobalAiBudget(tx: Executor, input: AiBudgetReservation & { monthlyBudgetCents: number }): Promise<boolean> {
  validateReservation(input)
  if (!Number.isSafeInteger(input.monthlyBudgetCents) || input.monthlyBudgetCents < 0 || input.monthlyBudgetCents > 2_147_483_647) throw new Error('AI_INVALID_BUDGET_RESERVATION')
  if (input.monthlyBudgetCents < input.reservationCostCents) return false
  await tx.execute(sql`insert into ai_usage_bucket (scope, user_id, bucket_month)
    values ('global', null, ${input.month}::date) on conflict do nothing`)
  const result = await tx.execute(sql`update ai_usage_bucket
    set reserved = reserved + 1, reserved_cost_cents = reserved_cost_cents + ${input.reservationCostCents}, updated_at = now()
    where scope = 'global' and user_id is null and bucket_month = ${input.month}::date
      and coalesce(estimated_cost_cents, 0)::bigint + reserved_cost_cents::bigint + ${input.reservationCostCents} <= ${input.monthlyBudgetCents}
    returning id`)
  return result.rows.length === 1
}

/** The winning queued cancellation releases its original monetary reservation exactly once. */
export async function releaseGlobalAiBudget(tx: Executor, input: AiBudgetReservation): Promise<void> {
  validateReservation(input)
  const result = await tx.execute(sql`update ai_usage_bucket
    set reserved = reserved - 1, reserved_cost_cents = reserved_cost_cents - ${input.reservationCostCents}, released = released + 1, updated_at = now()
    where scope = 'global' and user_id is null and bucket_month = ${input.month}::date
      and reserved > 0 and reserved_cost_cents >= ${input.reservationCostCents} returning id`)
  if (result.rows.length !== 1) throw new Error('AI_BUDGET_RESERVATION_MISSING')
}

/** Commit the conservative cost at dispatch admission, before opening a provider connection. */
export async function consumeGlobalAiBudget(tx: Executor, input: AiBudgetReservation): Promise<void> {
  validateReservation(input)
  const result = await tx.execute(sql`update ai_usage_bucket
    set reserved = reserved - 1, reserved_cost_cents = reserved_cost_cents - ${input.reservationCostCents},
        consumed = consumed + 1, estimated_cost_cents = coalesce(estimated_cost_cents, 0) + ${input.reservationCostCents}, updated_at = now()
    where scope = 'global' and user_id is null and bucket_month = ${input.month}::date
      and reserved > 0 and reserved_cost_cents >= ${input.reservationCostCents} returning id`)
  if (result.rows.length !== 1) throw new Error('AI_BUDGET_RESERVATION_MISSING')
}

/** Call once after an attempt-state CAS; only known cost adjusts the committed bound. */
export async function settleGlobalAiBudget(tx: Executor, input: AiBudgetReservation & { actualCostCents: number | null; inputTokens: number | null; outputTokens: number | null }): Promise<void> {
  validateReservation(input)
  for (const value of [input.actualCostCents, input.inputTokens, input.outputTokens]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647)) throw new Error('AI_INVALID_USAGE')
  }
  const adjustment = input.actualCostCents === null ? 0 : input.actualCostCents - input.reservationCostCents
  const result = await tx.execute(sql`update ai_usage_bucket
    set estimated_cost_cents = coalesce(estimated_cost_cents, 0) + ${adjustment},
        unknown = unknown + ${input.actualCostCents === null || input.inputTokens === null || input.outputTokens === null ? 1 : 0},
        input_tokens = case when ${input.inputTokens}::integer is null then input_tokens else coalesce(input_tokens, 0) + ${input.inputTokens ?? 0} end,
        output_tokens = case when ${input.outputTokens}::integer is null then output_tokens else coalesce(output_tokens, 0) + ${input.outputTokens ?? 0} end,
        updated_at = now()
    where scope = 'global' and user_id is null and bucket_month = ${input.month}::date and consumed > 0 returning id`)
  if (result.rows.length !== 1) throw new Error('AI_BUDGET_RESERVATION_MISSING')
}
