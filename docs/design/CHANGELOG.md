# Design changelog

Dated design decisions, supersessions, and provenance notes. DESIGN.md states only the rules currently in force; this file records how they got there and what they replaced. Entries are additive — do not rewrite or delete recorded decisions.

## 2026-10-01 — Market color preference, danger buttons, language font stacks, skeleton

- **Market color convention preference.** New user preference (localStorage `diary-market-color`, applied in the head script like `diary-theme`): `standard` (green up / red down, default), `cn` (red up / green down), `cb` (colorblind-safe blue/orange). Implemented as CSS variable overrides on `[data-market-color]`; sign characters (`+`/`−`) from `formatMarketValue` remain the primary direction signal, so color never carries direction alone.
- **Danger button promoted.** The `.danger-button` style moved from `diary-editor.css` to the shared stylesheet and is applied to delete actions (diary delete dialog, achievements, admin accounts, admin blog, ETF catalog, diary saved views). Every destructive action keeps its explicit consequence text and confirmation step.
- **Per-language font stacks.** `html[lang="zh-CN"]` now selects Simplified-Chinese glyphs (PingFang SC, Microsoft YaHei, Noto Sans CJK SC); `html[lang="en"]` drops CJK families. The default stack remains Traditional-Chinese-first for zh-TW.
- **Skeleton loading.** Shared `.skeleton` pulsing placeholder plus a `LoadingBlock` component; applied to holdings, timeline, and achievements initial loads. Loading is no longer text-only for list/table surfaces.
- Known gaps deliberately deferred: signed-in market-color sync to account settings, skeleton coverage beyond the three pages above, a shared quiet-button variant.

## 2026-09-07 — Visual layering supersedes the Flat Surface Rule

The user approved a visual upgrade with more layering and product polish. The former **Flat Surface Rule** (no shadows anywhere) and the 4px/8px radius record were superseded by the `shadow-1`/`shadow-2` tokens, the `--radius-control` (6px) / `--radius-card` (10px) / `--radius-pill` tokens, and raised card surfaces. Everything else in the earlier record that was not restated remained in force: semantic theme swapping, financial color isolation, gutter ownership, and reading-density rules.

Same date: the external product name became **Trade basic** (strict casing), replacing the former `diary-v3` wordmark in user-facing surfaces only. Repo, package, database, env, storage keys, auth cookies, and historical documents kept their names.

## Decision Agenda (North Star) — provenance

"Decision Agenda" is the direction name the agent adopted under the user's delegated design authority, not a confirmed external brand commitment. It describes the intent — neutral gray canvas, white surfaces, graphite text organizing dates, judgments, and later reflections — and remains a working name until the user confirms or replaces it.

## Earlier records and standing caveats

- The original records are superseded piecewise by DESIGN.md; where an earlier record says something DESIGN.md no longer states, DESIGN.md wins.
- The design deck's "all inputs 16px" claim was never the implementation — record the working sizes (44px minimum control height, `.75rem`→13px small text floor) instead of the deck's claim.
- Documentation-only refreshes (for example the 2026-09-27 navigation review) change documentation, not visual implementation; a review date is not a runtime verification claim.
- Route-boundary fallback text (bilingual Chinese/English) and the fixed table Symbol header are known partial i18n, not full trilingual coverage.
