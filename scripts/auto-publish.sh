#!/usr/bin/env bash
# =============================================================================
# AICQ — 自动发布脚本
# 每半小时由 cron 调用，参照发布注意事项.md 进行发布
# Tokens from environment: NPM_TOKEN, GITHUB_TOKEN
# =============================================================================
set -euo pipefail

PROJECT_ROOT="/home/z/my-project/aicq"
LOG_DIR="${PROJECT_ROOT}/test-results"
LOG_FILE="${LOG_DIR}/auto-publish-$(date +%Y%m%d).log"
NPM_TOKEN="${NPM_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
err() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $*" | tee -a "$LOG_FILE"; }

cd "$PROJECT_ROOT"

# ─── Step 1: 检查发布前置条件 ──────────────────────────────────────────
log "===== 开始自动发布周期 ====="

# 1a. 读取当前版本
CURRENT_PLUGIN_VERSION=$(node -p "require('${PROJECT_ROOT}/plugin/package.json').version" 2>/dev/null || echo "0.0.0")
CURRENT_ROOT_VERSION=$(node -p "require('${PROJECT_ROOT}/package.json').version" 2>/dev/null || echo "0.0.0")
log "当前 plugin 版本: ${CURRENT_PLUGIN_VERSION}"
log "当前根目录版本: ${CURRENT_ROOT_VERSION}"

# 1b. 检查是否有未提交的更改
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  log "⚠️ 有未提交的更改，先提交..."
  git add -A
  git commit -m "🤖 auto: 发布前自动提交 [$(date '+%Y%m%d-%H%M%S')]" 2>&1 | tee -a "$LOG_FILE" || true
fi

# 1c. 拉取最新代码
git pull origin main 2>&1 | tee -a "$LOG_FILE" || {
  err "拉取代码失败，跳过本次发布"
  exit 1
}

# ─── Step 2: 执行发布前检查清单 ────────────────────────────────────────
log "📋 执行发布前检查..."

# 2a. 确认依赖安装
log "安装所有依赖..."
npm run install:all 2>&1 | tail -3 | tee -a "$LOG_FILE"

# 2b. 构建验证
log "构建所有模块..."
BUILD_OUTPUT=$(npm run build 2>&1)
BUILD_EXIT=${PIPESTATUS[0]}
echo "$BUILD_OUTPUT" | tail -5 | tee -a "$LOG_FILE"

if [ "$BUILD_EXIT" -ne 0 ]; then
  err "构建失败，跳过发布！"
  # 更新 发布注意事项.md 记录构建失败
  echo "" >> "$PROJECT_ROOT/发布注意事项.md"
  echo "### ⚠️ 发布失败记录 - $(date '+%Y-%m-%d %H:%M:%S UTC+8')" >> "$PROJECT_ROOT/发布注意事项.md"
  echo "- **原因**: 构建失败" >> "$PROJECT_ROOT/发布注意事项.md"
  echo "- **版本**: plugin@${CURRENT_PLUGIN_VERSION}" >> "$PROJECT_ROOT/发布注意事项.md"
  echo "- **构建输出**: \`\`\`" >> "$PROJECT_ROOT/发布注意事项.md"
  echo "$BUILD_OUTPUT" | tail -20 >> "$PROJECT_ROOT/发布注意事项.md"
  echo "\`\`\`" >> "$PROJECT_ROOT/发布注意事项.md"
  git add "发布注意事项.md"
  git commit -m "🤖 auto: 记录发布构建失败" 2>&1 || true
  git push origin main 2>&1 || true
  exit 1
fi
log "✅ 构建成功"

# 2c. 验证构建产物
MISSING_BUILDS=0
[ ! -f "${PROJECT_ROOT}/shared/crypto/dist/index.js" ] && { log "❌ crypto 构建产物缺失"; MISSING_BUILDS=$((MISSING_BUILDS+1)); }
[ ! -f "${PROJECT_ROOT}/server/dist/index.js" ] && { log "❌ server 构建产物缺失"; MISSING_BUILDS=$((MISSING_BUILDS+1)); }
[ ! -f "${PROJECT_ROOT}/plugin/dist/index.js" ] && { log "❌ plugin 构建产物缺失"; MISSING_BUILDS=$((MISSING_BUILDS+1)); }

if [ "$MISSING_BUILDS" -gt 0 ]; then
  err "${MISSING_BUILDS} 个构建产物缺失，跳过发布"
  exit 1
fi
log "✅ 所有构建产物验证通过"

