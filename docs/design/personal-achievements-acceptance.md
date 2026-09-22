# Personal achievements acceptance

Delivered: 2026-09-22

The signed-in workspace links to `/achievements`. Users manually record a civil date and up to 1,000 characters, view newest-first records, edit them, and confirm deletion. Same-date records are allowed. PostgreSQL stores records per user; the API enforces ownership and cookie CSRF protection. No example data is seeded into user accounts.

## Verification

- `npm run typecheck`, `npm run lint`, and `npm run contracts:check`: passed.
- `npm run build`: passed.
- `npx vitest run tests/integration/achievements-http.test.ts`: 1 passed against disposable local PostgreSQL, covering migrations, persistence, sorting, ownership, validation, unauthenticated access, and CSRF.
- `npx playwright test tests/e2e/achievements.spec.ts`: 5 cases passed across the CRUD, guest, failed-save retry, and narrow long-text flows. CRUD covers 1440px and 390px, reload, focus return, three locales, and light/dark presentation.
- Navigation, web-session, and native shared-boundary regression tests: 62 passed.
- Impeccable detector: no findings on the changed achievement UI.

## Independent review

The focused API review found an initially missing migration journal entry; the generated migration and journal now include the table and passed fresh-database integration testing.

A focused Sol expert substituted for the unavailable dedicated Impeccable finish-reviewer role. It inspected all four captures and approved the incumbent visual direction. Its valid interaction finding, focus return after closing the form, was fixed and verified in the browser. Its separate concern about error visibility was withdrawn after confirming that the shared failure notice already focuses the error. Final disposition: ship, with the required browser test subsequently confirmed passing.

## Captures

- [Desktop list](evidence/achievements/list-1440.png)
- [Mobile list, dark theme](evidence/achievements/list-390.png)
- [Desktop editor](evidence/achievements/editor-1440.png)
- [Mobile editor, dark theme](evidence/achievements/editor-390.png)

This acceptance covers the feature in the workspace and isolated test environment. Production deployment and production database migration were not performed.
