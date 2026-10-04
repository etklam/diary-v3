# Architecture and convenience follow-up issues

All thirteen tickets completed and accepted on 2026-09-19. Each ticket records `Execution: done` with runnable acceptance evidence. Consolidated verification: `docs/design/convenience-follow-up-acceptance.md`.

| Ticket | Draft | Type | Blocked by |
|---|---|---|---|
| [64 — Write Quick Diary content before optional setup](issues/64-quick-content-first.md) | A01 | AFK | 63 |
| [65 — Resolve a same-date full Diary conflict without losing work](issues/65-diary-date-conflict.md) | A02 | AFK | 63 |
| [66 — Open Review scheduling at the requested field](issues/66-review-scheduling-focus.md) | A03 | AFK | None |
| [67 — Read a saved Diary with clear original-judgment states](issues/67-diary-reading-states.md) | A04 | AFK | None |
| [68 — Open Evidence capture only when requested](issues/68-evidence-disclosure.md) | A05 | AFK | None |
| [69 — Read recent Timeline entries before expanding date filters](issues/69-timeline-compact-filters.md) | A06 | AFK | None |
| [70 — Reuse recent tags across Quick and full Diary authoring](issues/70-recent-diary-tags.md) | A07 | AFK | None |
| [71 — Continue from a confirmed Quick Diary save](issues/71-quick-save-continuation.md) | A08 | AFK | 63 |
| [72 — Read Diary detail and by-date views through one owned projection](issues/72-diary-detail-read-module.md) | A09 | AFK | None |
| [73 — Serve bounded Diary lists and private Review through the read module](issues/73-diary-list-review-projections.md) | A10 | AFK | 72 |
| [74 — Read Portfolio market context without building a full monitor](issues/74-market-context-read-module.md) | A11 | AFK | None |
| [75 — Recover full Diary and Review drafts through one lifecycle](issues/75-diary-draft-lifecycle.md) | A12 | AFK | 63 |
| [76 — Run Rotation scopes through shared execution with compatible outcomes](issues/76-rotation-scope-execution.md) | A13 | AFK | None |

## Additional architecture deepening

The separately approved [architecture deepening follow-up](ARCHITECTURE-ISSUES.md) published tickets 77–81 on 2026-09-20. All five now have Execution: done and runnable acceptance evidence in their ticket files; they are included in the completed follow-up set.


## Current completion reconciliation — 2026-09-25

Tickets 64–81 are all recorded Execution: done; earlier pending paragraphs in ticket 63 are superseded by its 2026-09-19 completion reconciliation and acceptance record. Tickets 62 and 63 were checked against their narrative acceptance and evidence records even though those two issue templates use prose bullets rather than checkboxes. Local acceptance across these tickets is included in the [all-ticket acceptance inventory](../../docs/features/all-tickets-acceptance-2026-09-25.md). No remote CI run, push or production action is implied.

## Additional ticket discovery — 2026-09-25

| Ticket | Title | Recorded state | Issue file |
|---|---|---|---|
| 62 | Daily Workspace & First-use Flow | Execution: done | [62-daily-workspace.md](issues/62-daily-workspace.md) |
| 63 | Research to Diary context handoff | Execution: done | [63-research-diary-handoff.md](issues/63-research-diary-handoff.md) |
| 64–81 | Convenience and architecture follow-ups | All record Execution: done; individual links are listed above and in the architecture index. | [Architecture deepening index](ARCHITECTURE-ISSUES.md) |
| 82 | Return exact per-user Diary counts in Admin inventory | done; focused HTTP and Admin browser reruns passed. | [82-admin-users-diary-count.md](issues/82-admin-users-diary-count.md); [final verification](../../docs/features/all-tickets-acceptance-2026-09-25.md) |

The consolidated [All-ticket acceptance inventory — 2026-09-25](../../docs/features/all-tickets-acceptance-2026-09-25.md) records the completed local verification, including the separate E2E reruns and the remaining external acceptance gates.

## Capture-cost follow-ups — 2026-10-04

A review of input cost across `/diaries/quick` and `/diaries/new` produced eleven findings;
these are the ones judged worth scheduling. Seven are specified and unimplemented, and one is a
design question that refines already-accepted work rather than reporting a defect.

Two findings were deliberately not filed, and should not be revived without new evidence:
loosening the submit lock on the destination lookup, and removing the create/append `<select>`.
Both sit inside the uncertain-append state machine guarded by
`tests/e2e/diary-response-loss.spec.ts`, against benefits that only appear on a degraded
network or amount to one saved glance. Three further findings were ruled low return: moving
snippets and recent tags to the server, replacing the tag inputs with a chip control (the
eight recent-tag chips from [70](issues/70-recent-diary-tags.md) already cover repeat tagging),
and merging the two authoring routes — the last being a maintenance argument about two
overlapping state machines rather than an input-cost one.

**All five were re-evaluated on 2026-10-04 and three no longer stand as written.** See the
Diary authoring redesign section below and the "Re-evaluated exclusions" section in
[97](issues/97-quick-composer-redesign.md) before citing the paragraph above.

