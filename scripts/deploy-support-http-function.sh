#!/usr/bin/env bash

set -euo pipefail

DEFAULT_ENV_ID="cloud1-d8g02cdnld86f3823"
ENV_ID="${ENV_ID:-$DEFAULT_ENV_ID}"
FUNCTION_NAME="${FUNCTION_NAME:-support-api}"
COLLECTION_NAME="${FUSHI_SUPPORT_COLLECTION:-support_cases}"
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

echo "→ checking support-api HTTP function prerequisites"
command -v tcb >/dev/null 2>&1 || {
  echo "✗ CloudBase CLI is missing"
  exit 1
}

"$SCRIPT_DIR/build-support-http-function.sh" --check
tcb fn list -e "$ENV_ID" >/dev/null
tcb db nosql execute \
  -e "$ENV_ID" \
  --json \
  --command "[{\"TableName\":\"$COLLECTION_NAME\",\"CommandType\":\"COMMAND\",\"Command\":\"{\\\"count\\\":\\\"$COLLECTION_NAME\\\",\\\"query\\\":{}}\"}]" \
  >/dev/null

echo "  ✓ environment: $ENV_ID"
echo "  ✓ function target: $FUNCTION_NAME"
echo "  ✓ collection: $COLLECTION_NAME"
echo "  ✓ HTTP function port: 9000"

if [[ "$CHECK_ONLY" == "1" ]]; then
  echo "→ check complete; no cloud resources were changed"
  exit 0
fi

if [[ "${ALLOW_HTTP_FUNCTION_DEPLOY:-0}" != "1" ]]; then
  echo "✗ deployment requires explicit confirmation"
  echo "  ALLOW_HTTP_FUNCTION_DEPLOY=1 ./scripts/deploy-support-http-function.sh"
  exit 1
fi

echo "→ running repository quality gate"
cd "$PROJECT_ROOT"
npm run verify

echo "→ deploying HTTP function $FUNCTION_NAME to $ENV_ID"
tcb fn deploy "$FUNCTION_NAME" \
  --dir "$FUNCTION_DIR" \
  -e "$ENV_ID" \
  --httpFn \
  --runtime Nodejs20.19 \
  --force

echo "✓ HTTP function deployment command completed"
echo "  No public HTTP gateway route was created."
