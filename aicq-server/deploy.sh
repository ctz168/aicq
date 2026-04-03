#!/usr/bin/env bash
# ============================================================================
#  AICQ Server 独立一键部署脚本
#  版本: 2.0
#  用途: 在全新 Ubuntu/Debian 服务器上自动部署 AICQ 中继服务器
#  特性:
#    - 自动安装 Node.js 20.x + PM2 + Nginx
#    - 自动编译 TypeScript 源码
#    - 自动生成 .env 配置文件
#    - 自动配置 Nginx 反向代理 + WebSocket + SSL
#    - 支持 Let's Encrypt 自动申请证书
#    - 支持自定义端口、域名、好友上限等参数
#    - 支持从已有源码目录部署（无需重新克隆）
#    - 内置健康检查和部署验证
#
#  用法:
#    chmod +x deploy.sh
#    sudo ./deploy.sh [选项]
#
#  选项:
#    --domain=DOMAIN          服务器域名 (默认: aicq.online)
#    --port=PORT              监听端口 (默认: 3000)
#    --max-friends=N          每用户最大好友数 (默认: 200)
#    --temp-ttl=N             临时号码有效期/小时 (默认: 24)
#    --source-dir=DIR         源码目录 (默认: 从 GitHub 克隆)
#    --skip-nginx             跳过 Nginx 配置
#    --skip-ssl               跳过 SSL 证书配置
#    --ssl-email=EMAIL        Let's Encrypt 证书邮箱
#    --jwt-secret=SECRET      JWT 签名密钥 (默认: 自动生成)
#    --no-color               禁用彩色输出
#    --help                   显示帮助信息
#
#  示例:
#    sudo ./deploy.sh --domain=chat.example.com --ssl-email=admin@example.com
#    sudo ./deploy.sh --source-dir=/home/user/aicq --skip-nginx
#    sudo ./deploy.sh --port=8080 --max-friends=500
#
#  最简用法:
#    sudo ./deploy.sh
# ============================================================================
set -euo pipefail

# ─── 默认配置 ─────────────────────────────────────────────────────────────
DOMAIN="aicq.online"
PORT=3000
MAX_FRIENDS=200
TEMP_TTL_HOURS=24
QR_VALIDITY_SECONDS=60
APP_DIR="/opt/aicq"
SOURCE_DIR=""
SKIP_NGINX=false
SKIP_SSL=false
SSL_EMAIL=""
JWT_SECRET=""
NODE_VERSION="20"
USE_COLOR=true

# ─── 解析命令行参数 ───────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --domain=*)     DOMAIN="${arg#*=}" ;;
    --port=*)       PORT="${arg#*=}" ;;
    --max-friends=*)MAX_FRIENDS="${arg#*=}" ;;
    --temp-ttl=*)   TEMP_TTL_HOURS="${arg#*=}" ;;
    --source-dir=*) SOURCE_DIR="${arg#*=}" ;;
    --skip-nginx)   SKIP_NGINX=true ;;
    --skip-ssl)     SKIP_SSL=true ;;
    --ssl-email=*)  SSL_EMAIL="${arg#*=}" ;;
    --jwt-secret=*) JWT_SECRET="${arg#*=}" ;;
    --no-color)     USE_COLOR=false ;;
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
echo -e "${BOLD}${CYAN}          AICQ Server 独立一键部署脚本 v2.0${NC}"
log_line
echo -e "  域名:        ${GREEN}${DOMAIN}${NC}"
echo -e "  端口:        ${PORT}"
echo -e "  最大好友:    ${MAX_FRIENDS}"
echo -e "  临时码 TTL:  ${TEMP_TTL_HOURS} 小时"
echo -e "  安装目录:    ${APP_DIR}"
if [ -n "$SOURCE_DIR" ]; then
  echo -e "  源码目录:    ${SOURCE_DIR}"
else
  echo -e "  源码来源:    GitHub (ctz168/aicq)"
fi
log_line
echo ""

# ─── 辅助函数 ─────────────────────────────────────────────────────────────
check_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log_error "此脚本需要 root 权限运行"
    echo "  请使用: sudo ./deploy.sh"
    exit 1
  fi
}

check_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    log_ok "操作系统: ${PRETTY_NAME}"
  else
    log_warn "无法检测操作系统版本，继续执行..."
  fi
}

