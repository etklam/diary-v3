#!/usr/bin/env bash
# One-off provisioning of the production K3s secrets for diary-v3 on g2.
# Run from a machine with SSH access: ./ops/k3s/deploy-production-secrets.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-root@82.22.63.196}"
NAMESPACE="diary-v3"

DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD}"
JWT_SECRET="${JWT_SECRET:?Set JWT_SECRET (>=32 random bytes)}"
SEC_USER_AGENT="${SEC_USER_AGENT:?Set SEC_USER_AGENT per https://www.sec.gov/os/accessing-edgar-data}"

ssh "$HOST" "kubectl get ns diary-v3 >/dev/null 2>&1 || kubectl create ns diary-v3"

emit_secret() {
  local kind="$1"
  SECRET_KIND="$kind" DB_PASSWORD="$DB_PASSWORD" JWT_SECRET="$JWT_SECRET" SEC_USER_AGENT="$SEC_USER_AGENT" \
    node --input-type=module <<'NODE' | ssh "$HOST" "kubectl -n diary-v3 create -f - >/dev/null"
const kind = process.env.SECRET_KIND
const required = name => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

if (kind === 'db') {
  process.stdout.write(JSON.stringify({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'diary-v3-db', namespace: 'diary-v3' },
    type: 'Opaque',
    stringData: { POSTGRES_PASSWORD: required('DB_PASSWORD') },
  }))
} else if (kind === 'app') {
  const databaseUrl = new URL('postgresql://diary@diary-v3-postgres.diary-v3.svc.cluster.local:5432/diary_v3')
  databaseUrl.password = required('DB_PASSWORD')
  process.stdout.write(JSON.stringify({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'diary-v3-app', namespace: 'diary-v3' },
    type: 'Opaque',
    stringData: {
      DATABASE_URL: databaseUrl.toString(),
      JWT_SECRET: required('JWT_SECRET'),
      WEB_ORIGIN: 'https://v3.trade-basic.com',
      SEC_USER_AGENT: required('SEC_USER_AGENT'),
    },
  }))
} else {
  throw new Error(`Unknown secret kind: ${kind}`)
}
NODE
}

ensure_secret() {
  local name="$1"
  local kind="$2"
  if ssh "$HOST" "kubectl -n diary-v3 get secret '$name' >/dev/null 2>&1"; then
    echo "$name already exists; retaining existing values."
  else
    emit_secret "$kind"
    echo "Created $name."
  fi
}

ensure_secret diary-v3-db db
ensure_secret diary-v3-app app
echo "Secrets ensured in $NAMESPACE without printing values."
