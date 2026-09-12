#!/usr/bin/env bash
set -euo pipefail

ORIGIN="${1:-}"
if [ -z "$ORIGIN" ]; then
  echo 'usage: scripts/staging-smoke.sh https://staging.example.com' >&2
  exit 2
fi

STAGING_HOSTNAME=$(node - "$ORIGIN" <<'NODE'
const value = process.argv[2]
const origin = new URL(value)
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
  throw new Error('A bare HTTPS staging origin is required')
}
if (origin.hostname === 'v3.trade-basic.com') throw new Error('The production hostname is forbidden')
console.log(origin.hostname)
NODE
)

for path in /healthz /readyz; do
  curl --fail --silent --show-error --max-time 20 "$ORIGIN$path" >/dev/null
done

for path in / /articles /tools/position-sizing; do
  status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 "$ORIGIN$path")
  [ "$status" = 200 ] || { echo "staging smoke expected HTTP 200 for $path, got $status" >&2; exit 1; }
done

socket_open=$(curl --fail --silent --show-error --max-time 20 "$ORIGIN/socket.io/?EIO=4&transport=polling&t=rc2-smoke")
node - "$socket_open" <<'NODE'
const packet = process.argv[2]
if (!packet?.startsWith('0')) throw new Error('staging smoke did not receive an Engine.IO open packet')
const handshake = JSON.parse(packet.slice(1))
if (typeof handshake.sid !== 'string' || !Array.isArray(handshake.upgrades)) {
  throw new Error('staging smoke received an invalid Socket.IO polling handshake')
}
NODE

printf 'staging_http_smoke=pass host=%s health=200 ready=200 homepage=200 articles=200 anonymous_tools=200 socket_io=polling\n' "$STAGING_HOSTNAME"
