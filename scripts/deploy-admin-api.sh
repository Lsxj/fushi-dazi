#!/usr/bin/env bash

set -euo pipefail

ENV_ID="${ENV_ID:-cloud1-d8g02cdnld86f3823}"
FUNCTION_NAME="${FUNCTION_NAME:-admin-api}"
ADMIN_UID="${FUSHI_ADMIN_UID:-2074771023912120322}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTION_DIR="$PROJECT_ROOT/cloudfunctions/support-api"
CHECK_ONLY=0

if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=1
elif [[ $# -gt 0 ]]; then
  echo "unknown argument: $1"
  exit 1
fi

echo "→ checking admin-api prerequisites"
command -v tcb >/dev/null 2>&1 || {
  echo "✗ CloudBase CLI is missing"
  exit 1
}

"$SCRIPT_DIR/build-support-http-function.sh" --check
tcb fn list -e "$ENV_ID" >/dev/null
tcb user list -e "$ENV_ID" --uids "$ADMIN_UID" --json \
  | grep -q "\"Uid\": \"$ADMIN_UID\""
tcb db nosql execute \
  -e "$ENV_ID" \
  --json \
  --command '[{"TableName":"support_cases","CommandType":"COMMAND","Command":"{\"count\":\"support_cases\",\"query\":{}}"}]' \
  >/dev/null

echo "  ✓ environment: $ENV_ID"
echo "  ✓ function target: $FUNCTION_NAME"
echo "  ✓ administrator UID allowlisted: $ADMIN_UID"
echo "  ✓ route scope: admin-console"

if [[ "$CHECK_ONLY" == "1" ]]; then
  echo "→ check complete; no cloud resources were changed"
  exit 0
fi

if [[ "${ALLOW_ADMIN_API_DEPLOY:-0}" != "1" ]]; then
  echo "✗ deployment requires explicit confirmation"
  echo "  ALLOW_ADMIN_API_DEPLOY=1 ./scripts/deploy-admin-api.sh"
  exit 1
fi

echo "→ running repository quality gate"
cd "$PROJECT_ROOT"
npm run verify

echo "→ deploying authenticated HTTP function $FUNCTION_NAME"
tcb fn deploy "$FUNCTION_NAME" \
  --dir "$FUNCTION_DIR" \
  -e "$ENV_ID" \
  --httpFn \
  --runtime Nodejs20.19 \
  --force

echo "✓ admin-api function deployment completed"
echo "  The public route is managed separately and must keep gateway auth enabled."
