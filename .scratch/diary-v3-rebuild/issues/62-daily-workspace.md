# Daily Workspace & First-use Flow

Status: ready-for-agent
Execution: done

## Scope

Implement the user's bounded follow-up phase on baseline `ba88ed4`: capture-first workspace navigation, shared Diary browse navigation, a focused Overview, and successful-empty first-use guidance. Preserve all destinations, current save/append protections, public Tools, three locales, neutral light/dark themes, and financial color semantics. Research-to-Diary prefill is deferred.

Design authority: `docs/design/daily-workspace-brief.md` (Astra). Implementation: Luna. Independent semantic and finish review: Sol. Parent PRD remains unchanged.

## Acceptance

- [x] Plain sign-in reaches Overview, while explicit allowed return paths remain intact.
- [x] New user starts capture, saves the first Diary, and finds the same record again.
- [x] A due Review opens from Overview, completes, and disappears from due work when returning; recent status agrees.
- [x] Desktop and mobile expose capture/full-editor choice, Diary/Tools/Settings, and all secondary destinations. Diary list, Timeline, and Calendar share in-page navigation.
- [x] Overview bounds action rows to five and recent Diaries to three; merges only equivalent overdue review reasons and targets; retains distinct reasons.
- [x] Loading and errors are never first-use or false all-clear. Scoped retry preserves other readable data.
- [x] Public Tools, keyboard capture, themes, locales, and financial direction remain valid.

## Evidence

Accepted locally on 2026-09-12. Evidence: `docs/design/daily-workspace-acceptance.md` and its desktop/mobile screenshots.

- Baseline unit suite: 67 files / 599 tests; new Overview projection tests: 3 passed.
- Disposable PostgreSQL Review Queue / Portfolio Attention integration: 11 passed.
- Focused browser acceptance: 48 cases passed across navigation, three principal workspace tasks, resource states, themes/locales, public Tools, capture/session and retained browsing regressions.
- Final built-artifact acceptance: 3 passed.
- Typecheck, lint, contract drift, production build, independent semantic review and bounded visual confirmation passed.

No parent PRD, API/data model, production service, or deployment cutover changed. Research-to-Diary handoff remains deferred. Full regression and actual Forgejo-runner verification remain outside this local phase.
