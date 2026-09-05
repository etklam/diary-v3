# ADR 0010: Trade Plan storage and owner invariants

## Decision

Trade Plan prices use PostgreSQL fixed precision decimals: `numeric(18,6)` for price and zone fields, and `numeric(18,2)` for maximum position size. The request contract normalizes decimal strings and rejects values that PostgreSQL would otherwise round. Responses use canonical decimal strings without insignificant zeroes.

Every API query scopes a plan by `user_id`. A linked Diary must belong to the same user. The database keeps the ordinary `diary_id` foreign key with `ON DELETE SET NULL`, and a trigger rejects inserts or owner/link updates whose `(diary_id, user_id)` pair does not identify one Diary. This preserves automatic unlinking when a Diary is deleted while enforcing the owner invariant below the API.

Partial updates lock and re-read the Trade Plan before validation. Entry-zone ordering is checked against the merged stored and requested values with decimal-string comparison. This corrects two legacy defects: a one-sided update could bypass the request-only check, and conversion through JavaScript `Number` could lose decimal precision.

Diary detail and review responses include compact linked plans ordered by ID. Diary lists include a status summary and load plans for the current page in one query.

## Public behavior retained

- Statuses are `draft`, `active`, `closed`, and `cancelled`.
- Create accepts an omitted status as `draft`; partial update leaves an omitted status unchanged.
- List defaults to `updatedAt-desc`, supports `createdAt-desc` and `symbol-asc`, and uses ID as a stable tie breaker.
- A missing or foreign Trade Plan returns the same 404. A missing or foreign linked Diary also returns the same Diary 404.
- Deleting a Diary unlinks its plans; deleting a user deletes their plans.
