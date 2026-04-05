#!/usr/bin/env bash
# ============================================================================
#  AICQ Plugin 独立一键安装脚本
#  版本: 2.0
#  用途: 编译 AICQ OpenClaw 插件并安装到指定目录
#  特性:
#    - 自动检测并安装 Node.js
#    - 编译 aicq-crypto 加密库
#    - 编译 aicq-plugin 插件
#    - 自动复制运行时文件到目标目录
#    - 自动生成 .env 配置文件
#    - 支持从 GitHub 克隆或使用本地源码
#    - 支持自定义 Agent ID、服务器地址等参数
#    - 安装后自动验证
#
#  用法:
#    chmod +x deploy.sh
#    ./deploy.sh [选项]
#
#  选项:
#    --install-dir=DIR    安装目标目录 (默认: ./aicq-plugin-dist)
#    --server-url=URL     AICQ 服务器地址 (默认: https://aicq.online)
#    --agent-id=ID        Agent 唯一标识 (默认: 自动生成)
#    --max-friends=N      最大好友数 (默认: 200)
#    --auto-accept        自动接受好友请求
#    --source-dir=DIR     源码目录 (默认: 从 GitHub 克隆)
#    --no-color           禁用彩色输出
#    --help               显示帮助信息
#
#  示例:
#    ./deploy.sh --install-dir=/opt/openclaw/plugins/aicq-chat --server-url=https://aicq.online
#    ./deploy.sh --agent-id=my-agent-001 --auto-accept
#    ./deploy.sh --source-dir=/home/user/aicq
#
#  最简用法:
#    ./deploy.sh
# ============================================================================
set -euo pipefail

# ─── 默认配置 ─────────────────────────────────────────────────────────────
INSTALL_DIR="./aicq-plugin-dist"
SERVER_URL="https://aicq.online"
AGENT_ID=""
MAX_FRIENDS=200
AUTO_ACCEPT=false
SOURCE_DIR=""
USE_COLOR=true
REPO_URL="https://github.com/ctz168/aicq.git"

# ─── 解析命令行参数 ───────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --install-dir=*) INSTALL_DIR="${arg#*=}" ;;
    --server-url=*)  SERVER_URL="${arg#*=}" ;;
    --agent-id=*)    AGENT_ID="${arg#*=}" ;;
    --max-friends=*) MAX_FRIENDS="${arg#*=}" ;;
    --auto-accept)   AUTO_ACCEPT=true ;;
    --source-dir=*)  SOURCE_DIR="${arg#*=}" ;;
    --no-color)      USE_COLOR=false ;;
    --help|-h)
      head -40 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "未知参数: $arg (使用 --help 查看帮助)"
      exit 1
      ;;
  esac
done

# ─── 颜色输出 ─────────────────────────────────────────────────────────────
if $USE_COLOR; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; BOLD=''; NC=''
fi

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[FAIL]${NC}  $*"; }
log_step()  { echo -e "${CYAN}${BOLD}[STEP]${NC}  $*"; }
log_line()  { echo -e "${BOLD}────────────────────────────────────────────────────────────${NC}"; }

# ─── Banner ────────────────────────────────────────────────────────────────
echo ""
log_line
echo -e "${BOLD}${CYAN}          AICQ Plugin 独立一键安装脚本 v2.0${NC}"
log_line
echo -e "  安装目录:    ${GREEN}${INSTALL_DIR}${NC}"
echo -e "  服务器地址:  ${SERVER_URL}"
echo -e "  Agent ID:    ${AGENT_ID:-<自动生成>}"
echo -e "  最大好友:    ${MAX_FRIENDS}"
echo -e "  自动接受:    ${AUTO_ACCEPT}"
if [ -n "$SOURCE_DIR" ]; then
  echo -e "  源码目录:    ${SOURCE_DIR}"
else
  echo -e "  源码来源:    GitHub (ctz168/aicq)"
fi
log_line
echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  主安装流程
# ═══════════════════════════════════════════════════════════════════════════

TOTAL_STEPS=8
CURRENT_STEP=0

