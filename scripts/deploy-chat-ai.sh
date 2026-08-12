#!/usr/bin/env bash
# deploy-chat-ai.sh — 一键部署 chat-ai 云函数到 WeChat 云开发。
#
# 前置条件:
#   1. 装 cloudbase CLI: npm i -g @cloudbase/cli
#   2. 一次性登录: tcb login(浏览器弹窗授权)
#   3. 设置 ENV_ID(默认 cloud1-d8g02cdnld86f3823)
#
# 用法:
#   ./scripts/deploy-chat-ai.sh                 # 用默认 env
#   ENV_ID=other-env ./scripts/deploy-chat-ai.sh
#   ./scripts/deploy-chat-ai.sh --check         # 只检查前置,不上传
#   ./scripts/deploy-chat-ai.sh --tail-log      # deploy 完看最近 20 行日志
#
# 生产保护:
#   默认 env 是线上环境。部署到默认 env 时必须显式确认:
#   ALLOW_PROD_DEPLOY=1 ./scripts/deploy-chat-ai.sh
#
# 用户业务数据边界:
#   chat-ai 为无状态云函数，不读取或写入 user_data；无需部署前用户数据备份。
#
# 推送 env var(可选):
#   ./scripts/deploy-chat-ai.sh --env-file .env.local
#   .env.local 格式: 每行 KEY=VALUE,# 开头是注释。deploy 时临时注入 cloudbaserc.json,
#   deploy 完自动从 cloudbaserc.json 移除(避免 commit 泄露)。
#
#   ⚠️ 把 .env.local 加进 .gitignore! 脚本不会替你加。

set -euo pipefail

DEFAULT_ENV_ID="cloud1-d8g02cdnld86f3823"
ENV_ID="${ENV_ID:-$DEFAULT_ENV_ID}"
FUNCTION_NAME="chat-ai"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTION_DIR="$PROJECT_ROOT/cloudfunctions/$FUNCTION_NAME"
CLOUDBASERC="$PROJECT_ROOT/cloudbaserc.json"

# Args (use while + shift, not for-in $@ — shift doesn't work in for)
CHECK_ONLY=0
TAIL_LOG=0
ENV_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --tail-log) TAIL_LOG=1 ;;
    --env-file) ENV_FILE="${2:-}"; shift ;;
    -h|--help)
      sed -n '2,26p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
  shift
done

# --- preflight ---
echo "→ preflight checks"
command -v tcb >/dev/null 2>&1 || { echo "✗ @cloudbase/cli 没装。装: npm i -g @cloudbase/cli"; exit 1; }
echo "  ✓ tcb: $(tcb --version 2>&1 | head -1)"

if ! tcb fn list -e "$ENV_ID" >/dev/null 2>&1; then
  echo "✗ tcb 没登录或没权限。运行: tcb login"
  exit 1
fi
echo "  ✓ 已登录,env: $ENV_ID"

[ -d "$FUNCTION_DIR" ] || { echo "✗ 找不到 $FUNCTION_DIR"; exit 1; }
[ -f "$FUNCTION_DIR/index.js" ] || { echo "✗ 找不到 $FUNCTION_DIR/index.js"; exit 1; }
echo "  ✓ function dir: $FUNCTION_DIR"

if [ "$CHECK_ONLY" = 1 ]; then
  echo "→ --check mode,skipping deploy"
  exit 0
fi

if [ "$ENV_ID" = "$DEFAULT_ENV_ID" ] && [ "${ALLOW_PROD_DEPLOY:-0}" != "1" ]; then
  echo "✗ Refusing to deploy to production env $ENV_ID without explicit confirmation."
  echo "  Use: ALLOW_PROD_DEPLOY=1 ./scripts/deploy-chat-ai.sh"
  echo "  For preflight only: ./scripts/deploy-chat-ai.sh --check"
  exit 1
fi

# --- pre-deploy: mirror fushi-ditu utils/ and data/ into the bundle ---
echo
echo "→ syncing fushi-ditu utils+data into chat-ai bundle"
"$SCRIPT_DIR/sync-fushiditu.sh"

# --- pre-deploy: load .env into cloudbaserc.json (auto-cleanup on exit) ---
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  echo
  echo "→ loading env from $ENV_FILE into cloudbaserc.json"
  ENV_JSON=$(grep -v '^[[:space:]]*#' "$ENV_FILE" | grep -v '^[[:space:]]*$' | python3 -c '
import json, sys, os
out = {}
for line in sys.stdin:
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    if "=" not in line:
        continue
    k, v = line.split("=", 1)
    out[k.strip()] = v.strip()
print(json.dumps(out))
')
  echo "  loaded keys: $(echo "$ENV_JSON" | python3 -c 'import json,sys; print(", ".join(json.load(sys.stdin).keys()))')"

  # Inject into cloudbaserc.json (mutate in place, restore on exit)
  python3 -c "
import json, sys
with open('$CLOUDBASERC') as f: cfg = json.load(f)
env = json.loads('''$ENV_JSON''')
for fn in cfg.get('functions', []):
    if fn.get('name') == '$FUNCTION_NAME':
        fn['envVariables'] = {**(fn.get('envVariables') or {}), **env}
with open('$CLOUDBASERC', 'w') as f: json.dump(cfg, f, indent=2)
print('  injected into', '$FUNCTION_NAME', 'envVariables')
"
  # trap: 脚本退出(成功或失败)都从 cloudbaserc.json 移除 env var
  trap 'python3 -c "
import json
with open(\"$CLOUDBASERC\") as f: cfg = json.load(f)
for fn in cfg.get(\"functions\", []):
    if fn.get(\"name\") == \"$FUNCTION_NAME\" and \"envVariables\" in fn:
        del fn[\"envVariables\"]
with open(\"$CLOUDBASERC\", \"w\") as f: json.dump(cfg, f, indent=2)
print(\"  (cleanup) removed envVariables from $FUNCTION_NAME\")
"' EXIT
fi

# --- deploy ---
echo
echo "→ deploying $FUNCTION_NAME to $ENV_ID"
echo "  (first deploy installs node_modules from package.json — ~30-60s)"
echo
cd "$PROJECT_ROOT"
tcb fn deploy "$FUNCTION_NAME" --dir "$FUNCTION_DIR" -e "$ENV_ID" --force

echo
echo "✓ deploy done. test in console: https://console.cloud.tencent.com/tcb/scf"

if [ "$TAIL_LOG" = 1 ]; then
  echo
  echo "→ recent logs:"
  tcb fn log "$FUNCTION_NAME" -e "$ENV_ID" 2>&1 | tail -20 || echo "(no logs yet)"
fi
