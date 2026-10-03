# Architecture and daily-work convenience follow-up

> Historical planning snapshot. Ticket 63 was reconciled and accepted on 2026-09-19; tickets 64–81 are now `Execution: done`. Use the individual issue files and `FOLLOW-UP-ISSUES.md` for current status.

Publication: Approved and published on 2026-09-19; implementation authorized by “fix all ticket”.
Date: 2026-09-19
Source: the architecture review, independent UI/UX critique, and verified frozen diary-vue comparison in this conversation.

This proposal contains thirteen independently verifiable slices. Draft IDs A01–A13 map to published tickets 64–76 in [the follow-up index](FOLLOW-UP-ISSUES.md). The original PRD is unchanged; existing ticket 63 may receive verified completion evidence as a prerequisite.

## Scope and existing work

- A01–A06 address the five principal usability findings, separating reading and Evidence capture. A07–A08 are lower-priority legacy-inspired enhancements. A09–A13 address the four architecture candidates, with Diary reading divided into two complete read paths.
- The existing Diary editor, Quick Diary, Timeline, Review, Portfolio risk, Evidence, and Rotation tickets are complete. These slices improve those paths rather than repeat their original implementation.
- Existing ticket 62 records `Execution: done`. Ticket 63 still records `Execution: in-progress`; its logic evidence does not establish acceptance of the remaining capture UI and built-artifact flows. Slices relying on that handoff remain blocked by its completion. This proposal does not change either ticket.
- The PRD story references below identify existing behavior improved or protected. They do not claim that the PRD already specifies recent-tag history, post-save continuation, or these internal refactors.
- Workspace Guide discovery and a dedicated Review-scheduling write endpoint are deferred. Scheduling uses the existing complete editor workflow.

## Shared delivery rules

- All slices are AFK under the existing authorization: Astra owns architecture and design decisions and final acceptance, Luna owns implementation, and Sol provides focused independent review where useful. Routine agent design review is not a human blocker. No production cutover is authorized.
- Every slice completes its affected path through actual persistence, API/client, and UI or CLI consumers, with appropriate runnable evidence. A presentation change does not require inventing a database migration or new endpoint. No separate infrastructure-only or test-only tickets are needed.
- Each UI slice records an Astra brief before implementation: retain the existing typography, semantic light/dark colors, spacing tokens, reading widths, and focus treatment; define changed ordering and interactions. Verify desktop/mobile, all three locales, keyboard/focus, long content, and the relevant empty/loading/error states. Material deviations return to Astra.
- Preserve owner isolation, valid date and decimal semantics, original judgment versus private Review, safe Markdown, account-scoped drafts, explicit append, uncertain-write safeguards, and canonical research source returns. ADRs 0001, 0006, 0007, 0008, 0010, and 0011 constrain the affected slices.
- Use synthetic browser fixtures, real disposable PostgreSQL for integrity/concurrency, and controlled provider fixtures. Record commands and outcomes in each ticket before marking execution complete. Generated contracts/client/OpenAPI must remain consistent whenever an API contract is actually changed.
- A completed blocker is a scheduling condition. Shared files alone are not a product dependency; coordinate ownership when independent slices overlap.

## Proposed order and dependencies

| Draft | Slice | Type | Blocked by | Priority |
|---|---|---|---|---|
| A01 | Write Quick Diary content before optional setup | AFK | Existing 63 | P1 |
| A02 | Resolve a same-date full Diary conflict without losing work | AFK | Existing 63 | P2 |
| A03 | Open Review scheduling at the requested field | AFK | None | P2 |
| A04 | Read a saved Diary with clear original-judgment states | AFK | None | P2 |
| A05 | Open Evidence capture only when requested | AFK | None | P2 |
| A06 | Read recent Timeline entries before expanding date filters | AFK | None | P2 |
| A07 | Reuse recent tags across Quick and full Diary authoring | AFK | None | P3 |
| A08 | Continue from a confirmed Quick Diary save | AFK | Existing 63 | P3 |
| A09 | Read Diary detail and by-date views through one owned projection | AFK | None | P2 |
| A10 | Serve bounded Diary lists and private Review through the read module | AFK | A09 | P2 |
| A11 | Read Portfolio market context without building a full monitor | AFK | None | P2 |
| A12 | Recover full Diary and Review drafts through one lifecycle | AFK | Existing 63 | P2 |
| A13 | Run Rotation scopes through shared execution with compatible outcomes | AFK | None | P3 |

