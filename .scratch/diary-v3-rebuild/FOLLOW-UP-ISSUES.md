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
