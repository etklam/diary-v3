#!/usr/bin/env bash
set -euo pipefail

namespace="${KUBE_NAMESPACE:-diary-v3}"
context="${KUBE_CONTEXT:-diary-v3-local}"
hostname="${TLS_HOSTNAME:-diary.local}"
days="${TLS_DAYS:-7}"

current_context="$(kubectl config current-context 2>/dev/null || true)"
if [[ "$current_context" != "$context" ]]; then
  echo "Refusing TLS secret creation: current kubectl context is not $context" >&2
  exit 1
fi

if ! [[ "$days" =~ ^[1-9][0-9]*$ ]]; then
  echo "TLS_DAYS must be a positive integer" >&2
  exit 1
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
openssl req -x509 -nodes -newkey rsa:2048 -days "$days" \
  -keyout "$temporary_directory/tls.key" \
  -out "$temporary_directory/tls.crt" \
  -subj "/CN=$hostname" \
  -addext "subjectAltName=DNS:$hostname" \
  >/dev/null 2>&1

kubectl -n "$namespace" create secret tls diary-v3-tls \
  --cert="$temporary_directory/tls.crt" \
  --key="$temporary_directory/tls.key" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

echo "Created disposable TLS secret diary-v3-tls in $namespace for $hostname."