## A01 — Write Quick Diary content before optional setup

Type: AFK
User stories covered: US-015, US-016, US-017, US-098, US-100, US-102, US-103.

### What to build

Make the existing Quick Diary page and global dialog immediately writable. Show the writing area before optional templates and metadata, with a compact editable date and create/append destination summary. A visible existing destination title replaces the misleading editable title when appending to an occupied date. Preserve the existing capture features and actual save behavior.

### Acceptance criteria

- [ ] In the 390×844 mobile fixture, writing is available without scrolling past optional setup. The desktop keyboard shortcut focuses content; pointer/touch opening does not unnecessarily force the mobile keyboard.
- [ ] Date/destination changes remain explicit and accessible. Append shows the authoritative target title; an empty date still supports entering a new title. Stale date-lookups cannot overwrite newer selections.
- [ ] Free writing, templates, Company links, snippets, voice, source context, and draft Restore/Discard remain reachable and preserve their existing semantics.
- [ ] Existing sticky save, loading/error feedback, uncertain-result protection, and server-confirmed create/append work in browser tests. Read the saved Diary through the real API to verify title, body, tags, and Company links.

### Blocked by

- Existing [63 — Research to Diary context handoff](issues/63-research-diary-handoff.md): finish its capture UI and end-to-end acceptance before reorganizing that flow.

## A02 — Resolve a same-date full Diary conflict without losing work

Type: AFK
User stories covered: US-011, US-012, US-014, US-017, US-018, US-020, US-102.

### What to build

When full Diary creation meets an occupied date, show the owned existing Diary and offer Edit existing, Append this writing, or Cancel. Keep the unsaved creation draft recoverable. Explain append's additions and replacements before submission using the current canonical semantics; do not silently change the destination date or discard structured fields.

### Acceptance criteria

- [ ] Both a known occupied date and a server-side create race reach the same recoverable choice. Cancel restores the exact draft; opening the existing editor does not overwrite or discard the pending creation draft.
- [ ] Append makes the retained destination title, appended body, tag/Company unions, and any explicitly supplied judgment, Transaction, or scheduling changes understandable before commit. Every accepted field follows the existing contract; unsupported input cannot silently disappear.
- [ ] Server uniqueness and ledger locks remain authoritative. A stale/deleted destination and a newly occupied date produce canonical recoverable outcomes, without relying on a preflight lookup for integrity.
- [ ] Browser and disposable PostgreSQL evidence covers create conflict, each choice, transaction-bearing input, rapid date changes, cross-owner access, and ambiguous/failed writes. An uncertain append is not automatically replayed; authoritative readback confirms successful results.

### Blocked by

- Existing [63 — Research to Diary context handoff](issues/63-research-diary-handoff.md): preserve its draft/source precedence and mutation-recovery guarantees.

## A03 — Open Review scheduling at the requested field

Type: AFK
User stories covered: US-029, US-026, US-100, US-102.

### What to build

Make Schedule Review and Change Review schedule open the existing Diary editor at its scheduling field, focus that field when it is ready, and return to the originating Diary or Review after save/cancel. Keep the normal full-editor entry unchanged.

### Acceptance criteria

- [ ] Both entrypoints, direct links, and browser back/forward reach the intended field after loading on desktop/mobile without an unrelated jump to the top.
- [ ] Save and cancel preserve a safe return destination and existing unsaved-change guards. A restored draft is not overwritten by navigation intent or focus handling.
- [ ] Set, change, and clear a schedule through the existing authorized write flow; reopening the record and Review queue shows the persisted result with correct date/time semantics.
- [ ] Browser evidence covers keyboard focus, validation failure, cancel/back, and a reviewed Diary whose completed state remains intact. This slice does not introduce a partial update that submits stale unrelated Diary fields.

### Blocked by

None — can start immediately.

## A04 — Read a saved Diary with clear original-judgment states

Type: AFK
User stories covered: US-012, US-018, US-028, US-031, US-032, US-033, US-054, US-098.

### What to build

