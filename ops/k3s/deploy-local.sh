#!/usr/bin/env bash
set -euo pipefail

namespace="diary-v3"
context="${KUBE_CONTEXT:-diary-v3-local}"

current_context="$(kubectl config current-context 2>/dev/null || true)"
if [[ "$current_context" != "$context" ]]; then
  echo "Refusing deployment: current kubectl context is not $context" >&2
  exit 1
fi

kubectl apply -f ops/k8s/00-namespace.yaml
db_secret_exists=false
app_secret_exists=false
kubectl -n "$namespace" get secret diary-v3-db >/dev/null 2>&1 && db_secret_exists=true
kubectl -n "$namespace" get secret diary-v3-app >/dev/null 2>&1 && app_secret_exists=true
if [[ "$db_secret_exists" == true || "$app_secret_exists" == true ]]; then
  if [[ "$db_secret_exists" != true || "$app_secret_exists" != true ]]; then
    echo "Refusing partial deployment secrets; restore both diary-v3-db and diary-v3-app or remove both explicitly." >&2
    exit 1
  fi
  echo "Existing deployment secrets retained; no password or JWT rotation performed."
  exit 0
fi

: "${DB_PASSWORD:?Set DB_PASSWORD when creating the isolated cluster secrets}"
: "${JWT_SECRET:?Set JWT_SECRET when creating the isolated cluster secrets}"
web_origin="${WEB_ORIGIN:-https://diary.local}"
database_password="$DB_PASSWORD"
jwt_secret="$JWT_SECRET"
kubectl -n "$namespace" create secret generic diary-v3-db \
  --from-literal=POSTGRES_PASSWORD="$database_password" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
database_url="postgresql://diary:${database_password}@diary-v3-postgres.${namespace}.svc.cluster.local:5432/diary_v3"
kubectl -n "$namespace" create secret generic diary-v3-app \
  --from-literal=DATABASE_URL="$database_url" \
  --from-literal=JWT_SECRET="$jwt_secret" \
  --from-literal=WEB_ORIGIN="$web_origin" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

echo "Secrets applied to $namespace without printing values. Apply the workload manifests separately after loading images."
