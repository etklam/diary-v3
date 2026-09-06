#!/usr/bin/env bash
# One-off provisioning of the production K3s secrets for diary-v3 on g2.
# Run from a machine with SSH access: ./ops/k3s/deploy-production-secrets.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-root@82.22.63.196}"
NAMESPACE="diary-v3"

DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD (alphanumeric-only recommended)}"
JWT_SECRET="${JWT_SECRET:?Set JWT_SECRET (>=32 random bytes)}"
SEC_USER_AGENT="${SEC_USER_AGENT:?Set SEC_USER_AGENT per https://www.sec.gov/os/accessing-edgar-data}"

read -r -d '' REMOTE_SCRIPT <<EOF
set -euo pipefail
if kubectl -n "$NAMESPACE" get secret diary-v3-db >/dev/null 2>&1; then
  echo "diary-v3-db already exists; retaining existing credentials."
else
  kubectl -n "$NAMESPACE" create secret generic diary-v3-db \
    --from-literal=POSTGRES_PASSWORD='$DB_PASSWORD' >/dev/null
  echo "Created diary-v3-db."
fi
if kubectl -n "$NAMESPACE" get secret diary-v3-app >/dev/null 2>&1; then
  echo "diary-v3-app already exists; retaining existing values."
else
  kubectl -n "$NAMESPACE" create secret generic diary-v3-app \
    --from-literal=DATABASE_URL='postgresql://diary:$DB_PASSWORD@diary-v3-postgres.$NAMESPACE.svc.cluster.local:5432/diary_v3' \
    --from-literal=JWT_SECRET='$JWT_SECRET' \
    --from-literal=WEB_ORIGIN='https://v3.trade-basic.com' \
    --from-literal=SEC_USER_AGENT='$SEC_USER_AGENT' >/dev/null
  echo "Created diary-v3-app."
fi
EOF

ssh "$HOST" "kubectl get ns $NAMESPACE >/dev/null 2>&1 || kubectl create ns $NAMESPACE"
ssh "$HOST" "$REMOTE_SCRIPT"
echo "Secrets ensured in $NAMESPACE without printing values."
