#!/usr/bin/env bash
# ============================================================================
#  AICQ Web Client 独立一键构建部署脚本
#  版本: 2.0
#  用途: 构建 React 前端并部署到 Web 服务器
#  特性:
#    - 自动安装 Node.js (如未安装)
#    - 编译 aicq-crypto 加密库
#    - TypeScript 类型检查
#    - Vite 生产构建 (代码压缩、Tree-shaking)
#    - 自动部署到目标目录
#    - 自动配置 Nginx (可选)
#    - 支持 SSL 证书 (Let's Encrypt / 自签名)
#    - 支持自定义 API 服务器地址
#    - 支持多环境构建 (production / staging / development)
#    - 构建后自动验证
#
#  用法:
#    chmod +x deploy.sh
#    ./deploy.sh [选项]
#
#  选项:
#    --domain=DOMAIN          域名 (默认: aicq.online)
#    --deploy-dir=DIR         部署目录 (默认: /var/www/aicq)
#    --api-url=URL            后端 API 地址 (默认: https://aicq.online)
#    --skip-nginx             跳过 Nginx 配置
#    --skip-ssl               跳过 SSL 证书
#    --ssl-email=EMAIL        Let's Encrypt 证书邮箱
#    --source-dir=DIR         源码目录 (默认: 从 GitHub 克隆)
#    --env=ENV                构建环境 (production/staging/development)
#    --analyze                启用构建分析 (bundle 大小报告)
#    --no-color               禁用彩色输出
#    --help                   显示帮助信息
#
#  示例:
#    sudo ./deploy.sh --domain=chat.example.com --ssl-email=admin@example.com
#    ./deploy.sh --source-dir=/home/user/aicq --skip-nginx
#    sudo ./deploy.sh --api-url=https://api.example.com --deploy-dir=/var/www/chat
#
#  最简用法:
#    sudo ./deploy.sh
# ============================================================================
set -euo pipefail

# ─── 默认配置 ─────────────────────────────────────────────────────────────
DOMAIN="aicq.online"
DEPLOY_DIR="/var/www/aicq"
API_URL=""
SOURCE_DIR=""
SKIP_NGINX=false
SKIP_SSL=false
SSL_EMAIL=""
BUILD_ENV="production"
ANALYZE=false
USE_COLOR=true
APP_DIR="/opt/aicq"
NODE_VERSION="20"
REPO_URL="https://github.com/ctz168/aicq.git"

# ─── 解析命令行参数 ───────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --domain=*)    DOMAIN="${arg#*=}" ;;
    --deploy-dir=*)DEPLOY_DIR="${arg#*=}" ;;
    --api-url=*)   API_URL="${arg#*=}" ;;
    --source-dir=*)SOURCE_DIR="${arg#*=}" ;;
    --skip-nginx)  SKIP_NGINX=true ;;
    --skip-ssl)    SKIP_SSL=true ;;
    --ssl-email=*) SSL_EMAIL="${arg#*=}" ;;
    --env=*)       BUILD_ENV="${arg#*=}" ;;
    --analyze)     ANALYZE=true ;;
    --no-color)    USE_COLOR=false ;;
    --help|-h)
      head -42 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "未知参数: $arg (使用 --help 查看帮助)"
      exit 1
      ;;
  esac
done

# 如果未指定 API URL，使用域名
if [ -z "$API_URL" ]; then
  API_URL="https://${DOMAIN}"
fi

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
echo -e "${BOLD}${CYAN}          AICQ Web Client 独立一键构建部署脚本 v2.0${NC}"
log_line
echo -e "  域名:        ${GREEN}${DOMAIN}${NC}"
echo -e "  部署目录:    ${DEPLOY_DIR}"
echo -e "  API 地址:    ${API_URL}"
echo -e "  构建环境:    ${BUILD_ENV}"
echo -e "  构建分析:    ${ANALYZE}"
if [ -n "$SOURCE_DIR" ]; then
  echo -e "  源码目录:    ${SOURCE_DIR}"
else
  echo -e "  源码来源:    GitHub (ctz168/aicq)"
fi
log_line
echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  主构建部署流程
# ═══════════════════════════════════════════════════════════════════════════

TOTAL_STEPS=10
CURRENT_STEP=0

