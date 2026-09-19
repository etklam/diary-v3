---
target: Daily-work convenience and diary-vue comparison
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-19T07-50-06Z
slug: apps-web-app-routes-timeline-tsx
---
Method: dual-agent (A: /root/ux_design_a · B: /root/ux_evidence_b)

# Daily-work convenience review — Trade basic

Date: 2026-09-19. Target: `apps/web/app/routes/timeline.tsx` and adjacent Quick Diary, Diary authoring, reading, discovery, and Review flows. Mode: Operate / Read. This is an analysis and proposal, with no application changes.

## Design specificity and overall impression

The date-led Diary, Company context, original judgment, and private retrospective Review make the product specific to investment decisions. Keep the neutral visual system and the distinction between original evidence and later reflection. The main opportunity is to put writing and reading before optional configuration.

Two independent native-browser assessments inspected the disposable synthetic environment at desktop 1280×720 and mobile 390×844. Assessment A created one synthetic Diary and scheduled a Review. Assessment B made no data changes. This was a bounded usability inspection, not a complete accessibility or reliability acceptance run.

## Design health score

| # | Heuristic | Score | Key observation |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Saved, loading, draft, and Review state are visible. |
| 2 | Match with the real world | 3 | Original judgment and reflection are clear; capture starts with configuration. |
| 3 | User control and freedom | 3 | Back, cancel, filter reset, and dirty-exit guards exist. |
| 4 | Consistency and standards | 3 | Visual controls are coherent; tag editing differs across authoring flows. |
| 5 | Error prevention | 3 | Draft safeguards and validation exist; same-day full authoring lacks a recovery choice. |
| 6 | Recognition rather than recall | 2 | Review scheduling sends the user to the top of a long editor. |
| 7 | Flexibility and efficiency | 3 | Keyboard capture, templates, snippets, and URL filters exist. |
| 8 | Aesthetic and minimalist design | 3 | Quiet visual language; optional fields occupy primary reading/writing space. |
| 9 | Error recovery | 3 | Recovery paths exist in source; network failures were not injected in this review. |
| 10 | Help and documentation | 2 | Local hints and public Guide exist; workspace help is hard to discover. |
| **Total** | | **28/40** | **Good; heuristic judgment, not a measured user-success rate.** |

## What works

- Original Diary content, investment judgment, and private Review keep their distinct meaning.
- Local drafts, dirty-state guards, saved feedback, and session recovery provide confidence while writing.
- URL-backed filters, date-based reading, and due-today/overdue Review groups support returning to work.

## Priority issues

### P1 — Quick Diary makes the user configure before writing

On mobile, the content textarea starts near y=816 in an 844 px viewport; date, save mode, template, Company, title, and preview precede it. Both assessments observed this ordering. An append still exposes a title input even though the existing Diary title is preserved.

Put free-form content first. Present the selected date and create/append destination as a compact, editable summary. Disclose optional metadata and templates after the writing area; show the existing target title when appending. Focus the textarea for the desktop keyboard shortcut, without forcing the mobile keyboard open.

Preserve templates, Company links, snippets, voice, drafts, and explicit append semantics. Mobile Quick Diary already has a sticky save control; it is not missing. Suggested command: `$impeccable distill`.

Evidence: `apps/web/app/quick-composer.tsx:55`, `apps/web/app/quick-entry.tsx:42`, `apps/web/app/quick.css:174`.

### P2 — A same-day full Diary conflict offers an unhelpful next step

The full editor maps `DIARY_ALREADY_EXISTS` to “Choose another date.” It provides no same-day edit/append choice. Quick Diary already checks the date and selects append, so this is a gap in full authoring, not every capture path. This finding is source-supported, not a newly reproduced failure.

Show the existing Diary and explicit “Edit existing / Append this writing / Cancel” choices while preserving the unsaved draft. Keep server-side uniqueness authoritative and retain the existing response-loss safeguards; an early lookup alone cannot prevent races.

Evidence: `apps/web/app/api-error.tsx:31`, `apps/web/app/diary-editor.tsx:249`, `apps/web/app/quick-composer.tsx:45`. The frozen and current diary-vue `lib/diary-authoring/date-conflict.ts:83` and `components/diaries/DiaryAuthoringForm.vue:21` demonstrate a usable interaction. Suggested command: `$impeccable shape`.

### P2 — Review scheduling loses the action's location

“Schedule Review” and “Change Review schedule” open the full editor at its top. The scheduling field follows content, tags, original judgment, and Transactions. In the inspected desktop new editor, the scheduling section begins near y=2003 and Save near y=2413 on a 2489 px page.

First, link to a real scheduling anchor, scroll and focus the field, and preserve the return context. A later dedicated scheduling editor may reduce the task further, but it requires an explicitly scoped write operation and must not submit stale Diary fields.

