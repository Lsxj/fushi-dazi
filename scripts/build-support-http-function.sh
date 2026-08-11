#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTION_DIR="$PROJECT_ROOT/cloudfunctions/support-api"
OUTPUT_FILE="$FUNCTION_DIR/server.mjs"
CHECK_ONLY=0

if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=1
elif [[ $# -gt 0 ]]; then
  echo "unknown argument: $1"
  exit 1
fi

echo "→ building support-api HTTP function bundle"
cd "$PROJECT_ROOT"
pnpm --filter @fushi/api-server exec esbuild \
  "$PROJECT_ROOT/apps/api-server/src/index.ts" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --sourcemap \
  --outfile="$OUTPUT_FILE" \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
  --external:@cloudbase/signature-nodejs \
  --external:ws

chmod +x "$FUNCTION_DIR/scf_bootstrap"

if [[ "$CHECK_ONLY" == "1" ]]; then
  SMOKE_PORT=3901
  SMOKE_DATA_PATH="$(mktemp -d)/support-state.json"
  HOST=127.0.0.1 \
  PORT="$SMOKE_PORT" \
  FUSHI_SUPPORT_STORE_PATH="$SMOKE_DATA_PATH" \
  node "$OUTPUT_FILE" >/tmp/fushi-support-api-smoke.log 2>&1 &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true' EXIT

  for _ in {1..20}; do
    if curl --fail --silent "http://127.0.0.1:$SMOKE_PORT/health" >/dev/null; then
      echo "  ✓ bundled HTTP server health check passed"
      exit 0
    fi
    sleep 0.25
  done

  echo "✗ bundled HTTP server failed to start"
  sed -n '1,120p' /tmp/fushi-support-api-smoke.log
  exit 1
fi

echo "  ✓ bundle: $OUTPUT_FILE"