Put the readable saved Diary and a nearby Edit action first. Replace three all-empty original-judgment sections with one accurate missing-state summary. Apply the same distinction between original judgment and retrospective Review when reading a Review. Evidence capture presentation is a separate slice.

### Acceptance criteria

- [ ] A short saved Diary has a clear complete reading state and reachable Edit action; all-empty, partially filled, and fully filled original judgments render accurately without hiding existing information.
- [ ] Private reflection remains separate from original content, and no Review or other private fields enter a Partner or summary projection.
- [ ] Browser evidence covers short/long content, completed/pending Review, loading/failure, mobile reading, and keyboard focus. Follow the nearby Edit action, save a change, and verify the reread result. Preserve canonical Company/source return links.

### Blocked by

None — can start immediately.

## A05 — Open Evidence capture only when requested

Type: AFK
User stories covered: US-026, US-049, US-050, US-054, US-098, US-100, US-102.

### What to build

Replace the initially expanded Evidence capture form on Diary reading with an explicit contextual action. Expand the existing form when requested, retaining its source and Company/Diary context, and keep successful capture connected to the immutable Stock Timeline Record.

### Acceptance criteria

- [ ] Initial reading does not require scrolling past an unused capture form. Activating capture reveals a labeled form, moves focus appropriately, and preserves valid existing source choices and defaults.
- [ ] Closing a pristine form is immediate; closing or navigating away from a changed form preserves input or uses the existing discard safeguard. Validation/provider/API failures keep the entered data and a reachable retry action.
- [ ] A confirmed save creates exactly the intended Evidence record and exposes its existing destination. Canonical idempotency and ownership rules remain effective on retry, with no new write triggered merely by opening the form.
- [ ] Browser and API evidence captures Evidence from a saved Diary, reads the linked Stock Timeline Record, and covers empty/cancel/failure/retry, keyboard focus, mobile layout, and source/Company association.

### Blocked by

None — can start immediately.

## A06 — Read recent Timeline entries before expanding date filters

Type: AFK
User stories covered: US-024, US-026, US-098, US-100, US-102.

### What to build

Use a compact date-filter summary on mobile so recent Diaries appear earlier. Disclose exact date controls on demand and keep applied filters visible and clearable. Reuse the existing Timeline query and navigation semantics.

### Acceptance criteria

- [ ] With the standard one-Diary fixture at 390×844, a Diary entry begins in the first viewport before optional filter controls are expanded; long headings and other locales remain operable.
- [ ] Users can expand, apply, inspect, and clear an inclusive date range with keyboard or touch. Applied ranges are not hidden inside a closed disclosure.
- [ ] Reload, shared URLs, pagination if present, and browser back/forward preserve the exact current filter semantics and focus behavior. Invalid/empty/loading/failed results remain distinct.
- [ ] Browser evidence follows a filtered entry into the correct Diary and back to the same Timeline context. Do not add unsupported tag filters or change the read projection.

### Blocked by

None — can start immediately.

## A07 — Reuse recent tags across Quick and full Diary authoring

Type: AFK
User stories covered: US-013, US-015, US-018, US-098, US-100. Recent-tag memory is an enhancement to these stories.

### What to build

Offer up to eight recently saved tag chips in both authoring flows, plus the existing explicit whole-tag input. Reuse a tag with one action and show whether it is already selected. Keep this bounded browser convenience isolated per account. Suggestions never initialize capture fields or override restored input; they change selection only after an explicit user action.

### Acceptance criteria

- [ ] Only authoritatively successful saves update recent history; failed or uncertain writes do not. The most recently saved unique tags appear first, with deterministic bounded ordering.
- [ ] Selecting/removing a chip produces the same canonical tag array as manual entry. A tag containing a comma remains one tag, and long/multilingual tags stay usable.
- [ ] Account changes cannot reveal another account's history. Explicit sign-out clears that account's local history consistently with existing private local-data rules; unavailable/corrupt storage does not prevent writing.
- [ ] Browser evidence saves and reuses tags across Quick/full authoring, reads back the exact array, and verifies account isolation and keyboard access. Preserve restored draft selection and research defaults.

### Blocked by

None — can start immediately. Explicit suggestions do not depend on capture-default initialization.

