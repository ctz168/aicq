#!/usr/bin/env bash
# =============================================================================
# AICQ — 自动测试脚本
# 每5分钟由 cron 调用，拉取最新代码，构建，运行集成测试，更新 bugs.md
# Tokens from environment: GITHUB_TOKEN
# =============================================================================
set -euo pipefail

PROJECT_ROOT="/home/z/my-project/aicq"
LOG_DIR="${PROJECT_ROOT}/test-results"
LOG_FILE="${LOG_DIR}/auto-test-$(date +%Y%m%d).log"

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$PROJECT_ROOT"

# ─── Step 1: 拉取最新代码 ──────────────────────────────────────────────
log "===== 开始自动测试周期 ====="

OLD_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
log "当前 commit: ${OLD_COMMIT}"

git pull origin main 2>&1 | tee -a "$LOG_FILE" || {
  log "⚠️ git pull 失败，尝试 checkout + pull"
  git checkout main 2>&1 | tee -a "$LOG_FILE" || true
  git pull origin main 2>&1 | tee -a "$LOG_FILE"
}

NEW_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
log "最新 commit: ${NEW_COMMIT}"

# ─── Step 2: 分析变更 ────────────────────────────────────────────────
CHANGED_FILES=""
CHANGED_COUNT=0

if [ "$OLD_COMMIT" != "$NEW_COMMIT" ]; then
  CHANGED_FILES=$(git diff --name-only "$OLD_COMMIT" "$NEW_COMMIT" 2>/dev/null || echo "")
  CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -c . || echo "0")
  log "📝 代码有变更 (${CHANGED_COUNT} 个文件)"
  if [ -n "$CHANGED_FILES" ]; then
    echo "$CHANGED_FILES" | while read -r f; do log "  - $f"; done
  fi
else
  log "✅ 代码无变更"
fi

# ─── Step 3: 重新构建 ────────────────────────────────────────────────
log "🔄 构建所有模块..."
BUILD_OUTPUT=$(npm run build 2>&1)
BUILD_EXIT=$?
echo "$BUILD_OUTPUT" | tail -5 | tee -a "$LOG_FILE"

if [ "$BUILD_EXIT" -ne 0 ]; then
  log "❌ 构建失败！更新 bugs.md"
  cat >> "$PROJECT_ROOT/bugs.md" <<BUGEOF

### BUG-AUTO-$(date +%H%M%S): 自动构建失败
- **模块**: build
- **触发 commit**: ${NEW_COMMIT}
- **描述**: 自动拉取代码后构建失败
- **变更文件**: $(echo "$CHANGED_FILES" | tr '\n' ', ')
- **构建输出**: 见日志 \`${LOG_FILE}\`
- **状态**: 待修复
- **发现时间**: $(date '+%Y-%m-%d %H:%M:%S UTC+8')
BUGEOF
  git add bugs.md
  git commit -m "🤖 auto: 检测到构建失败，更新 bugs.md [${NEW_COMMIT:0:8}]" 2>&1 | tee -a "$LOG_FILE"
  git push origin main 2>&1 | tee -a "$LOG_FILE" || true
  log "===== 自动测试周期完成 (构建失败) ====="
  exit 1
fi
log "✅ 构建成功"

# ─── Step 4: 启动服务器并运行集成测试 ──────────────────────────────────
pkill -f "node.*aicq/server.*dist/index" 2>/dev/null || true
sleep 1

cd "$PROJECT_ROOT/server"
ALLOW_LOCALHOST=true PORT=61018 nohup node dist/index.js > "${LOG_DIR}/server-auto.log" 2>&1 &
SERVER_PID=$!
sleep 3

# 检查服务器是否启动
if ! curl -sf http://127.0.0.1:61018/health > /dev/null 2>&1; then
  log "❌ 服务器启动失败"
  tail -10 "${LOG_DIR}/server-auto.log" | tee -a "$LOG_FILE"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi
log "✅ 服务器启动成功 (PID: ${SERVER_PID})"

# 运行集成测试
log "🧪 运行集成测试..."
cd "$PROJECT_ROOT"
TEST_OUTPUT=$(node scripts/integration-test.cjs 2>&1 || true)
echo "$TEST_OUTPUT" | tee -a "$LOG_FILE"

# 提取测试结果
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+ 通过' | grep -oP '\d+' || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+ 失败' | grep -oP '\d+' || echo "0")
TOTAL_COUNT=$((PASS_COUNT + FAIL_COUNT))
log "📊 测试结果: ${PASS_COUNT} 通过 / ${FAIL_COUNT} 失败 / 共 ${TOTAL_COUNT} 项"

# ─── Step 5: 清理服务器 ──────────────────────────────────────────────
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
pkill -f "node.*aicq/server.*dist/index" 2>/dev/null || true

# ─── Step 6: 检查是否有新失败（与已知 bug 比较） ──────────────────────
# 已知的 7 个失败项模式
KNOWN_FAILURES=(
  "注册 Human Node"
  "注册 AI Node"
  "初始化管理员"
  "GET /api/v1/node/register"
  "GET /api/v1/temp-number"
  "POST /api/v1/groups"
  "GET /api/v1/groups"
)

NEW_BUGS=false
BUG_REPORT=""

# 提取所有失败行
while IFS= read -r line; do
  if echo "$line" | grep -q "❌"; then
    # 检查是否是已知失败
    is_known=false
    for known in "${KNOWN_FAILURES[@]}"; do
      if echo "$line" | grep -q "$known"; then
        is_known=true
        break
      fi
    done
    if [ "$is_known" = false ]; then
      NEW_BUGS=true
      BUG_REPORT="${BUG_REPORT}${line}"$'\n'
    fi
  fi
done <<< "$TEST_OUTPUT"

# ─── Step 7: 更新 bugs.md（如有新 bug） ──────────────────────────────
cd "$PROJECT_ROOT"
if [ "$NEW_BUGS" = true ]; then
  log "⚠️ 检测到新的测试失败！更新 bugs.md"
  
  # 生成 bug ID
  BUG_ID="BUG-$(date +%H%M%S)"
  
  cat >> "$PROJECT_ROOT/bugs.md" <<BUGEOF

### ${BUG_ID}: 自动测试发现新失败
- **模块**: auto-test
- **触发 commit**: ${NEW_COMMIT}
- **描述**: 集成测试中发现新的失败项
- **失败详情**:
${BUG_REPORT}
- **测试时间**: $(date '+%Y-%m-%d %H:%M:%S UTC+8')
- **状态**: 待分析
BUGEOF

  log "📝 提交并推送 bugs.md..."
  git add bugs.md
  git commit -m "🤖 auto: 定时测试更新 bugs.md [${NEW_COMMIT:0:8}]" 2>&1 | tee -a "$LOG_FILE"
  git push origin main 2>&1 | tee -a "$LOG_FILE" || true
else
  log "✅ 无新 bug，bugs.md 无需更新"
fi

log "===== 自动测试周期完成 (${PASS_COUNT}/${TOTAL_COUNT}) ====="
