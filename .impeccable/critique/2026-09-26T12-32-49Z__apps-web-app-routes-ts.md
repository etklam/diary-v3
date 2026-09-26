---
target: All diary-v3 web pages
total_score: 28
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
timestamp: 2026-09-26T12-32-49Z
slug: apps-web-app-routes-ts
---
Method: degraded dual-assessment (A: /root/uiux_design_assessment completed; B stalled and was stopped; primary ran the deterministic detector). Browser mutation was unavailable, so no live overlay was injected.

# All-pages UI/UX review — diary-v3

Date: 2026-09-26. Target: `apps/web/app/routes.ts` and the rendered web application. Mode: Review only; no product files or settings were changed.

## Design specificity verdict

**Good: the experience is recognizably designed around an investment decision diary.** The diary, evidence, transaction, and later review are kept together as related but distinct activities. The shared neutral surfaces and measured action color suit long-form financial records, while public tools remain usable without an account. Empty states, explicit data gaps, and synthetic-data messaging avoid pretending that missing research or market data is real. The interface does not read as an interchangeable dashboard.

The main opportunity is to help a new user choose a first recording path, make secondary workspace destinations easier to discover, and give every page a useful localized browser title.

## Design Health Score — Nielsen heuristics (0–4)

| # | Heuristic | Score | Key observation |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Loading, empty, save, and retry states are generally explicit; some detail routes had no matching synthetic record. |
| 2 | Match with the real world | 3 | Diary and review language is grounded in investment decisions; finance/research abbreviations still create a learning burden. |
| 3 | User control and freedom | 3 | Back, clear-filter, cancel, and retry paths are common; invalid detail states offer limited recovery. |
| 4 | Consistency and standards | 3 | Shared layout, labels, and theme tokens are coherent; signed-in `/login` is a state exception. |
| 5 | Error prevention | 3 | Form constraints, draft recovery, and honest missing-data states help; full diary entry is long. |
| 6 | Recognition rather than recall | 3 | Task headings and field labels are clear; lower sidebar destinations and the first-record choice are less visible. |
| 7 | Flexibility and efficiency | 3 | Quick entry, keyboard shortcut, filters, and configurable start page support repeat use. |
| 8 | Aesthetic and minimalist design | 3 | Calm hierarchy works well; research/admin pages become dense when populated. |
| 9 | Error recovery | 2 | Draft retention and retries help; disabled email recovery has no practical help route. |
| 10 | Help and documentation | 2 | `/guide` is task-oriented, but research abbreviations and complex tools lack contextual help. |
| **Total** | | **28/40** | **Good; heuristic judgment, not a measured task-success rate.** |

## Audit Health Score

| Dimension | Score (0–4) | Evidence |
|---|---:|---|
| Accessibility | 3 | Main landmarks, skip link, focus handling, form labels, and keyboard states are present. This was not a full screen-reader or WCAG conformance test. |
| Performance | 3 | No high-cost visual effects stood out. No performance trace or device benchmark was run. |
| Responsive Design | 3 | Responsive shell and compact layout were observed; repository CSS and existing design tests provide further implementation evidence. This review did not complete a live 390px visual pass. |
| Theming | 4 | Semantic color tokens support light/dark/system; light and dark appearances were visually checked. |
| Implementation Integrity | 3 | Coherent product-specific system; route metadata and a few state/discoverability gaps remain. Detector warnings were mostly false positives. |
| **Total** | **16/20** | **Good; address the recovery and route-wide metadata gaps.** |

## Priority findings

### P1 — Disabled email leaves password recovery without a useful next step

**Location:** `/login`, `/forgot-password`; `apps/web/app/auth-form.tsx:182`, `apps/web/app/routes/forgot-password.tsx:98`.

When password recovery is disabled, the login page hides the recovery link. Opening `/forgot-password` explains that recovery is unavailable and only links back to sign-in. In a deployment without SMTP, a user who loses access has no self-service or support route. This is conditional on recovery email being disabled, not a failure when it is enabled.

**Recommendation:** Keep a visible recovery entry and explain the disabled state with a deployment-configurable administrator/support contact or documented recovery path. Keep the unavailable state explicit; do not imply an email was sent.

### P2 — Signed-in users can land on a login form inside the workspace shell

**Location:** `/login`; `apps/web/app/root.tsx:91-102`.

A signed-in admin opening `/login` directly sees the login fields while the authenticated workspace shell and sign-out control remain present. The mixed state makes it unclear whether the form will switch accounts or affect the current session.

**Recommendation:** Redirect authenticated users to their workspace, or show the current account with a clear “switch account” action that signs out first.

### P2 — Most routes have URL-shaped or non-localized browser titles

**Location:** shared `<Meta />` in `apps/web/app/root.tsx:23`; route registry in `apps/web/app/routes.ts`.

Live browser tabs for `/tools`, `/timeline`, `/settings`, and `/admin/ai` displayed the origin plus route path as the title. Only 10 route modules currently export `meta`; several that do use fixed English metadata while the UI is Traditional Chinese. This weakens tab/history recognition and localized public search snippets.

