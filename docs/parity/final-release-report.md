# Final release acceptance — complete

All61 tickets are accepted, including the final cross-cutting verification. The authoritative inventory is [inventory.json](inventory.json): 212 source entries and114 stories. [Coverage checkpoint](coverage-checkpoint.md) records ownership and accepted feature coverage; it does not replace the final gates.

## Current whole-repository evidence

- `npm run contracts:check` passed for the current registered API, schemas and generated client.
- After fixing35 concrete unused-binding/Service Worker-global/test-type lint errors, `npm run lint` and `npm run build` passed.
- `npm test`: **122 files,795 tests passed**, including disposable PostgreSQL integrity, authorization, concurrency, native-session transport and shared domain suites. Duration43.43s; raw local log `/tmp/diary-v3-final-gates-resume.log`.
- Chrome verification now covers all 132 unique cases: the previously passed126 list (`/tmp/diary-v3-e2e-passed.txt`) plus the remaining6, which passed in one resumed run (`PLAYWRIGHT_CHANNEL=chrome npx playwright test --max-failures=6 --test-list-invert /tmp/diary-v3-e2e-passed.txt`: 6 passed,17.6s, 2026-09-06; raw log [browser-final-six.log](browser-final-six.log)). Corrections retained existing assertions and are test-only except one scoped CSS property: registration links are scoped to `#main` so the public banner copy no longer creates strict-mode ambiguity while `returnTo` stays preserved (discipline-share, first-diary both viewports); the shared ETF catalog cases now pin the common seed at24 (`Added`+`Skipped` parsed from the admin notice) and assert the catalog count equals the reported `Total` — the union with entries earlier catalog CRUD legitimately leaves — instead of a bare24, without deleting shared records; and the mobile390 market-rotation overflow was traced to visually-hidden `position:absolute` trend spans escaping the `.rotation-table-scroll` clip (document scrollWidth 1333px), fixed by `.rotation-trend-cell{position:relative}` so the wide table keeps its own horizontal scroll region. The regenerated `docs/design/evidence/market-rotation/mobile.png` was inspected: full readable data, own scroll regions, no body crop or font shrink. Astra retains core workflow acceptance and final release approval.
- Controlled performance gate passed for all four authenticated HTTP workloads. Legacy p95: Diary7.27ms, search14.12ms, holdings23.93ms, rotation13.96ms. Gates were frozen to250ms each before rebuilt measurement; rebuilt p95:4.38/12.46/5.76/10.30ms respectively. See [raw rebuilt evidence](performance-rebuilt-runtime.json), [frozen gates](performance-gates.json), and [procedure/provenance](performance-baseline.md). Each workload used5warmups/30samples and validated real response content. The initial legacy search verifier failure is retained; only search was remeasured after correcting the fixture expectation. New tooling passed typecheck/lint and4fixture self-checks.

## Cross-cutting story evidence

| Stories | Evidence and scope |
| --- | --- |
| US-006,098–100,103 | Each accepted feature's first desktop/mobile captures and principal flows; Astra-defined design briefs; ticket58 compact Menu/Escape focus and translated navigation; long draft, wide table and decimal fixtures in feature suites. No extra cosmetic test cycle. |
| US-101 | Ticket58: actual Chrome manifest/installability, private NetworkOnly boundary, static offline retrieval, and v1→waiting v2→user Apply activation retaining an unsaved Diary title. |
| US-102 | Feature-specific empty/failure/retry states, plus ticket61 real POST/PUT commit-response-loss proof: no duplicate Diary and no blind overwrite of a newer reminder/title update. |
| US-106,108 | Shared runtime contracts, generated standard-fetch client and native transport; `tests/integration/native-session.test.ts` composes the client against real API/PG, while unit tests cover concurrent401 replay, logout races and origin isolation. |
| US-107 | [Native compatibility decision](../adr/0011-native-contract-compatibility.md): first release baseline, preserved `/api` behavior, and explicit version/deprecation requirements for future breaking changes. No existing React Native binary is claimed. |
| US-109–111 | Ticket59 actual isolated production K3s/TLS: empty migrations/seed, Secure login/Diary writes, Socket.IO and REST recovery, controlled batch persistence, health/readiness logs and single-instance Recreate update. |
| US-112 | Ticket60 actual N backup→empty restore→N+1 upgrade and full N+1 backup→empty restore; persistent required CI runner, constraints/seeds/representative API and sharing rules, failed-backup checks and rollback instructions. |
| US-113 | Required CI dependency chain and observed local fail-fast lint gate prevented later build/tests until corrected. Final Chrome gate passed all132 unique cases; required local release acceptance is complete. |
| US-114 | All61 owners accepted,212 source entries and114 stories covered. Shared integration commit `7b8e1df` connects the feature commits; ticket61 contains the final evidence and scoped regression fixes. |

## Intentional source corrections

[ADR0001](../adr/0001-parity-baseline-and-contract-corrections.md) and the related domain ADRs record user-authorized fixes to legacy bugs and technical debt. Runtime-measured full-text probes preserve valid search semantics. No old user-data migration or production cutover was performed. The final-schema name audit excludes only the legacy migration tracker and historical duplicate-repair audit table; surviving business constraints are exercised by PostgreSQL suites and restore checks.

The final source-boundary review found no database/server/React imports or browser-global/environment accesses in the shared domain, runtime-contract or fetch-client source. Text matches for `window` were an ETF local array variable and date-window comments. This supports the passing native-client integration evidence; it is not a claim about a completed native UI. The immutable parent PRD still has SHA256 `ac6e9efa4bafb1ece28d03bd1df27c03a8d86421dd54b28bb42607ced8068395` and no Git diff.
