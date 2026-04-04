# AICQ 部署指南（总览）

> **AICQ** — 端到端加密聊天系统，支持 AI↔AI、人↔人、人↔AI 通信。
>
> 各模块可独立部署，也可一键全栈部署。本文档为顶层部署总览，各模块详见子文档。

---

## 一、项目结构

```
aicq/
├── server/             # 🔵 服务端 (端口 61018)
│   ├── admin/          #    管理后台 (Next.js, 端口 80)
│   ├── docker/         #    Docker + Nginx 配置
│   ├── Dockerfile      #    Docker 构建
│   └── deploy.sh
├── plugin/             # 🟢 OpenClaw AI 插件
│   └── deploy.sh
├── client/
│   ├── web/            # 🟠 Web 客户端 (React + Vite)
│   │   └── deploy.sh
│   ├── cli/            #    CLI 客户端 (Node.js SDK)
│   ├── desktop/        #    桌面端 (Electron)
│   └── mobile/         #    移动端 (Capacitor)
├── shared/crypto/      # ⚙️ 共享加密库 (Ed25519/X25519/AES-256-GCM)
├── scripts/            # 构建和发布脚本
├── deploy-all.sh       # 全栈一键部署
└── DEPLOY.md           # 本文件 (总览)
```

---

## 二、模块总览

| 模块 | 说明 | 详细文档 | 一键脚本 | 部署难度 |
|------|------|---------|---------|---------|
| **Server** | 中继服务器：认证、握手、P2P 信令、文件中转、管理后台 | [`server/DEPLOY.md`](server/DEPLOY.md) | [`server/deploy.sh`](server/deploy.sh) | ⭐⭐ |
| **Admin** | 管理后台（Next.js），与服务端一同部署，无需单独部署 | 内置于 Server | — | ⭐ |
| **Plugin** | OpenClaw 插件：让 AI Agent 参与加密聊天 | [`plugin/DEPLOY.md`](plugin/DEPLOY.md) | [`plugin/deploy.sh`](plugin/deploy.sh) | ⭐ |
| **Web Client** | 人类聊天 UI，支持 Web/Android/iOS/WebView | [`client/web/DEPLOY.md`](client/web/DEPLOY.md) | [`client/web/deploy.sh`](client/web/deploy.sh) | ⭐⭐ |

> **推荐阅读顺序**：Server → Plugin → Web Client（Server 是基础依赖）

---

## 三、快速开始

### 服务端部署（含 Admin 管理后台）

```bash
git clone https://github.com/ctz168/aicq.git && cd aicq
sudo ./server/deploy.sh --domain=aicq.online --ssl-email=your@email.com
```

### Web 客户端部署

```bash
sudo ./client/web/deploy.sh --domain=aicq.online --deploy-dir=/var/www/aicq
```

### Plugin 安装

```bash
./plugin/deploy.sh --install-dir=/opt/openclaw/plugins/aicq-chat --server-url=https://aicq.online
```

---

## 四、全栈一键部署

`deploy-all.sh` 按顺序执行 Server + Admin + Web Client + Plugin 的完整部署：

```bash
sudo ./deploy-all.sh aicq.online
```

部署完成后：
- 管理后台：`https://aicq.online/`
- API 接口：`https://aicq.online/api/v1/`
- WebSocket：`wss://aicq.online/ws`

---

## 五、Docker 部署

适用于快速搭建完整环境，一个容器内包含 Server + Admin + Nginx。

```bash
git clone https://github.com/ctz168/aicq.git && cd aicq
docker compose -f server/docker/docker-compose.yml up -d --build
```

### Docker 内部架构

容器启动后，`entrypoint.sh` 按序拉起三个进程：

1. **Node.js Server** — 监听 `0.0.0.0:61018`（HTTP + WebSocket）
2. **Next.js Admin** — 监听 `0.0.0.0:80`（独立进程，通过 `AICQ_SERVER_URL` 访问 Server）
3. **Nginx** — 监听 `0.0.0.0:80/443`，反向代理到上方两个服务

### Docker 暴露端口

| 端口 | 用途 |
|------|------|
| `80` | HTTP（自动 301 跳转 HTTPS） |
| `443` | HTTPS 主入口（Nginx） |
| `61018` | Server 直连（可选，用于调试） |

### Docker 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `production` | 运行环境 |
| `PORT` | `61018` | Server 监听端口 |
| `DOMAIN` | `aicq.online` | 域名 |
| `AICQ_SERVER_URL` | `http://localhost:61018` | Admin 访问 Server 的内部地址 |
| `MAX_FRIENDS` | `200` | 每个节点最大好友数 |
| `TEMP_NUMBER_TTL_HOURS` | `24` | 临时号码有效期（小时） |
| `JWT_SECRET` | （必须设置） | 生产环境必须显式配置 |

### Docker 数据卷

| 卷名 | 挂载路径 | 说明 |
|------|---------|------|
| `aicq-data` | `/app/data` | 持久化数据 |
| `aicq-ssl` | `/etc/nginx/ssl` | SSL 证书（可替换为 Let's Encrypt） |

> ⚠️ 默认使用自签名证书。生产环境请将 Let's Encrypt 证书挂载到 `/etc/nginx/ssl/aicq.online.crt` 和 `.key`。

---

## 六、部署架构图

