# diary-v3 — Trade basic

Trade basic is an investment decision diary built with React, Hono, PostgreSQL, and Drizzle. It connects diaries, trades, research, reminders, and reviews, with public tools and articles alongside a private workspace.

The core rebuild and subsequent local feature acceptance are recorded in the [acceptance report](docs/features/all-tickets-acceptance-2026-09-25.md). The [2026-09-27 audit](docs/audits/project-cleanup-2026-09-27.md) records the latest cleanup, security, performance, and verification results. These are local evidence checkpoints, not production cutover approval. Research Studio live-source acceptance, AI Reports beta release, and native device delivery have separate gates.

Start with the [documentation index](docs/README.md), [product scope](PRODUCT.md), or [current architecture](docs/architecture.md).

## Local development

Use Node.js 24 to match the production image and API build target, npm, and Docker Compose. The package minimum and source CI runtime are Node.js 22.22. Local development uses ports 3100 (Web), 3101 (API), and 55433 (PostgreSQL).

```sh
npm ci
docker compose -p diary-v3-dev up -d postgres
cp .env.example .env
```

Set `JWT_SECRET` in `.env` to your own cryptographically random secret of at least 32 characters. The remaining local database and origin defaults are in [.env.example](.env.example). Then initialize the schema and static market/ETF definitions:

```sh
npm run db:migrate
node --env-file-if-exists=.env --import tsx scripts/seed-system.ts
npm run dev
```

Open [the local Web app](http://127.0.0.1:3100), register, and sign in separately. The seed command is repeatable and does not create accounts or fetch market data. Public market tools use external providers during normal development; automated tests use controlled fixtures. See the [environment contract](docs/operations/environment-contract.md) for provider configuration and optional Redis, AI, Research, translation, and account-email workers.

## Verification

Run the source and database checks from the repository root:

```sh
npm run contracts:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run manifests:check
```

Integration tests create and drop randomly named databases on the local PostgreSQL service. Their database role needs create/drop privileges. The harness rejects non-loopback database hosts; never use real user data or production services. Test scripts use the exported `DATABASE_URL` or the local default rather than automatically loading `.env`. Redis verification has its own setup in the [rate-limit runbook](docs/runbooks/rate-limiting.md).

Install browsers once, then run browser suites sequentially because they share fixture-server ports 3200/3201:

```sh
npx playwright install chromium webkit
npm run test:e2e
npm run test:e2e:webkit:critical
npm run test:e2e:release
```

The release suite requires the preceding production build. The WebKit critical suite blocks service workers and does not certify PWA behavior. Browser suites may regenerate checked-in visual evidence. Native package/proof checks and restore drills are documented in the [native guide](docs/native/native-proof.md) and [operations guide](ops/k8s/README.md).

Commands above describe available checks, not a new claim that every gate passed. Read dated reports for run scope and failures. The [CI/CD notes](docs/operations/ci-cd-notes.md) identify which hosted gates currently block deployment and which remain advisory.

## Repository map

| Path | Responsibility |
| --- | --- |
| [apps/web](apps/web/) | React Router SSR, browser UI, i18n, and PWA |
| [apps/api](apps/api/) | Hono API, authorization, business services, realtime, and worker entrypoints |
| [packages/contracts](packages/contracts/) | Runtime schemas and OpenAPI definitions |
| [packages/api-client](packages/api-client/) | Generated protocol types and an injectable standard-fetch client |
| [packages/domain](packages/domain/) | Portable rules and calculations |
| [packages/db](packages/db/) | Drizzle schema, SQL migrations, and database access |
| [proofs/native](proofs/native/) | Isolated Expo consumer proof with its own lockfile |
| [tests](tests/) | Synthetic unit, PostgreSQL integration, parity, and browser evidence |
| [ops/k8s](ops/k8s/) | Deployment, migration, jobs, and restore procedures |

Parity uses the [sanitized frozen baseline](docs/parity/README.md). Intentional legacy bug fixes are recorded in [ADRs](docs/adr/0001-parity-baseline-and-contract-corrections.md). The [original plan](PLAN.md) and [immutable rebuild PRD](.scratch/diary-v3-rebuild/PRD.md) explain historical scope; current behavior is described in the product and feature guides.