# ─── Step 3: 检查是否有需要发布的变更 ──────────────────────────────────
# 检查各目录自上次发布以来的变更
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
PLUGIN_CHANGES=$(git diff --name-only "$LAST_TAG"..HEAD -- plugin/ 2>/dev/null | wc -l)
SERVER_CHANGES=$(git diff --name-only "$LAST_TAG"..HEAD -- server/ 2>/dev/null | wc -l)
CRYPTO_CHANGES=$(git diff --name-only "$LAST_TAG"..HEAD -- shared/crypto/ 2>/dev/null | wc -l)
CLIENT_CHANGES=$(git diff --name-only "$LAST_TAG"..HEAD -- client/ 2>/dev/null | wc -l)

log "自 ${LAST_TAG} 以来变更: plugin=${PLUGIN_CHANGES}, server=${SERVER_CHANGES}, crypto=${CRYPTO_CHANGES}, client=${CLIENT_CHANGES}"

# 只有 plugin/server/crypto 变更需要发布 npm 包
# 纯 client/web 变更不影响 plugin 产物，跳过发布
PUBLISHABLE_CHANGES=$((PLUGIN_CHANGES + SERVER_CHANGES + CRYPTO_CHANGES))
if [ "$PUBLISHABLE_CHANGES" -eq 0 ]; then
  if [ "$CLIENT_CHANGES" -gt 0 ]; then
    log "✅ 仅有 client 变更 (${CLIENT_CHANGES} 个文件)，不影响 plugin，跳过发布"
  else
    log "✅ 无代码变更，跳过发布"
  fi
  exit 0
fi

TOTAL_CHANGES=$((PUBLISHABLE_CHANGES + CLIENT_CHANGES))

# ─── Step 4: 递增版本号 ────────────────────────────────────────────────
log "🔄 递增版本号..."

# 提取当前版本号组件
MAJOR=$(echo "$CURRENT_PLUGIN_VERSION" | cut -d. -f1)
MINOR=$(echo "$CURRENT_PLUGIN_VERSION" | cut -d. -f2)
PATCH=$(echo "$CURRENT_PLUGIN_VERSION" | cut -d. -f3)

# 如果有重要变更，升级 minor；否则升级 patch
if [ "$SERVER_CHANGES" -gt 0 ]; then
  # server 变更可能影响 API 兼容性，升级 minor
  NEW_MINOR=$((MINOR + 1))
  NEW_VERSION="${MAJOR}.${NEW_MINOR}.0"
  log "检测到 server 变更，升级 minor 版本: ${CURRENT_PLUGIN_VERSION} → ${NEW_VERSION}"
else
  NEW_PATCH=$((PATCH + 1))
  NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"
  log "升级 patch 版本: ${CURRENT_PLUGIN_VERSION} → ${NEW_VERSION}"
fi

# 更新 plugin 版本号
cd "$PROJECT_ROOT/plugin"
npm version "$NEW_VERSION" --no-git-tag-version 2>&1 | tee -a "$LOG_FILE"

# 更新根目录版本号
cd "$PROJECT_ROOT"
npm version "$NEW_VERSION" --no-git-tag-version 2>&1 | tee -a "$LOG_FILE"

# 更新 server 版本号
cd "$PROJECT_ROOT/server"
npm version "$NEW_VERSION" --no-git-tag-version 2>&1 | tee -a "$LOG_FILE"

log "✅ 版本号更新为 ${NEW_VERSION}"

# ─── Step 5: 重新构建（使用新版本号） ──────────────────────────────────
log "使用新版本号重新构建..."
cd "$PROJECT_ROOT"
npm run build 2>&1 | tail -5 | tee -a "$LOG_FILE"

# ─── Step 6: 提交版本号变更 ────────────────────────────────────────────
cd "$PROJECT_ROOT"
git add -A
git commit -m "🤖 auto: 版本号更新至 v${NEW_VERSION}" 2>&1 | tee -a "$LOG_FILE"
git push origin main 2>&1 | tee -a "$LOG_FILE" || true

# ─── Step 7: 创建 Git Tag ──────────────────────────────────────────────
TAG="v${NEW_VERSION}"
log "创建 tag: ${TAG}"
git tag -a "$TAG" -m "Auto release ${TAG}" 2>&1 || {
  log "⚠️ Tag ${TAG} 已存在"
}
git push origin "$TAG" 2>&1 | tee -a "$LOG_FILE" || {
  log "⚠️ Tag 推送失败"
}

# ─── Step 8: 发布到 npm（使用临时目录避免 workspace 冲突） ────────────────
log "📦 发布到 npm..."

# 配置 npm token
npm config set //registry.npmjs.org/:_authToken="${NPM_TOKEN}" 2>&1 | tee -a "$LOG_FILE"

