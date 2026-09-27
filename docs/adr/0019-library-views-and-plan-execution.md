# ADR-0019: Saved diary views and explicit plan execution comparison

Status: Accepted for local implementation, 2026-09-28.

## Context

Diary library filters already have a validated URL model. Users need to reuse those filters without storing private result sets. Trade Plans describe intended decisions but previously had no explicit, versioned association with recorded execution. Legacy maximum position size has no reliable unit.

## Decision

Persist at most twenty named views per owner. Version 1 stores only supported filters and ordering; page numbers, result IDs and return URLs are excluded. Names are bounded to eighty characters and unique case-insensitively per owner. An owner advisory lock serializes the quota check and creation. Unsupported stored query/schema versions are omitted from the usable list instead of failing the entire library. Applying a view updates the validated URL and resets pagination; later filter edits do not overwrite the stored view.

Search remains escaped, parameter-bound substring matching. After filtering and pagination, a bounded plain-text snippet and source/ranges describe actual matches. React renders text and mark nodes. No HTML interpretation, client-side corpus download, tokenizer or per-result query is introduced.

Execution comparison requires manual confirmation of a plan snapshot and whole recorded transactions. Owner and symbol checks, transaction locks, an exclusive non-null transaction relation and execution revision checks protect associations. No allocation, inferred matching, ledger rewrite or broker import is added. Baseline rows are immutable, numbered snapshots; later plan edits produce an outdated comparison until the user explicitly establishes another version. Confirmation time is compared with the immutable selected transaction dates, so retrospective confirmation remains visible after transaction edits or deletion.

Selected transaction snapshots retain their original identity and facts. Source deletion nulls the live relation without removing the evidence; source edits become a visible conflict and suppress misleading totals. Removal is explicit. Retained snapshots are not silently re-captured when the user saves a reason or changes another selection.

Domain arithmetic uses existing exact decimal helpers. Buy quantity weights buy prices; sell fills remain visible but never enter buy averages. Price difference and percentage difference are distinct, and entry-zone comparison is separate. Missing inputs, zero denominators and invalidated relations return unavailable values. Legacy maximum position size remains `unknown`; cumulative buys are not peak holdings. Fees, FX and corporate actions are outside the comparison scope.

## Consequences

These are additive owner-scoped tables and new endpoints. Existing strict diary, plan and native response shapes remain intact. Deploy the complete migration chain before the new API and Web assets. The feature supplies evidence for reflection, not trade recommendations or automated compliance judgments.

Search snippets require `X-Diary-Search-Snippet: 1`. Watchlist management response fields require `X-Watchlist-Features: management-v1`, including mutation responses. Without those opt-ins, the API omits new response keys so previously released strict validators remain compatible. The current Web explicitly opts in; the new runtime fields are optional for gradual rollout.
