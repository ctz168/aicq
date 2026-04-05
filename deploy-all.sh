#!/usr/bin/env bash
# ============================================================================
#  AICQ 全栈一键部署脚本
#  版本: 3.0
#  用途: 在全新服务器上同时部署 Server + ClickHouse + Admin + Web Client + Plugin
#  用法: chmod +x deploy-all.sh && sudo ./deploy-all.sh [选项]
#  示例: sudo ./deploy-all.sh --domain=chat.example.com
# ============================================================================
set -euo pipefail

# ─── 默认配置 ─────────────────────────────────────────────────────────────
DOMAIN="aicq.online"
PORT=61018
MAX_FRIENDS=200
TEMP_TTL_HOURS=24
SKIP_NGINX=false
SKIP_SSL=false
SSL_EMAIL=""
JWT_SECRET=""
CH_URL="http://localhost:8123"
CH_USER="default"
CH_PASSWORD=""
CH_DATABASE="aicq"

# ─── 解析命令行参数 ───────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --domain=*)       DOMAIN="${arg#*=}" ;;
    --port=*)         PORT="${arg#*=}" ;;
    --max-friends=*)  MAX_FRIENDS="${arg#*=}" ;;
    --temp-ttl=*)     TEMP_TTL_HOURS="${arg#*=}" ;;
    --skip-nginx)     SKIP_NGINX=true ;;
    --skip-ssl)       SKIP_SSL=true ;;
    --ssl-email=*)    SSL_EMAIL="${arg#*=}" ;;
    --jwt-secret=*)   JWT_SECRET="${arg#*=}" ;;
    --ch-url=*)       CH_URL="${arg#*=}" ;;
    --ch-user=*)      CH_USER="${arg#*=}" ;;
    --ch-password=*)  CH_PASSWORD="${arg#*=}" ;;
    --ch-database=*)  CH_DATABASE="${arg#*=}" ;;
    --help|-h)
      echo "用法: sudo ./deploy-all.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --domain=DOMAIN       服务器域名 (默认: aicq.online)"
      echo "  --port=PORT           服务端口 (默认: 61018)"
      echo "  --max-friends=N       最大好友数 (默认: 200)"
      echo "  --ch-password=PASS    ClickHouse 密码 (默认: 自动生成)"
      echo "  --ssl-email=EMAIL     Let's Encrypt 邮箱"
      echo "  --skip-nginx          跳过 Nginx 配置"
      echo "  --skip-ssl            跳过 SSL"
      exit 0
      ;;
    *)
      echo "未知参数: $arg (使用 --help 查看帮助)"
      exit 1
      ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        AICQ 全栈一键部署 v3.0 (${DOMAIN})${NC}"
echo -e "${BLUE}║        含 ClickHouse 持久化数据库${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 构建 server deploy 参数
SERVER_ARGS="--domain=${DOMAIN} --port=${PORT} --max-friends=${MAX_FRIENDS} --temp-ttl=${TEMP_TTL_HOURS}"
if $SKIP_NGINX; then SERVER_ARGS="${SERVER_ARGS} --skip-nginx"; fi
if $SKIP_SSL;   then SERVER_ARGS="${SERVER_ARGS} --skip-ssl"; fi
if [ -n "$SSL_EMAIL" ];    then SERVER_ARGS="${SERVER_ARGS} --ssl-email=${SSL_EMAIL}"; fi
if [ -n "$JWT_SECRET" ];   then SERVER_ARGS="${SERVER_ARGS} --jwt-secret=${JWT_SECRET}"; fi
if [ -n "$CH_URL" ];       then SERVER_ARGS="${SERVER_ARGS} --ch-url=${CH_URL}"; fi
if [ -n "$CH_USER" ];      then SERVER_ARGS="${SERVER_ARGS} --ch-user=${CH_USER}"; fi
if [ -n "$CH_PASSWORD" ];  then SERVER_ARGS="${SERVER_ARGS} --ch-password=${CH_PASSWORD}"; fi
if [ -n "$CH_DATABASE" ];  then SERVER_ARGS="${SERVER_ARGS} --ch-database=${CH_DATABASE}"; fi

echo -e "${GREEN}[1/3]${NC} 部署 AICQ Server + ClickHouse..."
bash "${SCRIPT_DIR}/server/deploy.sh" ${SERVER_ARGS}

echo ""
echo -e "${GREEN}[2/3]${NC} 部署 AICQ Web Client..."
bash "${SCRIPT_DIR}/client/web/deploy.sh" "--domain=${DOMAIN}" "--deploy-dir=/var/www/aicq"

echo ""
echo -e "${GREEN}[3/3]${NC} 安装 AICQ Plugin (本地)..."
bash "${SCRIPT_DIR}/plugin/deploy.sh" "--install-dir=/opt/aicq-plugin" "--server-url=https://${DOMAIN}"

echo ""
echo -e "${GREEN}全部部署完成!${NC}"
echo -e "  Admin 管理后台: https://${DOMAIN}/"
echo -e "  API 接口:       https://${DOMAIN}/api/v1/"
echo -e "  WebSocket:      wss://${DOMAIN}/ws"
echo -e "  ClickHouse:     ${CH_URL} (数据库: ${CH_DATABASE})"
