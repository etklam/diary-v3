#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
snapshot_dir="${1:-/tmp/diary-v3-source-baseline}"
case "$snapshot_dir" in /tmp/diary-v3-source-baseline*) ;; *) echo 'Only a dedicated /tmp baseline snapshot is permitted' >&2; exit 1;; esac
mkdir -p "$snapshot_dir"
tar -xzf "$repo_root/docs/parity/source-snapshot.tar.gz" -C "$snapshot_dir"
if [[ ! -d "$snapshot_dir/node_modules" ]]; then echo 'Provide a private dependency copy in the isolated snapshot first (no symlink to source).' >&2; exit 1; fi
if [[ -L "$snapshot_dir/node_modules" ]]; then echo 'Refusing shared node_modules symlink' >&2; exit 1; fi
cp "$repo_root/tests/parity/legacy-diary-baseline.fixture.ts" "$snapshot_dir/tests/integration/http/parity-baseline.test.ts"
python3 - "$snapshot_dir" "$repo_root" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1]);repo=pathlib.Path(sys.argv[2])
original=(root/'scripts/test-backend-http-mariadb.sh').read_text()
script=original.split('BACKEND_HTTP_TEST_DATABASE_URL="${test_database_url}"')[0]
script+='''docker exec "${container_name}" mariadb --batch --user=root --password=test-password backend_http_test --execute="SELECT * FROM information_schema.table_constraints WHERE constraint_schema='backend_http_test'; SELECT * FROM information_schema.referential_constraints WHERE constraint_schema='backend_http_test'; SELECT * FROM information_schema.check_constraints WHERE constraint_schema='backend_http_test';" > "$BASELINE_CONSTRAINT_PATH"
BACKEND_HTTP_TEST_DATABASE_URL="${test_database_url}" DATABASE_URL="${test_database_url}" JWT_SECRET="baseline-only-isolated-jwt-secret-not-production" npx vitest run tests/integration/http/parity-baseline.test.ts --reporter=verbose
'''
(root/'scripts/run-parity-baseline.sh').write_text(script)
PY
cd "$snapshot_dir"
node scripts/generate-png-icons.js
NODE_ENV=test DATABASE_URL="mysql://root:test-password@127.0.0.1:3306/backend_http_test" JWT_SECRET="baseline-only-isolated-jwt-secret-not-production" npx nuxt prepare
BASELINE_EVIDENCE_PATH="$repo_root/docs/parity/legacy-runtime-evidence.json" BASELINE_CONSTRAINT_PATH="$repo_root/docs/parity/legacy-final-constraints.tsv" bash scripts/run-parity-baseline.sh
