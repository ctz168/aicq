#!/usr/bin/env bash
# ============================================================================
#  AICQ Server 一键部署脚本
#  用途: 在全新 Ubuntu/Debian 服务器上自动部署 AICQ 中继服务器
#  用法: chmod +x deploy-server.sh && ./deploy-server.sh [域名]
#  示例: ./deploy-server.sh aicq.online
# ============================================================================
set -euo pipefail

# ─── 配置 ──────────────────────────────────────────────────────────────
DOMAIN="${1:-aicq.online}"
APP_DIR="/opt/aicq"
NODE_VERSION="20"
PORT=3000
MAX_FRIENDS=200
TEMP_TTL_HOURS=24

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
echo "║          AICQ Server 一键部署脚本                           ║"
echo "║          域名: ${DOMAIN}$(printf '%*s' $((36 - ${#DOMAIN})) '')║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── 0. 检查 root 权限 ────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  log_error "请使用 root 用户运行此脚本"
  echo "  sudo ./deploy-server.sh ${DOMAIN}"
  exit 1
fi

# ─── 1. 安装系统依赖 ──────────────────────────────────────────────────
log_info "步骤 1/10: 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq curl wget git nginx openssl software-properties-common > /dev/null 2>&1
log_ok "系统依赖安装完成"

# ─── 2. 安装 Node.js 20.x ──────────────────────────────────────────────
log_info "步骤 2/10: 安装 Node.js ${NODE_VERSION}.x..."
if command -v node &>/dev/null && node -v | grep -q "v${NODE_VERSION}"; then
  log_ok "Node.js $(node -v) 已安装"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log_ok "Node.js $(node -v) 安装完成"
fi

# ─── 3. 安装 PM2 ──────────────────────────────────────────────────────
log_info "步骤 3/10: 安装 PM2 进程管理器..."
if command -v pm2 &>/dev/null; then
  log_ok "PM2 已安装"
else
  npm install -g pm2 > /dev/null 2>&1
  log_ok "PM2 安装完成"
fi

# ─── 4. 获取源码 ──────────────────────────────────────────────────────
log_info "步骤 4/10: 获取 AICQ 源码..."
if [ -d "${APP_DIR}/server" ]; then
  log_warn "目录 ${APP_DIR} 已存在, 执行 git pull 更新..."
  cd "${APP_DIR}" && git pull --ff-only 2>/dev/null || true
else
  mkdir -p "${APP_DIR}"
  git clone https://github.com/ctz168/aicq.git "${APP_DIR}" 2>/dev/null
  log_ok "源码克隆到 ${APP_DIR}"
fi

# ─── 5. 安装依赖 ──────────────────────────────────────────────────────
log_info "步骤 5/10: 安装 npm 依赖..."
cd "${APP_DIR}/shared/crypto" && npm install --production 2>&1 | tail -1
cd "${APP_DIR}/server" && npm install --production 2>&1 | tail -1
log_ok "依赖安装完成"

# ─── 6. 编译 ──────────────────────────────────────────────────────────
log_info "步骤 6/10: 编译 TypeScript..."
cd "${APP_DIR}/shared/crypto" && npm run build 2>&1 | tail -1
cd "${APP_DIR}/server" && npm run build 2>&1 | tail -1
log_ok "编译完成"

# ─── 7. 创建配置文件 ──────────────────────────────────────────────────
log_info "步骤 7/10: 创建配置文件..."
cat > "${APP_DIR}/server/.env" << EOF
# AICQ Server 配置 - 自动生成于 $(date '+%Y-%m-%d %H:%M:%S')
PORT=${PORT}
DOMAIN=${DOMAIN}
MAX_FRIENDS=${MAX_FRIENDS}
TEMP_NUMBER_TTL_HOURS=${TEMP_TTL_HOURS}
QR_CODE_VALIDITY_SECONDS=60
NODE_ENV=production
EOF
log_ok "配置文件已生成: .env"

