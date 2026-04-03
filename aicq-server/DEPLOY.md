# AICQ Server 部署指南

> **模块名称**：`@aicq/server`
> **版本**：1.0.0
> **语言**：TypeScript / Node.js 20
> **仓库**：https://github.com/ctz168/aicq.git
> **许可**：MIT

---

## 目录

1. [概述](#1-概述)
2. [系统要求](#2-系统要求)
3. [端口与网络](#3-端口与网络)
4. [安装方式总览](#4-安装方式总览)
5. [方式一：一键脚本部署](#5-方式一一键脚本部署)
6. [方式二：手动安装部署](#6-方式二手动安装部署)
7. [方式三：Docker 部署](#7-方式三docker-部署)
8. [环境变量详解](#8-环境变量详解)
9. [Nginx 配置详解](#9-nginx-配置详解)
10. [SSL 证书配置](#10-ssl-证书配置)
11. [PM2 进程管理](#11-pm2-进程管理)
12. [API 端点一览](#12-api-端点一览)
13. [数据存储](#13-数据存储)
14. [安全加固](#14-安全加固)
15. [故障排查](#15-故障排查)
16. [升级更新](#16-升级更新)
17. [卸载](#17-卸载)
18. [架构说明](#18-架构说明)
19. [性能参考](#19-性能参考)

---

## 1. 概述

AICQ Server 是 AICQ 加密即时通讯系统的核心中继服务器，负责用户认证、密钥握手协调、P2P 信令中继、文件传输分块转发以及好友关系管理等关键功能。本服务器不存储任何用户聊天明文内容，所有端到端加密（E2EE）操作均在客户端完成，服务器仅充当协调与中继角色，符合最小信任原则。

### 核心功能

| 功能 | 描述 |
|------|------|
| **用户认证** | 支持邮箱/手机号注册、JWT 令牌登录，以及 AI Agent 的 Ed25519 签名免密码登录 |
| **临时号码分配** | 为用户分配 6 位临时号码（100000–999999），便于好友发现，有效期可配置 |
| **E2E 握手协调** | 基于 Noise-XK 协议的三方握手流程，协调客户端间的密钥交换 |
| **P2P 信令中继** | WebRTC 信令转发（ICE Candidate、SDP Offer/Answer），辅助建立 P2P 直连通道 |
| **文件传输中继** | 64KB 分块中继、SHA-256 哈希校验、断点续传支持 |
| **好友管理** | 好友关系维护，每人最多 200 个好友，在线状态广播 |
| **健康检查** | `GET /health` 端点，返回服务状态、域名、运行时间等信息 |

### 架构概览（ASCII 图）

```
                          ┌─────────────────────────────────────────────┐
                          │            AICQ Server (Node.js)             │
                          │                                             │
  ┌───────────┐           │  ┌─────────┐    ┌─────────┐                │
  │  Client A │◄──────────┼──┤  Nginx  │───►│ Express │                │
  │  (Web)    │  HTTPS /  │  │ (反向   │    │  HTTP   │                │
  │           │  WSS      │  │  代理)  │    │  Server │                │
  └───────────┘           │  └─────────┘    └────┬────┘                │
                          │                     │                      │
  ┌───────────┐           │  ┌─────────┐    ┌────▼────┐                │
  │  Client B │◄──────────┼──┤  Nginx  │───►│   ws    │                │
  │  (Mobile) │  HTTPS /  │  │         │    │ Server  │                │
  │           │  WSS      │  └─────────┘    └────┬────┘                │
  └───────────┘           │                     │                      │
                          │               ┌─────▼──────┐              │
  ┌───────────┐           │               │ MemoryStore │              │
  │ AI Agent  │◄──────────┼──────────────►│ (内存存储)  │              │
  │ (Plugin)  │  WSS      │               └────────────┘              │
  └───────────┘           │                                             │
                          │               ┌──────────────┐            │
                          │               │ @aicq/crypto │            │
                          │               │ (tweetnacl)  │            │
                          │               └──────────────┘            │
                          └─────────────────────────────────────────────┘

                          ┌─────────────────────────────────────────────┐
                          │          P2P 通道 (WebRTC DataChannel)       │
                          │                                             │
                          │   Client A ◄══════════════════► Client B    │
                          │   (直连加密通道，消息不经过服务器)              │
                          └─────────────────────────────────────────────┘
```

### 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | 20 LTS |
| 语言 | TypeScript | 5.x |
| HTTP 框架 | Express | 4.18 |
| WebSocket | ws | 8.16 |
| 加密库 | tweetnacl（通过 `@aicq/crypto`） | 1.0.3 |
| UUID | uuid | 9.x |
| 安全 | helmet + cors + express-rate-limit | — |
| 配置 | dotenv | 16.x |
| 进程管理 | PM2 | 最新 |
| 反向代理 | Nginx | 最新 |
| 容器化 | Docker + docker-compose | — |

---

## 2. 系统要求

### 最低配置 vs 推荐配置

| 项目 | 最低配置 | 推荐配置（生产环境） |
|------|---------|-------------------|
| **CPU** | 1 核 | 2 核及以上 |
| **内存** | 512 MB | 2 GB 及以上 |
| **磁盘** | 10 GB（SSD） | 40 GB（SSD） |
| **操作系统** | Ubuntu 20.04 / Debian 11 | Ubuntu 22.04 LTS |
| **Node.js** | 20.x LTS | 20.x LTS |
| **npm** | 10.x | 10.x |
| **网络带宽** | 5 Mbps | 50 Mbps 及以上 |
| **公网 IP** | 需要 | 需要（静态 IP 为佳） |
| **域名** | 可选（可用 IP） | 推荐（SSL 必需） |

### 依赖软件

| 软件 | 用途 | 安装方式 |
|------|------|---------|
| `git` | 克隆源码仓库 | `apt install git` |
| `curl` / `wget` | 下载脚本、健康检查 | `apt install curl wget` |
| `nginx` | 反向代理 + SSL 终止 | `apt install nginx` |
| `certbot` | Let's Encrypt 证书管理 | `apt install certbot python3-certbot-nginx` |
| `pm2` | Node.js 进程守护 | `npm install -g pm2` |
| `ufw` | 防火墙管理 | `apt install ufw` |
| `docker`（可选） | 容器化部署 | 官方安装脚本 |

> **注意**：Docker 部署方式已内置 Nginx，无需额外安装。一键脚本部署会自动安装所有必需的系统依赖。

---

## 3. 端口与网络

### 端口分配

| 端口 | 协议 | 服务 | 说明 |
|------|------|------|------|
| `3000` | HTTP | Express + ws | Node.js 应用监听端口，仅本地访问 |
| `80` | HTTP | Nginx | HTTP 重定向到 HTTPS |
| `443` | HTTPS/WSS | Nginx | HTTPS + WebSocket 安全端口（对外暴露） |

### 网络路径

```
客户端 ──► :443 (HTTPS/WSS) ──► Nginx ──► :3000 (HTTP/WS) ──► Express/ws Server
         ▲
         │ SSL 终止在此处完成
```

### 防火墙配置（ufw）

```bash
# 允许 SSH（重要：防止被锁定！）
sudo ufw allow 22/tcp

# 允许 HTTP 和 HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 拒绝直接访问 Node.js 端口（仅允许本机）
# ufw 默认拒绝未放行的端口，3000 端口无需额外配置

# 启用防火墙
sudo ufw enable

# 查看状态
sudo ufw status verbose
```

预期输出示例：

```
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
22/tcp (v6)                ALLOW IN    Anywhere
80/tcp (v6)                ALLOW IN    Anywhere
443/tcp (v6)               ALLOW IN    Anywhere
```

> **重要提示**：端口 `3000` 仅需本机回环访问（`127.0.0.1`），Nginx 通过 `upstream` 转发。切勿将 3000 端口暴露到公网，否则会绕过 Nginx 的安全层。

---

## 4. 安装方式总览

AICQ Server 提供三种部署方式，适用于不同场景：

| 特性 | 一键脚本 | 手动安装 | Docker |
|------|---------|---------|--------|
| **难度** | ★☆☆ 简单 | ★★★ 较难 | ★★☆ 中等 |
| **耗时** | 约 5 分钟 | 约 15–30 分钟 | 约 10 分钟 |
| **适用场景** | 全新服务器、快速体验 | 自定义配置、深度定制 | 容器化环境、CI/CD |
| **自动安装依赖** | ✅ 是 | ❌ 手动 | ✅ 是 |
| **自动配置 Nginx** | ✅ 是 | ❌ 手动 | ✅ 是 |
| **自动生成 SSL** | ✅ 自签名 | ❌ 手动 | ✅ 自签名 |
| **可自定义程度** | 低（仅域名参数） | 高（完全可控） | 中（环境变量） |
| **卸载难度** | 中等 | 较易 | 极易 |
| **操作系统要求** | Ubuntu/Debian | 任意 Linux | 安装了 Docker 的系统 |

> **推荐选择**：
> - 新手或快速部署 → **方式一（一键脚本）**
> - 生产环境需要精细控制 → **方式二（手动安装）**
> - 已有 Docker 基础设施 → **方式三（Docker）**

---

## 5. 方式一：一键脚本部署

一键脚本 `deploy/deploy-server.sh` 可在全新的 Ubuntu/Debian 服务器上自动完成全部部署工作，包括系统依赖安装、Node.js 配置、源码克隆、编译构建、`.env` 配置生成、PM2 启动以及 Nginx + SSL 配置。

### 前提条件

- 全新或干净的 Ubuntu 20.04+ / Debian 11+ 服务器
- root 权限（或 sudo）
- 服务器已配置静态公网 IP
- 域名 DNS 已解析到服务器 IP（可选，但推荐）

### 执行步骤

```bash
# 1. 克隆仓库
git clone https://github.com/ctz168/aicq.git /tmp/aicq-deploy
cd /tmp/aicq-deploy

# 2. 赋予脚本执行权限
chmod +x deploy/deploy-server.sh

# 3. 执行部署脚本（传入你的域名）
sudo ./deploy/deploy-server.sh aicq.online

# 4. 部署完成后验证
curl -s https://aicq.online/health | jq .
```

### 脚本执行流程（10 个步骤）

脚本会自动执行以下操作：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1/10 | 安装系统依赖 | `curl`、`wget`、`git`、`nginx`、`openssl` |
| 2/10 | 安装 Node.js 20.x | 通过 NodeSource 官方源安装 |
| 3/10 | 安装 PM2 | 全局安装 PM2 进程管理器 |
| 4/10 | 获取源码 | 克隆到 `/opt/aicq`，若已存在则 `git pull` |
| 5/10 | 安装 npm 依赖 | 编译 `aicq-crypto` 和 `aicq-server` 依赖 |
| 6/10 | 编译 TypeScript | `npm run build` 编译 crypto 和 server 模块 |
| 7/10 | 创建 `.env` 配置 | 根据参数生成配置文件 |
| 8/10 | 启动 PM2 服务 | 以 `production` 模式启动 `aicq-server` |
| 9/10 | 配置 Nginx | 生成站点配置 + 自签名 SSL 证书 |
| 10/10 | 验证部署 | 本地健康检查 |

### 参数说明

```bash
./deploy-server.sh [域名]
```

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `域名` | 否 | `aicq.online` | 服务器绑定的域名 |

### 自定义配置

如果需要修改端口或其他参数，编辑脚本顶部的配置变量：

```bash
# 部署前修改这些值
DOMAIN="${1:-aicq.online}"       # 域名
APP_DIR="/opt/aicq"              # 安装目录
NODE_VERSION="20"                # Node.js 版本
PORT=3000                        # 服务端口
MAX_FRIENDS=200                  # 最大好友数
TEMP_TTL_HOURS=24                # 临时号码有效期
```

### 部署完成输出示例

```
╔══════════════════════════════════════════════════════════════╗
║          AICQ Server 部署完成!                             ║
╠══════════════════════════════════════════════════════════════╣
║                                                          ║
║  Web UI:     https://aicq.online                        ║
║  API:        https://aicq.online/api/v1/                ║
║  WebSocket:  wss://aicq.online/ws                       ║
║  健康检查:   https://aicq.online/health                 ║
║                                                          ║
║  配置文件:   /opt/aicq/aicq-server/.env                 ║
║  日志:       pm2 logs aicq-server                       ║
║                                                          ║
║  [后续] 安装 Let's Encrypt 真实证书:                       ║
║  sudo apt install certbot python3-certbot-nginx          ║
║  sudo certbot --nginx -d aicq.online                    ║
╚══════════════════════════════════════════════════════════════╝
```

### 后续操作

一键脚本生成的 SSL 证书为**自签名证书**，浏览器会显示安全警告。生产环境请务必替换为 Let's Encrypt 证书：

```bash
# 安装 certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取真实证书（自动替换 Nginx 配置中的证书路径）
sudo certbot --nginx -d aicq.online

# 测试自动续期
sudo certbot renew --dry-run
```

---

## 6. 方式二：手动安装部署

手动安装适用于需要完全控制每个步骤的场景。以下是在 Ubuntu 22.04 LTS 上的完整操作流程。

### 步骤 1：安装系统依赖

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git nginx openssl software-properties-common build-essential
```

### 步骤 2：安装 Node.js 20.x

```bash
# 添加 NodeSource 官方源
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 安装 Node.js（自动包含 npm）
sudo apt install -y nodejs

# 验证安装
node --version    # 应输出 v20.x.x
npm --version     # 应输出 10.x.x
```

### 步骤 3：安装 PM2

```bash
sudo npm install -g pm2

# 验证安装
pm2 --version
```

### 步骤 4：克隆源码

```bash
# 创建应用目录
sudo mkdir -p /opt/aicq
sudo chown $USER:$USER /opt/aicq

# 克隆仓库
cd /opt/aicq
git clone https://github.com/ctz168/aicq.git .

# 查看目录结构
ls -la
# aicq-crypto/  aicq-server/  aicq-client/  aicq-web/  aicq-plugin/  docker/  deploy/
```

### 步骤 5：编译 @aicq/crypto

`aicq-server` 依赖于 `@aicq/crypto` 模块（内部包 `file:../aicq-crypto`），必须先编译。

```bash
cd /opt/aicq/aicq-crypto

# 安装依赖
npm install

# 编译 TypeScript → dist/
npm run build

# 验证编译产物
ls dist/
# 应看到: index.js  index.d.ts  keygen.js  handshake.js  cipher.js  message.js  nacl.js  signer.js  ...
```

### 步骤 6：编译 aicq-server

```bash
cd /opt/aicq/aicq-server

# 安装依赖（会自动链接 ../aicq-crypto）
npm install

# 编译 TypeScript → dist/
npm run build

# 验证编译产物
ls dist/
# 应看到: index.js  config.js  api/  db/  middleware/  models/  services/
```

### 步骤 7：配置 .env 文件

```bash
cd /opt/aicq/aicq-server

cat > .env << 'EOF'
# AICQ Server 环境配置
PORT=3000
DOMAIN=aicq.online
MAX_FRIENDS=200
TEMP_NUMBER_TTL_HOURS=24
QR_CODE_VALIDITY_SECONDS=60
NODE_ENV=production
EOF

# 验证配置
cat .env
```

### 步骤 8：使用 PM2 启动服务

```bash
cd /opt/aicq/aicq-server

# 启动服务
pm2 start dist/index.js --name "aicq-server" --env production

# 查看状态
pm2 status

# 保存 PM2 进程列表（开机自动恢复）
pm2 save

# 设置 PM2 开机自启
pm2 startup
# 按照输出的命令执行（通常为 sudo env PATH=$PATH:/usr/bin pm2 startup ...）
```

### 步骤 9：创建 systemd 服务（可选但推荐）

如果不想使用 PM2 的 startup 机制，也可以手动创建 systemd 服务：

```bash
sudo cat > /etc/systemd/system/aicq-server.service << 'EOF'
[Unit]
Description=AICQ Relay Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/aicq/aicq-server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable aicq-server
sudo systemctl start aicq-server

# 查看状态
sudo systemctl status aicq-server
```

### 步骤 10：配置 Nginx

创建 Nginx 站点配置文件：

```bash
sudo mkdir -p /etc/nginx/ssl

sudo cat > /etc/nginx/sites-available/aicq.online << 'EOF'
upstream aicq_api {
    server 127.0.0.1:3000;
}

# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name aicq.online;
    return 301 https://$host$request_uri;
}

# HTTPS 主配置
server {
    listen 443 ssl http2;
    server_name aicq.online;

    # SSL 证书路径（先用自签名，后用 certbot 替换）
    ssl_certificate /etc/nginx/ssl/aicq.online.crt;
    ssl_certificate_key /etc/nginx/ssl/aicq.online.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 安全响应头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # 静态文件（Web UI）
    location / {
        root /opt/aicq/aicq-web/dist;
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

    # WebSocket 代理
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
EOF

# 启用站点
sudo ln -sf /etc/nginx/sites-available/aicq.online /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试 Nginx 配置
sudo nginx -t
```

### 步骤 11：配置 SSL 证书

```bash
# 先生成自签名证书（用于初步测试）
sudo openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/aicq.online.key \
  -out /etc/nginx/ssl/aicq.online.crt \
  -subj "/CN=aicq.online"

# 重载 Nginx
sudo systemctl reload nginx

# 安装 Let's Encrypt（正式环境）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d aicq.online
```

### 步骤 12：配置防火墙

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

### 步骤 13：验证部署

```bash
# 本地健康检查
curl -s http://127.0.0.1:3000/health

# 通过域名检查
curl -s https://aicq.online/health

# WebSocket 连通性测试（安装 wscat）
npm install -g wscat
wscat -c wss://aicq.online/ws

# 查看 PM2 日志
pm2 logs aicq-server --lines 20
```

---

## 7. 方式三：Docker 部署

Docker 部署方式将 AICQ Server、Nginx 和 Web UI 打包为单一容器，适合已有 Docker 基础设施的环境。

### 前提条件

- Docker 20.10+
- Docker Compose 2.0+
- 服务器已开放 80、443 端口

### docker-compose.yml

项目提供了 `docker/docker-compose.yml` 文件，内容如下：

```yaml
version: '3.8'

services:
  aicq:
    build: ..
    container_name: aicq
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DOMAIN=aicq.online
      - MAX_FRIENDS=200
      - TEMP_NUMBER_TTL_HOURS=24
    volumes:
      - aicq-data:/app/data
      - aicq-ssl:/etc/nginx/ssl
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  aicq-data:
  aicq-ssl:
```

### 构建与运行

```bash
# 进入项目根目录
cd /opt/aicq

# 使用 docker-compose 构建并启动
cd docker
docker compose up -d --build

# 查看容器状态
docker compose ps

# 查看实时日志
docker compose logs -f
```

### 自定义配置

修改 `docker/docker-compose.yml` 中的 `environment` 部分来覆盖默认配置：

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - DOMAIN=your-domain.com        # 修改为你的域名
  - MAX_FRIENDS=200               # 调整最大好友数
  - TEMP_NUMBER_TTL_HOURS=48      # 临时号码 48 小时有效
  - QR_CODE_VALIDITY_SECONDS=120  # 二维码 120 秒有效
```

修改后重新启动容器：

```bash
docker compose down
docker compose up -d
```

### 数据卷说明

| 卷名 | 容器路径 | 说明 |
|------|---------|------|
| `aicq-data` | `/app/data` | 应用数据目录（用于未来持久化存储） |
| `aicq-ssl` | `/etc/nginx/ssl` | SSL 证书文件目录 |

### 挂载自定义 SSL 证书

将 Let's Encrypt 证书挂载到容器中：

```yaml
volumes:
  - aicq-data:/app/data
  - /etc/letsencrypt/live/aicq.online/fullchain.pem:/etc/nginx/ssl/aicq.online.crt:ro
  - /etc/letsencrypt/live/aicq.online/privkey.pem:/etc/nginx/ssl/aicq.online.key:ro
```

### 常用 Docker 命令

```bash
# 查看容器状态
docker compose ps

# 查看日志（最近 100 行）
docker compose logs --tail 100

# 进入容器内部
docker compose exec aicq sh

# 重启容器
docker compose restart

# 停止并移除
docker compose down

# 停止并移除（包括数据卷）
docker compose down -v
```

### Dockerfile 说明

项目根目录的 `Dockerfile` 采用**多阶段构建**：

1. **构建阶段**（`builder`）：基于 `node:20-alpine`，编译 `aicq-crypto`、`aicq-server` 和 `aicq-web` 三个模块
2. **运行阶段**：基于 `node:20-alpine`，仅复制编译产物和运行时依赖，安装 Nginx，使用 `entrypoint.sh` 同时启动 Node.js 和 Nginx

---

## 8. 环境变量详解

AICQ Server 通过 `.env` 文件加载配置（使用 `dotenv` 库）。所有环境变量均为可选，未设置时使用默认值。

### 完整环境变量表

| 变量名 | 类型 | 默认值 | 说明 | 示例 |
|--------|------|--------|------|------|
| `PORT` | 整数 | `3000` | Node.js HTTP + WebSocket 监听端口 | `3000` |
| `DOMAIN` | 字符串 | `aicq.online` | 服务器域名，用于标识和 WebSocket URL 生成 | `chat.example.com` |
| `MAX_FRIENDS` | 整数 | `200` | 每个用户允许的最大好友数量 | `200` |
| `TEMP_NUMBER_TTL_HOURS` | 整数 | `24` | 临时号码有效时长（小时） | `48` |
| `QR_CODE_VALIDITY_SECONDS` | 整数 | `60` | 二维码登录有效期（秒） | `120` |
| `NODE_ENV` | 字符串 | — | 运行环境标识（`production` / `development`） | `production` |
| `RATE_LIMIT_DISABLED` | 字符串 | `false` | 是否禁用 API 速率限制（仅限测试环境使用） | `true` |

### .env 文件示例

```bash
# ──────────────────────────────────────────────
# AICQ Server 环境配置
# 文件位置: /opt/aicq/aicq-server/.env
# ──────────────────────────────────────────────

# 服务器端口（Nginx 反向代理到此端口）
PORT=3000

# 服务器域名（用于 CORS、WebSocket URL 等）
DOMAIN=aicq.online

# 每个用户最大好友数
MAX_FRIENDS=200

# 临时号码有效期（小时），到期自动回收
TEMP_NUMBER_TTL_HOURS=24

# 二维码登录有效期（秒）
QR_CODE_VALIDITY_SECONDS=60

# 运行环境
NODE_ENV=production

# 速率限制开关（⚠️ 仅测试环境设为 true）
# RATE_LIMIT_DISABLED=false
```

### 配置加载机制

配置通过 `src/config.ts` 文件加载，使用 `dotenv.config()` 读取 `.env` 文件，并通过 `parseInt` 确保数值类型正确：

```typescript
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  domain: process.env.DOMAIN || 'aicq.online',
  maxFriends: parseInt(process.env.MAX_FRIENDS || '200', 10),
  tempNumberTtlHours: parseInt(process.env.TEMP_NUMBER_TTL_HOURS || '24', 10),
  qrCodeValiditySeconds: parseInt(process.env.QR_CODE_VALIDITY_SECONDS || '60', 10),
} as const;
```

> **注意**：修改 `.env` 文件后需要重启服务才能生效（`pm2 restart aicq-server` 或 `docker compose restart`）。

---

## 9. Nginx 配置详解

Nginx 作为反向代理，负责 SSL 终止、HTTP→HTTPS 重定向、WebSocket 升级代理、静态文件服务和安全头注入。

### 完整配置文件（含详细注释）

```nginx
# ──────────────────────────────────────────────────────────────
# AICQ Server Nginx 配置
# 文件位置: /etc/nginx/sites-available/aicq.online
# ──────────────────────────────────────────────────────────────

# 定义上游 Node.js 服务（Express + ws）
upstream aicq_api {
    server 127.0.0.1:3000;
    # 如果有多个实例，可以配置负载均衡：
    # server 127.0.0.1:3001;
    # server 127.0.0.1:3002;
}

# ─── HTTP → HTTPS 重定向 ──────────────────────────────────────
server {
    listen 80;
    server_name aicq.online;

    # 所有 HTTP 请求 301 永久重定向到 HTTPS
    return 301 https://$host$request_uri;
}

# ─── HTTPS 主配置 ─────────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name aicq.online;

    # ── SSL 证书配置 ────────────────────────────────────────
    ssl_certificate /etc/nginx/ssl/aicq.online.crt;
    ssl_certificate_key /etc/nginx/ssl/aicq.online.key;

    # 仅允许 TLS 1.2 和 1.3
    ssl_protocols TLSv1.2 TLSv1.3;

    # 加密套件（排除不安全的算法）
    ssl_ciphers HIGH:!aNULL:!MD5;

    # SSL 会话缓存（提升性能）
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS（强制 HTTPS，有效期 1 年）
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ── 安全响应头 ──────────────────────────────────────────
    # 防止页面被嵌入 iframe（防止点击劫持）
    add_header X-Frame-Options DENY;

    # 防止 MIME 类型嗅探
    add_header X-Content-Type-Options nosniff;

    # XSS 保护（旧版浏览器）
    add_header X-XSS-Protection "1; mode=block";

    # ── Gzip 压缩 ──────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # ── 静态文件服务（Web UI）──────────────────────────────
    location / {
        root /opt/aicq/aicq-web/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # ── API 代理 ───────────────────────────────────────────
    location /api/ {
        proxy_pass http://aicq_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_buffering off;       # 禁用缓冲，适合实时 API
        proxy_cache off;
        chunked_transfer_encoding off;

        # 请求体大小限制（文件上传）
        client_max_body_size 100m;
    }

    # ── 健康检查 ───────────────────────────────────────────
    location /health {
        proxy_pass http://aicq_api;
        proxy_http_version 1.1;
        access_log off;  # 健康检查不写日志
    }

    # ── WebSocket 代理 ─────────────────────────────────────
    location /ws {
        proxy_pass http://aicq_api;
        proxy_http_version 1.1;

        # WebSocket 升级头（核心配置）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 传递客户端信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 超时（24 小时，防止长时间空闲断开）
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # ── 日志配置 ───────────────────────────────────────────
    access_log /var/log/nginx/aicq_access.log;
    error_log  /var/log/nginx/aicq_error.log;
}
```

### WebSocket 代理关键配置

WebSocket 代理是 AICQ Server 最重要的 Nginx 配置部分。以下三个配置项缺一不可：

```nginx
# 1. 升级头：告诉 Nginx 这是一个 WebSocket 连接
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

# 2. 超时设置：WebSocket 是长连接，默认 60 秒超时会导致断开
proxy_read_timeout 86400;  # 24 小时
proxy_send_timeout 86400;  # 24 小时
```

### Nginx 配置测试与重载

```bash
# 测试配置语法
sudo nginx -t

# 重载配置（不中断服务）
sudo systemctl reload nginx

# 重启 Nginx
sudo systemctl restart nginx
```

---

## 10. SSL 证书配置

### 方式一：Let's Encrypt（推荐，免费）

Let's Encrypt 提供免费的可信 SSL 证书，自动续期，适用于生产环境。

```bash
# 安装 certbot 和 Nginx 插件
sudo apt install -y certbot python3-certbot-nginx

# 获取证书（自动修改 Nginx 配置）
sudo certbot --nginx -d aicq.online

# 交互式问题：
# 1. 输入邮箱（用于证书到期提醒）
# 2. 同意服务条款 (Y)
# 3. 是否重定向 HTTP → HTTPS (推荐选 2 - Redirect)
```

#### 自动续期

Certbot 安装时会自动创建定时任务，无需手动配置。验证自动续期：

```bash
# 检查自动续期定时器
sudo systemctl status certbot.timer

# 手动测试续期（dry-run 不实际执行）
sudo certbot renew --dry-run
```

如果需要手动续期：

```bash
sudo certbot renew
sudo systemctl reload nginx
```

#### 仅获取证书（不自动修改 Nginx）

```bash
sudo certbot certonly --webroot \
  -w /opt/aicq/aicq-web/dist \
  -d aicq.online \
  -d www.aicq.online
```

证书文件位置：

| 文件 | 路径 |
|------|------|
| 证书 | `/etc/letsencrypt/live/aicq.online/fullchain.pem` |
| 私钥 | `/etc/letsencrypt/live/aicq.online/privkey.pem` |

在 Nginx 中引用：

```nginx
ssl_certificate /etc/letsencrypt/live/aicq.online/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/aicq.online/privkey.pem;
```

### 方式二：自签名证书（仅开发环境）

```bash
sudo mkdir -p /etc/nginx/ssl

sudo openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/aicq.online.key \
  -out /etc/nginx/ssl/aicq.online.crt \
  -subj "/CN=aicq.online" \
  -addext "subjectAltName=DNS:aicq.online,DNS:*.aicq.online"
```

> ⚠️ **警告**：自签名证书仅用于开发和测试。浏览器会显示安全警告，WebSocket 客户端可能需要额外配置以跳过证书验证。

### SSL 安全建议

| 建议 | 说明 |
|------|------|
| 使用 TLS 1.2+ | 已在 Nginx 配置中设置 |
| 禁用弱加密套件 | 已配置 `HIGH:!aNULL:!MD5` |
| 启用 HSTS | 已设置 `max-age=31536000` |
| 开启 OCSP Stapling | 减少证书验证延迟 |
| 定期检查证书 | 使用 [SSL Labs](https://www.ssllabs.com/ssltest/) 测试 |

---

## 11. PM2 进程管理

PM2 是 Node.js 生产环境的进程管理器，提供进程守护、日志管理、负载均衡和监控功能。

### 常用命令速查

#### 服务管理

```bash
# 启动服务
pm2 start /opt/aicq/aicq-server/dist/index.js --name "aicq-server"

# 指定运行环境变量
pm2 start dist/index.js --name "aicq-server" --env production

# 停止服务
pm2 stop aicq-server

# 重启服务
pm2 restart aicq-server

# 重载服务（零停机时间，支持 cluster 模式）
pm2 reload aicq-server

# 删除服务
pm2 delete aicq-server
```

#### 日志管理

```bash
# 实时查看日志
pm2 logs aicq-server

# 查看最近 200 行日志
pm2 logs aicq-server --lines 200

# 仅查看错误日志
pm2 logs aicq-server --err

# 清空日志
pm2 flush

# 日志文件位置（默认）
# ~/.pm2/logs/aicq-server-out.log  (标准输出)
# ~/.pm2/logs/aicq-server-error.log (错误输出)
```

#### 监控与状态

```bash
# 查看所有进程状态
pm2 status
# 或
pm2 list

# 实时监控面板（CPU、内存、日志）
pm2 monit

# 查看详细信息
pm2 show aicq-server

# 查看进程信息
pm2 info aicq-server
```

#### 开机自启

```bash
# 生成启动脚本
pm2 startup

# 按照输出执行命令，例如：
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root

# 保存当前进程列表
pm2 save
```

#### 进程配置文件（可选）

对于更复杂的配置，可以创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'aicq-server',
    script: '/opt/aicq/aicq-server/dist/index.js',
    cwd: '/opt/aicq/aicq-server',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/aicq/error.log',
    out_file: '/var/log/aicq/out.log',
  }]
};
```

使用配置文件启动：

```bash
pm2 start ecosystem.config.js
```

### PM2 状态输出解读

```
┌─────┬──────────────┬─────────┬─────────┬───────────┬──────────┐
│ id  │ name         │ mode    │ ↺       │ status    │ cpu      │
├─────┼──────────────┼─────────┼─────────┼───────────┼──────────┤
│ 0   │ aicq-server  │ fork    │ 0       │ online    │ 0.3%     │
└─────┴──────────────┴─────────┴─────────┴───────────┴──────────┘
```

| 字段 | 含义 |
|------|------|
| `mode` | `fork`（单进程）或 `cluster`（集群模式） |
| `↺` | 重启次数，频繁重启说明有异常 |
| `status` | `online`（正常）、`stopped`（停止）、`errored`（错误） |
| `cpu` | CPU 占用率 |

---

## 12. API 端点一览

所有 API 端点以 `/api/v1` 为前缀。WebSocket 连接路径为 `/ws`。

### 认证（Authentication）

| 方法 | 路径 | 描述 | 速率限制 |
|------|------|------|---------|
| `POST` | `/api/v1/auth/send-code` | 发送验证码（邮箱/手机号） | 60 次/分钟 |
| `POST` | `/api/v1/auth/register` | 用户注册（邮箱/手机号 + 密码 + 公钥） | 60 次/分钟 |
| `POST` | `/api/v1/auth/login` | 用户登录（密码/验证码） | 60 次/分钟 |
| `POST` | `/api/v1/auth/login-agent` | AI Agent 签名登录（Ed25519 公钥签名） | 60 次/分钟 |
| `POST` | `/api/v1/auth/refresh` | 刷新 JWT 令牌 | 60 次/分钟 |

### 节点（Node）

| 方法 | 路径 | 描述 | 速率限制 |
|------|------|------|---------|
| `POST` | `/api/v1/node/register` | 注册节点（提交公钥） | 60 次/分钟 |

### 临时号码（Temp Number）

| 方法 | 路径 | 描述 | 速率限制 |
|------|------|------|---------|
| `POST` | `/api/v1/temp-number/request` | 请求分配 6 位临时号码 | 5 次/分钟 |
| `GET` | `/api/v1/temp-number/:number` | 查询临时号码（解析所有者） | 60 次/分钟 |
| `DELETE` | `/api/v1/temp-number/:number` | 撤销临时号码 | 60 次/分钟 |

### 握手（Handshake）

| 方法 | 路径 | 描述 | 速率限制 |
|------|------|------|---------|
| `POST` | `/api/v1/handshake/initiate` | 发起握手（Noise-XK 第一步） | 10 次/分钟 |
| `POST` | `/api/v1/handshake/respond` | 提交握手响应（第二步） | 10 次/分钟 |
| `POST` | `/api/v1/handshake/confirm` | 确认握手完成（第三步） | 10 次/分钟 |

### 好友（Friends）

| 方法 | 路径 | 描述 | 速率限制 |
|------|------|------|---------|
| `GET` | `/api/v1/friends?nodeId=xxx` | 获取好友列表 | 60 次/分钟 |
| `DELETE` | `/api/v1/friends/:friendId` | 删除好友 | 60 次/分钟 |

### 文件传输（File Transfer）

| 方法 | 路径 | 描述 | 速率限制 |
|------|------|------|---------|
| `POST` | `/api/v1/file/initiate` | 发起文件传输会话 | 60 次/分钟 |
| `GET` | `/api/v1/file/:sessionId` | 查询传输会话信息 | 60 次/分钟 |
| `POST` | `/api/v1/file/:sessionId/chunk` | 上报分块接收进度 | 60 次/分钟 |
| `GET` | `/api/v1/file/:sessionId/missing` | 获取缺失分块（断点续传） | 60 次/分钟 |

### 系统（System）

| 方法 | 路径 | 描述 | 速率限制 |
|------|------|------|---------|
| `GET` | `/health` | 健康检查（无前缀） | 无限制 |

### WebSocket 消息类型

通过 `wss://aicq.online/ws` 连接后，支持以下消息类型：

| 类型 | 方向 | 描述 |
|------|------|------|
| `online` | 客户端→服务器 | 节点上线路由 |
| `online_ack` | 服务器→客户端 | 上线确认 |
| `offline` | 客户端→服务器 | 节点下线路由 |
| `signal` | 双向 | WebRTC 信令转发（ICE/SDP） |
| `message` | 双向 | 消息中继（已废弃，推荐 P2P） |
| `file_chunk` | 双向 | 文件分块中继 |
| `presence` | 服务器→客户端 | 好友在线/离线状态广播 |
| `error` | 服务器→客户端 | 错误响应 |

---

## 13. 数据存储

### 当前方案：MemoryStore（内存存储）

AICQ Server 当前使用纯内存存储方案（`MemoryStore` 类），所有数据保存在 Node.js 进程的堆内存中。

#### 存储的数据结构

| 数据 | Map 键 | 值类型 | 说明 |
|------|--------|--------|------|
| 已注册节点 | `nodeId` (string) | `NodeRecord` | 节点公钥、在线状态、好友列表 |
| 临时号码 | `6位号码` (string) | `TempNumberRecord` | 号码→节点映射，带过期时间 |
| 握手会话 | `sessionId` (string) | `HandshakeSession` | Noise-XK 三步握手状态 |
| 文件传输 | `sessionId` (string) | `FileTransferRecord` | 文件分块进度、哈希校验 |
| 待处理请求 | `targetNodeId` (string) | `PendingRequest[]` | 好友请求队列 |
| 用户账户 | `accountId` (string) | `Account` | 账户信息、密码哈希、公钥 |
| 验证码 | `target+purpose` (string) | `VerificationCode` | 邮箱/手机验证码 |
| 会话 | `sessionId` (string) | `Session` | JWT 令牌、刷新令牌 |

#### 自动清理机制

服务器每 60 秒执行一次自动清理（`startPeriodicCleanup`），清理以下过期数据：

| 清理任务 | 过期条件 |
|---------|---------|
| 临时号码 | 超过 `TEMP_NUMBER_TTL_HOURS`（默认 24h） |
| 握手会话 | 超过 10 分钟 |
| 文件传输记录 | 完成/取消后超过 1 小时 |
| 验证码 | 超过有效期 |
| 会话令牌 | 超过有效期 |

#### 重要限制

> ⚠️ **数据易失性**：由于使用内存存储，以下情况会导致**所有数据丢失**：
> - 服务器重启（`pm2 restart`）
> - 进程崩溃后自动重启
> - 服务器操作系统重启
> - PM2 更新或进程删除

这意味着：
- 用户的账户、好友关系、临时号码等在重启后全部消失
- 适用于开发/测试环境或无状态中继场景
- AI Agent 可通过重新签名登录自动恢复

#### 未来规划

| 方案 | 状态 | 说明 |
|------|------|------|
| SQLite | 计划中 | 轻量级持久化，适合单机部署 |
| Redis | 计划中 | 高性能缓存 + 持久化，适合分布式部署 |
| PostgreSQL | 远期 | 完整关系型数据库，适合大规模部署 |

---

## 14. 安全加固

### 14.1 防火墙（ufw）

```bash
# 仅开放必要端口
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP → HTTPS 重定向
sudo ufw allow 443/tcp    # HTTPS + WSS
sudo ufw --force enable

# 验证
sudo ufw status numbered
```

### 14.2 Fail2Ban（防暴力破解）

```bash
# 安装
sudo apt install -y fail2ban

# 创建 Nginx 保护配置
sudo cat > /etc/fail2ban/jail.d/nginx.conf << 'EOF'
[nginx-http-auth]
enabled  = true
filter   = nginx-http-auth
port     = http,https
logpath  = /var/log/nginx/error.log
maxretry = 5
findtime = 600
bantime  = 3600

[nginx-bad-request]
enabled  = true
filter   = nginx-bad-request
port     = http,https
logpath  = /var/log/nginx/access.log
maxretry = 20
findtime = 60
bantime  = 600
EOF

# 创建过滤器
sudo cat > /etc/fail2ban/filter.d/nginx-bad-request.conf << 'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST) .*" (400|401|403) .*$
ignoreregex =
EOF

# 启动
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 查看状态
sudo fail2ban-client status nginx-http-auth
```

### 14.3 速率限制（已内置）

AICQ Server 已集成 `express-rate-limit`，配置如下：

| 限制器 | 窗口 | 最大请求数 | 应用范围 |
|--------|------|-----------|---------|
| `generalLimiter` | 1 分钟 | 60 次 | 所有 API 端点 |
| `tempNumberLimiter` | 1 分钟 | 5 次 | 临时号码申请 |
| `handshakeLimiter` | 1 分钟 | 10 次 | 握手相关端点 |

> **注意**：测试环境可通过设置 `RATE_LIMIT_DISABLED=true` 禁用速率限制。**切勿在生产环境禁用**。

### 14.4 安全响应头（Helmet）

AICQ Server 使用 `helmet` 中间件自动添加安全头：

```typescript
app.use(helmet());
```

Helmet 默认设置以下头信息：

| 头 | 作用 |
|----|------|
| `Content-Security-Policy` | 限制资源加载来源 |
| `X-Frame-Options` | 防止点击劫持 |
| `X-Content-Type-Options` | 防止 MIME 嗅探 |
| `Strict-Transport-Security` | 强制 HTTPS |

### 14.5 HTTPS 强制

- Nginx 配置了 HTTP→HTTPS 的 301 重定向
- HSTS 头设置了 1 年有效期
- WebSocket 使用 `wss://` 协议

### 14.6 环境变量安全

```bash
# .env 文件权限应限制为仅所有者可读
chmod 600 /opt/aicq/aicq-server/.env

# 确保 .env 已在 .gitignore 中
echo ".env" >> /opt/aicq/.gitignore
```

### 14.7 其他建议

| 建议 | 命令/方法 |
|------|----------|
| 禁止 root SSH 登录 | 在 `/etc/ssh/sshd_config` 中设置 `PermitRootLogin no` |
| 使用 SSH 密钥登录 | 禁用密码登录，仅允许公钥认证 |
| 定期更新系统 | `sudo apt update && sudo apt upgrade -y` |
| 限制 PM2 API 访问 | 不暴露 PM2 端口（9615）到公网 |
| 日志轮转 | 配置 `logrotate` 管理 PM2 和 Nginx 日志 |

---

## 15. 故障排查

### 常见问题与解决方案

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| **服务启动失败** | 端口 3000 被占用 | `lsof -i :3000` 查看占用进程，`kill` 后重启 |
| **服务启动失败** | 编译错误 | 重新编译：`cd /opt/aicq/aicq-server && npm run build` |
| **服务启动失败** | `@aicq/crypto` 未编译 | 先编译 crypto：`cd /opt/aicq/aicq-crypto && npm run build` |
| **服务启动失败** | `.env` 文件不存在 | 创建 `.env` 文件并填入必要配置 |
| **WebSocket 频繁断开** | Nginx 超时设置过短 | 设置 `proxy_read_timeout 86400` |
| **WebSocket 频繁断开** | 未配置 `Upgrade` 头 | 确认 Nginx 中 `proxy_set_header Upgrade` 和 `Connection "upgrade"` 已配置 |
| **WebSocket 频繁断开** | 客户端网络不稳定 | 检查客户端网络，实现自动重连机制 |
| **502 Bad Gateway** | Node.js 进程未运行 | `pm2 status` 检查，`pm2 restart aicq-server` |
| **502 Bad Gateway** | Nginx upstream 配置错误 | 检查 `upstream` 地址是否为 `127.0.0.1:3000` |
| **SSL 证书错误** | 证书过期 | `sudo certbot renew && sudo systemctl reload nginx` |
| **SSL 证书错误** | 域名不匹配 | 确保证书域名与实际域名一致 |
| **429 Too Many Requests** | 触发速率限制 | 降低请求频率，或调整 `express-rate-limit` 配置 |
| **健康检查失败** | 服务未启动 | `pm2 logs aicq-server --err` 查看错误日志 |
| **健康检查失败** | 防火墙阻止 | `curl http://127.0.0.1:3000/health` 本地测试 |
| **git pull 冲突** | 本地有修改 | `git stash && git pull && git stash pop` |
| **npm install 失败** | 网络问题 | 配置 npm 镜像：`npm config set registry https://registry.npmmirror.com` |
| **编译报错 TS2307** | `@aicq/crypto` 链接失败 | 确认 `aicq-crypto/dist/` 目录存在且已编译 |

### 诊断命令速查

```bash
# 检查 Node.js 进程是否在运行
pm2 status

# 检查端口是否在监听
sudo ss -tlnp | grep 3000

# 检查 Nginx 状态
sudo systemctl status nginx

# 查看 Nginx 错误日志
sudo tail -50 /var/log/nginx/aicq_error.log

# 查看 PM2 错误日志
pm2 logs aicq-server --err --lines 50

# 测试本地健康检查
curl -v http://127.0.0.1:3000/health

# 测试 WebSocket 本地连接
wscat -c ws://127.0.0.1:3000/ws

# 测试 HTTPS 健康检查
curl -v https://aicq.online/health

# 测试 WSS 连接
wscat -c wss://aicq.online/ws

# 检查磁盘空间
df -h

# 检查内存使用
free -h

# 检查 Node.js 内存使用
pm2 monit
```

---

## 16. 升级更新

### 标准更新流程

```bash
# 1. 进入项目目录
cd /opt/aicq

# 2. 拉取最新代码
git pull origin main

# 3. 更新依赖
cd aicq-crypto && npm install && npm run build
cd ../aicq-server && npm install && npm run build

# 4. 重启服务
pm2 restart aicq-server

# 5. 验证
curl -s https://aicq.online/health | jq .
```

### Docker 更新流程

```bash
cd /opt/aicq/docker

# 拉取最新代码（如果在服务器上使用 git）
cd /opt/aicq && git pull origin main

# 重新构建并启动
cd docker
docker compose up -d --build
```

### 回滚操作

```bash
# 查看提交历史
cd /opt/aicq
git log --oneline -10

# 回滚到指定版本
git checkout <commit-hash>

# 重新编译和重启
cd aicq-crypto && npm run build
cd ../aicq-server && npm run build
pm2 restart aicq-server
```

### 更新前注意事项

- ⚠️ 当前使用内存存储，重启会**丢失所有数据**
- 建议在低峰期执行更新
- 更新前通知用户（WebSocket 会断开）
- 保留回滚方案（记录当前 commit hash）

---

## 17. 卸载

### 完整卸载步骤

```bash
# 1. 停止并删除 PM2 进程
pm2 stop aicq-server
pm2 delete aicq-server
pm2 save

# 2. 移除 PM2 开机自启（如已配置）
pm2 unstartup systemd

# 3. 删除应用文件
sudo rm -rf /opt/aicq

# 4. 删除 Nginx 站点配置
sudo rm -f /etc/nginx/sites-enabled/aicq.online
sudo rm -f /etc/nginx/sites-available/aicq.online
sudo nginx -t && sudo systemctl reload nginx

# 5. 删除自签名 SSL 证书（如适用）
sudo rm -rf /etc/nginx/ssl/aicq.online.*

# 6. 删除 Let's Encrypt 证书（如适用）
sudo certbot delete --cert-name aicq.online

# 7. 删除日志文件（可选）
sudo rm -rf /var/log/nginx/aicq_*
rm -rf ~/.pm2/logs/aicq-server-*

# 8. 卸载 Node.js（如不再需要）
sudo apt remove -y nodejs
sudo rm -rf /etc/apt/sources.list.d/nodesource.list

# 9. 卸载 PM2（如不再需要）
sudo npm uninstall -g pm2

# 10. 卸载 Nginx（如不再需要）
sudo apt remove -y nginx nginx-common
sudo apt autoremove -y
```

### Docker 卸载

```bash
cd /opt/aicq/docker

# 停止并移除容器和数据卷
docker compose down -v

# 删除镜像
docker rmi aicq-docker-aicq

# 删除项目文件
sudo rm -rf /opt/aicq
```

---

## 18. 架构说明

### 整体架构图

```
                        ┌─────────────────────────────────────────────────────────┐
                        │                     互联网                              │
                        │                                                       │
                        │    ┌──────────┐    ┌──────────┐    ┌──────────┐        │
                        │    │ Web 客户端 │    │ 移动客户端 │    │ AI Agent  │        │
                        │    │ (浏览器)   │    │ (Capacitor)│   │ (Plugin)  │        │
                        │    └─────┬─────┘    └─────┬─────┘    └─────┬─────┘        │
                        └──────────┼───────────────┼───────────────┼───────────────┘
                                   │ HTTPS/WSS     │ HTTPS/WSS     │ WSS
                                   ▼               ▼               ▼
                        ┌──────────────────────────────────────────────────────────┐
                        │                     Nginx (反向代理)                       │
                        │                                                          │
                        │  ┌──────────┐   ┌──────────┐   ┌──────────┐            │
                        │  │ SSL 终止  │   │ 静态文件  │   │ 负载均衡  │            │
                        │  └──────────┘   └──────────┘   └──────────┘            │
                        └──────────────────────────┬───────────────────────────────┘
                                                   │ proxy_pass :3000
                                                   ▼
                        ┌──────────────────────────────────────────────────────────┐
                        │                AICQ Server (Node.js :3000)                │
                        │                                                          │
                        │  ┌──────────────────┐    ┌──────────────────┐           │
                        │  │   Express HTTP    │    │   ws WebSocket   │           │
                        │  │                  │    │                  │           │
                        │  │  /api/v1/auth/*  │    │  online/offline  │           │
                        │  │  /api/v1/node/*  │    │  signal (WebRTC) │           │
                        │  │  /api/v1/temp*   │    │  file_chunk      │           │
                        │  │  /api/v1/hand*   │    │  message (遗留)  │           │
                        │  │  /api/v1/friends │    │  presence 广播   │           │
                        │  │  /api/v1/file/*  │    │                  │           │
                        │  │  /health         │    │                  │           │
                        │  └────────┬─────────┘    └────────┬─────────┘           │
                        │           │                       │                      │
                        │  ┌────────▼───────────────────────▼─────────┐           │
                        │  │              中间件层                      │           │
                        │  │  helmet │ cors │ rate-limit │ json-parser │           │
                        │  └────────┬───────────────────────┬─────────┘           │
                        │           │                       │                      │
                        │  ┌────────▼───────────────────────▼─────────┐           │
                        │  │              服务层 (Services)            │           │
                        │  │                                        │           │
                        │  │  accountService    │ tempNumberService   │           │
                        │  │  verificationService│ handshakeService    │           │
                        │  │  friendshipService  │ fileTransferService │           │
                        │  │  p2pDiscoveryService│                    │           │
                        │  └────────┬───────────────────────┬─────────┘           │
                        │           │                       │                      │
                        │  ┌────────▼───────────────────────▼─────────┐           │
                        │  │            MemoryStore (内存存储)         │           │
                        │  │                                        │           │
                        │  │  nodes │ accounts │ sessions │ codes    │           │
                        │  │  tempNumbers │ handshakes │ fileTransfers│           │
                        │  │  pendingRequests │ verificationCodes   │           │
                        │  └────────────────────────────────────────┘           │
                        │                                                          │
                        │  ┌────────────────────────────────────────┐            │
                        │  │         @aicq/crypto (tweetnacl)       │            │
                        │  │  Ed25519 签名 │ X25519 密钥交换 │ NaCl  │            │
                        │  └────────────────────────────────────────┘            │
                        └──────────────────────────────────────────────────────────┘

                        ┌──────────────────────────────────────────────────────────┐
                        │           P2P 直连通道（握手成功后建立）                    │
                        │                                                          │
                        │   Client A ◄═════════ WebRTC DataChannel ═════════► Client B
                        │                                                          │
                        │   · 端到端加密（Noise 协议协商的共享密钥）                    │
                        │   · 消息不经过服务器中继                                     │
                        │   · 信令服务器仅用于初始连接建立                              │
                        └──────────────────────────────────────────────────────────┘
```

### 数据流说明

#### 握手流程（Noise-XK 三步）

```
  Client A (发起方)              Server (协调)              Client B (响应方)
       │                            │                            │
       │  1. POST /handshake/initiate│                            │
       │  ────────────────────────► │                            │
       │                            │                            │
       │  ◄──── sessionId ────────── │                            │
       │                            │                            │
       │  2. POST /handshake/respond│                            │
       │  ────────────────────────► │                            │
       │                            │                            │
       │                            │  (Client B 轮询或 WS 推送)    │
       │                            │                            │
       │                            │  3. POST /handshake/confirm │
       │                            │ ◄────────────────────────── │
       │                            │                            │
       │  ◄──── status: confirmed ── │                            │
       │                            │ ──── status: confirmed ──► │
       │                            │                            │
       │  ═══ WebRTC P2P 直连建立 ═══│═══ WebRTC P2P 直连建立 ════│
```

#### 消息流程（正常通信）

```
  Client A                      Server                     Client B
       │                          │                            │
       │  [P2P 直连已建立]         │   [P2P 直连已建立]           │
       │                          │                            │
       │ ═══ 加密消息直接发送 ══════════════════════════════════►│
       │  (不经过服务器)           │  (不经过服务器)              │
       │                          │                            │
       │                          │  ◄─── 仅用于信令/状态广播 ────│
```

#### 文件传输流程

```
  Client A (发送方)              Server                    Client B (接收方)
       │                          │                            │
       │  POST /file/initiate     │                            │
       │ ────────────────────────►│                            │
       │  ◄─── sessionId ──────── │                            │
       │                          │                            │
       │  (P2P 可用时)            │                            │
       │ ═══ WebRTC DataChannel ═══════════════════════════════►│
       │  分块发送 + 哈希校验      │                            │
       │                          │                            │
       │  (P2P 不可用时)          │                            │
       │  WS: file_chunk ────────►│─── WS: file_chunk ────────►│
       │  POST /file/:id/chunk ──►│    POST /file/:id/chunk ──►│
       │                          │                            │
       │  (断点续传)              │                            │
       │  GET /file/:id/missing ─►│    GET /file/:id/missing ─►│
```

---

## 19. 性能参考

以下数据基于测试环境的估算值，实际性能受服务器硬件、网络条件和负载类型影响。

### 内存使用

| 指标 | 估算值 |
|------|--------|
| Node.js 进程基础内存 | ~50 MB |
| 每个 WebSocket 连接增量 | ~10–30 KB |
| 1,000 并发连接总内存 | ~80–120 MB |
| 10,000 并发连接总内存 | ~200–500 MB |
| 50,000 并发连接总内存 | ~800 MB–1.5 GB |

### 连接容量

| 指标 | 估算值 |
|------|--------|
| WebSocket 最大并发连接（单进程） | ~50,000–100,000 |
| HTTP API 请求吞吐量 | ~5,000–10,000 req/s |
| WebSocket 消息转发延迟（P2P 信令） | < 5 ms |
| 文件分块中继吞吐量 | 受限于上行/下行带宽 |

### 不同规模的推荐配置

| 规模 | 并发用户 | CPU | 内存 | 磁盘 | 带宽 | 适用场景 |
|------|---------|-----|------|------|------|---------|
| **小型** | 100 | 1 核 | 512 MB | 10 GB | 10 Mbps | 个人/团队内部使用 |
| **中型** | 1,000 | 2 核 | 2 GB | 20 GB | 50 Mbps | 社区/小规模部署 |
| **大型** | 10,000 | 4 核 | 8 GB | 50 GB | 200 Mbps | 公开服务 |

### 性能优化建议

| 优化措施 | 说明 | 适用规模 |
|---------|------|---------|
| 启用 Nginx Gzip | 减少传输数据量 | 所有 |
| PM2 Cluster 模式 | 利用多核 CPU，`pm2 start -i max` | 中型及以上 |
| 连接心跳优化 | 调整 WebSocket ping/pong 间隔 | 中型及以上 |
| 速率限制调优 | 根据实际负载调整 `windowMs` 和 `max` | 所有 |
| 内存存储改为 Redis | 减少进程内存压力，支持分布式 | 大型 |
| 添加 Redis pub/sub | 支持多实例横向扩展 | 大型 |
| 日志异步写入 | 减少磁盘 I/O 阻塞 | 中型及以上 |
| CDN 加速静态文件 | 将 Web UI 静态资源卸载到 CDN | 中型及以上 |

### PM2 Cluster 模式示例

```bash
# 使用所有 CPU 核心启动集群模式
pm2 start dist/index.js -i max --name "aicq-server"

# 指定 4 个实例
pm2 start dist/index.js -i 4 --name "aicq-server"
```

> **注意**：Cluster 模式下，WebSocket 连接的 sticky session 需要通过 Nginx 的 `ip_hash` 配置来确保同一客户端始终连接到同一进程：

```nginx
upstream aicq_api {
    ip_hash;  # 确保 WebSocket 连接的会话亲和性
    server 127.0.0.1:3000;
}
```

---

## 附录

### A. 目录结构

```
aicq-server/
├── dist/                    # TypeScript 编译输出（运行时使用）
│   ├── index.js
│   ├── config.js
│   ├── api/
│   │   ├── authRoutes.js
│   │   ├── routes.js
│   │   └── wsHandler.js
│   ├── db/
│   │   └── memoryStore.js
│   ├── middleware/
│   │   └── rateLimit.js
│   ├── models/
│   │   └── types.js
│   └── services/
│       ├── accountService.js
│       ├── fileTransferService.js
│       ├── friendshipService.js
│       ├── handshakeService.js
│       ├── p2pDiscoveryService.js
│       ├── tempNumberService.js
│       └── verificationService.js
├── src/                     # TypeScript 源码
│   └── ... (同 dist/ 结构)
├── node_modules/            # 依赖包
├── package.json
├── tsconfig.json
├── .env                     # 环境配置（需手动创建）
└── DEPLOY.md                # 本文件
```

### B. 常用链接

| 资源 | 地址 |
|------|------|
| GitHub 仓库 | https://github.com/ctz168/aicq |
| Node.js 官网 | https://nodejs.org/ |
| PM2 文档 | https://pm2.keymetrics.io/ |
| Nginx 文档 | https://nginx.org/en/docs/ |
| Let's Encrypt | https://letsencrypt.org/ |
| Docker 文档 | https://docs.docker.com/ |
| ws (WebSocket) | https://github.com/websockets/ws |

### C. 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | — | 初始版本，支持认证、握手、P2P 信令、文件中继 |