# 复制 plugin 产物到临时目录发布（避免 monorepo workspace 冲突）
PUBLISH_DIR=$(mktemp -d)
log "使用临时发布目录: ${PUBLISH_DIR}"
cp -r "$PROJECT_ROOT/plugin/dist" "$PUBLISH_DIR/dist"
cp "$PROJECT_ROOT/plugin/package.json" "$PUBLISH_DIR/package.json"

# 复制 openclaw.plugin.json 如果存在
[ -f "$PROJECT_ROOT/plugin/openclaw.plugin.json" ] && \
  cp "$PROJECT_ROOT/plugin/openclaw.plugin.json" "$PUBLISH_DIR/openclaw.plugin.json"

# 从临时目录发布
cd "$PUBLISH_DIR"
PUBLISH_OUTPUT=$(npm publish --ignore-scripts 2>&1)
PUBLISH_EXIT=$?

# 清理临时目录
rm -rf "$PUBLISH_DIR"

cd "$PROJECT_ROOT"

if [ "$PUBLISH_EXIT" -ne 0 ]; then
  if [ -z "$PUBLISH_OUTPUT" ]; then PUBLISH_OUTPUT="(no output)"; fi
  err "npm 发布失败！"
  echo "$PUBLISH_OUTPUT" | tee -a "$LOG_FILE"

  # 更新 发布注意事项.md
  echo "" >> "$PROJECT_ROOT/发布注意事项.md"
  echo "### ⚠️ npm 发布失败 - $(date '+%Y-%m-%d %H:%M:%S UTC+8')" >> "$PROJECT_ROOT/发布注意事项.md"
  echo "- **版本**: ${NEW_VERSION}" >> "$PROJECT_ROOT/发布注意事项.md"
  echo "- **错误详情**: 见日志文件" >> "$PROJECT_ROOT/发布注意事项.md"

  cd "$PROJECT_ROOT"
  git add "发布注意事项.md"
  git commit -m "🤖 auto: 记录 npm 发布失败 v${NEW_VERSION}" 2>&1 || true
  git push origin main 2>&1 || true
  exit 1
fi

log "✅ npm 发布成功！"
echo "$PUBLISH_OUTPUT" | tee -a "$LOG_FILE"

# ─── Step 9: 创建 GitHub Release ──────────────────────────────────────
log "📋 创建 GitHub Release..."

RELEASE_BODY="## AICQ ${TAG}

### Changes
自动发布，自 ${LAST_TAG} 以来的变更：
- Plugin 变更: ${PLUGIN_CHANGES} 个文件
- Server 变更: ${SERVER_CHANGES} 个文件
- Client 变更: ${CLIENT_CHANGES} 个文件

### ModelScope Models
- stepfun-ai/Step-3.5-Flash
- ZhipuAI/GLM-5
- Minimal/MiniMax-M2.5
- moonshotai/Kimi-K2.5

### Downloads
See attached artifacts.
"

RELEASE_PAYLOAD=$(jq -n \
  --arg tag "$TAG" \
  --arg name "AICQ ${TAG}" \
  --arg body "$RELEASE_BODY" \
  '{tag_name: $tag, name: $name, body: $body, draft: false, prerelease: false}')

RELEASE_RESPONSE=$(curl -s -X POST \
  "https://api.github.com/repos/ctz168/aicq/releases" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$RELEASE_PAYLOAD" 2>&1)

RELEASE_ID=$(echo "$RELEASE_RESPONSE" | jq -r '.id // empty' 2>/dev/null || echo "")

if [ -n "$RELEASE_ID" ] && [ "$RELEASE_ID" != "null" ]; then
  log "✅ GitHub Release 创建成功: ID=${RELEASE_ID}"
else
  log "⚠️ GitHub Release 创建失败或已存在"
  echo "$RELEASE_RESPONSE" | head -5 | tee -a "$LOG_FILE"
fi

# ─── Step 10: 更新 发布注意事项.md ────────────────────────────────────
log "📝 更新发布注意事项.md..."
cd "$PROJECT_ROOT"

cat >> "$PROJECT_ROOT/发布注意事项.md" <<PUBEOF

### ✅ 发布成功 - v${NEW_VERSION} ($(date '+%Y-%m-%d %H:%M:%S UTC+8'))
- **plugin 版本**: ${NEW_VERSION}
- **Git Tag**: ${TAG}
- **npm 包**: aicq-openclaw-plugin@${NEW_VERSION}
- **变更文件数**: ${TOTAL_CHANGES}
- **GitHub Release**: https://github.com/ctz168/aicq/releases/tag/${TAG}
PUBEOF

git add "发布注意事项.md"
git commit -m "🤖 auto: 记录发布成功 v${NEW_VERSION}" 2>&1 || true
git push origin main 2>&1 || true

log "===== 自动发布周期完成 ====="
log "🎉 版本 ${NEW_VERSION} 发布成功！"