# ─── 8. 启动服务 ──────────────────────────────────────────────────────
log_info "步骤 8/10: 启动 AICQ Server..."
pm2 delete aicq-server 2>/dev/null || true
cd "${APP_DIR}/server"
pm2 start dist/index.js --name "aicq-server" --env production
pm2 save
log_ok "AICQ Server 已启动 (PID: $(pm2 pid aicq-server))"

# ─── 9. 配置 Nginx ────────────────────────────────────────────────────
log_info "步骤 9/10: 配置 Nginx..."
mkdir -p /etc/nginx/ssl

cat > "/etc/nginx/sites-available/${DOMAIN}" << 'NGINXEOF'
upstream aicq_api {
    server 127.0.0.1:__PORT__;
}

server {
    listen 80;
    server_name __DOMAIN__;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name __DOMAIN__;

    # SSL (先用自签名，后续用 certbot 替换)
    ssl_certificate /etc/nginx/ssl/__DOMAIN__.crt;
    ssl_certificate_key /etc/nginx/ssl/__DOMAIN__.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # 静态文件 (Web UI，如果已构建)
    location / {
        root __APP_DIR__/client/web/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
    }

    # API 代理
    location /api/ {
        proxy_pass http://aicq_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }

    # 健康检查
    location /health {
        proxy_pass http://aicq_api;
        proxy_http_version 1.1;
    }

    # WebSocket
    location /ws {
        proxy_pass http://aicq_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINXEOF

# 替换占位符
sed -i "s/__PORT__/${PORT}/g" "/etc/nginx/sites-available/${DOMAIN}"
sed -i "s/__DOMAIN__/${DOMAIN}/g" "/etc/nginx/sites-available/${DOMAIN}"
sed -i "s|__APP_DIR__|${APP_DIR}|g" "/etc/nginx/sites-available/${DOMAIN}"

# 启用站点
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default

# 生成自签名证书（如果没有）
if [ ! -f "/etc/nginx/ssl/${DOMAIN}.crt" ]; then
  openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout "/etc/nginx/ssl/${DOMAIN}.key" \
    -out "/etc/nginx/ssl/${DOMAIN}.crt" \
    -subj "/CN=${DOMAIN}" 2>/dev/null
  log_warn "已生成自签名证书，生产环境请使用 Let's Encrypt"
fi

# 测试并重载 Nginx
nginx -t 2>/dev/null && systemctl reload nginx && systemctl enable nginx
log_ok "Nginx 配置完成"

# ─── 10. 验证部署 ─────────────────────────────────────────────────────
log_info "步骤 10/10: 验证部署..."

sleep 2

# 本地检查
if curl -sf "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; then
  HEALTH=$(curl -s "http://127.0.0.1:${PORT}/health")
  log_ok "健康检查通过: ${HEALTH}"
else
  log_warn "健康检查失败，请检查日志: pm2 logs aicq-server"
fi

# ─── 完成 ──────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          AICQ Server 部署完成!                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  Web UI:     https://${DOMAIN}$(printf '%*s' $((25 - ${#DOMAIN})) '')║"
echo "║  API:        https://${DOMAIN}/api/v1/$(printf '%*s' $((17 - ${#DOMAIN}))')║"
echo "║  WebSocket:  wss://${DOMAIN}/ws$(printf '%*s' $((25 - ${#DOMAIN}))')║"
echo "║  健康检查:   https://${DOMAIN}/health$(printf '%*s' $((21 - ${#DOMAIN}))')║"
echo "║                                                          ║"
echo "║  配置文件:   ${APP_DIR}/server/.env$(printf '%*s' $((12 - ${#APP_DIR}))')║"
echo "║  日志:       pm2 logs aicq-server                            ║"
echo "║                                                          ║"
echo "║  [后续] 安装 Let's Encrypt 真实证书:                       ║"
echo "║  sudo apt install certbot python3-certbot-nginx            ║"
echo "║  sudo certbot --nginx -d ${DOMAIN}$(printf '%*s' $((23 - ${#DOMAIN}))')║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