next_step() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  log_step "步骤 ${CURRENT_STEP}/${TOTAL_STEPS}: $1"
}

# ─── 步骤 1: 检查环境 ────────────────────────────────────────────────────
next_step "检查运行环境"

if ! command -v node &>/dev/null; then
  log_error "未找到 Node.js，请先安装 Node.js >= 18"
  echo ""
  echo "  安装方式 (Ubuntu/Debian):"
  echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "    sudo apt-get install -y nodejs"
  echo ""
  echo "  或使用 nvm:"
  echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
  echo "    nvm install 20"
  exit 1
fi

NODE_VER=$(node -v)
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  log_error "Node.js 版本过低: ${NODE_VER}，要求 >= v18"
  exit 1
fi
log_ok "Node.js ${NODE_VER}"

if ! command -v npm &>/dev/null; then
  log_error "未找到 npm"
  exit 1
fi
log_ok "npm $(npm -v)"

if ! command -v git &>/dev/null; then
  log_error "未找到 git，请先安装: sudo apt-get install -y git"
  exit 1
fi
log_ok "git $(git --version | cut -d' ' -f3)"

# ─── 步骤 2: 获取源码 ────────────────────────────────────────────────────
next_step "获取 AICQ 源码"

if [ -n "$SOURCE_DIR" ] && [ -d "$SOURCE_DIR/plugin" ]; then
  REPO_ROOT="$(cd "$SOURCE_DIR" && pwd)"
  log_info "使用本地源码目录: ${REPO_ROOT}"
  if [ -d "${REPO_ROOT}/.git" ]; then
    cd "$REPO_ROOT" && git pull --ff-only 2>/dev/null || log_warn "git pull 失败，使用现有代码"
  fi
else
  # 在临时目录克隆
  TEMP_DIR=$(mktemp -d)
  log_info "从 GitHub 克隆到临时目录..."
  git clone --depth 1 "$REPO_URL" "$TEMP_DIR/aicq" 2>/dev/null
  REPO_ROOT="${TEMP_DIR}/aicq"
fi
  log_ok "源码克隆完成"
fi

# 验证关键目录存在
if [ ! -d "${REPO_ROOT}/plugin" ]; then
  log_error "未找到 plugin 目录: ${REPO_ROOT}/plugin"
  exit 1
fi
if [ ! -d "${REPO_ROOT}/shared/crypto" ]; then
  log_error "未找到 shared/crypto 目录: ${REPO_ROOT}/shared/crypto"
  exit 1
fi
log_ok "源码目录就绪: ${REPO_ROOT}"

# ─── 步骤 3: 安装 aicq-crypto 依赖 ────────────────────────────────────────
next_step "安装并编译 shared/crypto 加密库"
cd "${REPO_ROOT}/shared/crypto"

if [ ! -d "node_modules" ]; then
  log_info "  安装 shared/crypto 依赖..."
  npm install 2>&1 | tail -1
else
  log_ok "  shared/crypto 依赖已存在"
fi

log_info "  编译 shared/crypto..."
if npm run build 2>&1; then
  log_ok "shared/crypto 编译成功"
else
  log_error "shared/crypto 编译失败"
  exit 1
fi

# ─── 步骤 4: 安装 aicq-plugin 依赖 ────────────────────────────────────────
next_step "安装 plugin 依赖"
cd "${REPO_ROOT}/plugin"

if [ ! -d "node_modules" ]; then
  log_info "  安装 plugin 依赖..."
  npm install 2>&1 | tail -1
else
  log_info "  更新 plugin 依赖..."
  npm install 2>&1 | tail -1
fi
log_ok "plugin 依赖安装完成"

# ─── 步骤 5: 编译 aicq-plugin ─────────────────────────────────────────────
next_step "编译 plugin"

if npm run build 2>&1; then
  log_ok "plugin 编译成功"
else
  log_error "plugin 编译失败"
  exit 1
fi

# ─── 步骤 6: 安装到目标目录 ───────────────────────────────────────────────
next_step "安装到目标目录: ${INSTALL_DIR}"

