#!/usr/bin/env bash
# ============================================================================
#  AICQ Plugin 一键安装脚本
#  用途: 安装 AICQ OpenClaw 插件到指定目录，编译并配置
#  用法: chmod +x deploy-plugin.sh && ./deploy-plugin.sh [安装目录] [服务器地址]
#  示例: ./deploy-plugin.sh /opt/openclaw/plugins/aicq-chat https://aicq.online
# ============================================================================
set -euo pipefail

# ─── 配置 ──────────────────────────────────────────────────────────────
INSTALL_DIR="${1:-./aicq-plugin}"
SERVER_URL="${2:-https://aicq.online}"
AGENT_ID="${AICQ_AGENT_ID:-}"
MAX_FRIENDS="${AICQ_MAX_FRIENDS:-200}"
AUTO_ACCEPT="${AICQ_AUTO_ACCEPT:-false}"

# ─── 颜色输出 ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          AICQ Plugin 一键安装脚本                          ║"
echo "║          安装目录: ${INSTALL_DIR}$(printf '%*s' $((37 - ${#INSTALL_DIR}))')║"
echo "║          服务器:   ${SERVER_URL}$(printf '%*s' $((37 - ${#SERVER_URL}))')║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── 0. 检查 Node.js ────────────────────────────────────────────────────
log_info "步骤 0: 检查环境..."
if ! command -v node &>/dev/null; then
  log_error "未找到 Node.js，请先安装 Node.js >= 18"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi
NODE_VER=$(node -v)
log_ok "Node.js ${NODE_VER} 已安装"

if ! command -v git &>/dev/null; then
  log_error "未找到 git，请先安装: sudo apt-get install -y git"
  exit 1
fi
log_ok "git 已安装"

# ─── 1. 获取源码 ──────────────────────────────────────────────────────
log_info "步骤 1/6: 获取 AICQ 源码..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/.."

if [ -d "${REPO_ROOT}/aicq-plugin" ]; then
  log_ok "源码目录已找到: ${REPO_ROOT}"
else
  log_error "未找到源码目录，请确保在 aicq/deploy/ 下运行此脚本"
  exit 1
fi

# ─── 2. 安装 crypto 依赖 ────────────────────────────────────────────────
log_info "步骤 2/6: 编译 aicq-crypto 加密库..."
cd "${REPO_ROOT}/aicq-crypto"
if [ ! -d "node_modules" ]; then
  npm install 2>&1 | tail -1
fi
npm run build 2>&1 | tail -1
log_ok "aicq-crypto 编译完成"

# ─── 3. 安装 Plugin 依赖 ────────────────────────────────────────────────
log_info "步骤 3/6: 安装 aicq-plugin 依赖..."
cd "${REPO_ROOT}/aicq-plugin"
if [ ! -d "node_modules" ]; then
  npm install 2>&1 | tail -1
fi
log_ok "依赖安装完成"

# ─── 4. 编译 Plugin ────────────────────────────────────────────────────
log_info "步骤 4/6: 编译 aicq-plugin..."
npm run build 2>&1 | tail -1
log_ok "编译完成"

# ─── 5. 复制到目标目录 ──────────────────────────────────────────────────
log_info "步骤 5/6: 安装到 ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

# 复制必要文件
cp -r "${REPO_ROOT}/aicq-plugin/dist"          "${INSTALL_DIR}/dist"
cp -r "${REPO_ROOT}/aicq-plugin/node_modules"   "${INSTALL_DIR}/node_modules"
cp    "${REPO_ROOT}/aicq-plugin/package.json"    "${INSTALL_DIR}/package.json"
cp    "${REPO_ROOT}/aicq-plugin/openclaw.plugin.json" "${INSTALL_DIR}/openclaw.plugin.json"

# 复制 crypto 库（运行时依赖）
mkdir -p "${INSTALL_DIR}/node_modules/@aicq"
cp -r "${REPO_ROOT}/aicq-crypto/dist"           "${INSTALL_DIR}/node_modules/@aicq/crypto/dist"
cp    "${REPO_ROOT}/aicq-crypto/package.json"  "${INSTALL_DIR}/node_modules/@aicq/crypto/package.json"

log_ok "文件已复制到 ${INSTALL_DIR}"

# ─── 6. 创建环境配置 ──────────────────────────────────────────────────
log_info "步骤 6/6: 生成配置文件..."

if [ -n "${AGENT_ID}" ]; then
  AGENT_LINE="AICQ_AGENT_ID=${AGENT_ID}"
else
  AGENT_LINE="# AICQ_AGENT_ID=  (留空则自动生成)"
fi

cat > "${INSTALL_DIR}/.env" << EOF
# AICQ Plugin 配置 - 自动生成于 $(date '+%Y-%m-%d %H:%M:%S')
# 服务器地址
AICQ_SERVER_URL=${SERVER_URL}

# Agent 标识
${AGENT_LINE}

# 好友上限
AICQ_MAX_FRIENDS=${MAX_FRIENDS}

# 是否自动接受好友请求 (true/false)
AICQ_AUTO_ACCEPT=${AUTO_ACCEPT}
EOF

log_ok "配置文件已生成: ${INSTALL_DIR}/.env"

# ─── 测试运行 ──────────────────────────────────────────────────────────
echo ""
log_info "运行独立测试（模拟 OpenClaw Runtime）..."
cd "${INSTALL_DIR}"
timeout 5 node dist/index.js 2>&1 || true

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          AICQ Plugin 安装完成!                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  安装路径:   ${INSTALL_DIR}$(printf '%*s' $((37 - ${#INSTALL_DIR}))')║"
echo "║  配置文件:   ${INSTALL_DIR}/.env$(printf '%*s' $((43 - ${#INSTALL_DIR}))')║"
echo "║  服务器:     ${SERVER_URL}$(printf '%*s' $((37 - ${#SERVER_URL}))')║"
echo "║                                                          ║"
echo "║  插件清单:                                                 ║"
echo "║    Channel:  encrypted-chat                               ║"
echo "║    Tool:     chat-friend / chat-send / chat-export-key     ║"
echo "║    Hook:     message_sending / before_tool_call            ║"
echo "║    Service:  identity-service                              ║"
echo "║                                                          ║"
echo "║  注册到 OpenClaw:                                         ║"
echo "║    将 ${INSTALL_DIR} 目录复制到 OpenClaw plugins 目录        ║"
echo "║    然后重启 OpenClaw Agent                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
