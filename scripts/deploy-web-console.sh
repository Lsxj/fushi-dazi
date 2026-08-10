#!/usr/bin/env bash

set -euo pipefail

ENV_ID="${ENV_ID:-cloud1-d8g02cdnld86f3823}"
API_BASE_URL="${VITE_API_BASE_URL:-}"
DEPLOY_PATH="${WEB_CONSOLE_DEPLOY_PATH:-admin}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/apps/web-console/dist"

command -v tcb >/dev/null 2>&1 || {
  echo "CloudBase CLI is missing"
  exit 1
}

if [[ -z "$API_BASE_URL" ]]; then
  echo "VITE_API_BASE_URL is required"
  exit 1
fi

if [[ "${ALLOW_WEB_CONSOLE_DEPLOY:-0}" != "1" ]]; then
  echo "deployment requires explicit confirmation"
  echo "ALLOW_WEB_CONSOLE_DEPLOY=1 VITE_API_BASE_URL=https://.../api ./scripts/deploy-web-console.sh"
  exit 1
fi

cd "$PROJECT_ROOT"
VITE_CLOUDBASE_ENV_ID="$ENV_ID" VITE_API_BASE_URL="$API_BASE_URL" \
  VITE_BASE_PATH="/$DEPLOY_PATH/" \
  pnpm --filter @fushi/web-console build

tcb hosting deploy "$DIST_DIR" "$DEPLOY_PATH" -e "$ENV_ID"

echo "Web Console deployed to static hosting path /$DEPLOY_PATH"
