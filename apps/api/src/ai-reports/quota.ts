import { sql } from 'drizzle-orm'
import type { Database } from '@diary/db'

type SqlExecutor = Pick<Database, 'execute'>

export interface QuotaReservation {
  userId: bigint
  bucketMonth: string
  reservationCostCents: number
}

function ensureBucket(tx: SqlExecutor, userId: bigint, bucketMonth: string) {
  return tx.execute(sql`
    insert into ai_usage_bucket (scope, user_id, bucket_month)
    values ('user', ${userId}, ${bucketMonth}::date)
    on conflict (scope, user_id, bucket_month) do nothing
  `)
}

/** Reserve one request under the owner quota. The update predicate is the concurrency gate. */
export async function reserveUserQuota(
  tx: SqlExecutor,
  input: { userId: bigint; bucketMonth: string; monthlyQuota: number },
): Promise<QuotaReservation | null> {
  await ensureBucket(tx, input.userId, input.bucketMonth)
  const result = await tx.execute(sql`
    update ai_usage_bucket
    set reserved = reserved + 1, updated_at = now()
    where scope = 'user'
      and user_id = ${input.userId}
      and bucket_month = ${input.bucketMonth}::date
      and reserved + consumed < ${input.monthlyQuota}
    returning user_id, bucket_month::text as bucket_month
  `)
  if (result.rows.length === 0) return null
  return { userId: input.userId, bucketMonth: String((result.rows[0] as { bucket_month: string }).bucket_month), reservationCostCents: 0 }
}

export async function releaseUserQuota(tx: SqlExecutor, reservation: QuotaReservation) {
  await tx.execute(sql`
    update ai_usage_bucket
    set reserved = greatest(0, reserved - 1), released = released + 1, updated_at = now()
    where scope = 'user' and user_id = ${reservation.userId} and bucket_month = ${reservation.bucketMonth}::date
  `)
}

export async function consumeUserQuota(
  tx: SqlExecutor,
  reservation: QuotaReservation,
  usage: { inputTokens?: number | null; outputTokens?: number | null; estimatedCostCents?: number | null; unknown?: boolean },
) {
  await tx.execute(sql`
    update ai_usage_bucket
    set reserved = greatest(0, reserved - 1),
        consumed = consumed + 1,
        unknown = unknown + ${usage.unknown ? 1 : 0},
        input_tokens = case when ${usage.inputTokens ?? null}::integer is null then input_tokens else coalesce(input_tokens, 0) + ${usage.inputTokens ?? 0} end,
        output_tokens = case when ${usage.outputTokens ?? null}::integer is null then output_tokens else coalesce(output_tokens, 0) + ${usage.outputTokens ?? 0} end,
        estimated_cost_cents = case when ${usage.estimatedCostCents ?? null}::integer is null then estimated_cost_cents else coalesce(estimated_cost_cents, 0) + ${usage.estimatedCostCents ?? 0} end,
        updated_at = now()
    where scope = 'user' and user_id = ${reservation.userId} and bucket_month = ${reservation.bucketMonth}::date
  `)
}

/** Add provider accounting after admission without consuming the request twice. */
export async function recordUserQuotaUsage(
  tx: SqlExecutor,
  reservation: QuotaReservation,
  usage: { inputTokens?: number | null; outputTokens?: number | null; estimatedCostCents?: number | null; unknown?: boolean },
) {
  await tx.execute(sql`
    update ai_usage_bucket
    set unknown = unknown + ${usage.unknown ? 1 : 0},
        input_tokens = case when ${usage.inputTokens ?? null}::integer is null then input_tokens else coalesce(input_tokens, 0) + ${usage.inputTokens ?? 0} end,
        output_tokens = case when ${usage.outputTokens ?? null}::integer is null then output_tokens else coalesce(output_tokens, 0) + ${usage.outputTokens ?? 0} end,
        estimated_cost_cents = case when ${usage.estimatedCostCents ?? null}::integer is null then estimated_cost_cents else coalesce(estimated_cost_cents, 0) + ${usage.estimatedCostCents ?? 0} end,
        updated_at = now()
    where scope = 'user' and user_id = ${reservation.userId} and bucket_month = ${reservation.bucketMonth}::date
  `)
}

export async function readUserQuota(tx: SqlExecutor, input: { userId: bigint; bucketMonth: string; monthlyQuota: number }) {
  await ensureBucket(tx, input.userId, input.bucketMonth)
  const result = await tx.execute(sql`
    select reserved, consumed, released, unknown
    from ai_usage_bucket
    where scope = 'user' and user_id = ${input.userId} and bucket_month = ${input.bucketMonth}::date
  `)
  const row = result.rows[0] as { reserved: number; consumed: number; released: number; unknown: number } | undefined
  const reserved = Number(row?.reserved ?? 0)
  const consumed = Number(row?.consumed ?? 0)
  return { monthlyQuota: input.monthlyQuota, reserved, consumed, released: Number(row?.released ?? 0), unknown: Number(row?.unknown ?? 0), remaining: Math.max(0, input.monthlyQuota - reserved - consumed) }
}
