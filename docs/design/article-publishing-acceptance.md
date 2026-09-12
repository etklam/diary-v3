# Public article publishing acceptance

Date: 2026-09-12
Review baseline and implementation start: `77c3a930023a32471ddad1fd61af0cb34603836b`

## Scope and audit findings

The existing API already enforced Admin ownership for article writes, exposed only Published articles through public endpoints, generated slugs on the server, and preserved decimal/date behavior outside this feature. Those contracts were retained without an API schema change.

Three product defects were confirmed and corrected: submitting an existing Published article silently changed it to Draft; an expired-session return path rejected the real `/admin/blog/:id/edit` route; and signed-in readers saw the workspace shell on public article and information pages. No authorization bypass or public Draft/Archived disclosure was reproduced. The existing public Markdown sanitization, metadata, canonical URL, category filtering, pagination, and Admin CRUD endpoints were already present and reused.

A current-HEAD follow-up audit corrected the remaining presentation and evidence gaps without changing the domain contract: cover images now appear in editor preview with a non-crashing fallback; validation marks and describes invalid fields; Published editors and management rows expose server-derived public links; Admin search covers title, author name, and author email; update dates are localized with an explicit UTC suffix; bulk deletion asks for confirmation; and compact public/workspace menu targets meet the 44px minimum.

## Role and shell matrix

| Surface | Guest | User | Admin |
| --- | --- | --- | --- |
| `/articles`, article detail, Guide, About, Blog | Public shell; sign-in/register | Public shell; Workspace | Public shell; Workspace plus quiet article-management links |
| `/` | Public home | Workspace Overview | Workspace Overview |
| `/tools` and tool detail | Public shell | Workspace shell | Workspace shell |
| Article create/edit | Rejected | Rejected | Workspace editor |

Cross-tab logout removes Admin-only public controls after the session refresh. Article management remains absent for ordinary users even while they read through the public shell.

## Article state and action matrix

| Stored state | Filled primary action | Secondary state transition | Public result |
| --- | --- | --- | --- |
| Draft | Save draft | Publish publicly | Hidden until the server confirms Published |
| Published | Update published article | Archive article | Existing server slug remains readable; update stays Published |
| Archived | Save changes | Republish publicly | Hidden until republished |

The editor disables its field group while a request is pending and ignores duplicate submissions. Success copy is explicit, and a public link is derived only from the current Admin read/write server response. Network, authorization, and simulated publish failures retain the form content and never invent a public link. Preview preserves the draft, renders excerpt/cover/Markdown, and manages keyboard focus in both directions. A dirty editor warns before navigation. Recovery data is limited to the six content fields, never stores publication status, merges onto the latest server status, expires after 24 hours, is keyed by account plus article, is retained through automatic expiry, and is removed by an explicit logout.

## Implementation map

| Area | Files | Reason |
| --- | --- | --- |
| Session-aware shell and controls | `apps/web/app/root.tsx`, `apps/web/app/nav.tsx`, `apps/web/app/public.css` | Keep reading routes public while reflecting guest/User/Admin capabilities |
| Public list and reading | `apps/web/app/routes/articles.tsx`, `apps/web/app/routes/article.tsx` | Add contextual Admin entry points and localized category labels without exposing private data |
| Admin query and authorization | `apps/api/src/posts.ts` | Keep public full-text behavior separate while matching the Admin title-or-author search label |
| Authoring state machine | `apps/web/app/admin-post.tsx`, `apps/web/app/routes/admin-blog.tsx`, `apps/web/app/styles.css` | Make Draft/Published/Archived actions explicit, preview the full article, and preserve content safely |
| Session recovery | `apps/web/app/session.ts` | Accept exact edit returns and distinguish automatic expiry from explicit logout |
| Release fixture | `scripts/release-e2e-server.ts` | Seed only a synthetic Admin in the isolated release database |

## Evidence

The focused browser scenario covers Draft creation, server persistence, guest invisibility, publication, server slug use, public list/detail and metadata, Published update without regression to Draft, archive removal, failed publish retention, expired-session recovery, cross-tab logout, role gating, and 360/390/768/1440 overflow checks. The focused integration suite verifies anonymous and ordinary-user write rejection plus private public projections. The release-artifact scenario repeats create, publish, update, and archive against built Web and API artifacts.

Screenshots:

- Before: `docs/design/evidence/ui-consistency/after-public/articles-direct-1440.png` and `docs/design/evidence/ui-consistency/after-public/articles-direct-390.png`
- Admin list: `docs/design/evidence/article-publishing/list-admin-1440.png`
- Draft editor: `docs/design/evidence/article-publishing/editor-draft-1440.png`
- Published editor: `docs/design/evidence/article-publishing/editor-published-1440.png`
- Published editor, 390px dark: `docs/design/evidence/article-publishing/editor-published-390-dark.png`
- Guest list: `docs/design/evidence/article-publishing/list-guest-1440.png`
- Admin reading detail: `docs/design/evidence/article-publishing/detail-admin-1440.png`
- Signed-in User list, 390px dark: `docs/design/evidence/article-publishing/list-user-390-dark.png`

The article phase intentionally does not introduce a general CMS, revision history, scheduled publication, uploads, or production deployment.

## Verification results

- TypeScript and ESLint: passed.
- Unit suite: 72 files, 648 tests passed.
- OpenAPI/contracts drift check: passed; no generated contract change.
- Article PostgreSQL integration: 8 tests passed against a fresh disposable database.
- Article browser acceptance: 1 scenario passed, including every role and viewport listed above.
- Scoped browser regression: 20 scenarios passed across navigation, mobile menu, workspace, articles, session/auth, public tools, Diary flows, and partner Timeline.
- Production build: Web client, SSR bundle, and API artifact passed.
- Production-artifact RC1 suite: 9 scenarios passed, including article create/publish/update/archive.
- Impeccable detector: no findings on the changed interface files.

Production deployment, live production data, external-provider calls, and a production cutover were not run and were outside this phase.
