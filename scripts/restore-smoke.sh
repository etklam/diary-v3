#!/usr/bin/env bash
set -euo pipefail

# Bounded, disposable restore gate. It owns its PostgreSQL container and never
# accepts a product DATABASE_URL, so it cannot touch dev/K3s/production data.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${RESTORE_SMOKE_CONTAINER:-diary-v3-restore-smoke}"
PORT="${RESTORE_SMOKE_PORT:-55435}"
IMAGE="${RESTORE_SMOKE_IMAGE:-postgres:17.6-alpine}"
DB_USER="restore_smoke"
DB_PASSWORD="${RESTORE_SMOKE_PASSWORD:-restore_smoke_password}"
SOURCE_DB="restore_n"
TARGET_DB="restore_empty"
N1_DB="restore_empty_n1"
FAILED_DB="restore_failed"
N_TAG="${RESTORE_SMOKE_N_TAG:-0019_price_alert_moving_average_direction}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/diary-v3-restore-smoke.XXXXXX")"
N_MIGRATIONS="$WORK_DIR/migrations-n"
SOURCE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${SOURCE_DB}"
TARGET_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${TARGET_DB}"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER"; then
  echo "restore smoke container already exists: $CONTAINER" >&2
  exit 1
fi

mkdir -p "$N_MIGRATIONS/meta"
node - "$ROOT_DIR/packages/db/migrations" "$N_MIGRATIONS" "$N_TAG" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [source, target, cutoffTag] = process.argv.slice(2)
const journalPath = path.join(source, 'meta', '_journal.json')
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
const cutoff = journal.entries.findIndex(entry => entry.tag === cutoffTag)
if (cutoff < 0) throw new Error(`migration tag not found: ${cutoffTag}`)
fs.cpSync(path.join(source, 'meta'), path.join(target, 'meta'), { recursive: true })
for (const entry of journal.entries.slice(0, cutoff + 1)) {
  fs.copyFileSync(path.join(source, `${entry.tag}.sql`), path.join(target, `${entry.tag}.sql`))
}
journal.entries = journal.entries.slice(0, cutoff + 1)
fs.writeFileSync(path.join(target, 'meta', '_journal.json'), `${JSON.stringify(journal, null, 2)}\n`)
NODE

docker run -d --name "$CONTAINER" \
  -e "POSTGRES_USER=$DB_USER" \
  -e "POSTGRES_PASSWORD=$DB_PASSWORD" \
  -e "POSTGRES_DB=$SOURCE_DB" \
  -p "${PORT}:5432" "$IMAGE" >/dev/null

for attempt in $(seq 1 45); do
  if docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$SOURCE_DB" >/dev/null 2>&1; then break; fi
  if [ "$attempt" = 45 ]; then echo 'restore smoke PostgreSQL did not become ready' >&2; exit 1; fi
  sleep 1
done