| Ticket | Title | Recorded state | Issue file |
|---|---|---|---|
| 84 | Close the Quick Diary keyboard loop with Cmd/Ctrl+Enter | ready-for-agent; Execution: todo | [84-quick-keyboard-submit.md](issues/84-quick-keyboard-submit.md) |
| 85 | Launch straight into capture from the installed app icon | ready-for-agent; Execution: todo | [85-app-shortcuts-to-capture.md](issues/85-app-shortcuts-to-capture.md) |
| 86 | Receive shared links and text into a Quick Diary draft | ready-for-agent; Execution: todo; blocked by 85 | [86-share-target-into-quick-diary.md](issues/86-share-target-into-quick-diary.md) |
| 87 | Offer prefilled capture from holdings, watchlist and price alerts | ready-for-agent; Execution: todo | [87-prefilled-capture-entries.md](issues/87-prefilled-capture-entries.md) |
| 88 | Stop requiring a title in the full Diary editor | ready-for-agent; Execution: todo | [88-full-editor-title-derivation.md](issues/88-full-editor-title-derivation.md) |
| 89 | Suggest company symbols the account already tracks | ready-for-agent; Execution: todo | [89-company-symbol-suggestions.md](issues/89-company-symbol-suggestions.md) |
| 90 | Remove the cold-start wait before the Quick Diary writing area | ready-for-agent; Execution: todo; blocked by 85 | [90-quick-cold-start-wait.md](issues/90-quick-cold-start-wait.md) |
| 91 | Revisit the destination summary sitting above Quick writing | needs-triage; refines accepted work in [64](issues/64-quick-content-first.md) | [91-quick-destination-placement.md](issues/91-quick-destination-placement.md) |

Suggested order: 84, 85 and 87 first — each is additive, cheap, and touches no write semantics.
Then 86 and 88. Then 89 and 90, with 90 after 85 because the launcher shortcut is what makes
cold-start capture a primary path. 91 is ruled inside 97 and closes as absorbed.

No implementation, verification or acceptance is recorded for any of these tickets yet.

## Article translation management follow-up — 2026-10-04

| Ticket | Title | Recorded state | Issue file |
|---|---|---|---|
| 92 | Batch-manage and retranslate article translations | needs-triage; Execution: todo | [92-article-translation-bulk-management.md](issues/92-article-translation-bulk-management.md) |

## Desktop workspace layout follow-up — 2026-10-04

| Ticket | Title | Recorded state | Issue file |
|---|---|---|---|
| 93 | Use desktop workspace width more effectively | needs-triage; Execution: todo | [93-desktop-workspace-space-utilization.md](issues/93-desktop-workspace-space-utilization.md) |

## Quick Diary button consistency follow-up — 2026-10-04

| Ticket | Title | Recorded state | Issue file |
|---|---|---|---|
| 94 | Standardize button sizing across Quick Diary editing | needs-triage; Execution: todo | [94-quick-diary-button-consistency.md](issues/94-quick-diary-button-consistency.md) |

## Dropdown layout density follow-up — 2026-10-04

| Ticket | Title | Recorded state | Issue file |
|---|---|---|---|
| 95 | Reduce excess space in dropdown controls and lists | needs-triage; Execution: todo | [95-dropdown-layout-density.md](issues/95-dropdown-layout-density.md) |

## Trading principles page redesign — 2026-10-04

| Ticket | Title | Recorded state | Issue file |
|---|---|---|---|
| 96 | Rebuild the Trading principles page around reading, not managing | needs-triage; Execution: todo | [96-discipline-page-redesign.md](issues/96-discipline-page-redesign.md) |

## Diary authoring redesign — 2026-10-04

| Ticket | Title | Recorded state | Issue file |
|---|---|---|---|
| 97 | Redesign both diary authoring surfaces as one writing system | needs-triage; Execution: todo; covers /diaries/quick and /diaries/new; consumes 91 and 94 | [97-quick-composer-redesign.md](issues/97-quick-composer-redesign.md) |
| 98 | Derive recent tag suggestions from saved diaries | needs-triage; Execution: todo | [98-recent-tags-from-saved-diaries.md](issues/98-recent-tags-from-saved-diaries.md) |
| 99 | Redesign the Diary calendar around density and legible destinations | needs-triage; Execution: todo | [99-calendar-redesign.md](issues/99-calendar-redesign.md) |

The five findings the capture-cost review declined to file were re-evaluated on 2026-10-04 at the
user's request. Upheld: the tag chip control, moving snippets to the server, and merging the two
authoring routes. Overturned in part and folded into [97](issues/97-quick-composer-redesign.md):
the submit lock (kept, but a submit arriving during the lookup is queued instead of swallowed,
because [84](issues/84-quick-keyboard-submit.md) shipped `Cmd/Ctrl+Enter` after that ruling), the
create/append `<select>` (kept, but stops offering the combination that can only 409), and tag
entry (the chip control stays rejected; splitting on commas does not). Split out as its own
ticket: recent tags, which are derived data and far cheaper than the snippets they were priced
with. Reasoning is recorded in [97](issues/97-quick-composer-redesign.md) under
"Re-evaluated exclusions".