**Recommendation:** Give every HTML route a localized title; add descriptions for indexable public routes. Keep route-specific titles meaningful on private pages as well.

### P2 — Workspace navigation hides lower destinations below the fold

**Location:** desktop sidebar in `apps/web/app/styles.css:523-533,1571-1578`.

At a short desktop viewport the initial sidebar view ended around Trade Plans; Market Research, Tools, Account, and Admin required a separate sidebar scroll. The navigation still works, but the lack of an obvious overflow cue makes breadth of the workspace easy to miss.

**Recommendation:** Add a visible continuation cue or make the most-used lower destinations reachable through a compact “more”/search affordance. Preserve the current grouping.

### P3 — First-time users may not know when to choose Quick Diary versus the full editor

**Location:** `/diaries/quick`, `/diaries/new`, and the global Quick Record entry.

The quick flow is low-friction and progressively exposes options; the full editor supports richer thesis, risk, execution, trade, and review fields. The two paths are both useful, but a first-time user may assume every diary must use the full form or wonder which action to choose.

**Recommendation:** Add a one-line distinction at the first-record entry point (“quickly capture one observation” versus “create a complete investment diary”), keeping Quick Diary as the low-friction default.

## Deterministic detector

The CLI scan of `apps/web/app` returned three warnings (exit code 2):

- `markdown.css:122`, imported by 12 Markdown surfaces: a colored blockquote border. **Likely false positive:** semantic blockquote styling, not a side-tab card accent.
- `markdown.tsx:9`: a ReactMarkdown image renderer. **False positive for “broken image” from source inspection:** the `img` node receives Markdown-provided props and ReactMarkdown retains its safe URL transform; the detector cannot establish that a rendered image has an empty source. Review authored alt text separately where article/diary content supports images.
- `position-sizing.css:102`: accent border on `.position-sizing-total`. **Likely false positive:** a localized summary result, not a repeated card treatment.

The CUA browser API exposes read-only page evaluation and no script-injection method. Therefore the required `[Human]` browser overlay was not injected, no visual overlay is available, and no overlay server was started. The normal local app servers used for review were stopped afterward.

## What works

- The home page states the product’s purpose and labels its visual preview as synthetic.
- Guests can use the Tools catalog and public calculators without creating an account; authentication is reserved for private writes.
- Timeline, Diary library, Calendar, Reviews, and tools use consistent headings and meaningful empty states.
- Quick Diary and full authoring serve different depths of work; draft retention and visible save/retry feedback support trust.
- Light/dark themes, typography, spacing, and semantic financial colors form a restrained, consistent system.
- `/guide` explains core tasks in the same sequence users perform them.

## Cognitive load and emotional journey

The workspace is broad, but grouping keeps the principal diary, investment, market, account, and admin jobs understandable. Quick recording lowers the cost of starting. The larger editor and research pages increase decision density, especially for new investors; inline definitions for ETF/SEC/CIK/FIRE and clear first-entry wording would reduce that cost. The quiet tone and honest empty states establish trust; the account-recovery dead end is the sharpest negative moment.

## Persona red flags

- **Jordan, first-time investor:** may overestimate how much detail a first Diary requires and may get stuck if recovery email is disabled.
- **Alex, frequent trader:** benefits from quick entry and shortcuts but must scroll to reach some secondary workspace groups.
- **Casey, interrupted mobile user:** compact navigation and safe-area support exist, but the full editor’s live narrow-screen reading order was not verified in this run.

## Coverage and limitations

All 64 route entries were reviewed at page/template level, including dynamic diary, research, stock/thesis, article, SEC, and blog patterns. The 63 HTML templates were opened in a local browser; the sitemap is an XML endpoint, not a visual page. Representative screenshots covered the guest homepage, authenticated workspace, Timeline, Diary library/editor, Tools, Relative Value, Admin email settings, and Admin AI. Both themes were visually checked; desktop and compact-width layouts were inspected. Assessment A also audited all route entries independently.

The app used a disposable E2E database and synthetic accounts/fixtures only. Several dynamic routes lacked corresponding records; tokenized registration/reset routes lacked valid synthetic tokens; article and research lists were empty; some SEC/market data was unavailable. These states limited valid-data edit/read-flow inspection and are not counted as product defects. The independent assessment did not complete live mobile visual review. No production system or real user data was accessed.

## Run Notes

- Target slug: `apps-web-app-routes-ts`; prior trend history for this all-routes target: none (first snapshot).
- Ignore list: `.impeccable/critique/ignore.md` was absent.
- Assessment A was an independent sub-agent review. Assessment B stalled and was stopped; primary ran the detector after that failure.
- Detector command: `node /Users/klam/.agents/skills/impeccable/scripts/detect.mjs --json /Users/klam/Desktop/project/diary-v3/apps/web/app`.
- Browser was used for route review. Overlay injection was not possible because the available CUA page evaluation is read-only. No `[Human]` overlay is claimed.
- Disposable API and web servers were stopped. No application files were edited.
