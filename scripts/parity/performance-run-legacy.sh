#!/usr/bin/env bash
set -euo pipefail
# Ticket61 legacy performance measurement. Mirrors scripts/parity/run-old-baseline.sh
# but writes only NEW artifacts: the fixture is copied to
# tests/integration/http/performance-baseline.test.ts inside the isolated
# snapshot and evidence goes to docs/parity/performance-legacy-runtime.json.
# Original parity evidence and the parity-baseline fixture are never touched.
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
snapshot_dir="${1:-/tmp/diary-v3-source-baseline}"
case "$snapshot_dir" in /tmp/diary-v3-source-baseline*) ;; *) echo 'Only a dedicated /tmp baseline snapshot is permitted' >&2; exit 1;; esac
mkdir -p "$snapshot_dir"
tar -xzf "$repo_root/docs/parity/source-snapshot.tar.gz" -C "$snapshot_dir"
if [[ ! -d "$snapshot_dir/node_modules" ]]; then echo 'Provide a private dependency copy in the isolated snapshot first (no symlink to source).' >&2; exit 1; fi
if [[ -L "$snapshot_dir/node_modules" ]]; then echo 'Refusing shared node_modules symlink' >&2; exit 1; fi
cp "$repo_root/tests/parity/performance-legacy.fixture.ts" "$snapshot_dir/tests/integration/http/performance-baseline.test.ts"
cp "$repo_root/tests/parity/performance-fixture.ts" "$snapshot_dir/tests/integration/http/performance-fixture.ts"
python3 - "$snapshot_dir" "$repo_root" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1]);repo=pathlib.Path(sys.argv[2])
original=(root/'scripts/test-backend-http-mariadb.sh').read_text()
# Reuse the proven disposable-MariaDB container/migration harness up to the
# first test invocation, then run only the performance fixture.
script=original.split('BACKEND_HTTP_TEST_DATABASE_URL="${test_database_url}"')[0]
script+='''BACKEND_HTTP_TEST_DATABASE_URL="${test_database_url}" DATABASE_URL="${test_database_url}" JWT_SECRET="baseline-only-isolated-jwt-secret-not-production" PERFORMANCE_EVIDENCE_PATH="${PERFORMANCE_EVIDENCE_PATH}" npx vitest run tests/integration/http/performance-baseline.test.ts --reporter=verbose
'''
(root/'scripts/run-performance-baseline.sh').write_text(script)
PY
cd "$snapshot_dir"
node scripts/generate-png-icons.js
NODE_ENV=test DATABASE_URL="mysql://root:test-password@127.0.0.1:3306/backend_http_test" JWT_SECRET="baseline-only-isolated-jwt-secret-not-production" npx nuxt prepare
PERFORMANCE_EVIDENCE_PATH="${PERFORMANCE_EVIDENCE_PATH:-$repo_root/docs/parity/performance-legacy-runtime.json}" bash scripts/run-performance-baseline.sh
