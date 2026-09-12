# Research to Diary context handoff acceptance

This record covers the 2026-09-12 Research to Diary context handoff phase. It uses synthetic accounts, the disposable PostgreSQL database, the deterministic E2E market fixture, and controlled browser request interception. No production service or real user data is used.

## Scope and evidence

The browser acceptance is owned by `tests/e2e/research-diary-handoff.spec.ts`. The built-artifact path is extended in `tests/e2e/release-artifacts.spec.ts`. Aggregate preservation and atomic symbol-limit behavior are covered by `tests/integration/diary-stocks.test.ts`.

The browser cases cover:

- Company → Quick and Company → Full capture, authoritative detail reads, symbol filtering, source return, and the saved-detail reload path.
- Same-day append with title/body/symbol/transaction/reminder/review preservation, plus the ten-symbol overflow rollback.
- Legacy Quick and Full draft precedence, Restore versus Discard, invalid optional draft context, and fresh draft backup.
- Guest Company access, explicit Sign in continuation, registration continuation, central session expiry, explicit cross-tab logout, and account isolation.
- Direct contextual initialization, date precedence, manual symbol edits, locale/session refresh, same-route dirty navigation, delayed response locking, failed writes, and uncertain append response loss.

The requested visual evidence is written under `docs/design/evidence/research-diary-handoff/` at 1440px and 390px dark mobile states for the Company CTA, contextual Quick form, draft conflict, and saved return view.

## Commands and results

Results below are the independent logic, API, integration, and browser evidence available before the external Company UI handoff. The E2E server was run serially for each browser command; no parallel server instances were used.

| Check | Command | Result |
| --- | --- | --- |
| Targeted lint | `npx eslint tests/e2e/research-diary-handoff.spec.ts tests/e2e/release-artifacts.spec.ts tests/integration/diary-stocks.test.ts` | Passed |
| Typecheck | `npx tsc --noEmit --pretty false` | Passed |
| Contracts drift | `npm run contracts:check` | Passed |
| Handoff unit cases | `npx vitest run tests/unit/capture-context.test.ts tests/unit/capture-session.test.ts tests/unit/diary-stocks.test.ts tests/unit/web-session.test.ts` | Passed, 33 tests |
| Full logic unit suite | Existing Luna run after the final persistence guard | Passed, 71 files / 615 tests |
| Disposable PostgreSQL aggregate suite | `npx vitest run tests/integration/diary-stocks.test.ts --reporter=verbose` | Passed, 6 tests |
| Affected PostgreSQL suites | `npx vitest run tests/integration/diary-stocks.test.ts tests/integration/diary-editor.test.ts tests/integration/diary-review.test.ts tests/integration/alerts.test.ts tests/integration/diary-summary.test.ts --reporter=verbose` | Passed, 27 tests |
| Affected browser regression | `npx playwright test tests/e2e/quick-diary.spec.ts tests/e2e/diary-response-loss.spec.ts tests/e2e/library-session-recovery.spec.ts tests/e2e/web-session.spec.ts tests/e2e/diary-editor-ux.spec.ts --reporter=list` | Passed, 21 tests |
| Focused append safety | `npx playwright test tests/e2e/research-diary-handoff.spec.ts --grep "Quick append blocks double submit" --reporter=list` | Passed, 1 test; delayed double-submit, failure retention, uncertain lock after reload/Restore, and no replay |
| Late response logout safety | `npx playwright test tests/e2e/research-diary-handoff.spec.ts --grep "late Quick append response" --reporter=list` | Passed, 1 test; late aborted response did not recreate the cleared draft |
| Contextual 401 recovery | `npx playwright test tests/e2e/research-diary-handoff.spec.ts --grep "central 401 invalidation" --reporter=list` | Passed, 1 test; one failed write, exact source/date return, manual login, Restore, save, and GET |
| Focused browser acceptance | `npx playwright test tests/e2e/research-diary-handoff.spec.ts` | Pending external Company UI handoff; includes Company CTA, context notice, Full flow, parser notice, and visual captures |
| Built artifact acceptance | `npx playwright test --config=playwright.release.config.ts` | Pending external Company UI handoff and built-artifact server run |

## Limitations

The Company CTA/detail return path and contextual notice are not present in the current Web UI tree, so the full handoff browser suite, built-artifact flow, and requested screenshots remain pending the external GLM UI implementation. A generated screenshot file is not treated as visual acceptance until it has been opened and inspected for layout, contrast, wrapping, and data-boundary defects. The focused safety and auth cases intentionally avoid that missing notice so their state, session, and write-boundary evidence remains runnable.
