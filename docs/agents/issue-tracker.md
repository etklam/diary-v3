# Issue tracker: Local Markdown

Issues and PRDs for this repo live as Markdown files in `.scratch/`. The active core feature is [diary-v3-rebuild](../../.scratch/diary-v3-rebuild/ISSUES.md). Its parent PRD is immutable; subsequent approved scope uses follow-up issues or a separate feature specification. Current coverage and external release blockers are summarized in the [acceptance inventory](../features/all-tickets-acceptance-2026-09-25.md).

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Keep triage role and execution state separate. The original core tickets use `Status: done` for completed execution; later tickets may retain `Status: ready-for-agent` with a separate `Execution: done`. Read both fields and the acceptance evidence rather than treating the planning index as a live queue. Use the canonical roles in [triage-labels.md](triage-labels.md).
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