next_step() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  log_step "步骤 ${CURRENT_STEP}/${TOTAL_STEPS}: $1"
}

# ─── 步骤 1: 检查环境 ────────────────────────────────────────────────────
next_step "检查运行环境"

if ! command -v node &>/dev/null; then
  if [ "$(id -u)" -eq 0 ]; then
    log_info "安装 Node.js ${NODE_VERSION}.x..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    log_ok "Node.js $(node -v) 安装完成"
  else
    log_error "未找到 Node.js，请先安装 Node.js >= 18"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo "  或: nvm install 20"
    exit 1
  fi
else
  NODE_VER=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    log_error "Node.js 版本过低: ${NODE_VER}，要求 >= v18"
    exit 1
  fi
  log_ok "Node.js ${NODE_VER}"
fi

log_ok "npm $(npm -v)"

if ! command -v git &>/dev/null; then
  log_error "未找到 git"
  exit 1
fi
log_ok "git $(git --version | cut -d' ' -f3)"

# ─── 步骤 2: 获取源码 ────────────────────────────────────────────────────
next_step "获取 AICQ 源码"

if [ -n "$SOURCE_DIR" ] && [ -d "$SOURCE_DIR/aicq-web" ]; then
  REPO_ROOT="$(cd "$SOURCE_DIR" && pwd)"
  log_info "使用本地源码目录: ${REPO_ROOT}"
  if [ -d "${REPO_ROOT}/.git" ]; then
    cd "$REPO_ROOT" && git pull --ff-only 2>/dev/null || log_warn "git pull 失败，使用现有代码"
  fi
  APP_DIR="$REPO_ROOT"
else
  if [ -d "${APP_DIR}/aicq-web" ]; then
    log_info "检测到已有安装，执行更新..."
    cd "$APP_DIR" && git pull --ff-only 2>/dev/null || log_warn "git pull 失败，使用现有代码"
  else
    log_info "从 GitHub 克隆源码..."
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --depth 1 "$REPO_URL" "$APP_DIR" 2>/dev/null
    log_ok "源码克隆完成: ${APP_DIR}"
  fi
  REPO_ROOT="$APP_DIR"
fi

if [ ! -d "${REPO_ROOT}/aicq-web" ]; then
  log_error "未找到 aicq-web 目录: ${REPO_ROOT}/aicq-web"
  exit 1
fi
if [ ! -d "${REPO_ROOT}/aicq-crypto" ]; then
  log_error "未找到 aicq-crypto 目录: ${REPO_ROOT}/aicq-crypto"
  exit 1
fi
log_ok "源码目录就绪: ${REPO_ROOT}"

# ─── 步骤 3: 准备加密库 ─────────────────────────────────────────────────
next_step "准备 aicq-crypto 加密库"
cd "${REPO_ROOT}/aicq-crypto"

if [ ! -d "node_modules" ] || [ ! -d "dist" ]; then
  log_info "  安装并编译 aicq-crypto..."
  npm install 2>&1 | tail -1
  npm run build 2>&1 | tail -1
  log_ok "aicq-crypto 准备完成"
else
  log_ok "aicq-crypto 已就绪"
fi

# ─── 步骤 4: 安装 Web 依赖 ──────────────────────────────────────────────
next_step "安装 aicq-web 前端依赖"
cd "${REPO_ROOT}/aicq-web"

if [ ! -d "node_modules" ]; then
  log_info "  首次安装依赖 (可能需要几分钟)..."
  npm install 2>&1 | tail -3
else
  log_info "  更新依赖..."
  npm install 2>&1 | tail -1
fi
log_ok "前端依赖安装完成"

# ─── 步骤 5: 配置 API 地址 ───────────────────────────────────────────────
next_step "配置构建参数"

# 创建环境文件
mkdir -p "${REPO_ROOT}/aicq-web"
cat > "${REPO_ROOT}/aicq-web/.env.${BUILD_ENV}" << ENVEOF
# AICQ Web Client 构建环境配置
# 自动生成时间: $(date '+%Y-%m-%d %H:%M:%S')

# API 服务器地址
VITE_API_URL=${API_URL}

# WebSocket 地址 (自动从 API URL 推导)
VITE_WS_URL=wss://${DOMAIN}/ws

# 应用标题
VITE_APP_TITLE=AICQ Encrypted Chat