## A08 — Continue from a confirmed Quick Diary save

Type: AFK
User stories covered: US-015, US-017, US-018, US-020, US-026, US-102. Persistent continuation choices are an enhancement to these stories.

### What to build

After an authoritative Quick Diary save, offer quiet explicit actions to open the saved Diary, edit details or Transactions, or start another note. Retain the source-return action when a valid research source exists. Keep the success state available until the user acts or dismisses it.

### Acceptance criteria

- [ ] Every destination uses the confirmed saved Diary identity, including same-day append. The result is not guessed from the submitted date or a stale lookup.
- [ ] No action automatically replays a write, navigates away, or expires after a fixed timeout. Ambiguous writes remain in recovery instead of presenting success actions.
- [ ] Starting another note intentionally resets the saved draft and follows the existing date/Company/source defaults; a second successful note can be saved and read back without duplicate submission.
- [ ] Browser evidence covers create, append, delayed success, response loss, all continuation choices, keyboard focus, and canonical source return. Both the Quick page and dialog have a coherent completion flow.

### Blocked by

- Existing [63 — Research to Diary context handoff](issues/63-research-diary-handoff.md): extends its confirmed-save and source-return flow.

## A09 — Read Diary detail and by-date views through one owned projection

Type: AFK
User stories covered: US-012, US-014, US-020, US-021, US-028, US-036, US-106, US-107, US-113 (preserved behavior).

### What to build

Concentrate owner-scoped Diary loading, association ordering, projection-specific assembly, serialization, and snapshot policy behind a Diary reading module for detail and by-date reads. Integrate both existing HTTP paths and their browser/client consumers in this slice.

### Acceptance criteria

- [ ] Existing authorized reads preserve response fields, decimal/date formats, empty arrays, missing-record outcomes, and their distinct association projections. Cross-owner access remains rejected.
- [ ] Each detail/by-date read performs owner-scoped Diary existence, all associations included by that projection, and serialization from one read-only repeatable-read transaction. The snapshot is fixed by its first database read; existing missing-record/ownership outcomes and distinct association sets remain unchanged. Verify a self-consistent aggregate under a controlled concurrent update with real PostgreSQL rather than timing-only sleeps, and record this intentional consistency strengthening in the relevant ADR.
- [ ] Routes no longer assemble related Transactions, Trade Plans, Company links, and Alerts independently. Keep useful owner-scoped batched readers; do not replace them with pass-through wrappers.
- [ ] HTTP/client and browser evidence reads the same saved record by identity and date. Contract compatibility, representative associations, and bounded query behavior pass. No current race or speedup is claimed without evidence.

### Blocked by

None — can start immediately.

## A10 — Serve bounded Diary lists and private Review through the read module

Type: AFK
User stories covered: US-022, US-024, US-031, US-032, US-033, US-069, US-106, US-113 (preserved behavior).

### What to build

Integrate existing full-list, bounded-summary, and owner-only Review reads with the Diary reading module. Share projection ownership and association rules while keeping each consumer's purpose and privacy boundary explicit.

### Acceptance criteria

- [ ] Lists preserve filters, ordering, tie-breakers, pagination, existing snapshot behavior, and count/result agreement. Association loading remains batched rather than one query per Diary.
- [ ] Summary consumers remain bounded and exclude full body/private reflection where currently excluded. Review still exposes the owner's original judgment and separate retrospective fields.
- [ ] Partner sharing remains governed by its existing explicit projection and excludes Transactions, Portfolio, reminders, and private Review text; consolidation must not widen that projection.
- [ ] Disposable PostgreSQL and API/browser evidence covers list-to-detail, filtered Timeline, owner Review, and negative privacy cases. Projection code has one responsible module without a universal form or resource framework.

### Blocked by

- A09 — Read Diary detail and by-date views through one owned projection.

## A11 — Read Portfolio market context without building a full monitor

Type: AFK
User stories covered: US-041, US-042, US-077, US-079, US-080, US-082, US-089 (preserved behavior).

### What to build

Give Portfolio exposure and Market Rotation Monitor a shared read module for persisted Market State, Sector Breadth, allocation, and provenance dates. Keep ranking, comparison trends, and monitor-only summary construction in the monitor path.

### Acceptance criteria

