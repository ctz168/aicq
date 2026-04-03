#!/usr/bin/env bash
# ============================================================================
#  AICQ 全栈一键部署脚本
#  用途: 在全新服务器上同时部署 Server + Web Client
#  用法: chmod +x deploy-all.sh && sudo ./deploy-all.sh [域名]
#  示例: sudo ./deploy-all.sh aicq.online
# ============================================================================
set -euo pipefail

DOMAIN="${1:-aicq.online}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          AICQ 全栈一键部署 (${DOMAIN})${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${GREEN}[1/3]${NC} 部署 AICQ Server..."
bash "${SCRIPT_DIR}/deploy-server.sh" "${DOMAIN}"

echo ""
echo -e "${GREEN}[2/3]${NC} 部署 AICQ Web Client..."
bash "${SCRIPT_DIR}/deploy-web.sh" "${DOMAIN}" "/var/www/aicq"

echo ""
echo -e "${GREEN}[3/3]${NC} 安装 AICQ Plugin (本地)..."
bash "${SCRIPT_DIR}/deploy-plugin.sh" "/opt/aicq-plugin" "https://${DOMAIN}"

echo ""
echo -e "${GREEN}全部部署完成!${NC} 访问 https://${DOMAIN} 开始使用"