psql_db() { local database="$1"; shift; docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$database" "$@"; }
run_migrate() { DATABASE_URL="$1" MIGRATIONS_FOLDER="$2" npm run db:migrate >/dev/null; }
db_value() { psql_db "$1" -Atc "$2" | tr -d '[:space:]'; }

run_migrate "$SOURCE_URL" "$N_MIGRATIONS"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$SOURCE_DB" < "$ROOT_DIR/scripts/restore-smoke-fixture.sql" >/dev/null

source_ledger="$(db_value "$SOURCE_DB" 'select count(*) from drizzle.__drizzle_migrations')"
[ "$source_ledger" = 20 ] || { echo "expected schema N ledger 20, got $source_ledger" >&2; exit 1; }
source_fixture="$(db_value "$SOURCE_DB" "select (select count(*) from users where email like 'restore-%-60@example.test') || '|' || (select count(*) from diaries where title='Restore decision') || '|' || (select count(*) from transactions where notes='Synthetic N backup transaction') || '|' || (select count(*) from stock_notes where title='N research note') || '|' || (select count(*) from stock_timeline_records where idempotency_key='restore-60-timeline-key') || '|' || (select count(*) from alerts where message='Synthetic review reminder') || '|' || (select count(*) from partner_links where accepted_at is not null) || '|' || (select count(*) from refresh_tokens where token='synthetic-refresh-token-60')")"
[ "$source_fixture" = '2|1|1|1|1|1|1|1' ] || { echo "unexpected source fixture counts: $source_fixture" >&2; exit 1; }

docker exec "$CONTAINER" createdb -U "$DB_USER" "$TARGET_DB"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$SOURCE_DB" --format=custom > "$WORK_DIR/schema-n.dump"
docker cp "$WORK_DIR/schema-n.dump" "$CONTAINER:/tmp/schema-n.dump" >/dev/null
docker exec "$CONTAINER" pg_restore -U "$DB_USER" --no-owner --exit-on-error --dbname="$TARGET_DB" /tmp/schema-n.dump

target_before="$(db_value "$TARGET_DB" 'select count(*) from drizzle.__drizzle_migrations')"
[ "$target_before" = 20 ] || { echo "restore target did not preserve N ledger: $target_before" >&2; exit 1; }
target_fixture="$(db_value "$TARGET_DB" "select (select count(*) from users where email like 'restore-%-60@example.test') || '|' || (select count(*) from diaries where title='Restore decision') || '|' || (select count(*) from transactions where notes='Synthetic N backup transaction') || '|' || (select count(*) from stock_notes where title='N research note') || '|' || (select count(*) from stock_timeline_records where idempotency_key='restore-60-timeline-key') || '|' || (select count(*) from alerts where message='Synthetic review reminder') || '|' || (select count(*) from partner_links where accepted_at is not null) || '|' || (select count(*) from refresh_tokens where token='synthetic-refresh-token-60')")"
[ "$target_fixture" = "$source_fixture" ] || { echo "restored fixture mismatch: $target_fixture" >&2; exit 1; }

run_migrate "$TARGET_URL" "$ROOT_DIR/packages/db/migrations"
DATABASE_URL="$TARGET_URL" npx tsx "$ROOT_DIR/scripts/seed-system.ts" >/dev/null
psql_db "$TARGET_DB" <<'SQL' >/dev/null
INSERT INTO posts (author_id, title, slug, content, category, status)
SELECT id, 'Restored migration post', 'restore-smoke-post', 'Synthetic post after N+1.', 'research', 'DRAFT'
FROM users WHERE email = 'restore-owner-60@example.test';
DO $$
DECLARE owner_id bigint; diary_id bigint;
BEGIN
  SELECT id INTO owner_id FROM users WHERE email = 'restore-owner-60@example.test';
  SELECT id INTO diary_id FROM diaries WHERE title = 'Restore decision' AND user_id = owner_id;
  BEGIN
    INSERT INTO transactions (diary_id, user_id, symbol, type, quantity, price, trade_date)
    VALUES (diary_id, owner_id, 'R60', 'BUY', -1, 1, '2026-09-01T10:00:00Z');
    RAISE EXCEPTION 'negative transaction unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;
SQL

target_after="$(db_value "$TARGET_DB" 'select count(*) from drizzle.__drizzle_migrations')"
posts_after="$(db_value "$TARGET_DB" "select count(*) from posts where slug='restore-smoke-post'")"
seed_after="$(db_value "$TARGET_DB" "select (select count(*) from etfs) || '|' || (select count(*) from market_universe)")"
[ "$target_after" = 21 ] || { echo "expected N+1 ledger 21, got $target_after" >&2; exit 1; }
[ "$posts_after" = 1 ] || { echo "N+1 post verification failed: $posts_after" >&2; exit 1; }
[ "$seed_after" = '24|213' ] || { echo "system seed verification failed: $seed_after" >&2; exit 1; }

# Back up the complete N+1 schema/data and restore it into a second empty DB.
docker exec "$CONTAINER" createdb -U "$DB_USER" "$N1_DB"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$TARGET_DB" --format=custom > "$WORK_DIR/schema-n1.dump"
docker cp "$WORK_DIR/schema-n1.dump" "$CONTAINER:/tmp/schema-n1.dump" >/dev/null
docker exec "$CONTAINER" pg_restore -U "$DB_USER" --no-owner --exit-on-error --dbname="$N1_DB" /tmp/schema-n1.dump
n1_ledger="$(db_value "$N1_DB" 'select count(*) from drizzle.__drizzle_migrations')"
n1_posts="$(db_value "$N1_DB" "select count(*) from posts where slug='restore-smoke-post'")"
[ "$n1_ledger" = 21 ] || { echo "N+1 full restore ledger mismatch: $n1_ledger" >&2; exit 1; }
[ "$n1_posts" = 1 ] || { echo "N+1 full restore post mismatch: $n1_posts" >&2; exit 1; }

# A failed restore must leave its empty target empty.
docker exec "$CONTAINER" createdb -U "$DB_USER" "$FAILED_DB"
set +e
docker exec "$CONTAINER" pg_restore -U "$DB_USER" --exit-on-error --dbname="$FAILED_DB" /tmp/missing-restore-smoke.dump >/dev/null 2>&1
failed_status=$?
set -e
[ "$failed_status" -ne 0 ] || { echo 'invalid backup unexpectedly succeeded' >&2; exit 1; }
failed_tables="$(db_value "$FAILED_DB" "select count(*) from pg_tables where schemaname='public'")"
[ "$failed_tables" = 0 ] || { echo "failed restore left public tables: $failed_tables" >&2; exit 1; }

printf '%s\n' "restore_smoke=pass schema_N=20 schema_N_plus_1=21 fixture=$source_fixture seed=$seed_after n1_restore_ledger=$n1_ledger invalid_restore_exit=$failed_status failed_target_public_tables=$failed_tables"