generate_jwt_secret() {
  if [ -n "$JWT_SECRET" ]; then
    echo "$JWT_SECRET"
  else
    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  fi
}

wait_for_service() {
  local url="$1" max_wait="${2:-30}" label="${3:-服务}"
  local count=0
  while [ $count -lt $max_wait ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
    count=$((count + 1))
  done
  log_warn "${label} 在 ${max_wait} 秒内未就绪"
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════
#  主部署流程
# ═══════════════════════════════════════════════════════════════════════════

check_root
check_os

TOTAL_STEPS=11
CURRENT_STEP=0

next_step() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  log_step "步骤 ${CURRENT_STEP}/${TOTAL_STEPS}: $1"
}

# ─── 步骤 1: 安装系统依赖 ─────────────────────────────────────────────────
next_step "安装系统依赖"
apt-get update -qq
apt-get install -y -qq curl wget git unzip software-properties-common lsb-release > /dev/null 2>&1
log_ok "系统基础依赖安装完成"

# ─── 步骤 2: 安装 Node.js ─────────────────────────────────────────────────
next_step "安装 Node.js ${NODE_VERSION}.x"
if command -v node &>/dev/null; then
  CURRENT_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$CURRENT_VER" -ge "$NODE_VERSION" ]; then
    log_ok "Node.js $(node -v) 已安装，满足要求 (>= v${NODE_VERSION})"
  else
    log_warn "Node.js $(node -v) 版本过低，升级到 ${NODE_VERSION}.x..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    log_ok "Node.js $(node -v) 升级完成"
  fi
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log_ok "Node.js $(node -v) 安装完成"
fi
log_info "  npm: $(npm -v)"

# ─── 步骤 3: 安装 PM2 ────────────────────────────────────────────────────
next_step "安装 PM2 进程管理器"
if command -v pm2 &>/dev/null; then
  log_ok "PM2 $(pm2 -v | head -1) 已安装"
else
  npm install -g pm2 > /dev/null 2>&1
  pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
  log_ok "PM2 安装完成并配置开机自启"
fi

# ─── 步骤 4: 获取/更新源码 ───────────────────────────────────────────────
next_step "获取 AICQ 源码"
if [ -n "$SOURCE_DIR" ] && [ -d "$SOURCE_DIR/aicq-server" ]; then
  log_info "使用本地源码目录: ${SOURCE_DIR}"
  if [ -d "$SOURCE_DIR/.git" ]; then
    cd "$SOURCE_DIR" && git pull --ff-only 2>/dev/null || log_warn "git pull 失败，使用现有代码"
  fi
  # 创建符号链接
  if [ "$SOURCE_DIR" != "$APP_DIR" ]; then
    ln -sfn "$SOURCE_DIR" "$APP_DIR" 2>/dev/null || cp -r "$SOURCE_DIR" "$APP_DIR"
  fi
  APP_DIR="$(readlink -f "$APP_DIR" 2>/dev/null || echo "$APP_DIR")"
elif [ -d "${APP_DIR}/aicq-server" ]; then
  log_info "检测到已有安装，执行更新..."
  cd "$APP_DIR" && git pull --ff-only 2>/dev/null || log_warn "git pull 失败，使用现有代码"
else
  log_info "从 GitHub 克隆源码..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone https://github.com/ctz168/aicq.git "$APP_DIR" 2>/dev/null
  log_ok "源码克隆完成: ${APP_DIR}"
fi
log_ok "源码目录: ${APP_DIR}"

# ─── 步骤 5: 安装 npm 依赖 ──────────────────────────────────────────────
next_step "安装 npm 依赖"
cd "${APP_DIR}/aicq-crypto"
log_info "  安装 aicq-crypto..."
npm install --production 2>&1 | tail -1

cd "${APP_DIR}/aicq-server"
log_info "  安装 aicq-server..."
npm install --production 2>&1 | tail -1
log_ok "所有 npm 依赖安装完成"

# ─── 步骤 6: 编译 TypeScript ─────────────────────────────────────────────
next_step "编译 TypeScript 源码"
cd "${APP_DIR}/aicq-crypto"
if npm run build 2>&1; then
  log_ok "aicq-crypto 编译成功"
else
  log_error "aicq-crypto 编译失败"
  exit 1
fi

cd "${APP_DIR}/aicq-server"
if npm run build 2>&1; then
  log_ok "aicq-server 编译成功"
else
  log_error "aicq-server 编译失败"
  exit 1
fi

# ─── 步骤 7: 生成配置文件 ────────────────────────────────────────────────
next_step "生成 .env 配置文件"
ACTUAL_JWT_SECRET=$(generate_jwt_secret)

cat > "${APP_DIR}/aicq-server/.env" << ENVEOF
# ══════════════════════════════════════════════════════════════════
# AICQ Server 配置文件
# 自动生成时间: $(date '+%Y-%m-%d %H:%M:%S')
# 部署脚本版本: v2.0
# ══════════════════════════════════════════════════════════════════

# 服务端口
PORT=${PORT}

# 服务器域名 (用于生成外部 URL)
DOMAIN=${DOMAIN}

# 每用户最大好友数
MAX_FRIENDS=${MAX_FRIENDS}

# 临时号码有效期 (小时)
TEMP_NUMBER_TTL_HOURS=${TEMP_TTL_HOURS}

# QR 码私钥导出有效期 (秒)
QR_CODE_VALIDITY_SECONDS=${QR_VALIDITY_SECONDS}

# 运行环境
NODE_ENV=production

# JWT 签名密钥 (自动生成，请勿泄露)
JWT_SECRET=${ACTUAL_JWT_SECRET}

# ─── 以下为可选配置 ──────────────────────────────────────────────

# 短信验证码提供商 (console / alibaba / tencent)
# SMS_PROVIDER=console
# SMS_ACCESS_KEY=
# SMS_ACCESS_SECRET=
# SMS_SIGN_NAME=AICQ

# 邮件 SMTP 配置 (用于邮箱验证码)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=noreply@example.com
# SMTP_PASS=your-password
# SMTP_FROM=noreply@example.com
ENVEOF

log_ok "配置文件已生成: ${APP_DIR}/aicq-server/.env"
log_warn "  JWT_SECRET: ${ACTUAL_JWT_SECRET:0:16}... (请妥善保管)"

# ─── 步骤 8: 启动服务 ───────────────────────────────────────────────────
next_step "启动 AICQ Server (PM2)"
cd "${APP_DIR}/aicq-server"

# 停止旧进程
pm2 delete aicq-server 2>/dev/null || true

# 启动新进程
pm2 start dist/index.js \
  --name "aicq-server" \
  --env production \
  --max-memory-restart 512M \
  --log-date-format="YYYY-MM-DD HH:mm:ss" \
  --merge-logs

# 保存 PM2 配置
pm2 save
log_ok "AICQ Server 已启动 (PID: $(pm2 pid aicq-server 2>/dev/null || echo 'N/A'))"

# 等待服务就绪
log_info "  等待服务启动..."
if wait_for_service "http://127.0.0.1:${PORT}/health" 15 "AICQ Server"; then
  HEALTH=$(curl -s "http://127.0.0.1:${PORT}/health" 2>/dev/null || echo '{"status":"unknown"}')
  log_ok "健康检查通过: ${HEALTH}"
else
  log_error "服务启动失败！请检查日志:"
  echo "  pm2 logs aicq-server --lines 50"
  exit 1
fi

# ─── 步骤 9: 配置 Nginx ────────────────────────────────────────────────
if $SKIP_NGINX; then
  next_step "跳过 Nginx 配置 (--skip-nginx)"
else
  next_step "配置 Nginx 反向代理"
  if ! command -v nginx &>/dev/null; then
    log_info "安装 Nginx..."
    apt-get install -y -qq nginx > /dev/null 2>&1
  fi

  mkdir -p /etc/nginx/ssl

  # 生成 Nginx 配置文件
  cat > "/etc/nginx/sites-available/${DOMAIN}" << NGINXEOF
# ══════════════════════════════════════════════════════════════════
# AICQ Server Nginx 配置
# 域名: ${DOMAIN}
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')
# ══════════════════════════════════════════════════════════════════

upstream aicq_backend {
    server 127.0.0.1:${PORT};
    keepalive 64;
}

# ─── HTTP → HTTPS 重定向 ────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# ─── HTTPS 主配置 ───────────────────────────────────────────────
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    # ── SSL 证书 ──
    ssl_certificate     /etc/nginx/ssl/${DOMAIN}.crt;
    ssl_certificate_key /etc/nginx/ssl/${DOMAIN}.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;

    # ── 安全头 ──
    add_header X-Frame-Options           DENY always;
    add_header X-Content-Type-Options    nosniff always;
    add_header X-XSS-Protection          "1; mode=block" always;
    add_header Referrer-Policy           strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # ── Gzip 压缩 ──
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        application/json
        application/javascript
        application/xml
        application/xml+rss
        image/svg+xml;

    # ── 静态文件 (Web UI，如果已构建) ──
    root ${APP_DIR}/aicq-web/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # ── API 反向代理 ──
    location /api/ {
        proxy_pass http://aicq_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection        '';
        proxy_buffering off;
        proxy_cache off;
        proxy_request_buffering off;
        proxy_connect_timeout 60s;
        proxy_read_timeout    300s;
        proxy_send_timeout    300s;
    }

    # ── 健康检查 ──
    location /health {
        proxy_pass http://aicq_backend;
        proxy_http_version 1.1;
        access_log off;
    }

    # ── WebSocket 代理 ──
    location /ws {
        proxy_pass http://aicq_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       \$host;
        proxy_set_header X-Real-IP  \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout    86400s;
        proxy_send_timeout    86400s;
        proxy_buffering       off;
    }

    # ── 静态资源长缓存 ──
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)\$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # ── 禁止访问隐藏文件 ──
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINXEOF

  # 启用站点配置
  ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
  rm -f /etc/nginx/sites-enabled/default

  # 生成自签名证书（如果没有且跳过 SSL）
  if $SKIP_SSL; then
    log_info "跳过 SSL 证书配置 (--skip-ssl)"
    # 修改配置去掉 SSL，使用纯 HTTP
    cat > "/etc/nginx/sites-available/${DOMAIN}" << NGINXEOF