# 构建环境
VITE_BUILD_ENV=${BUILD_ENV}
ENVEOF

log_ok "环境配置文件已生成: .env.${BUILD_ENV}"
log_info "  API 地址: ${API_URL}"
log_info "  WS 地址:  wss://${DOMAIN}/ws"

# ─── 步骤 6: TypeScript 类型检查 ────────────────────────────────────────
next_step "TypeScript 类型检查"
cd "${REPO_ROOT}/aicq-web"

if npx tsc --noEmit 2>&1; then
  log_ok "类型检查通过 (0 errors)"
else
  log_warn "存在 TypeScript 类型警告 (不影响构建，建议修复)"
fi

# ─── 步骤 7: Vite 生产构建 ──────────────────────────────────────────────
next_step "Vite 生产构建"
cd "${REPO_ROOT}/aicq-web"

# 清理旧构建
rm -rf dist

# 执行构建
BUILD_CMD="npx vite build --mode ${BUILD_ENV}"
if $ANALYZE; then
  log_info "  启用构建分析..."
  npm install -D rollup-plugin-visualizer 2>/dev/null || true
  BUILD_CMD="${BUILD_CMD} --analyze"
fi

log_info "  开始构建..."
if eval "$BUILD_CMD" 2>&1; then
  BUILD_RESULT="成功"
else
  BUILD_CMD="npx vite build"
  log_warn "指定模式构建失败，使用默认模式..."
  if eval "$BUILD_CMD" 2>&1; then
    BUILD_RESULT="成功 (默认模式)"
  else
    log_error "Vite 构建失败！"
    exit 1
  fi
fi

