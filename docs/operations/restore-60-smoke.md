# PostgreSQL backup and restore smoke (ticket 60)

This is a disposable restore rehearsal for the diary-v3 schema. It uses only
synthetic records and a PostgreSQL container named `diary-v3-restore-60`; it
does not use the development database, the production Compose volume, the
local K3s PostgreSQL volume, or any user export.

## Rehearsal procedure

The source schema was migrated through `0019_price_alert_moving_average_direction`
(schema version **N**, 20 rows in `drizzle.__drizzle_migrations`). The source
fixture contained two synthetic users, one Diary, one Transaction, one company
research note and timeline record, one recurring reminder, one accepted partner
link with asymmetric note sharing, and one WEB refresh session. The owner used
a generated bcrypt password so the post-restore HTTP login could be exercised.

The commands below are the reproducible shape of the rehearsal. The password
and JWT values are throwaway local values; keep them in the shell environment,
never in a committed file.

The repeatable release gate is `npm run db:restore-smoke`. It owns a disposable
`postgres:17.6-alpine` container, derives the N migration folder from the
repository journal (default `0019_price_alert_moving_average_direction`),
loads [`scripts/restore-smoke-fixture.sql`](../../scripts/restore-smoke-fixture.sql),
and runs the full N→N+1 plus N+1 full-backup restore and failed-backup checks.
It removes its container and temporary dumps on exit. Forgejo runs it after
source-manifest validation and before integration tests. The runner shares the
job container's network namespace and uses its private port 5432; local runs
use the dedicated host port 55435. A failed restore prevents image publication
and deployment.

```sh
RESTORE_SMOKE_CONTAINER=diary-v3-restore-smoke \
RESTORE_SMOKE_PORT=55435 \
RESTORE_SMOKE_PASSWORD=throwaway-local-password \
npm run db:restore-smoke
```

```sh
docker run -d --name diary-v3-restore-60 \
  -e POSTGRES_USER=restore_owner \
  -e POSTGRES_PASSWORD="$RESTORE_PG_PASSWORD" \
  -e POSTGRES_DB=restore_n \
  -p 55434:5432 postgres:17.6-alpine

# Prepare a schema-N migration folder by copying migrations 0000..0019 and
# truncating its meta/_journal.json to those 20 entries.
DATABASE_URL="postgresql://restore_owner:$RESTORE_PG_PASSWORD@127.0.0.1:55434/restore_n" \
MIGRATIONS_FOLDER=/tmp/diary-v3-restore-60-n npm run db:migrate

docker exec diary-v3-restore-60 createdb -U restore_owner restore_empty
docker exec diary-v3-restore-60 pg_dump -U restore_owner -d restore_n \
  --format=custom --file=/tmp/restore-n.dump
docker exec diary-v3-restore-60 pg_restore -U restore_owner --no-owner \
  --exit-on-error --dbname=restore_empty /tmp/restore-n.dump

# Use the repository's complete migration journal. Since the target ledger is
# at N, this applies only 0020_posts.sql (N→N+1).
DATABASE_URL="postgresql://restore_owner:$RESTORE_PG_PASSWORD@127.0.0.1:55434/restore_empty" \
MIGRATIONS_FOLDER=packages/db/migrations npm run db:migrate
DATABASE_URL="postgresql://restore_owner:$RESTORE_PG_PASSWORD@127.0.0.1:55434/restore_empty" \
npx tsx scripts/seed-system.ts
```

The actual run used the above flow with an isolated port and a custom-format
backup of **107721 bytes**. Before N→N+1, the empty target had 20 migration
rows and all eight fixture categories. After applying 0020 it had 21 rows and
the `posts` table. The seed job returned `addedEtfs: 24` and
`addedUniverse: 213`.

## Verification evidence

The restored database reported 68 PostgreSQL check/foreign-key constraints,
including `transactions_diary_owner_fkey`. A negative transaction quantity and
a blank reminder were each rejected inside a savepoint (`check_violation`),
while a synthetic post was inserted successfully after 0020.

A short API process was started against only `restore_empty` with
`MARKET_PROVIDER=fixture`. Real HTTP checks returned:

| Check | Result |
| --- | --- |
| `/healthz` | `{"status":"ok"}` |
| Synthetic owner login and `/api/auth/me` | 200; restored user id `1` |
| `/api/diaries/1` | restored Diary plus 1 Transaction |
| `/api/stocks/R60/notes` | 1 restored research note |
| `/api/alerts` | 1 restored reminder |
| `/api/partners` | 1 connected share |
| `/api/partners/compare?partnerId=2` | 1 compare day; no private field/value leaked |
| `/api/stocks/R60/notes?partnerId=2` | 403, because the partner’s note share flag is false |
| POST `/api/diaries` with one Transaction | 201; response and subsequent list read back 2 Diaries |

The request used the restored WEB session and a CSRF token obtained from a
safe GET. No token, cookie value or password is retained in this document.

## Failed restore gate and cleanup

`pg_restore --exit-on-error` against a missing backup exited **1** with
`could not open input file`; a separate empty target still had **0 public
tables**. A failed restore is therefore not reported as a ready database.
The rehearsal container, its database and `/tmp/diary-v3-restore-60` artifacts
are disposable and are removed after review. The existing `diary-v3-dev`
PostgreSQL container/volume and the K3s production rehearsal volume are outside
the cleanup boundary.

The next migration rehearsal should repeat the same N→N+1 sequence against a
new isolated target and retain the migration ledger count, representative
fixture counts, constraint checks, seed result and one authenticated read/write
smoke as the restore gate.

## Release rollback commands

An image-only rollback keeps the database at its already-applied schema and
uses the previous immutable image revision. In the isolated K3s context, record
the current revisions before updating, then use:

```sh
export KUBE_CONTEXT=diary-v3-local
kubectl --context "$KUBE_CONTEXT" -n diary-v3 rollout history deployment/diary-v3-api
kubectl --context "$KUBE_CONTEXT" -n diary-v3 rollout history deployment/diary-v3-web
kubectl --context "$KUBE_CONTEXT" -n diary-v3 rollout undo deployment/diary-v3-api
kubectl --context "$KUBE_CONTEXT" -n diary-v3 rollout undo deployment/diary-v3-web
kubectl --context "$KUBE_CONTEXT" -n diary-v3 rollout status deployment/diary-v3-api --timeout=180s
kubectl --context "$KUBE_CONTEXT" -n diary-v3 rollout status deployment/diary-v3-web --timeout=180s
```

If a migration has already changed the schema and the previous application
cannot run against it, restore the pre-release custom dump during an explicit
isolated maintenance window before undoing the images. Stop the single API
replica first so no writes race the restore; use the database container’s local PostgreSQL connection:

```sh
export KUBE_CONTEXT=diary-v3-local
export BACKUP_FILE=/secure/operator/path/schema-n.dump
kubectl --context "$KUBE_CONTEXT" -n diary-v3 scale deployment/diary-v3-api --replicas=0
kubectl --context "$KUBE_CONTEXT" -n diary-v3 wait --for=delete pod -l app=diary-v3-api --timeout=120s
kubectl --context "$KUBE_CONTEXT" -n diary-v3 exec -i deployment/diary-v3-postgres -- \
  pg_restore -U diary --clean --if-exists --no-owner --exit-on-error --dbname=diary_v3 < "$BACKUP_FILE"
kubectl --context "$KUBE_CONTEXT" -n diary-v3 rollout undo deployment/diary-v3-api
kubectl --context "$KUBE_CONTEXT" -n diary-v3 scale deployment/diary-v3-api --replicas=1
kubectl --context "$KUBE_CONTEXT" -n diary-v3 rollout status deployment/diary-v3-api --timeout=180s
unset BACKUP_FILE KUBE_CONTEXT
```

The restore command is intentionally an operator-controlled destructive action
against the selected isolated database; it is not run by CI or against a
production context. Validate `/readyz`, the migration ledger and an
authenticated read before reopening the application to users. The API must return to one replica after the image rollback; undoing a rollout does not itself reverse the earlier scale-to-zero operation.
