# diary-v3

The investment diary, rebuilt with React/PostgreSQL/Drizzle. See [tickets](.scratch/diary-v3-rebuild/ISSUES.md) for the full scope and per-item acceptance; the product is not complete and must not yet serve as the production replacement.

## Local development

Requires Node.js ≥22.22, npm, and Docker. Make sure local ports 3100, 3101, and 55433 are free first.

```sh
npm ci
docker compose -p diary-v3-dev up -d postgres
cp .env.example .env
```

Set your own generated `JWT_SECRET` in `.env` (at least 32 characters; never use the sample string), then:

```sh
npm run db:migrate
npm run dev
```

The web app is at http://127.0.0.1:3100. Register, then sign in separately before creating a diary. Local Compose only starts the development PostgreSQL; production Docker/K3s deployment is delivered by ticket 59.

## Verification

```sh
npm run contracts:check
npm run lint
npm run typecheck
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
```

Integration and browser tests create a randomly named test database from the PostgreSQL in `DATABASE_URL` and drop it when done. The test account needs permission to create and drop test databases and must never point at production services. E2E uses ports 3200/3201 and must not reuse another app server. Listing these commands does not mean all gates have passed; check the recorded evidence for the current ticket.

## Structure

- `apps/web`: React Router SSR and the React UI.
- `apps/api`: the Hono HTTP API and the authoritative business entry point.
- `packages/contracts`: runtime schemas and OpenAPI.
- `packages/api-client`: generated types and a client with injectable fetch.
- `packages/domain`: pure rules with no DOM or server dependencies.
- `packages/db`: the Drizzle PostgreSQL schema and migrations.

See [baseline](docs/parity/README.md) for the source snapshot and feature mapping. Legacy bugs and tech debt were fixed at the user's request; the reasons and regression evidence are recorded separately in [these decisions](docs/adr/0001-parity-baseline-and-contract-corrections.md).