Evidence: `apps/web/app/routes/diary.tsx:29`, `apps/web/app/routes/diary-review.tsx:90`, `apps/web/app/diary-editor.tsx:287`. Suggested command: `$impeccable shape`.

### P2 — Reading a saved Diary resembles an unfinished form

A short Diary is followed by three empty original-judgment sections, Review material, and an expanded research-evidence form before the Edit action. On mobile, empty original sections also delay the Review reflection area.

Move Edit near the reading title. Expand the evidence form only after an explicit action. When all original judgment fields are absent, summarize that state once; when present, keep the original evidence readable and distinct from reflection. Do not hide an existing judgment behind a misleading empty state.

Evidence: `apps/web/app/routes/diary.tsx:29`, `apps/web/app/evidence.tsx:63`, `apps/web/app/routes/diary-review.tsx:90`. Suggested command: `$impeccable distill`.

### P2 — Mobile Timeline shows filtering before the first memory

With one synthetic Diary, the mobile first screen is consumed by the heading, capture action, reading-mode switch, empty date inputs, and Apply/Clear. The first Diary remains below it.

Start with recent entries and a compact date-range summary. Expand exact date controls on request; presets such as this week/this month can shorten common tasks. Active filters must remain visible and clearable. Preserve URL state and history restoration.

Evidence: `apps/web/app/routes/timeline.tsx:14`, `apps/web/app/timeline.css:40`, `apps/web/app/timeline.css:152`. Suggested command: `$impeccable adapt`.

## Cognitive load and emotional journey

Quick Diary introduces at least five categories of setup before free-form writing. This is sequential decision burden, not a claim that its four-template chooser violates a four-option limit. The evidence source selector has ten choices; Diary-origin capture can lead with its relevant default. The library's advanced-filter disclosure and Review's collapsed secondary buckets already demonstrate a useful pattern to reuse.

The emotional high point is a confirmed save. Following it with repeated empty sections and an expanded input form weakens the feeling of completion. Keep the successful save, readable memory, and obvious next action together.

## Persona red flags

- **Casey, distracted mobile user:** the first capture screen delays writing; Timeline delays the first record; Review scheduling requires a long scroll.
- **Alex, frequent keyboard user:** the existing shortcut is useful, but its initial focus goes to Close; a scheduling link does not focus the requested task.
- **Jordan, first-time user:** three empty judgment sections and a research-evidence form can make an already saved Diary look incomplete.

## diary-vue patterns worth absorbing

The frozen baseline is `47f8313bf29870b52582db97209bef2e1cbe41ce`. Eight selected files were checked against the recorded SHA-256 manifest and match the current local diary-vue checkout at `bb4837e`. Legacy comparison is source-based; the old application was not run.

| Pattern | Recommendation | Adaptation for v3 |
|---|---|---|
| Same-date conflict choices | Strong | Preserve drafts and offer edit/append/cancel in full authoring. |
| Content-first Quick Diary and compact metadata | Strong | Reuse task order and progressive disclosure; implement in React with current tokens. |
| Recent/default tag chips | Worth exploring | Keep an explicit whole-tag input; do not copy comma splitting or browser-global tag history. |
| Post-save continuation | Worth exploring | Offer a quiet next step or continue-writing action; do not copy the old eight-second timeout. |
| Concentrated Diary read projections | Strong | Supports architecture candidate 1; reuse the ownership of assembly, not Prisma or Vue dependencies. |

Legacy evidence: `components/quicknote/QuickNoteEditorCore.vue:30`, `components/QuickTags.vue:62`, `components/QuickDiaryOneLiner.vue:10`, `server/utils/diary-read.ts:50`. Retain v3's exact decimal handling, explicit date semantics, account-scoped recovery, bounded summary reads, and runtime-neutral shared packages.

## Deterministic scan and limitations

Assessment B ran the detector once on nine named TSX files: Timeline, root, navigation, Quick entry, Quick composer, Diary editor, Diary library, Review queue, and Diary Review. Result: zero findings, zero triggered rules, zero flagged locations, and no false positives. The static scan did not flag the workflow costs observed in both browser reviews.

Native screenshots, accessibility state, read-only DOM geometry, and source inspection supplied browser evidence. No live overlay was injected because the available native evaluate interface is read-only. The clean detector result does not establish accessibility conformance or complete usability.

## Minor observations

Tag entry differs between Quick and full authoring. A visible Guide entry in the workspace could improve discovery. These follow the high-frequency workflow changes above.

## Questions for the next step

1. Prioritize capture convenience, reading/Review convenience, or the Diary reading Module?
2. Should the first pass cover the top three improvements, or the complete set of five?
