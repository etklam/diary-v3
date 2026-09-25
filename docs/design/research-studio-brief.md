# Research Studio surface brief

Mode: Operate, with a Read report preview.
Authority: Astra direction under the existing delegated design responsibility; Luna implementation.

Extend the existing admin world from DESIGN. Use the current system font, graphite text, neutral canvas, raised white/dark surfaces, blue primary action, semantic focus rings, and the established 4px spacing scale. No new typography or palette. Keep 16px mobile and 32px desktop gutters. The heading is 24px/700, subsection titles 18px/700, body 16px, metadata 14px. Status always includes words.

The list uses an editorial work queue: title and one new-research action first, then compact instrument/status filters and rows showing instrument, reference session, quality, execution/review state, and last change. Empty state explains preparing evidence before generation. Settings is a secondary link rather than another primary action.

The new-run page is a short form with profile, supported instrument, timezone and as-of, followed by the instrument identity/benchmarks and an explicit prepare action. Coverage, missing evidence and preparation results precede generation. Never imply unavailable live sources are connected.

The detail header shows the instrument/report date, reference session, and separate quality/review labels. Below it use ordinary wrapping tab buttons for Preview, Evidence, QA, and Activity/Usage. Preview uses a readable 72ch column; evidence and QA use inspectable rows with dates and source links. At desktop a restrained side panel contains the current next action and limitations; at mobile it becomes a full-width section above the report. No nested scroll panes or hidden mobile actions. Explicit buttons advance generation, revision, approval and article handoff individually.

Show critical blocking reasons beside the disabled dependent action, with a usable next step. Never show a misleading enabled generation action for unavailable source/method configuration. Refresh restores persisted state. Revisions use a Markdown field with a preview and version-conflict feedback; share the current editor/renderer where practical. Settings explain free-only test routing and masked credentials without exposing secrets.

Use native inputs and buttons, associated labels, keyboard focus, aria-live for async outcomes and accessible selected tab state. Preserve zh-TW/zh-CN/en UI and light/dark themes. Long source URLs wrap, tables scroll only within an explicitly labelled container, and no page-level overflow at 390px.

Acceptance: desktop and mobile captures of list, detail, blocked preparation and error recovery; browser journey for creation, evidence inspection and refresh; conditional generation/approval/handoff journey using controlled fixtures. Keep screenshots and runnable evidence separate from claims of live research correctness.