- [ ] Portfolio no longer invokes the complete monitor to obtain market context and does not execute its comparison-history work. Verify the bounded read behavior with controlled query evidence rather than a claimed latency improvement.
- [ ] Both consumers use the persisted canonical regime, the existing 90%/availability gates, and explicit unknown values. Rank snapshot, Market State, and sector-summary dates remain separate.
- [ ] Missing/stale/under-covered market context preserves the existing best-effort holdings response and allocation uncertainty. No new upstream request occurs merely because a page is opened.
- [ ] Real PostgreSQL/API/browser fixtures verify mixed dates, absent sectors, qualified comparison history, unknown state, and holdings fallback, while existing monitor rankings/trends remain compatible.

### Blocked by

None — can start immediately.

## A12 — Recover full Diary and Review drafts through one lifecycle

Type: AFK
User stories covered: US-002, US-003, US-018, US-031, US-032, US-102 (preserved behavior).

### What to build

Consolidate account-and-Diary draft storage, expiry, debounce, restore pause, flush, and session-invalidation ordering across the full Diary editor and Diary Review. Keep dirty detection, payload normalization, restore merging, and save reconciliation owned by each form. Leave Quick Diary's uncertain-append recovery outside this refactor.

### Acceptance criteria

- [ ] Preserve existing 24-hour expiry, 600ms debounce, restore/discard choice, and unmount flushing. Invalid or unavailable storage remains recoverable without blocking the form.
- [ ] Automatic session expiry preserves eligible work; explicit and cross-tab sign-out clears it and suppresses late writeback. Another account cannot restore or see that draft.
- [ ] Successful save/Review completion cannot resurrect a stale draft. Research defaults, full-editor restored input, and Review-specific reflection merging retain their distinct precedence.
- [ ] Browser evidence covers both forms across reload, expiry/sign-in/restore, discard, rapid exit, successful save, and cross-tab sign-out. Reuse existing behavior tests and add only uncovered lifecycle regressions; avoid a configuration-heavy generic form engine.

### Blocked by

- Existing [63 — Research to Diary context handoff](issues/63-research-diary-handoff.md): preserve the accepted full-editor context and recovery behavior.

## A13 — Run Rotation scopes through shared execution with compatible outcomes

Type: AFK
User stories covered: US-079, US-082, US-097, US-110, US-111, US-113 (preserved behavior).

### What to build

Concentrate selected-scope expansion, ordered execution, accumulated results, and stop-on-failure behavior for the CLI and administrator HTTP batch entrypoint. Keep their intentionally different response/error policies at their existing boundaries. This slice consolidates execution without unifying external failure contracts.

### Acceptance criteria

- [ ] Single-scope and all-scope runs preserve sectors → indexes → core ordering, stop after failure, and retain successful persisted work. Do not introduce an all-scope transaction or parallel provider execution.
- [ ] CLI retains its job metadata, partial results, failure envelope, and error total based on symbol count minus upserts plus the failed-run increment. HTTP retains its schema, error-array totals on success, ordinary thrown errors, and busy 409 behavior.
- [ ] Administrator authentication, no-store behavior, per-scope locking, idempotent reruns, and existing structured operational evidence remain intact.
- [ ] Controlled-provider and real PostgreSQL evidence covers success, failure on a later scope, busy scope, rerun, CLI outcome, HTTP outcome, and reading the successfully persisted snapshot through the public monitor.

### Blocked by

None — can start immediately.

## Landing coordination

Independent tickets remain independently claimable. Assign explicit file ownership when scheduling work: the Quick Diary changes A01/A08 should land in a coordinated sequence; full-editor changes A02/A03 should do the same. Prefer consolidating recovery in A12 after the selected authoring improvements land, but do not label that preference as a false product dependency. A04/A05 can be scheduled separately around their reading/capture ownership. A09/A10 form a real architectural sequence; A11/A13 can proceed independently.

## Approval questions

1. Is the granularity appropriate, or should any slices be merged/split?
2. Are the existing-63 dependencies and A10 → A09 dependency correct?
3. Should lower-priority A07/A08 be included now or deferred?
4. Is AFK for all thirteen correct under the established Astra/Luna/Sol responsibilities, or does a specific slice need human involvement?