# 清理并创建目标目录
rm -rf "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"

log_info "  复制插件文件..."
# 复制编译产物
cp -r "${REPO_ROOT}/plugin/dist"                    "${INSTALL_DIR}/dist"
cp -r "${REPO_ROOT}/plugin/node_modules"            "${INSTALL_DIR}/node_modules" 2>/dev/null || true
cp    "${REPO_ROOT}/plugin/package.json"             "${INSTALL_DIR}/package.json"
cp    "${REPO_ROOT}/plugin/openclaw.plugin.json"     "${INSTALL_DIR}/openclaw.plugin.json"
cp    "${REPO_ROOT}/plugin/tsconfig.json"            "${INSTALL_DIR}/tsconfig.json" 2>/dev/null || true

# 复制 crypto 库作为运行时依赖
log_info "  打包加密库..."
mkdir -p "${INSTALL_DIR}/node_modules/@aicq"
if [ -d "${REPO_ROOT}/shared/crypto/dist" ]; then
  cp -r "${REPO_ROOT}/shared/crypto/dist"          "${INSTALL_DIR}/node_modules/@aicq/crypto/dist"
fi
cp "${REPO_ROOT}/shared/crypto/package.json"       "${INSTALL_DIR}/node_modules/@aicq/crypto/package.json"

# 复制 crypto 的依赖 (tweetnacl 等)
if [ -d "${REPO_ROOT}/shared/crypto/node_modules" ]; then
  cp -r "${REPO_ROOT}/shared/crypto/node_modules/"* "${INSTALL_DIR}/node_modules/" 2>/dev/null || true
fi

log_ok "文件复制完成"

# 显示安装的文件结构
log_info "  安装目录结构:"
echo "  ${INSTALL_DIR}/"
echo "  ├── dist/                  # 编译产物"
echo "  ├── node_modules/           # 运行时依赖"
echo "  │   └── @aicq/crypto/      # 加密库"
echo "  ├── package.json            # 包描述"
echo "  ├── openclaw.plugin.json    # OpenClaw 插件清单"
echo "  └── .env                    # 配置文件 (下一步生成)"

# ─── 步骤 7: 生成配置文件 ────────────────────────────────────────────────
next_step "生成配置文件"

# Agent ID 处理
AGENT_LINE=""
if [ -n "$AGENT_ID" ]; then
  AGENT_LINE="AICQ_AGENT_ID=${AGENT_ID}"
else
  AGENT_LINE="# AICQ_AGENT_ID=              # 留空则首次启动时自动生成 UUID"
fi

# 自动接受好友
AUTO_ACCEPT_VAL="false"
if $AUTO_ACCEPT; then
  AUTO_ACCEPT_VAL="true"
fi

cat > "${INSTALL_DIR}/.env" << ENVEOF
# ══════════════════════════════════════════════════════════════════
# AICQ Plugin 配置文件
# 自动生成时间: $(date '+%Y-%m-%d %H:%M:%S')
# 安装脚本版本: v2.0
# ══════════════════════════════════════════════════════════════════

# AICQ 服务器地址
AICQ_SERVER_URL=${SERVER_URL}

# Agent 唯一标识 (UUID 格式，留空自动生成)
${AGENT_LINE}

# 每个 Agent 最大好友数
AICQ_MAX_FRIENDS=${MAX_FRIENDS}

# 是否自动接受好友请求 (true/false)
AICQ_AUTO_ACCEPT=${AUTO_ACCEPT_VAL}

# ─── 以下为高级配置，通常不需要修改 ─────────────────────────────

# WebSocket 重连间隔 (毫秒)
# AICQ_RECONNECT_INTERVAL=5000

# WebSocket 最大重连次数
# AICQ_MAX_RECONNECT_ATTEMPTS=10

# 日志级别 (debug/info/warn/error)
# AICQ_LOG_LEVEL=info
ENVEOF

log_ok "配置文件已生成: ${INSTALL_DIR}/.env"

# ─── 步骤 8: 安装验证 ────────────────────────────────────────────────────
next_step "安装验证"

