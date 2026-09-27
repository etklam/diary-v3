# Market rotation and state CLI

These commands run against the configured PostgreSQL database. Use a disposable
database and `MARKET_PROVIDER=fixture` for local or acceptance exercises; leave
`MARKET_PROVIDER` unset for the normal Yahoo-backed deployment. Run migrations
before any batch command.

## Source checkout

The package scripts load `.env` when present and execute the TypeScript entry
points through `tsx`:

```sh
npm run db:migrate
MARKET_PROVIDER=fixture npm run market:rotation -- --scope=core
MARKET_PROVIDER=fixture npm run market:state -- --seed
```

`--scope` accepts `sectors`, `indexes`, `core`, or `all`; the default is `all`.
The rotation command runs selected scopes sequentially. `--seed` initializes the
market-state universe; the normal state refresh has no flag.

## Built API image

`npm run build` emits the same entry points under `dist/api/` that the API image
and Kubernetes CronJob use:

```sh
node dist/api/rotation.js --scope=all
node dist/api/market-state.js
```

Run the one-time market-state seed explicitly when preparing a new database:

```sh
node dist/api/market-state.js --seed
```

The production CronJob in
[`ops/k8s/production/05-market-cron.yaml`](../ops/k8s/production/05-market-cron.yaml)
runs the rotation followed by the normal state batch. It uses
`concurrencyPolicy: Forbid`, a 30-minute starting deadline and a 30-minute
active deadline. Its schedule is `30 21 * * 0-5`, recorded by ticket 59 as
21:30 UTC on Sunday through Friday. The manifest does not set `spec.timeZone`,
and its Asia/Taipei comment does not establish execution timezone. Verify the
cluster controller's timezone before relying on the recorded UTC schedule.

## Behavior and safety

The CLI prints one JSON result and exits non-zero when startup, provider refresh,
or a selected scope fails. Earlier scopes may have committed before a later
scope fails; inspect the PostgreSQL run records for per-scope status. A
same-scope PostgreSQL advisory lock rejects overlapping API and CLI runs.

Daily provider refresh completes before snapshot computation. A stale provider
result fails the run instead of becoming fresh data. Price refreshes and
snapshot writes use separate atomic transactions, and reruns update the
existing unique symbol/date or scope/symbol/date rows.

Completed-day selection uses weekdays after 16:00 in `America/New_York`, with
DST handled by the timezone conversion. Special early-closing sessions are not
modeled separately. The normal CronJob uses the live provider; set
`MARKET_PROVIDER=fixture` only on an explicitly isolated test Job.
