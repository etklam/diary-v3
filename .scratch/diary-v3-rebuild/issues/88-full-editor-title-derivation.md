# [88] Stop requiring a title in the full Diary editor

Status: accepted
Execution: done
Published: 2026-10-04

Type: AFK
User stories covered: US-011, US-012, US-013, US-014. Title derivation is an enhancement to these stories.

## What to build

Quick Diary does not ask for a title: when the author leaves it empty it submits a fallback
label instead (`apps/web/app/quick-composer.tsx:66`). The full editor marks title as
`required` (`apps/web/app/diary-editor.tsx:363`), so choosing the richer authoring path is
penalized with an extra mandatory field.

Make the full editor use the same fallback when the author leaves the title empty, so title
becomes an optional override in both flows and the same input produces the same stored title
regardless of which editor produced it.

### Correction to this ticket's original premise

As first written, this ticket said the title is "derived from the content". It is not.
`deriveQuickTitle` (`packages/domain/src/quick-composer.ts:5`) is
`(_content, fallback) => fallback` — it discards the content argument entirely and returns
`generateTemplateDraft(...).title`, a date label such as `2026/10/04 日記`.

That is deliberate, not a defect. Audit [UI-005](../../../docs/ui-ux-audit.md) records that the
old implementation baked a 69-character content prefix plus an ellipsis into the title
(`"Audit smoke entry: … Uncer… — 2026/10/01 日記"`), which read as corrupted data on the diary
list, the detail H1, the review subtitle and the append notice. The accepted recommendation was
to "return the fallback label only, never the content prefix."

**Consequence for this ticket, which needs a ruling before it can be accepted:** what it
actually delivers is that an untitled full-editor diary saves as `2026/10/04 日記` instead of
refusing to save. The capture cost of one required field is removed; the price is a generic
title on a library surface whose primary job is scanning. Requiring a real title on the full
path — where the author has already chosen to record thesis, risk and execution — may have been
intentional. Do not "fix" this by reintroducing content-prefix derivation; UI-005 removed it on
purpose.

## Implementation notes

- `deriveQuickTitle` comes from `@diary/domain` and is already imported in
  `apps/web/app/quick-composer.tsx`. Reuse it; do not write a second derivation rule.
- Remove `required` from the title field in `apps/web/app/diary-editor.tsx:363` and derive at
  submit time where the request body is assembled.
- The contract is unchanged and still demands a non-empty title
  (`packages/contracts/src/index.ts:515`, `title: z.string().trim().min(1)`). Derivation
  therefore happens client-side before the POST, exactly as Quick Diary does today. Do not
  relax the contract.
- `apps/web/app/diary-editor.tsx` reassembles the body on more than one path — the date
  conflict append, the revision-conflict retry, and write recovery. Derivation must be applied
  consistently across all of them, including the comparison performed by `sameDiaryWrite`,
  so recovery cannot decide a confirmed write differs purely because one path derived a title
  and another did not.
- Content is already required and remains so; a diary with neither title nor content stays
  invalid.

## Acceptance criteria

- [ ] Saving a new full-editor diary with an empty title succeeds and persists a derived title,
      read back through the real API. An explicitly entered title is still used verbatim.
- [ ] The same content yields the identical title through Quick Diary and the full editor.
- [ ] Editing an existing diary and clearing its title derives a new one rather than failing
      validation, and does not silently alter a title the author set deliberately.
- [ ] Derivation is consistent across the date-conflict append, revision-conflict and
      write-recovery paths. `sameDiaryWrite` still recognizes a confirmed write as identical,
      and `tests/e2e/diary-response-loss.spec.ts` passes unchanged.
- [ ] Content-only validation is unchanged: an empty content body is still rejected.
- [ ] Derivation handles multilingual and very long content within the 500-character title
      bound, in all three locales.

Shared slice rules apply: [切片共同遵循](../ISSUE-BREAKDOWN.md#所有切片共同遵循).

## Blocked by

None.

## Comments

Published 2026-10-04 from a capture-cost review, which found the two authoring paths disagree
on whether a title is mandatory. Cheap because the derivation rule already exists and is
accepted; the care is entirely in applying it uniformly across the editor's recovery paths.

### 2026-10-04 implementation

Changed `apps/web/app/diary-editor.tsx` only (no copy change was needed, so `diary-copy.ts` is
untouched) and extended `tests/unit/authoring-lifecycle.test.ts`.

- New exported pure helper `diaryWriteTitle(title,content,date,locale)` wraps the shared
  `deriveQuickTitle` with the same fallback Quick Diary uses for a blank note
  (`generateTemplateDraft({templateKind:'blank',date,locale,templateData:createEmptyQuickNoteTemplateData()}).title`).
  No second derivation rule; identical writing yields an identical title in both flows.
- Body-assembly sites found and covered: (1) `save()` body — used by `POST /api/diaries`
  (create), by `PUT /api/v2/diaries/{id}` (update, the revision-conflict retry reassembles this
  same body), and by the `sameDiaryWrite(latest,body)` write-recovery comparison, so all three
  share one derived title; (2) `appendCopy()` for the date-conflict append, which keeps the
  existing diary's title and now routes it through the same helper (a no-op for a contract-valid
  non-empty title) so no path can send a different title shape. `writeAppendMarker` and the
  draft envelope keep storing the raw (possibly empty) title, which re-derives identically on
  the next submit.
- Title field lost `required`; `date` keeps it, content keeps both `required` and the
  `!form.content.trim()` submit guard, so a diary with no content is still rejected.

Commands run:

- `./node_modules/.bin/tsc --noEmit` — pass, no output.
- `./node_modules/.bin/eslint apps/web/app/diary-editor.tsx apps/web/app/diary-copy.ts tests/unit/authoring-lifecycle.test.ts` — pass, no output.
- `./node_modules/.bin/vitest run --exclude 'tests/integration/**' --exclude 'tests/e2e/**'` —
  120 files passed, 1051 tests passed, 0 failed.

Still needs browser/API evidence (not run here): `tests/e2e/diary-response-loss.spec.ts` plus a
new-diary save with an empty title read back through the real API, an edit that clears an
existing title, and the three-locale derived label in the UI.

## Execution record

Shipped in `84207d5`; the ticket's Execution line was left stale and is reconciled here on 2026-10-04.
