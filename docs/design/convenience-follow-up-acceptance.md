# Architecture and daily-work convenience acceptance

Date: 2026-09-19. Scope: local tickets 64–76 and prerequisite ticket 63 reconciliation. All thirteen tickets are implemented and accepted. Each local ticket records `Execution: done` and its runnable evidence.

## Scope and environment

The baseline working tree had no product-code edits; the pre-existing critique snapshot was untracked. The parent PRD and read-only diary-vue source are unchanged. Checks use synthetic accounts, disposable local PostgreSQL and controlled provider fixtures. The accepted design follows [the Astra brief](convenience-follow-up-brief.md).

Ticket 63 was reconciled against accepted commit `c21442cb`, an ancestor of HEAD, and a fresh 18/18 research-handoff browser pass before the dependent changes.

## Delivered behavior

- Quick places writing before optional configuration, displays the authoritative append destination, remembers eight whole tags per account after confirmed saves, and presents persistent Open/Edit/New note/source-return actions.
- Full creation conflicts retain the exact draft and offer explicit Append/Edit/Cancel. Structured append follows the existing transaction contract. Both authoring flows persist an uncertainty marker before append, refuse an unprotected append if device storage fails, and retain the lock for ambiguous responses and reloads.
- Review scheduling focuses the requested field and preserves the canonical Diary/Review return through authentication, save and cancel. The full editor and Review share key-bound draft storage ordering while keeping their own payload and reconciliation rules.
- Diary and Review distinguish original judgment from private reflection. Evidence capture opens explicitly. Timeline exposes compact date filters with visible active bounds and unchanged URL semantics.
- Named Diary read projections own detail, by-date, lists and private Review with batched associations and coherent snapshots. Market context is shared between Monitor and Portfolio. Rotation execution preserves HTTP/CLI adapter behavior, partial completion and lock semantics.

## Runnable verification

| Check | Result |
|---|---|
| `npm run test:unit` after lifecycle changes | 77 files, 692 tests passed in 12.52 seconds |
| `npm run test:integration` after backend changes | 68 files, 243 tests passed in 26.40 seconds |
| New PostgreSQL read/context/execution cases | 3 files, 5 tests passed in 3.54 seconds |
| Full-project TypeScript, ESLint and production build | Passed after final production changes |
| `npm run contracts:check` | Passed; API contracts and generated client unchanged |
| Stable full-authoring/Review/session/detail/Timeline batch | 29/29 passed in 1.8 minutes |
| New full-authoring follow-ups | All 10 cases passed across the initial product run and corrected lifecycle-harness rerun |
| Final full conflict desktop/mobile confirmation | 2/2 passed in 10.2 seconds |
| Diary discovery, detail and initial Evidence/Timeline coverage | All 16 cases have passing evidence |
| Final Evidence and Stock Notes guard correction | All four Evidence and three Stock Notes cases passed; final Timeline rerun passed all three |
| Market Rotation and Portfolio consumers | 6/6 passed in 25.3 seconds |
| Quick/company/daily-workspace follow-up batch | All 21 non-research cases passed; all 18 research cases passed across the final full-file run and one corrected continuation-test rerun |
| Quick layout, tags and keyboard focus | 2/2 passed in 12.1 seconds after the final corrections |
| Overview and workspace navigation | 7/7 passed |
| Built-artifact release suite | 9/9 passed in 12.4 seconds on the final build |

Commands for the focused checks:

