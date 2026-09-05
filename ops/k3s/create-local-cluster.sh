#!/usr/bin/env bash
set -euo pipefail

name="${K3S_CONTAINER:-diary-v3-k3s}"
api_port="${K3S_API_PORT:-16443}"
http_port="${K3S_HTTP_PORT:-8088}"
https_port="${K3S_HTTPS_PORT:-8443}"
kubeconfig_path="${KUBECONFIG_PATH:-$HOME/.kube/diary-v3-local.yaml}"
context="${KUBE_CONTEXT:-diary-v3-local}"
if docker ps --format '{{.Names}}' | grep -Fxq "$name"; then
  echo "$name is already running"
  exit 0
fi
docker rm "$name" >/dev/null 2>&1 || true
docker run -d --privileged --name "$name" \
  -p "${api_port}:6443" -p "${http_port}:80" -p "${https_port}:443" \
  rancher/k3s:v1.31.5-k3s1 server \
  --write-kubeconfig-mode=644 --tls-san=127.0.0.1

ready=false
for attempt in {1..60}; do
  if docker exec "$name" kubectl wait --for=condition=Ready node --all --timeout=2s >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo "K3s node did not become Ready within 120 seconds" >&2
  docker logs --tail=80 "$name" >&2 || true
  exit 1
fi
docker exec "$name" kubectl get node -o wide
mkdir -p "$(dirname "$kubeconfig_path")"
docker exec "$name" cat /etc/rancher/k3s/k3s.yaml \
  | sed "s#https://127.0.0.1:6443#https://127.0.0.1:${api_port}#" \
  > "$kubeconfig_path"
kubectl config --kubeconfig "$kubeconfig_path" rename-context default "$context" >/dev/null
kubectl config --kubeconfig "$kubeconfig_path" use-context "$context" >/dev/null
echo "Kubeconfig written to $kubeconfig_path with context $context. Set KUBECONFIG before applying manifests."
