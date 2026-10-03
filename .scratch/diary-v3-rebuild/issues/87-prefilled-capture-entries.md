# [87] Offer prefilled capture from holdings, watchlist and price alerts

Status: ready-for-agent
Execution: in-progress
Published: 2026-10-04

Type: AFK
User stories covered: US-015, US-016, US-017. Per-row capture entries are an enhancement to these stories.

## What to build

The capture-context handoff is already built and working: `buildCapturePath` produces a
capture path carrying a company symbol, `parseCaptureContext` consumes it, and `CaptureNotice`
explains the arrival. But `buildCapturePath` is constructed in exactly one place —
`apps/web/app/routes/company-market.tsx`. Everywhere else the user is looking at a position
and has a reaction, they must open capture cold and retype the symbol they were just reading.

Add a per-row capture entry to the pages where attention on a specific holding already is:

- `apps/web/app/routes/holdings.tsx`
- `apps/web/app/routes/watchlist.tsx`
- `apps/web/app/routes/price-alerts.tsx`

Each entry opens Quick Diary with that symbol already linked. This reuses the delivered
mechanism rather than adding one; the work is connecting existing machinery to three
surfaces, and the benefit is that the most frequently typed string in the product stops
being typed at all.

## Implementation notes

- Read the existing call site in `apps/web/app/routes/company-market.tsx` first and copy its
  context construction exactly. Do not invent a parameter shape: `buildCapturePath` and the
  path whitelist in `apps/web/app/capture-context.ts:152` and `:159` are authoritative.
- Use the existing `pen` icon from `apps/web/app/icons.tsx`, which already denotes capture in
  `apps/web/app/diary-navigation.tsx:52`.
- Each entry needs an accessible name including the symbol — a bare icon repeated down a list
  is indistinguishable to assistive technology. Follow the `aria-label` composition pattern in
  `apps/web/app/diary-navigation.tsx`.
- Rows are dense and already carry actions; the entry must not displace or crowd the existing
  per-row controls, and must stay reachable at 390×844. Define placement against DESIGN.md
  before implementing, per the shared slice rules.

## Acceptance criteria

- [ ] From a row on each of the three pages, the capture entry opens Quick Diary with that
      symbol present in the company-context field and `CaptureNotice` stating the source.
      Saving persists the company link, verified by reading the diary back through the real API.
- [ ] A symbol needing normalization or escaping travels correctly, and an invalid or unknown
      symbol produces the existing capture-issue notice rather than a silent wrong prefill or a
      crash.
- [ ] The three entries behave identically and share one implementation of the link; the same
      prefill rule is not re-expressed per page.
- [ ] Keyboard and screen-reader access work per row, each entry is distinguishable by name,
      and the existing per-row actions remain reachable at 390×844 and on desktop in all three
      locales.
- [ ] Existing Company-page handoff and `tests/unit/capture-context.test.ts` remain passing.
- [ ] Browser evidence covers one full path per page: open the list, launch capture from a row,
      save, and find the diary again with its company link intact.

Shared slice rules apply: [切片共同遵循](../ISSUE-BREAKDOWN.md#所有切片共同遵循).

## Blocked by

None. The capture-context mechanism it reuses is delivered.

## Comments

Published 2026-10-04 from a capture-cost review. Rated the most underweighted item in that
review: it removes typing rather than clicks, it places a capture trigger where the user's
attention already is, and its mechanism is already written and accepted — the cost is three
small connections, not a new capability.

### 2026-10-04 implementation (in-progress, pending browser evidence)

One shared component carries the entry on all three pages: `apps/web/app/capture-entry.tsx`
exports `CaptureEntry({ symbol })`, which calls `captureContextForCompanySymbol` then
`buildCapturePath('quick', context)`. No page re-expresses the prefill rule, no page builds a
query string, and `capture-context.ts` was not modified. A symbol that cannot be linked to a
diary (for example an index such as `^GSPC`, which fails the diary `stockSymbols` regex)
renders no entry rather than a control that would silently drop the prefill.

Placement:

- `holdings.tsx` — inside the symbol `th[scope=row]`, wrapped in a new `.holdings-symbol`
  inline-flex span (`ledger.css`). The holdings table is a 900px horizontal scroll region, so a
  trailing actions column would be unreachable at 390px; the symbol cell is the only cell always
  on screen. No new column, so the table's column model is untouched.
- `watchlist.tsx` — inside the existing `.watch-actions` group, immediately after
  "View research". Existing controls keep their relative order; the group already wraps and goes
  full width below 1023px, where `.watch-actions .button` lifts the target to 44px.
- `price-alerts.tsx` — first control in the row's existing `.actions` group, ahead of
  Edit/Monitor again/Delete, which keep their order.

Treatment is the same everywhere: `.button .quiet-button .button-compact` (transparent, action
ink, 36px — the committed quiet row-level control in DESIGN.md) holding the 16px `pen` icon,
with `aria-label="<label> · <SYMBOL>"` and a `title`. Copy (`記錄想法` / `记录想法` /
`Record a thought`) lives in the component, as in `diary-navigation.tsx`, because the label
belongs to the entry rather than to any one page; repeating it in three page copy modules would
be the duplication this ticket forbids.

Commands run:

- `./node_modules/.bin/tsc --noEmit` — pass, no output.
- `./node_modules/.bin/eslint apps/web/app/routes/holdings.tsx apps/web/app/routes/watchlist.tsx
  apps/web/app/routes/price-alerts.tsx apps/web/app/capture-entry.tsx` — pass, no output.
- `./node_modules/.bin/vitest run --exclude 'tests/integration/**' --exclude 'tests/e2e/**'` —
  120 test files passed, 1051 tests passed, 0 failed. `tests/unit/capture-context.test.ts` was
  not modified and still passes.

No unit test was added: every existing `tests/unit` file is pure logic (none renders web
components), the only logic here is already covered by `tests/unit/capture-context.test.ts`,
and a new shared test file was outside this ticket's owned paths.

Still needs browser evidence (not run here — e2e is the integrator's step):

- One full path per page: open the list, launch capture from a row, save, read the diary back
  and confirm the company link persisted.
- `CaptureNotice` wording on arrival from each page.
- Keyboard and screen-reader pass per row, and that existing per-row controls stay reachable at
  390×844 and on desktop in all three locales.

Open design questions for a ruling:

- Holdings row height grows to the 36px compact-control floor (roughly +20px per row at desktop
  padding). Accepted as in-spec density for a working surface, but it is a visible change to the
  table.
- The capture entry sits inside `th[scope=row]` on holdings, so name-from-content makes the row
  header announce "AAPL 記錄想法 · AAPL" for every cell in that row. The alternative is a
  dedicated second column, which would change the table's row layout — deliberately not decided
  here.
- The entry is icon-only beside text buttons in the watchlist and price-reminder action groups.
  Quiet styling keeps it from reading as a broken text button, but it is the first icon-only
  row control in those groups.
