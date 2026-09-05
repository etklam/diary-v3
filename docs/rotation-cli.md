# Market rotation batch CLI

Run after PostgreSQL migrations with DATABASE_URL configured:

```sh
npm run market:rotation -- --scope=indexes
```

The production API bundle includes the same job entrypoint:

```sh
node dist/api/rotation-cli.js --scope=all
```

Scopes: sectors, indexes, core, all (default). Scopes execute sequentially. No Web session or HTTP request is involved. JSON stdout identifies the job and successful scope results; exit 1 means failure. Earlier scopes may have committed before a later scope fails. PostgreSQL run records provide individual scope status. A same-scope advisory lock rejects overlap across API/CLI runtimes.

Daily provider refresh completes before snapshot computation. Stale provider fallback fails the run, retaining previous snapshots. Price refreshes and snapshot writes each have their own atomic transactions; they are not one transaction covering the full job. Repeating a run updates existing unique symbol/date or scope/symbol/date rows.

Current completed-day policy follows the source: weekdays after 16:00 America/New_York, with DST handled by the timezone. Special early closing days are not modeled separately. Deployment CronJob manifests and end-to-end operational acceptance remain pending.
