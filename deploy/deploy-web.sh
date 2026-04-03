#!/usr/bin/env bash
# ============================================================================
#  AICQ Web Client 一键构建部署脚本
#  用途: 构建 React 前端并部署为 Nginx 静态站点
#  用法: chmod +x deploy-web.sh && ./deploy-web.sh [域名] [部署目录]
#  示例: ./deploy-web.sh aicq.online /var/www/aicq
# ============================================================================
set -euo pipefail

# ─── 配置 ──────────────────────────────────────────────────────────────
DOMAIN="${1:-aicq.online}"
DEPLOY_DIR="${2:-/var/www/aicq}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/.."

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
echo "║          AICQ Web Client 一键构建部署脚本                    ║"
echo "║          域名: ${DOMAIN}$(printf '%*s' $((37 - ${#DOMAIN}))')║"
echo "║          部署: ${DEPLOY_DIR}$(printf '%*s' $((37 - ${#DEPLOY_DIR}))')║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── 0. 检查 Node.js ────────────────────────────────────────────────────
log_info "步骤 0: 检查环境..."
if ! command -v node &>/dev/null; then
  log_error "未找到 Node.js，请先安装 Node.js >= 18"
  exit 1
fi
log_ok "Node.js $(node -v)"

if ! command -v nginx &>/dev/null; then
  log_warn "未找到 Nginx，将只执行构建步骤（跳过部署）"
  SKIP_NGINX=1
else
  SKIP_NGINX=0
fi

# ─── 1. 安装依赖 ──────────────────────────────────────────────────────
log_info "步骤 1/5: 安装依赖..."

cd "${REPO_ROOT}/aicq-crypto"
if [ ! -d "node_modules" ] || [ ! -d "dist" ]; then
  npm install 2>&1 | tail -1
  npm run build 2>&1 | tail -1
else
  log_ok "aicq-crypto 已就绪"
fi

cd "${REPO_ROOT}/aicq-web"
if [ ! -d "node_modules" ]; then
  npm install 2>&1 | tail -1
else
  log_ok "aicq-web 依赖已就绪"
fi

# ─── 2. 类型检查 ──────────────────────────────────────────────────────
log_info "步骤 2/5: TypeScript 类型检查..."
npx tsc --noEmit 2>&1 || log_warn "存在 TypeScript 类型警告（不影响构建）"
log_ok "类型检查完成"

# ─── 3. 构建生产版本 ──────────────────────────────────────────────────
log_info "步骤 3/5: 构建生产版本 (Vite build)..."
rm -rf dist
npx vite build "${REPO_ROOT}/aicq-web" 2>&1 | tail -10

if [ -d "${REPO_ROOT}/aicq-web/dist" ]; then
  DIST_SIZE=$(du -sh "${REPO_ROOT}/aicq-web/dist" | cut -f1)
  log_ok "构建完成 (大小: ${DIST_SIZE})"
  echo "  产物目录: ${REPO_ROOT}/aicq-web/dist/"
  ls -lh "${REPO_ROOT}/aicq-web/dist/" 2>/dev/null | tail -n +2
else
  log_error "构建失败，请检查上方错误信息"
  exit 1
fi

# ─── 4. 部署到目标目录 ────────────────────────────────────────────────
log_info "步骤 4/5: 部署到 ${DEPLOY_DIR}..."
mkdir -p "${DEPLOY_DIR}"

# 清理旧版本
rm -rf "${DEPLOY_DIR:?}/*"

# 复制构建产物
cp -r "${REPO_ROOT}/aicq-web/dist/"* "${DEPLOY_DIR}/"

# 设置权限
chown -R www-data:www-data "${DEPLOY_DIR}" 2>/dev/null || chmod -R 755 "${DEPLOY_DIR}"
log_ok "文件已部署到 ${DEPLOY_DIR}"

# ─── 5. 配置 Nginx ────────────────────────────────────────────────────
if [ "${SKIP_NGINX}" -eq 0 ]; then
  log_info "步骤 5/5: 配置 Nginx..."

  # 如果已有 aicq-server 的 Nginx 配置则跳过
  if [ -f "/etc/nginx/sites-available/${DOMAIN}" ]; then
    log_ok "Nginx 配置已存在 (/etc/nginx/sites-available/${DOMAIN})，跳过"
    log_info "如需更新静态文件路径，请手动编辑 Nginx 配置中 location / 的 root 指向:"
    echo "      root ${DEPLOY_DIR};"
  else
    # 创建独立的 Web 静态配置
    cat > "/etc/nginx/sites-available/${DOMAIN}-web" << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/nginx/ssl/${DOMAIN}.crt;
    ssl_certificate_key /etc/nginx/ssl/${DOMAIN}.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    root ${DEPLOY_DIR};
    index index.html;

    # SPA 路由支持
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # API 代理（如 Server 在同一台机器）
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # 静态资源长缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    gzip_min_length 256;
}
NGINXEOF

    ln -sf "/etc/nginx/sites-available/${DOMAIN}-web" "/etc/nginx/sites-enabled/${DOMAIN}-web"
    rm -f /etc/nginx/sites-enabled/default

    # 生成自签名证书（如果没有）
    mkdir -p /etc/nginx/ssl
    if [ ! -f "/etc/nginx/ssl/${DOMAIN}.crt" ]; then
      openssl req -x509 -nodes -days 365 \
        -newkey rsa:2048 \
        -keyout "/etc/nginx/ssl/${DOMAIN}.key" \
        -out "/etc/nginx/ssl/${DOMAIN}.crt" \
        -subj "/CN=${DOMAIN}" 2>/dev/null
      log_warn "已生成自签名证书"
    fi

    nginx -t 2>/dev/null && systemctl reload nginx
    log_ok "Nginx 配置完成"
  fi
else
  log_info "步骤 5/5: 跳过 Nginx 配置（未安装或无需配置）"
fi

# ─── 完成 ──────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          AICQ Web Client 部署完成!                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  访问地址:   https://${DOMAIN}$(printf '%*s' $((25 - ${#DOMAIN}))')║"
echo "║  部署目录:   ${DEPLOY_DIR}$(printf '%*s' $((37 - ${#DEPLOY_DIR}))')║"
echo "║                                                          ║"
echo "║  功能清单:                                                 ║"
echo "║    - 文本/Markdown 聊天 + 代码高亮                         ║"
echo "║    - AI 流式输出 + 动画光标                                ║"
echo "║    - 图片预览 + 灯箱全屏                                  ║"
echo "║    - 视频播放 + 自定义播放器                                ║"
echo "║    - 文件传输 + 断点续传                                    ║"
echo "║    - 拖拽上传                                              ║"
echo "║    - 6位数临时号码发现                                      ║"
echo "║                                                          ║"
echo "║  移动端打包 (可选):                                        ║"
echo "║    cd ${REPO_ROOT}/aicq-web$(printf '%*s' $((29 - ${#REPO_ROOT}))')║"
echo "║    npx cap add android && npx cap sync android              ║"
echo "║    npx cap add ios && npx cap sync ios                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