# 构建结果统计
if [ -d "dist" ]; then
  DIST_SIZE=$(du -sh dist | cut -f1)
  FILE_COUNT=$(find dist -type f | wc -l)
  HTML_SIZE=$(du -h dist/index.html 2>/dev/null | cut -f1 || echo "N/A")
  JS_SIZE=$(du -sh dist/assets/*.js 2>/dev/null | cut -f1 || echo "N/A")
  CSS_SIZE=$(du -sh dist/assets/*.css 2>/dev/null | cut -f1 || echo "N/A")

  log_ok "构建完成: ${BUILD_RESULT}"
  log_info "  总大小:    ${DIST_SIZE} (${FILE_COUNT} 个文件)"
  log_info "  HTML:      ${HTML_SIZE}"
  log_info "  JS:        ${JS_SIZE}"
  log_info "  CSS:       ${CSS_SIZE}"
  echo ""
  log_info "  构建产物:"
  ls -lh dist/ 2>/dev/null | tail -n +2 | head -10
  echo ""
else
  log_error "构建产物目录不存在"
  exit 1
fi

# ─── 步骤 8: 部署到目标目录 ──────────────────────────────────────────────
next_step "部署到 ${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}"

# 备份旧版本
if [ -d "${DEPLOY_DIR}" ] && [ "$(ls -A ${DEPLOY_DIR} 2>/dev/null)" ]; then
  BACKUP_DIR="${DEPLOY_DIR}.backup.$(date +%Y%m%d%H%M%S)"
  log_info "  备份旧版本到 ${BACKUP_DIR}..."
  cp -r "${DEPLOY_DIR}" "${BACKUP_DIR}" 2>/dev/null || true
  # 只保留最近 3 个备份
  ls -dt "${DEPLOY_DIR}.backup."* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
fi

# 清理并复制新版本
rm -rf "${DEPLOY_DIR:?}"/*
cp -r "${REPO_ROOT}/aicq-web/dist/"* "${DEPLOY_DIR}/"

# 设置权限
if [ "$(id -u)" -eq 0 ]; then
  chown -R www-data:www-data "${DEPLOY_DIR}" 2>/dev/null || true
  chmod -R 755 "${DEPLOY_DIR}"
fi

DEPLOY_SIZE=$(du -sh "${DEPLOY_DIR}" | cut -f1)
DEPLOY_FILES=$(find "${DEPLOY_DIR}" -type f | wc -l)
log_ok "部署完成: ${DEPLOY_SIZE} (${DEPLOY_FILES} 个文件)"

# ─── 步骤 9: 配置 Nginx (可选) ───────────────────────────────────────────
if $SKIP_NGINX; then
  next_step "跳过 Nginx 配置 (--skip-nginx)"
elif ! command -v nginx &>/dev/null; then
  next_step "Nginx 未安装，跳过配置"
  log_info "如需配置 Nginx，请先安装: sudo apt-get install -y nginx"
else
  next_step "配置 Nginx"

  # 检查是否已有配置
  if [ -f "/etc/nginx/sites-available/${DOMAIN}" ]; then
    log_ok "Nginx 配置已存在，跳过 (如需更新请手动编辑)"
    log_info "  配置文件: /etc/nginx/sites-available/${DOMAIN}"
    log_info "  确保静态文件 root 指向: ${DEPLOY_DIR}"

    # 更新 root 路径 (如果配置中有旧路径)
    if ! grep -q "root ${DEPLOY_DIR}" "/etc/nginx/sites-available/${DOMAIN}" 2>/dev/null; then
      log_warn "  建议更新 Nginx 配置中的 root 路径为: ${DEPLOY_DIR}"
    fi
  else
    log_info "  创建新的 Nginx 站点配置..."

    mkdir -p /etc/nginx/ssl

    cat > "/etc/nginx/sites-available/${DOMAIN}" << NGINXEOF
# ══════════════════════════════════════════════════════════════════
# AICQ Web Client Nginx 配置
# 域名: ${DOMAIN}
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')
# ══════════════════════════════════════════════════════════════════

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

    # ── 安全头 ──
    add_header X-Frame-Options           DENY always;
    add_header X-Content-Type-Options    nosniff always;
    add_header X-XSS-Protection          "1; mode=block" always;
    add_header Referrer-Policy           strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # ── 根目录 ──
    root ${DEPLOY_DIR};
    index index.html;

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

    # ── SPA 路由 ──
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # ── API 反向代理 (如果 Server 在同一台机器) ──
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection        '';
        proxy_buffering off;
        proxy_cache off;
    }

    # ── WebSocket 代理 ──
    location /ws {
        proxy_pass http://127.0.0.1:3000;
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

    # ── 静态资源长缓存 (Vite 生成的带 hash 文件名) ──
    location ~* /assets/.*\.(js|css|woff2?|ttf|eot|svg)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # ── 图片缓存 ──
    location ~* \.(png|jpg|jpeg|gif|ico|webp|avif)\$ {
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

    # 启用站点
    ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
    rm -f /etc/nginx/sites-enabled/default

    # SSL 证书
    if $SKIP_SSL; then
      log_info "跳过 SSL 证书配置 (--skip-ssl)"
    elif [ ! -f "/etc/nginx/ssl/${DOMAIN}.crt" ]; then
      if [ -n "$SSL_EMAIL" ]; then
        log_info "安装 Let's Encrypt 证书..."
        apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
        certbot --nginx -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive --redirect 2>/dev/null || true
        if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
          sed -i "s|/etc/nginx/ssl/${DOMAIN}.crt|/etc/letsencrypt/live/${DOMAIN}/fullchain.pem|g" "/etc/nginx/sites-available/${DOMAIN}"
          sed -i "s|/etc/nginx/ssl/${DOMAIN}.key|/etc/letsencrypt/live/${DOMAIN}/privkey.pem|g" "/etc/nginx/sites-available/${DOMAIN}"
          log_ok "Let's Encrypt SSL 证书安装成功"
          systemctl enable certbot.timer 2>/dev/null || true
          echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" | crontab - 2>/dev/null || true
        else
          # 生成自签名证书
          openssl req -x509 -nodes -days 365 \
            -newkey rsa:2048 \
            -keyout "/etc/nginx/ssl/${DOMAIN}.key" \
            -out "/etc/nginx/ssl/${DOMAIN}.crt" \
            -subj "/CN=${DOMAIN}" 2>/dev/null
          log_warn "Let's Encrypt 申请失败，使用自签名证书"
        fi
      else
        openssl req -x509 -nodes -days 365 \
          -newkey rsa:2048 \
          -keyout "/etc/nginx/ssl/${DOMAIN}.key" \
          -out "/etc/nginx/ssl/${DOMAIN}.crt" \
          -subj "/CN=${DOMAIN}" 2>/dev/null
        log_warn "已生成自签名证书 (浏览器会提示不安全)"
        log_info "生产环境建议: sudo certbot --nginx -d ${DOMAIN}"
      fi
    fi

    # 测试并重载 Nginx
    if nginx -t 2>/dev/null; then
      systemctl reload nginx && systemctl enable nginx
      log_ok "Nginx 配置完成"
    else
      log_error "Nginx 配置测试失败！请手动检查: nginx -t"
      exit 1
    fi
  fi
fi

# ─── 步骤 10: 部署验证 ──────────────────────────────────────────────────
next_step "部署验证"

ERRORS=0

# 检查部署目录
if [ -d "${DEPLOY_DIR}" ]; then
  log_ok "  [1/5] 部署目录存在"
else
  log_error " [1/5] 部署目录缺失"
  ERRORS=$((ERRORS + 1))
fi

# 检查 index.html
if [ -f "${DEPLOY_DIR}/index.html" ]; then
  log_ok "  [2/5] index.html 存在"
else
  log_error " [2/5] index.html 缺失"
  ERRORS=$((ERRORS + 1))
fi

# 检查 JS 资源
JS_COUNT=$(find "${DEPLOY_DIR}/assets" -name "*.js" 2>/dev/null | wc -l)
if [ "$JS_COUNT" -gt 0 ]; then
  log_ok "  [3/5] JS 资源文件 ${JS_COUNT} 个"
else
  log_warn " [3/5] 未找到 JS 资源文件"
fi

# 检查 CSS 资源
CSS_COUNT=$(find "${DEPLOY_DIR}/assets" -name "*.css" 2>/dev/null | wc -l)
if [ "$CSS_COUNT" -gt 0 ]; then
  log_ok "  [4/5] CSS 资源文件 ${CSS_COUNT} 个"
else
  log_warn " [4/5] 未找到 CSS 资源文件"
fi

# Nginx 检查
if $SKIP_NGINX; then
  log_ok "  [5/5] Nginx (跳过)"
elif systemctl is-active nginx &>/dev/null; then
  log_ok "  [5/5] Nginx 运行中"
else
  log_warn " [5/5] Nginx 未运行"
fi

# ─── 部署完成报告 ────────────────────────────────────────────────────────
echo ""
log_line
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}          AICQ Web Client 部署成功!${NC}"
else
  echo -e "${YELLOW}${BOLD}          AICQ Web Client 部署完成 (有 ${ERRORS} 个警告)${NC}"
fi
log_line
echo ""
echo -e "  ${BOLD}访问地址:${NC}"
echo -e "    Web UI:  ${CYAN}https://${DOMAIN}${NC}"
if ! $SKIP_NGINX; then
  echo -e "    HTTP:    http://${DOMAIN} (自动跳转 HTTPS)"
fi
echo ""
echo -e "  ${BOLD}部署信息:${NC}"
echo -e "    部署目录:    ${DEPLOY_DIR}"
echo -e "    部署大小:    ${DEPLOY_SIZE}"
echo -e "    构建环境:    ${BUILD_ENV}"
echo -e "    API 地址:    ${API_URL}"
echo ""
echo -e "  ${BOLD}功能清单:${NC}"
echo -e "    文本/Markdown 聊天 + Prism 代码高亮"
echo -e "    AI 流式输出 + 动画光标"
echo -e "    图片预览 + 灯箱全屏"
echo -e "    视频播放 + 自定义播放器"
echo -e "    文件传输 + 断点续传 + 速度/ETA"
echo -e "    拖拽上传"
echo -e "    6 位数临时号码发现"
echo -e "    QR 码密钥导入导出"
echo ""
echo -e "  ${BOLD}移动端打包 (可选):${NC}"
echo -e "    cd ${REPO_ROOT}/aicq-web"
echo -e "    npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios"
echo -e "    npx cap init AICQ online.aicq.app --web-dir dist"
echo -e "    npx cap add android && npx cap sync android && npx cap open android"
echo -e "    npx cap add ios && npx cap sync ios && npx cap open ios"
echo ""
echo -e "  ${BOLD}更新部署:${NC}"
echo -e "    cd ${REPO_ROOT} && git pull"
echo -e "    cd aicq-web && npm install && npm run build"
echo -e "    rm -rf ${DEPLOY_DIR}/* && cp -r dist/* ${DEPLOY_DIR}/"
echo ""
log_line
echo ""
