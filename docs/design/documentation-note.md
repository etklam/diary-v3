# Built Design System Record

Date: 2026-09-05. Artifacts: [DESIGN.md](../../DESIGN.md) and the [design.json sidecar](../../.impeccable/design.json).

The shipped documenter role is unavailable in this harness; a standalone documenter subagent read Impeccable `reference/document.md` and `reference/degraded/documenter.md` and performed substitute documentation. The context script, the detector, and a third round of UI changes were not re-run.

The record is based on the built styles and components in `apps/web/app/styles.css`, `root.tsx`, `ui.tsx`, `routes/preview.tsx`, `routes/new.tsx`, and `routes/diary.tsx`, plus the final verdict of the [independent finish review](finish-review.md). The [implementation brief](implementation-brief.md) is retained as design intent; DESIGN.md does not promote its unimplemented specs into features of the shipped system.

## Evidence and Limits

- [Round 1 screenshots](evidence/round-1/): representative real Diary and Overview screens, desktop and mobile.
- [Round 2 screenshots](evidence/round-2/): Overview, Company, Review, Quick Diary, the real Diary, and editor error, desktop and mobile. The finish reviewer opened and inspected all 12 screens; this record adopts that independent visual judgment and the existing source, without launching a separate browser sweep.
- The final verdict of the [finish review](finish-review.md) was to ship the ticket-03 representative design scope. The three fixes covered route selection/focus, API errors and field association, and early application of a saved theme.
- The reviewer's record reports from root that `first-diary.spec.ts` desktop/mobile and `design.spec.ts` passed. The latter covers three languages, 1440/390/320px, keyboard template switching, current language, no document horizontal overflow, theme reload, and route main focus; Quick Diary has evidence of a real create → read, Escape, and focus return. This cites reported verification results; the documenter did not re-run the tests.
- [detector.json](detector.json) is `[]`, produced by a single static TSX/CSS scan. It must not be read as runtime contrast, full WCAG, or assistive-technology certification.
- The bottom extension in the mobile Quick Diary full-page screenshot is a capture artifact from exceeding the modal viewport; no interactive-background design rule is derived from it. If root supplies a viewport-only re-capture, it does not constitute a third round of product changes.

## Recorded Scope Adjustments

The sidebar is currently 216px on desktop and 180px on tablet; mobile keeps two real navigation entries and the preferences menu at the top. There is no bottom navigation, no collapsing tablet menu, and no fake entries for unfinished modules. The initial product includes real login/registration and Diary creation/reading; Quick Diary reuses the API form, but the preview entry is not the full global quick-capture product. Overview/Company/Review are synthetic representations; Markdown and the full queue/research/templates/append are left to their own tickets.

Body fonts, colors, spacing, fields, dialogs, reading, and both themes were extracted from built code. The CSS has no general motion or box-shadow, so the sidecar invents no tokens for them. The OKLCH tonal ramps synthesized for panel display are explicitly labeled metadata and are not authoritative for adding new UI color steps. The sidecar only attaches metadata, breakpoints, six independently renderable component snippets, and a narrative mirroring this text; core tokens are governed by the DESIGN.md frontmatter.

The larger system-font headings on the home page were not promoted into brand display rules; local translation gaps such as the fixed Symbol and the Chinese/English error boundary were not recorded as norms that future work should inherit. No comp approval, user build-path preference, external brand commitment, or native-completion claim was invented.
