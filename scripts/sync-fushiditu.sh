#!/usr/bin/env bash
# sync-fushiditu.sh — 把 fushi-ditu 的 utils/ 和 data/ 复制到 chat-ai/
# 这样云函数能 require 自己的 fushi-ditu 副本。
#
# 为什么需要这个:
#   WeChat 云函数 deploy 只打包单个函数目录。所以 chat-ai 在云端是
#   /var/user/,无法 require 上级的 /fushi-ditu/utils/* 。本地 dryrun
#   之所以能跑,是因为 dev 时 __dirname 真解析到 fushi-ditu 上层。
#
# 何时跑:
#   1. 改 fushi-ditu/utils/* 或 data/* 后(任何修改)
#   2. deploy-chat-ai.sh 跑之前(自动化 — 见 deploy-chat-ai.sh)
#   3. 切换 fushi-ditu git branch / pull 之后
#
# 输出:
#   cloudfunctions/chat-ai/fushi-ditu/utils/   (副本)
#   cloudfunctions/chat-ai/fushi-ditu/data/    (副本)
#   cloudfunctions/chat-ai/fushi-ditu/README   (标记副本 + 同步时间)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_UTILS="$PROJECT_ROOT/utils"
SRC_DATA="$PROJECT_ROOT/data"
DEST="$PROJECT_ROOT/cloudfunctions/chat-ai/fushi-ditu"
DEST_UTILS="$DEST/utils"
DEST_DATA="$DEST/data"

[ -d "$SRC_UTILS" ] || { echo "✗ 找不到 $SRC_UTILS"; exit 1; }
[ -d "$SRC_DATA" ] || { echo "✗ 找不到 $SRC_DATA"; exit 1; }

# Mirror with rsync if available, else cp -R.
copy_dir() {
  local src="$1" dest="$2"
  rm -rf "$dest"
  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude="*.tsbuildinfo" --exclude="*.d.ts" "$src/" "$dest/"
  else
    cp -R "$src/." "$dest/"
  fi
}

echo "→ syncing fushi-ditu/utils/ → chat-ai/fushi-ditu/utils/"
copy_dir "$SRC_UTILS" "$DEST_UTILS"

echo "→ syncing fushi-ditu/data/ → chat-ai/fushi-ditu/data/"
copy_dir "$SRC_DATA" "$DEST_DATA"

# Mark the copy with a sync marker so it's obvious this is a snapshot.
cat > "$DEST/README" <<EOF
# DO NOT EDIT — auto-generated snapshot

This is a copy of \`utils/\` and \`data/\` from the parent fushi-ditu repo.
The cloud function \`chat-ai\` deploys as a single bundle and cannot
require files from outside its own directory, so we mirror them here
before each deploy.

Last sync: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Source:    fushi-ditu/utils/, fushi-ditu/data/

Regenerate with:  ./scripts/sync-fushiditu.sh
EOF

# Count what was copied
UTILS_COUNT=$(find "$DEST_UTILS" -maxdepth 1 -type f | wc -l | tr -d ' ')
DATA_COUNT=$(find "$DEST_DATA" -maxdepth 1 -type f | wc -l | tr -d ' ')
echo "✓ synced: $UTILS_COUNT utils files, $DATA_COUNT data files"
echo "  dest: $DEST"
