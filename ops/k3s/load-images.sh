#!/usr/bin/env bash
set -euo pipefail

context="${KUBE_CONTEXT:-diary-v3-local}"
container="${K3S_CONTAINER:-diary-v3-k3s}"
if [[ "$(kubectl config current-context 2>/dev/null || true)" != "$context" ]]; then
  echo "Refusing image load: current kubectl context is not $context" >&2
  exit 1
fi

docker save diary-v3/api:local diary-v3/web:local | docker exec -i "$container" ctr images import -
