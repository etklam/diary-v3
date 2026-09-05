# Timeline source and integration record

Frozen sources read: `composables/useTimelineDiaries.ts`, `pages/timeline/index.vue`, and `lib/diary-excerpt.ts` inside `docs/parity/source-snapshot.tar.gz`.

Implemented reading scope: server-side civil date range with 20-row pages, newest-first month groups, full titles and dates, first two tags, source-compatible compact Markdown excerpt, safe inline expansion of original content, and the correct Diary destination. The compact projection explicitly picks allowed fields: no Review summary, learning or adjustment text enters Timeline state or rendering. Transaction/alert counts and reviewed/outcome signals render only when actual response data supports them.

Load-more advances only after a successful response, retains loaded entries on failure, and retries the same page. Filter changes abort and invalidate older requests. Successful global Quick Diary captures refresh the current range. ID merge also deduplicates within an incoming batch; the legacy helper only checked previously loaded IDs. Canonical decimal ID tie ordering uses BigInt instead of lexical/Number conversion; unit tests cover IDs beyond the safe-number range.

The redesigned reading stream uses flat separators and an explicit expandable Markdown body. It retains the source's compact scan path without truncating the available original writing. Month labels format an explicit civil-month UTC anchor, so the display never shifts to a neighboring month in another timezone.

## Other slices

- [30 Decision agenda](../../.scratch/diary-v3-rebuild/issues/30-overview.md) owns the source overview panel: portfolio valuation and coverage, attention items, recent activity, upcoming/unscheduled reviews. This Timeline does not invent portfolio values or empty successful projections.
- [38 comparison](../../.scratch/diary-v3-rebuild/issues/38-pair-view.md) owns the source paired-comparison mode. No dead comparison route is shown.
- [14 trade-plan](../../.scratch/diary-v3-rebuild/issues/14-trade-plans.md) status summaries and [31 persisted alert](../../.scratch/diary-v3-rebuild/issues/31-diary-alerts.md) counts require their relation slices to extend the canonical response. The frozen renderer reads `tradePlanSummary.total` and `.statuses[{status,count}]`; these must be connected when that API projection is delivered. Current unavailable summaries are not represented as zero.
