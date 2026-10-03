# Research to Diary context handoff

Status: ready-for-agent
Execution: done

## Scope

Implement the bounded user specification supplied on 2026-09-12 against verified latest local/remote HEAD `2293369a7bf30795c6e94f81ef5219c199a830cd`. Company research opens the existing Quick or Full Diary editor with a validated symbol and company source, preserves draft/auth/date semantics, explicitly saves and reads authoritative results, and offers a canonical company return path.

Direction: `docs/design/research-diary-handoff-brief.md`. Logic/tests: Luna. UI: Claude Code `sonnet` mapped to `glm-5.3-flash[1M]`, subject to the explicit external-source transfer approval requested after automatic approval review rejected the first invocation. Astra integrates/accepts; Sol reviews integrity. Parent PRD remains unchanged.

## Acceptance

- [x] One typed parser/builder, strict symbols/source/date/encoding/duplicate-key rules, canonical safe auth returns.
- [x] Existing Quick and Full editors; draft Restore wins over incoming defaults, Discard initializes incoming source, same-route navigation does not silently clear input.
- [x] Automatic 401 retains account-scoped Quick writing; explicit/cross-tab sign-out clears and suppresses writeback; another account cannot restore it.
- [x] Explicit create/append, no transparent append replay, protected uncertain writes; server read confirms final symbols and body.
- [x] Append keeps original record and related data, unions symbols within the existing limit, and rejects overflow atomically.
- [x] Login/registration preserve context without writes. Public Company data stays public, supported capture survives quote failure/staleness.
- [x] Saved Diary has an explicit canonical source-return link only when valid source exists.
- [x] Fresh unit/integration/browser/build/release checks; desktop/mobile/dark screenshots inspected; no production deployment.

## Fresh baseline

2026-09-12: unit suite 68 files / 602 tests; affected PostgreSQL suite 5 files / 23 tests; affected E2E 22 tests. All passed before product edits. Prior phase reports are historical context only.

## Independent acceptance evidence — 2026-09-12

- Luna logic gates: 71 files / 615 unit tests passed after the final draft-persistence guard; typecheck, lint, contracts drift, and build passed.
- Handoff unit cases: 33 passed, including strict capture parsing, session replay opt-out, draft uncertainty serialization, and aggregate symbol handling.
- Disposable PostgreSQL diary aggregate suite: 6 passed. The append case completed a review and preserved title/date/body, unioned symbols, transactions, alerts, and review reflection fields. The overflow case rejected the eleventh symbol with `SYS_VALIDATION_ERROR` and preserved the complete aggregate.
- Affected PostgreSQL suites: 27 passed.
- Affected browser regression: 21 passed across Quick diary, response loss, library/session recovery, web session, and editor UX.
- Focused browser safety: delayed double-submit/failure/uncertain append 1 passed; late aborted append after cross-tab logout 1 passed; contextual 401 with exact source/date return, manual login, Restore, save, and authoritative GET 1 passed.

The full Company CTA/context notice/Full capture flow, built-artifact flow, and desktop/mobile/dark screenshot inspection remain pending the external GLM UI handoff. The acceptance record is `docs/design/research-diary-handoff-acceptance.md`.

## Audit corrections

The existing append transaction preserves ID/title/body and related records, but validates only incoming symbols, not the final union. The shared web client transparently retries mutation 401s, and Quick append has no uncertain-result lock. These directly block the requested handoff safety and may receive narrow corrections with regression evidence; no schema change is planned.

## Completion reconciliation — 2026-09-19

The preceding pending statements are historical. Commit `c21442cb` is an ancestor of the current checkout and includes the Company CTA, context notice, and saved-source return UI. The existing acceptance record documents the completed 18-case browser suite, four built-artifact cases, and inspected desktop/mobile/dark screenshots. A fresh `npx playwright test tests/e2e/research-diary-handoff.spec.ts --reporter=list` passed all 18 cases in 1.4 minutes on 2026-09-19 before dependent authoring changes. This reconciles the stale execution state and unblocks follow-up tickets 64, 65, 71, and 75. No new production deployment is implied.
