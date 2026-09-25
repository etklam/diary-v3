# Research method bundle

The Research Studio method is the versioned `us-equity-swing-report` profile at
version `1.0.0`. The source evidence is the checked-in Notion export at
`tests/fixtures/research-method/notion-pages.json`; Notion is not a runtime
dependency.

The export contains the main method and seven appendices. The fixture SHA-256 is
`b45697fb82435cfc4c45961620be209ab8ebe59f558e36c02bcda380eff6206d`. The
per-page hashes in [source-inventory.json](./source-inventory.json) hash the
decoded page `text` field only. They do not claim to hash the JSON envelope,
Notion transport metadata, or a missing original ZIP.

The TypeScript replacement calculator is
`ts-research-calculator-1.0.0`, exported from
`packages/domain/src/research-studio.ts`. It is pure and deterministic: the
caller supplies a canonical, verified session calendar and bars; the module
performs validation, explicit price normalization, indicators, completed-week
aggregation, common-window relative strength, pivots, gaps, structural levels,
reward/risk arithmetic, and the transparent direction score.

The source export was captured at `2026-09-24T17:41:21.300Z`; the page edit
timestamps are retained separately as `sourceEditedAt`. The supplied original
Python calculator and its reported 36 tests were not present in the repository
or Downloads during implementation. This release therefore records a reviewed
TypeScript replacement and local golden tests; it does not claim equivalence to
the unavailable Python artifact or that the original 36 tests were run.

The method deliberately keeps evidence and manual review outside the calculator.
Subjective patterns, event confirmation, source rights, citation support,
report contradictions, and publication decisions remain gated by the backend
and reviewer workflow. `RESEARCH_METHOD_BUNDLE.coverage` is the machine-readable
coverage manifest used by the worker and tests.