```sh
DATABASE_URL=<local disposable PostgreSQL> npx vitest run tests/integration/diary-read.test.ts tests/integration/market-context.test.ts tests/integration/rotation-execution-http.test.ts
npx playwright test tests/e2e/diary-editor.spec.ts tests/e2e/diary-editor-ux.spec.ts tests/e2e/diary-response-loss.spec.ts tests/e2e/diary-review.spec.ts tests/e2e/web-session.spec.ts tests/e2e/diary-detail-review.spec.ts tests/e2e/timeline.spec.ts --reporter=list --max-failures=4
npx playwright test tests/e2e/full-authoring-follow-up.spec.ts --reporter=list
npx playwright test tests/e2e/full-authoring-follow-up.spec.ts -g 'real React lifecycle' --reporter=list
npx playwright test tests/e2e/full-authoring-follow-up.spec.ts -g 'conflict and schedule evidence' --reporter=list
npx playwright test tests/e2e/quick-authoring-follow-up.spec.ts tests/e2e/quick-diary.spec.ts tests/e2e/quick-related-trades.spec.ts tests/e2e/company-context.spec.ts tests/e2e/research-diary-handoff.spec.ts tests/e2e/daily-workspace.spec.ts --reporter=list --max-failures=5
npx playwright test tests/e2e/market-rotation.spec.ts tests/e2e/portfolio-exposure.spec.ts --reporter=list
npx playwright test tests/e2e/quick-layout-follow-up.spec.ts --reporter=list
npx playwright test tests/e2e/research-diary-handoff.spec.ts --reporter=list --max-failures=3
npx playwright test tests/e2e/quick-layout-follow-up.spec.ts tests/e2e/research-diary-handoff.spec.ts -g 'Quick layout|Quick append blocks double submit' --reporter=list
npm run test:e2e:release -- --reporter=list
```

The real React lifecycle harness verifies key A/B isolation, immediate unmount flushing, suppression after save, re-arming and explicit flush. Its first attempt failed because the Vite import exposed React DOM through a default export; the corrected harness passed. React act warnings originate from the test's second mounted root and are not an application failure.

## Independent review and visual acceptance

Sol reviewed append ambiguity, account/session transitions, stale destinations, full-editor recovery and draft lifecycle ordering. Material corrections were implemented: durable pre-POST markers, session-bound callbacks, account rebinding, date-bound destination checks, canonical definite-rejection handling and visible recovery controls. Final review found no remaining P1/P2 blocker. Full and Quick use different small classifiers with the same safe behavior for current API responses; future changes to rejection contracts must preserve that property.

Astra inspected the desktop/mobile reading batch. Original-judgment hierarchy, nearby editing and form widths were accepted. The bounded correction added a visible Timeline chevron and replaced mobile Evidence element captures with full-page captures. Confirmation passed. Evidence's router guard was restricted to collapsed capture so it cannot shadow the existing Company Stock Notes guard.

Astra inspected full conflict and scheduling captures, and Quick saved continuation captures. A bounded copy correction removed the obsolete instruction to choose another date while preserving the canonical error code and request ID. Desktop/mobile confirmation passed, including Cancel/Edit/draft restoration. Quick saved actions were accepted. Content-first and recent-tag editing captures were inspected and accepted. A bounded correction restored the mobile sticky button’s normal primary colors, hid a duplicate visual Content label while retaining its accessible name, and spaced the destination title. The confirmation captures and 2/2 layout tests passed. The keyboard test explicitly waits for the recovery choice to finish loading before testing restoration focus.

Screenshots are under `docs/design/evidence/convenience-follow-up/`. Unrelated screenshots regenerated by regression tests are excluded from the final change.

## Ticket ledger

| Tickets | Acceptance |
|---|---|
| 64, 70, 71 | Accepted: Quick content-first writing, recent tags, confirmed continuation and research flows |
| 65, 66, 75 | Accepted: full authoring, scheduling and draft lifecycle |
| 67, 68, 69 | Accepted: reading, explicit Evidence and compact Timeline |
| 72, 73 | Accepted: coherent Diary projections and private Review |
| 74, 76 | Accepted: shared Market context and Rotation execution |

## Final delivery state

All requested source, tests, ADRs and design evidence are in the shared working tree. The parent PRD and diary-vue source are unchanged. No production cutover, commit or pull request was performed. Full-project build, TypeScript, ESLint and diff checks passed; all affected acceptance paths above have passing evidence.
