# [83] Phase 1 Stability Repairs

Status: done
Type: AFK

## Parent

[Full rebuild PRD](../PRD.md)

## Scope

Address the confirmed correctness and recovery issues in the 2026-09-25 stability review: Diary optimistic concurrency, complete Review Queue thesis classification, safe article authentication return paths, and translation-worker lock/recovery behavior. Add request and worker error diagnostics that correlate failures without recording private Diary content, credentials, or request bodies.

## Acceptance criteria

- [x] Diary detail returns a positive revision; the versioned `/api/v2/diaries/:id` replacement requires the revision the editor loaded. Missing revisions are rejected; stale edits receive `409 DIARY_REVISION_CONFLICT` and do not mutate any Diary field or association. The legacy `/api/diaries/:id` replacement remains compatible with old clients: `expectedRevision` is optional there and checked when supplied. Quick append increments the revision while preserving append semantics.
- [x] The editor keeps local work visible after a revision conflict, identifies the server version as newer, offers an explicit reload, and never retries the stale full replacement automatically. Recovered device drafts retain the revision they were based on.
- [x] Review Queue counts and pages all eligible ACTIVE Theses before pagination. 100 unscheduled Theses do not hide an overdue Thesis.
- [x] Member-article Sign in and Register return through one same-origin allowlisted path that preserves a valid `lang` query; unsafe URLs and query variants are rejected.
- [x] Translation worker transactions lock runtime, job, post, and translation rows in a consistent order. Bounded database retry and loop recovery do not redispatch a provider request, and definitive lease loss fences late results.
- [x] Unexpected API, automatic enqueue, and worker failures log request/job context and safe error metadata without credentials, request bodies, or private Diary content.
- [x] Regression evidence uses synthetic data, controlled provider fixtures, and disposable PostgreSQL only. No production cutover or external provider call is part of this ticket.

## Compatibility correction

The initial acceptance text incorrectly required `expectedRevision` on the
unversioned `/api` contract. ADR 0011 keeps that contract compatible and
introduces the required optimistic-concurrency behavior at `/api/v2`; the
previous-client request shape remains covered during the deprecation period.

## Verification evidence

- `npm run typecheck` — passed.
- `npm run contracts:check` — passed.
- Scoped `npx eslint` on changed API, web, contract, DB and test files — passed.
- `git diff --check` — passed.
- `npx vitest run tests/unit/article-loader.test.ts` — 9 passed.
- `npx vitest run tests/integration/article-translations.test.ts` — 16 passed, including wrapped deadlock retry, safe logging, recoverable loop behavior and overlapping AI lease recovery with a fake provider.
- `npx vitest run tests/integration/diary-editor.test.ts` — 6 passed, including stale association protection and append/replacement revision ordering.
- `npx vitest run tests/integration/article-translations.test.ts tests/integration/diary-editor.test.ts tests/integration/review-queue.test.ts` — 31 passed; Review Queue includes 100 unscheduled theses plus one overdue thesis.
- `npx vitest run tests/integration/diary-editor.test.ts tests/integration/diary-review.test.ts tests/integration/diary-stocks.test.ts tests/integration/evidence.test.ts tests/integration/quick-diary-http.test.ts` — 29 passed; includes omitted-revision rejection and all affected full PUT callers.
- `npx playwright test tests/e2e/article-access.spec.ts tests/e2e/diary-editor-ux.spec.ts` — 15 passed; member article login and registration preserve the selected language.
- `npx playwright test tests/e2e/diary-editor-ux.spec.ts` — 15 passed, including the recovered-draft conflict flow and required revision on update.
