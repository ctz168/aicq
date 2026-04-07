#!/usr/bin/env bash
# =============================================================================
# AICQ — 自动拉取代码并测试脚本
# 每3分钟由 cron 调用，拉取最新代码，分析变更，针对性测试，更新 bugs.md
# =============================================================================
set -euo pipefail

PROJECT_ROOT="/home/z/my-project/aicq"
LOG_DIR="${PROJECT_ROOT}/test-results"
LOG_FILE="${LOG_DIR}/auto-test-$(date +%Y%m%d).log"
REPO_URL="https://github.com/ctz168/aicq.git"

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ─── Step 1: 拉取最新代码 ──────────────────────────────────────────────
log "===== 开始自动测试周期 ====="
cd "$PROJECT_ROOT"

# 保存当前 commit
OLD_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
log "当前 commit: ${OLD_COMMIT}"

# 拉取代码
git pull origin main 2>&1 | tee -a "$LOG_FILE" || {
  log "⚠️ git pull 失败，尝试 checkout"
  git checkout main 2>&1 | tee -a "$LOG_FILE"
  git pull origin main 2>&1 | tee -a "$LOG_FILE"
}

NEW_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
log "最新 commit: ${NEW_COMMIT}"

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
  log "✅ 代码无变更，跳过测试"
  exit 0
fi

log "📝 代码有变更，开始分析..."

# ─── Step 2: 分析变更文件 ──────────────────────────────────────────────
CHANGED_FILES=$(git diff --name-only "$OLD_COMMIT" "$NEW_COMMIT" 2>/dev/null || echo "")
CHANGED_COUNT=$(echo "$CHANGED_FILES" | wc -l)

log "变更文件数: ${CHANGED_COUNT}"
if [ -n "$CHANGED_FILES" ]; then
  log "变更文件:"
  echo "$CHANGED_FILES" | while read -r f; do
    log "  - $f"
  done
fi

# ─── Step 3: 重新构建 ────────────────────────────────────────────────
log "🔄 重新构建..."
npm run build 2>&1 | tail -5 | tee -a "$LOG_FILE"
BUILD_EXIT=${PIPESTATUS[0]}

if [ "$BUILD_EXIT" -ne 0 ]; then
  log "❌ 构建失败！更新 bugs.md"
  # 追加到 bugs.md
  cat >> "$PROJECT_ROOT/bugs.md" <<BUGEOF

### BUG-AUTO-$(date +%H%M%S): 构建失败
- **模块**: build
- **触发 commit**: ${NEW_COMMIT}
- **描述**: 自动拉取代码后构建失败
- **变更文件**: $(echo "$CHANGED_FILES" | tr '\n' ', ')
- **状态**: 待修复
- **发现时间**: $(date '+%Y-%m-%d %H:%M:%S UTC+8')
BUGEOF
  # 推送 bugs.md
  cd "$PROJECT_ROOT"
  git add bugs.md
  git commit -m "🤖 auto: 检测到构建失败，更新 bugs.md [${NEW_COMMIT:0:8}]"
  git push origin main 2>&1 | tee -a "$LOG_FILE" || true
  exit 1
fi

log "✅ 构建成功"

# ─── Step 4: 根据变更文件选择测试策略 ──────────────────────────────────
# 检查哪些模块被修改了
NEED_SERVER_TEST=false
NEED_PLUGIN_TEST=false
NEED_CLIENT_TEST=false
NEED_CRYPTO_TEST=false

echo "$CHANGED_FILES" | while read -r f; do
  case "$f" in
    server/*) NEED_SERVER_TEST=true ;;
    plugin/*) NEED_PLUGIN_TEST=true ;;
    client/*) NEED_CLIENT_TEST=true ;;
    shared/crypto/*) NEED_CRYPTO_TEST=true ;;
  esac
done

# ─── Step 5: 启动服务器并运行测试 ──────────────────────────────────────
# 先杀掉可能残留的服务器进程
pkill -f "node.*aicq/server.*dist/index" 2>/dev/null || true
sleep 1

# 启动服务器
cd "$PROJECT_ROOT/server"
ALLOW_LOCALHOST=true PORT=61018 node dist/index.js > "${LOG_DIR}/server-auto.log" 2>&1 &
SERVER_PID=$!
sleep 3

# 检查服务器是否启动
if curl -sf http://127.0.0.1:61018/health > /dev/null 2>&1; then
  log "✅ 服务器启动成功 (PID: ${SERVER_PID})"

  # 运行集成测试
  log "🧪 运行集成测试..."
  cd "$PROJECT_ROOT"
  TEST_OUTPUT=$(node scripts/integration-test.cjs 2>&1 || true)
  echo "$TEST_OUTPUT" | tee -a "$LOG_FILE"

  # 提取失败数
  FAIL_COUNT=$(echo "$TEST_OUTPUT" | rg '失败, 共' -o || echo "0")
  log "测试结果: ${FAIL_COUNT}"

  # 如果有失败，分析并更新 bugs.md
  if echo "$TEST_OUTPUT" | rq -q '.[] | select(.status == "FAIL")' 2>/dev/null; then
    FAILED_TESTS=$(echo "$TEST_OUTPUT" | rg '❌' || echo "none")
    log "失败的测试: ${FAILED_TESTS}"

    # 智能分析：将失败与变更关联
    echo "$CHANGED_FILES" | rg -q "server/src/api" && {
      log "⚠️ API 相关文件有变更，测试失败可能与变更有关"
    }
  fi

  # 清理服务器
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
else
  log "❌ 服务器启动失败"
  tail -10 "${LOG_DIR}/server-auto.log" | tee -a "$LOG_FILE"
fi

# ─── Step 6: 推送 bugs.md 更新（如有变更） ──────────────────────────────
cd "$PROJECT_ROOT"
if git diff --quiet bugs.md 2>/dev/null; then
  log "✅ bugs.md 无变更"
else
  log "📝 bugs.md 有变更，提交并推送..."
  git add bugs.md
  git commit -m "🤖 auto: 自动测试更新 bugs.md [${NEW_COMMIT:0:8}]"
  git push origin main 2>&1 | tee -a "$LOG_FILE" || true
fi

log "===== 自动测试周期完成 ====="