upstream aicq_backend {
    server 127.0.0.1:${PORT};
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    add_header X-Frame-Options           DENY always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    location /api/ {
        proxy_pass http://aicq_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Connection '';
        proxy_buffering off;
    }

    location /health {
        proxy_pass http://aicq_backend;
        proxy_http_version 1.1;
        access_log off;
    }

    location /ws {
        proxy_pass http://aicq_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGINXEOF
  elif [ ! -f "/etc/nginx/ssl/${DOMAIN}.crt" ]; then
    if [ -n "$SSL_EMAIL" ]; then
      # 安装 certbot 并申请 Let's Encrypt 证书
      log_info "安装 Let's Encrypt 证书..."
      apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
      certbot --nginx -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive --redirect 2>/dev/null || true
      if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        # 更新 Nginx 配置使用 Let's Encrypt 证书
        sed -i "s|/etc/nginx/ssl/${DOMAIN}.crt|/etc/letsencrypt/live/${DOMAIN}/fullchain.pem|g" "/etc/nginx/sites-available/${DOMAIN}"
        sed -i "s|/etc/nginx/ssl/${DOMAIN}.key|/etc/letsencrypt/live/${DOMAIN}/privkey.pem|g" "/etc/nginx/sites-available/${DOMAIN}"
        log_ok "Let's Encrypt SSL 证书申请成功"
        # 配置自动续期
        systemctl enable certbot.timer 2>/dev/null || true
        echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" | crontab - 2>/dev/null || true
      else
        log_warn "Let's Encrypt 申请失败，使用自签名证书"
        generate_self_signed
      fi
    else
      generate_self_signed
    fi
  fi

  # 测试并重载 Nginx
  if nginx -t 2>/dev/null; then
    systemctl reload nginx && systemctl enable nginx
    log_ok "Nginx 配置完成并已重载"
  else
    log_error "Nginx 配置测试失败！请手动检查: nginx -t"
    exit 1
  fi
fi

generate_self_signed() {
  log_info "生成自签名 SSL 证书..."
  openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout "/etc/nginx/ssl/${DOMAIN}.key" \
    -out "/etc/nginx/ssl/${DOMAIN}.crt" \
    -subj "/CN=${DOMAIN}" 2>/dev/null
  log_warn "自签名证书已生成，浏览器会提示不安全，生产环境请使用 Let's Encrypt"
}

# ─── 步骤 10: 配置防火墙 ────────────────────────────────────────────────
next_step "配置防火墙规则"
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp    comment 'SSH'    2>/dev/null || true
  ufw allow 80/tcp    comment 'HTTP'   2>/dev/null || true
  ufw allow 443/tcp   comment 'HTTPS'  2>/dev/null || true
  ufw --force enable  2>/dev/null || true
  log_ok "UFW 防火墙已配置 (22, 80, 443)"
else
  log_warn "ufw 未安装，跳过防火墙配置。建议安装: apt-get install -y ufw"
fi

# ─── 步骤 11: 最终验证 ──────────────────────────────────────────────────
next_step "部署验证"

echo ""
log_info "运行部署检查..."

ERRORS=0

# 检查 Node.js 进程
if pm2 pid aicq-server &>/dev/null; then
  log_ok "  [1/5] PM2 进程运行中"
else
  log_error " [1/5] PM2 进程未运行"
  ERRORS=$((ERRORS + 1))
fi

# 检查本地健康端点
if curl -sf "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; then
  log_ok "  [2/5] 本地健康检查通过"
else
  log_error " [2/5] 本地健康检查失败"
  ERRORS=$((ERRORS + 1))
fi

# 检查 Nginx (如果已配置)
if $SKIP_NGINX; then
  log_ok "  [3/5] Nginx (跳过)"
else
  if systemctl is-active nginx &>/dev/null; then
    log_ok "  [3/5] Nginx 运行中"
  else
    log_error " [3/5] Nginx 未运行"
    ERRORS=$((ERRORS + 1))
  fi
fi

# 检查配置文件
if [ -f "${APP_DIR}/aicq-server/.env" ]; then
  log_ok "  [4/5] 配置文件存在"
else
  log_error " [4/5] 配置文件缺失"
  ERRORS=$((ERRORS + 1))
fi

# 检查端口监听
if ss -tlnp 2>/dev/null | grep -q ":${PORT}\|:80\|:443"; then
  log_ok "  [5/5] 端口监听正常"
else
  log_warn " [5/5] 端口监听检查异常"
fi

# ─── 部署完成报告 ────────────────────────────────────────────────────────
echo ""
log_line
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}          AICQ Server 部署成功!${NC}"
else
  echo -e "${YELLOW}${BOLD}          AICQ Server 部署完成 (有 ${ERRORS} 个警告)${NC}"
fi
log_line
echo ""
echo -e "  ${BOLD}访问地址:${NC}"
echo -e "    Web UI:      ${CYAN}https://${DOMAIN}${NC}"
echo -e "    API:         ${CYAN}https://${DOMAIN}/api/v1/${NC}"
echo -e "    WebSocket:   ${CYAN}wss://${DOMAIN}/ws${NC}"
echo -e "    健康检查:    ${CYAN}https://${DOMAIN}/health${NC}"
echo ""
echo -e "  ${BOLD}服务器管理:${NC}"
echo -e "    配置文件:    ${APP_DIR}/aicq-server/.env"
echo -e "    应用目录:    ${APP_DIR}"
echo -e "    查看日志:    pm2 logs aicq-server"
echo -e "    进程监控:    pm2 monit"
echo -e "    重启服务:    pm2 restart aicq-server"
echo -e "    停止服务:    pm2 stop aicq-server"
echo ""
if ! $SKIP_SSL && [ -z "$SSL_EMAIL" ]; then
  echo -e "  ${YELLOW}${BOLD}后续建议:${NC}"
  echo -e "    1. 申请 Let's Encrypt 真实 SSL 证书:"
  echo -e "       sudo apt install certbot python3-certbot-nginx"
  echo -e "       sudo certbot --nginx -d ${DOMAIN} --email your@email.com"
  echo ""
fi
echo -e "  ${BOLD}快速命令:${NC}"
echo -e "    查看状态:    pm2 status"
echo -e "    查看日志:    pm2 logs aicq-server --lines 100"
echo -e "    更新部署:    cd ${APP_DIR} && git pull && cd aicq-crypto && npm run build && cd ../aicq-server && npm run build && pm2 restart aicq-server"
echo ""
log_line
echo ""