ERRORS=0

# 检查关键文件
for file in "dist/index.js" "package.json" "openclaw.plugin.json" ".env" "node_modules/@aicq/crypto/package.json"; do
  if [ -f "${INSTALL_DIR}/${file}" ]; then
    log_ok "  [文件] ${file}"
  else
    log_error " [文件] ${file} (缺失!)"
    ERRORS=$((ERRORS + 1))
  fi
done

# 尝试加载模块
log_info "  验证模块可加载性..."
cd "${INSTALL_DIR}"
if node -e "require('./dist/index.js')" 2>/dev/null; then
  log_ok "  模块加载成功"
elif timeout 3 node -e "
    try {
      const path = require('path');
      const manifest = require('./openclaw.plugin.json');
      console.log('Plugin: ' + manifest.name + ' v' + manifest.version);
      console.log('Channels: ' + manifest.channels.map(c => c.name).join(', '));
      console.log('Tools: ' + manifest.tools.map(t => t.name).join(', '));
      console.log('Hooks: ' + manifest.hooks.map(h => h.event).join(', '));
      console.log('Services: ' + manifest.services.map(s => s.name).join(', '));
    } catch(e) {
      console.error('Error: ' + e.message);
      process.exit(1);
    }
" 2>/dev/null; then
  log_ok "  插件清单验证通过"
else
  log_warn "  模块完整验证跳过 (需要 OpenClaw Runtime 环境)"
fi

# ─── 清理临时目录 ────────────────────────────────────────────────────────
if [ -n "${TEMP_DIR:-}" ] && [ -d "$TEMP_DIR" ]; then
  rm -rf "$TEMP_DIR"
  log_info "临时目录已清理"
fi

# ─── 安装完成报告 ────────────────────────────────────────────────────────
echo ""
log_line
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}          AICQ Plugin 安装成功!${NC}"
else
  echo -e "${YELLOW}${BOLD}          AICQ Plugin 安装完成 (有 ${ERRORS} 个警告)${NC}"
fi
log_line
echo ""
echo -e "  ${BOLD}安装信息:${NC}"
echo -e "    安装路径:    ${INSTALL_DIR}"
echo -e "    配置文件:    ${INSTALL_DIR}/.env"
echo -e "    服务器:      ${SERVER_URL}"
echo -e "    Agent ID:    ${AGENT_ID:-<启动时自动生成>}"
echo ""
echo -e "  ${BOLD}插件能力:${NC}"
echo -e "    Channel:     encrypted-chat (加密 P2P 聊天频道)"
echo -e "    Tools:       chat-friend (好友管理)"
echo -e "                 chat-send (发送加密消息)"
echo -e "                 chat-export-key (导出私钥 QR 码)"
echo -e "    Hooks:       message_sending (消息加密拦截)"
echo -e "                 before_tool_call (工具权限检查)"
echo -e "    Service:     identity-service (身份密钥管理)"
echo ""
echo -e "  ${BOLD}注册到 OpenClaw:${NC}"
echo -e "    1. 将 ${INSTALL_DIR} 目录复制到 OpenClaw plugins 目录:"
echo -e "       cp -r ${INSTALL_DIR} /path/to/openclaw/plugins/aicq-chat"
echo ""
echo -e "    2. 或在 OpenClaw 配置文件中添加插件路径:"
echo -e "       plugins:"
echo -e "         - ${INSTALL_DIR}"
echo ""
echo -e "    3. 重启 OpenClaw Agent:"
echo -e "       openclaw restart"
echo ""
echo -e "  ${BOLD}更新插件:${NC}"
echo -e "    cd $(dirname "$0") && ./deploy.sh --install-dir=${INSTALL_DIR} --server-url=${SERVER_URL}"
echo ""
echo -e "  ${BOLD}开发调试:${NC}"
echo -e "    直接运行: cd ${INSTALL_DIR} && node dist/index.js"
echo -e "    调试模式: AICQ_LOG_LEVEL=debug node dist/index.js"
echo ""
log_line
echo ""
