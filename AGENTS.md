# diary-v3

- Use Traditional Chinese for user-facing updates. Write all new or edited code comments and documentation in English; Chinese belongs only in product i18n copy, test fixtures, and parity evidence data.
- Never use real user data or production services in tests. Keep diary-vue read-only; parity uses the [sanitized frozen baseline](docs/parity/README.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `apps/web/app/` | React Router SSR, browser UI, i18n, styles; PWA assets in `apps/web/public/` |
| `apps/api/src/` | Hono API, authorization, business services, providers, realtime, workers |
| `packages/contracts/` | Zod runtime schemas and OpenAPI definitions |
| `packages/api-client/` | Generated protocol types and injectable standard-fetch client |
| `packages/domain/` | Portable business rules and calculations |
| `packages/db/` | Server-only Drizzle schema, PostgreSQL access, SQL migrations |
| `proofs/native/` | Isolated Expo consumer proof with its own lockfile; outside root workspaces |
| `tests/` | Unit, disposable PostgreSQL integration, parity, Playwright flows |
| `scripts/`, `openapi/` | Development/build/verification tools and generated API specification |
| `ops/`, `.forgejo/workflows/` | Docker/K3s operations and CI/deployment workflows |
| `docs/`, `.scratch/` | Current guides, ADRs, dated evidence, local tickets and specifications |

## Development and checks

Use npm workspaces and the lockfile, from the repository root. Prefer Node 24 (Docker/API build runtime); the package minimum and source CI runtime are Node 22.22.0.

- Setup: `npm ci`, `docker compose -p diary-v3-dev up -d postgres`; configure `.env` with a random `JWT_SECRET` (32+ characters), run `npm run db:migrate`, then the static seed in [README.md](README.md#local-development).
- `npm run dev` loads `.env`; Web/API/PostgreSQL ports are 3100/3101/55433. Standalone `dev:api`/`dev:web` need their environment supplied separately.

| Check or change | Command |
| --- | --- |
| Source gates | `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build` |
| Focused regression | `npx vitest run <test-file>` |
| PostgreSQL integration | `npm run test:integration` |
| Browser flows | `npx playwright install chromium webkit` once; `npm run test:e2e`, `npm run test:e2e:webkit:critical` |
| Built release smoke | `npm run build`, then `npm run test:e2e:release` |
| Contract changes | `npm run contracts:generate`, then `npm run contracts:check` |
| Schema changes | `npm run db:generate`, review SQL, then `npm run db:migrate` on a disposable database |
| UI rules / production manifests | `npm run design:check` / `npm run manifests:check` |
| Shared/native changes | `npm run native:proof:test`, `npm run native:api:test`; package/proof setup in [proofs/native/README.md](proofs/native/README.md) |

Test harnesses use exported `DATABASE_URL` or the loopback default, create/drop unique databases, and need those privileges; they do not auto-load `.env`. Run browser suites sequentially (shared ports 3200/3201); they may regenerate visual evidence. `npm test` includes integration. See [CI/CD notes](docs/operations/ci-cd-notes.md) for release gates and [runbooks](docs/README.md#operations) for optional services.

## Code and product conventions

- TypeScript ESM, strict mode, `noUncheckedIndexedAccess`; follow nearby formatting. Contracts/domain/client stay framework- and server-independent; Web accesses data through the API.
- The API owns authorization and business validation. Preserve ownership, Partner allowlists, transactions, and concurrency. IDs/persisted financial decimals are strings; calendar dates use `YYYY-MM-DD`, instants use UTC `Z`. Missing quotes must not become zero.
- Generate `openapi/openapi.json` and `packages/api-client/src/generated.ts` from contracts; do not hand-edit generated output. Use versioned SQL migrations for schema changes.
- Before behavior changes, read [PRODUCT.md](PRODUCT.md), [PLAN.md](PLAN.md), and the relevant approved PRD/specification. The [rebuild PRD](.scratch/diary-v3-rebuild/PRD.md) is immutable original scope; extensions have separate records. Use [architecture](docs/architecture.md) and accepted [ADRs](docs/adr/) for implementation decisions.
- Preserve valid legacy feature intent; deliberate bug/debt corrections need regression evidence and the policy in [ADR-0001](docs/adr/0001-parity-baseline-and-contract-corrections.md).
- UI follows [DESIGN.md](DESIGN.md) and Impeccable: preserve zh-TW/zh-CN/en, themes, responsiveness, accessibility, and private-data PWA boundaries. The implementing agent owns direction, architecture, design, and acceptance; record material visual rationale and before/after evidence without a routine design-approval gate.

## Agent skills

### Issue tracker

Local Markdown: `.scratch/<feature>/`; core tickets: `diary-v3-rebuild`. Follow [tracker conventions](docs/agents/issue-tracker.md); do not rewrite the parent PRD.

### Triage labels

Use [canonical labels](docs/agents/triage-labels.md). Execution states `in-progress`/`blocked`/`done` differ from triage roles; ready tickets still require completed blockers.

### Domain docs

Use [docs/agents/domain.md](docs/agents/domain.md) as the single monorepo context. Read relevant guides; planning status and historical reports do not establish current completion.

## Completion and collaboration

- The primary agent owns integration/verification. Delegate useful independent work with distinct paths; preserve others' edits. `sol-expert` handles focused complex analysis/review, read-only, without recursive delegation.
- Mark tickets done only with runnable acceptance evidence. Test observable behavior with fixed clocks/provider fixtures, disposable PostgreSQL for integrity/concurrency, and browsers for principal flows; record corrections and required independent review.
- Run relevant checks and required release gates. Documentation-only edits need reference/command validation; behavior changes need regression tests and source gates. Report commands, results, scope, and failures; historical passes are not current results.
- Keep related guides/tickets current. Routine implementation/design decisions may proceed autonomously; production cutover needs separate authorization and operational evidence.

## Instruction loading

This file governs the repository. Codex discovers instructions once per run: Codex home, then project root through the working directory. Each directory selects `AGENTS.override.md`, otherwise `AGENTS.md`, then configured fallbacks; deeper guidance takes precedence. Linked guides are not automatically injected.

After edits, start a fresh run and ask Codex to list active instruction sources. Markdown model/effort preferences do not switch the executing model. See the [official discovery guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