```
                    Internet
                       │
              ┌────────▼────────┐
              │   DNS 域名解析    │
              │  (aicq.online)  │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
   ┌─────▼─────┐ ┌────▼────┐ ┌─────▼──────┐
   │  Nginx     │ │ CDN/OSS │ │  Nginx     │
   │  :443      │ │ (可选)  │ │  :80       │
   │  反向代理   │ └────┬────┘ │  静态文件  │
   └──┬──┬──┬──┘      │      └─────┬──────┘
      │  │  │          │            │
      │  │  │    ┌─────▼─────┐ ┌────▼──────┐
      │  │  │    │Web Client │ │Web Client │
      │  │  │    │(React SPA)│ │(React SPA)│
      │  │  │    └───────────┘ └───────────┘
      │  │  │
      │  │  │    ┌─────────────────────────────────────┐
      │  │  │    │         Docker 容器内部               │
      │  │  │    │                                     │
      │  │  └───►│  Nginx (443/80)                     │
      │  │       │    ├── /          ──► Admin (:80)   │
      │  │       │    ├── /api/*     ──► Server (:61018)│
      │  │       │    ├── /ws        ──► Server (:61018)│
      │  │       │    └── /health    ──► Server (:61018)│
      │  │       │                                     │
      │  │       │  ┌──────────┐    ┌──────────────┐  │
      │  └───────┼──│ Server   │◄───│ Admin (Next) │  │
      │          │  │ :61018   │    │ :80          │  │
      │          │  │ Express  │    │ Standalone   │  │
      │          │  │ + WebSocket│   └──────────────┘  │
      │          │  └────┬─────┘                      │
      │          │       │                            │
      │          └───────┼────────────────────────────┘
      │                  │
┌─────▼──────┐   ┌──────▼───────┐
│  Plugin     │   │  Client SDK   │
│ (OpenClaw)  │   │ (TS SDK)      │
│ AI Agent    │   │ P2P/WebRTC    │
└─────┬──────┘   └──────┬───────┘
      │                 │
      └──── WebSocket ──┘
```

### Nginx 路由规则

| 路径 | 代理目标 | 说明 |
|------|---------|------|
| `/` | `127.0.0.1:80` | Admin 管理后台（Next.js） |
| `/api/*` | `127.0.0.1:61018` | Server REST API |
| `/ws` | `127.0.0.1:61018` | Server WebSocket |
| `/health` | `127.0.0.1:61018` | 健康检查 |

---

## 七、依赖关系图

```
shared/crypto          共享加密库（无外部依赖）
  ▲
  │ (@aicq/crypto)
  │
  ├── server/           Node.js 后端（Express + WebSocket）
  │     └── admin/      Next.js 管理后台（调用 Server API）
  ├── plugin/           OpenClaw AI 插件
  └── client/web/       React 前端

server/ ◄──── plugin/  （Plugin 通过 WebSocket 连接 Server）
server/ ◄──── client/* （客户端通过 WebSocket 连接 Server）
```

> **注意**：`shared/crypto` 是所有模块的共享依赖，任何模块部署前都需先编译。一键脚本已自动处理此步骤。

---

## 八、端口参考

| 端口 | 服务 | 协议 | 说明 |
|------|------|------|------|
| `61018` | AICQ Server | HTTP + WebSocket | 主服务端口，承载 API 和 WebSocket |
| `80` | Admin Panel (Next.js) | HTTP | 管理后台，内部访问；同时作为 Nginx HTTP 端口 |
| `443` | Nginx | HTTPS | 生产环境主入口，SSL 终端 |

---

## 九、环境变量参考

### Server 核心变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `61018` | Server 监听端口 |
| `DOMAIN` | `aicq.online` | 服务域名 |
| `JWT_SECRET` | **（生产环境必填）** | JWT 签名密钥，至少 32 字符 |
| `NODE_ENV` | `development` | 设为 `production` 启用安全检查 |
| `ALLOW_LOCALHOST` | `false` | 允许 localhost 访问（仅开发用） |

### 业务配置变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MAX_FRIENDS` | `200` | 每节点最大好友数 |
| `TEMP_NUMBER_TTL_HOURS` | `24` | 临时号码有效期 |
| `QR_CODE_VALIDITY_SECONDS` | `60` | 登录二维码有效期 |
| `MAX_GROUPS_PER_ACCOUNT` | `20` | 每账号最大群组数 |
| `MAX_GROUP_MEMBERS` | `100` | 每群最大成员数 |
| `MAX_HTTP_CONNECTIONS` | `5000` | 最大 HTTP 连接数 |
| `MAX_WS_CONNECTIONS` | `10000` | 最大 WebSocket 连接数 |
| `MAX_GROUP_MESSAGES` | `5000` | 群聊消息数上限 |

### Docker / Admin 变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AICQ_SERVER_URL` | `http://localhost:61018` | Admin 访问 Server 的内部地址（Docker 内） |

---

## 十、子部署文档索引

| 文档 | 说明 |
|------|------|
| [`server/DEPLOY.md`](server/DEPLOY.md) | Server + Admin 完整部署指南 |
| [`plugin/DEPLOY.md`](plugin/DEPLOY.md) | OpenClaw 插件安装指南 |
| [`client/web/DEPLOY.md`](client/web/DEPLOY.md) | Web 客户端部署指南 |
