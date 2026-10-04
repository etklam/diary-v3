# [89] Suggest company symbols the account already tracks

Status: accepted
Execution: done
Published: 2026-10-04

Type: AFK
User stories covered: US-015, US-016, US-017. Symbol suggestions are an enhancement to these stories.

## What to build

`apps/web/app/company-context-input.tsx:6` is a bare comma-separated text field with
`autoComplete="off"`. The author must recall and spell each symbol from memory, even though
the account's holdings, watchlist and price alerts are already in the database.

Offer the account's own symbols as suggestions on that input, so two characters select
instead of recall. The field stays free text — an unlisted symbol must remain enterable,
because a diary may legitimately reference something not yet held or watched.

Deliver this as a `<datalist>`-backed suggestion list, not a custom combobox. The input is
shared by Quick Diary and the full editor, so a native control keeps keyboard and
assistive-technology behavior correct in one change across both.

## Implementation notes

- `apps/web/app/company-context-input.tsx` is consumed by both
  `apps/web/app/quick-composer.tsx` and `apps/web/app/diary-editor.tsx`. Change it once;
  do not fork a second input.
- Source suggestions from the endpoints the existing pages already consume — see
  `apps/web/app/routes/holdings.tsx` and `apps/web/app/routes/watchlist.tsx` for the current
  reads. Prefer reusing an existing response over adding an endpoint; if one aggregate read is
  genuinely needed, say so and extend contracts and generated client/OpenAPI consistently.
- Suggestions are a convenience and must never block writing. Capture is reachable before and
  during the fetch, and a failed or empty fetch leaves an ordinary usable text field with no
  error surfaced into the capture path.
- Preserve the existing `onBlur` normalization (`company-context-input.tsx:6`), the 10-symbol
  limit, and the validation message. Do not move validation into the suggestion layer.
- Suggestions must stay account-scoped. They are private holdings data and must not leak
  across accounts or survive sign-out, consistent with the rules applied to recent tags in
  [70](70-recent-diary-tags.md).

## Acceptance criteria

- [ ] On both Quick Diary and the full editor, the field suggests symbols drawn from the
      signed-in account's own holdings and watchlist, and selecting one produces the same
      canonical value as typing it.
- [ ] A symbol absent from the suggestions is still enterable and saves normally. The
      10-symbol limit, blur normalization and existing invalid-input message are unchanged.
- [ ] A slow, failed or empty suggestion read never blocks or delays writing and never raises
      an error in the capture path.
- [ ] Suggestions are account-scoped: switching accounts or signing out cannot reveal a
      previous account's symbols.
- [ ] Keyboard and screen-reader access work for selection in all three locales, and the
      existing hint text remains associated with the input.
- [ ] Browser evidence saves a diary using a suggested symbol and a manually typed symbol, and
      reads both back through the real API.

Shared slice rules apply: [切片共同遵循](../ISSUE-BREAKDOWN.md#所有切片共同遵循).

## Blocked by

None.

## Comments

Published 2026-10-04 from a capture-cost review. Scheduled in that review's second batch:
the benefit applies only to diaries that link a company, and [87](87-prefilled-capture-entries.md)
already removes the typing for the most common of those cases by prefilling from a row. Kept
to a native `datalist` deliberately — the review rated a full custom combobox as not worth its
accessibility cost here.

2026-10-04 implementation (`apps/web/app/company-context-input.tsx` only; no call site, contract or
API change).

Endpoints reused, both already in the generated client and both owner-scoped on the server:

- `GET /api/stocks/holdings` — `apps/api/src/portfolio-routes.ts:32` calls
  `getHoldings(db, BigInt(session.id))`. Cross-account isolation is already covered by
  `tests/integration/buy-ledger.test.ts:115-120` (one owner reads `[]` while another owner reads
  its own single holding).
- `GET /api/stocks/watchlist` — `apps/api/src/watchlist.ts:86` filters on
  `eq(stockWatchlists.userId, userId)`. The `x-watchlist-features: management-v1` header is
  deliberately omitted; only `stock.symbol` is read.

Chose `/api/stocks/holdings` over the `/api/portfolio/ledger` read used by `routes/holdings.tsx`:
it is an existing contract route that returns only the position rows, instead of pulling exposure,
valuation and realized-trade payloads for a suggestion list.

Design decisions:

- The read is lazy — it fires on the input's first focus, so the collapsed Quick Diary
  `<details class="quick-options">` costs nothing until the author opens it and reaches the field.
- Both requests are issued with `Promise.all` where each already has `.catch(() => null)`, the whole
  async body is wrapped in `try/catch`, and there is no error, pending or disabled state anywhere in
  the component. A slow, failed, aborted or malformed read simply leaves `symbols` empty and the
  field an ordinary text input. Nothing in the suggestion path can reach `FailureNotice` or the
  submit path.
- Account scoping: suggestions are never persisted. The in-flight read is dropped if
  `getSessionRevision()` moved, and the stored result is only returned while
  `session.authenticated === true && loaded.revision === session.revision`, so a sign-out or account
  switch (both of which bump the revision in `session.ts`) empties the list immediately. `session.ts`
  also already lists `/api/stocks/holdings` and `/api/stocks/watchlist` as private paths, so a
  locally signed-out tab gets a synthetic 401 rather than a cookie refill.
- A native `datalist` matches against the entire field value, so each option carries the symbols
  already typed (`head + candidate`) and `head` preserves the author's own spacing. Options stop
  being offered once `MAX_DIARY_STOCK_SYMBOLS` symbols precede the cursor, and symbols already
  entered are filtered out.
- Unchanged: free text, `autoComplete="off"`, the `onBlur` normalization, `parseCompanyContext`, the
  10-symbol limit, `aria-invalid`, the `aria-describedby` hint association and the `invalid` message
  string. A new `suggestions` sentence was added to `companyContextCopy` in all three locales and is
  appended inside the same existing hint paragraph, only when suggestions are actually available.

Commands run from the repo root:

- `./node_modules/.bin/tsc --noEmit` — pass, no output.
- `./node_modules/.bin/eslint apps/web/app/company-context-input.tsx` — pass, no findings.
- `./node_modules/.bin/vitest run --exclude 'tests/integration/**' --exclude 'tests/e2e/**'` —
  pass, 120 test files / 1051 tests, 0 failures.

Still needs browser evidence before this can be marked done:

- Save a diary from Quick Diary and from the full editor using a suggested symbol, and a second one
  using a manually typed symbol absent from holdings and watchlist; read both back through the real
  API.
- Keyboard and screen-reader selection in `zh-TW`, `zh-CN` and `en`, including that the hint stays
  associated with the input.
- Account scoping: sign out and sign in as a second account, confirm the first account's symbols are
  not offered.
- Confirm the composite multi-symbol options filter as expected in the browsers under test; native
  `datalist` filtering differs between engines (prefix versus substring), which is why the option
  head preserves the author's raw text.

## Execution record

Shipped in `765e38a`; the ticket's Execution line was left stale and is reconciled here on 2026-10-04.
