# Daily Workspace acceptance

Status: accepted locally by Astra after implementation by Luna and independent review by Sol, 2026-09-12.
Baseline: `ba88ed4`. Scope and design authority: [Daily Workspace brief](daily-workspace-brief.md).

## Scope

Capture-first navigation, shared Diary browse links, focused Overview, and successful-empty first-use guidance. The research-to-Diary symbol handoff is deferred. The existing lost-write-response reconciliation and save-lock behavior remain outside implementation scope, with regression checks retained.

## Verification record

| Check | Result |
| --- | --- |
| Existing unit baseline | 67 files, 599 tests passed |
| New Overview projection unit tests | 1 file, 3 tests passed: Diary/thesis dedup, local-day priority, distinct reasons, completed-review first-use exclusion |
| Review Queue and Portfolio Attention PostgreSQL integration | 2 files, 11 tests passed |
| Generated OpenAPI and typed-client drift | Passed |
| Final typecheck, lint, production build | Passed; client, SSR server, and API artifacts built locally |
| New-user capture, save, and retrieval | Passed: plain login → first-use action → Quick Diary save → reopen the same record from Overview |
| Due Review completion and return consistency | Passed: open due Review → complete → browser back → due row removed and recent status/outcome updated |
| Mobile navigation and secondary destinations | Passed: capture/full-editor choice, Diary/Tools/Settings, secondary links, Diary browse links, Escape and focus return |
| Bounded reminders, semantic dedup, partial failures | Passed: five-row cap, unit-tested Diary/thesis identity, pending/failed resource states and scoped retry |
| Existing focused browser regression set | 40 cases passed across initial runs and corrected-case reruns; see commands below |
| Independent finish review | Passed; Sol verified scoped resource states, reminder identity/ranking, route preservation, disclosures, and focus handling |
| Final Overview/First-use browser suite | 2 files, 8 tests passed after final changes |
| Desktop/mobile visual acceptance | Passed at 1440px light and 390px dark; one correction batch followed by one confirmation pass |
| Built-artifact browser acceptance | 3 tests passed: public pages/API health, auth/create/read/edit, draft restoration and Review completion |

Tests use synthetic users, a fresh disposable local PostgreSQL database, and controlled market-provider fixtures. The browser evidence totals 48 focused development-server cases and 3 built-artifact cases, excluding duplicate reruns. This is targeted phase verification, not a rerun of the entire regression suite. These results do not verify a production deployment or the Forgejo runner.

## Visual evidence

| State | Desktop | Mobile |
| --- | --- | --- |
| Successful-empty workspace | [1440px light](evidence/daily-workspace/first-use-1440.png) | [390px dark](evidence/daily-workspace/first-use-390.png) |
| Populated workspace | [1440px light](evidence/daily-workspace/overview-1440-light.png) | [390px dark](evidence/daily-workspace/overview-390-dark.png) |

The confirmation shows single-line sidebar capture, one primary action in the first-use content, compact portfolio metrics, and side-by-side mobile reminder actions with 44px targets. Text wraps without horizontal overflow. Existing locale/theme and financial-color browser checks passed.

## Browser commands and corrected assertions

The focused regression set covers public Tools, session/return-path behavior, Quick Diary drafts and appending, lost write responses, editor navigation guards, Diary discovery, Timeline, Calendar, theme alignment, financial colors, mobile navigation, and PWA update preservation. Browser commands use `PLAYWRIGHT_CHANNEL=chrome`:

```sh
npx playwright test tests/e2e/public-tools.spec.ts tests/e2e/web-session.spec.ts tests/e2e/quick-diary.spec.ts tests/e2e/diary-response-loss.spec.ts tests/e2e/diary-editor-ux.spec.ts tests/e2e/library-session-recovery.spec.ts
npx playwright test tests/e2e/workspace-navigation.spec.ts tests/e2e/first-diary.spec.ts tests/e2e/diary-list.spec.ts tests/e2e/timeline.spec.ts tests/e2e/calendar.spec.ts tests/e2e/layout-theme.spec.ts tests/e2e/market-colors.spec.ts tests/e2e/pwa.spec.ts
npx playwright test tests/e2e/pwa.spec.ts tests/e2e/layout-theme.spec.ts tests/e2e/diary-editor-ux.spec.ts --grep 'mobile menu keeps every route reachable|applies a waiting worker update|workspace page header and section cards|dirty editors warn'
npx playwright test tests/e2e/overview.spec.ts tests/e2e/daily-workspace.spec.ts
npx playwright test --config=playwright.release.config.ts
```

The targeted `--grep` rerun passed all four corrected cases. Navigation assertions now follow the retained Diary links and Tools catalog. The alignment assertion recognizes the current workspace heading and first-use section. The PWA assertion now waits for the existing informational update notice, verifies the unsaved editor survives, and dismisses the notice with Later. The PWA implementation is unchanged: activation deliberately avoids an automatic reload while the user is writing.

## Design decisions

The ordinary link/disclosure navigation follows the [W3C disclosure-navigation pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/) without application-menu roles. The product keeps its existing dialog behavior for the mobile Menu and keyboard capture.

Attention and Review Queue can classify the same deadline differently because one compares instants and the other uses the account-local day. Equivalent review obligations merge by Diary ID or normalized thesis symbol; Queue's day classification wins. Other attention reasons remain independent. The full Review Queue and Portfolio attention retain separate destination links.
