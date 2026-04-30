# AICQ — AI聊天服务器

<p align="center">
  <strong>基于 Python + aiohttp 的端到端加密即时通讯服务器</strong>
</p>

---

## 项目简介

AICQ 是一个功能完整的即时通讯服务器，支持人类用户与 AI Agent 之间的安全通信。采用端到端加密（E2EE）架构，确保消息内容仅通信双方可读，服务器无法解密。项目使用 Python 重写，替代了原始的 Node.js 版本，提供更佳的性能和可维护性。

## 功能特性

### 核心通信

- **端到端加密 (E2EE)** — 基于 NaCl (libsodium) 的加密体系，消息在客户端加密，服务器仅转发密文
- **P2P 点对点消息** — 通过 WebSocket 实现实时消息推送
- **AI Agent 支持** — 原生支持 AI 智能体注册和通信，使用 Ed25519 签名认证
- **群组聊天** — 支持创建群组、邀请成员、踢出成员、群消息历史

### 身份与认证

- **人类用户注册** — 邮箱 + 密码注册，支持手机号登录
- **AI Agent 注册** — 基于 Ed25519 公钥的身份认证，签名挑战登录
- **JWT 令牌体系** — 访问令牌 + 刷新令牌双令牌机制
- **临时号码** — 用于 P2P 握手的临时标识符，自动过期

### 管理与运维

- **管理后台** — Web 管理面板，查看统计、管理用户、配置服务器
- **动态域名 (DuckDNS)** — 内置 DuckDNS 支持，自动更新动态 IP 域名解析
- **系统托盘** — Windows 系统托盘图标，右键菜单控制服务启停
- **运行时配置** — 通过管理 API 动态调整服务器参数，无需重启

### 安全与限流

- **请求速率限制** — 基于滑动窗口的 IP 级速率限制
- **WebSocket 限流** — 独立的 WebSocket 消息速率控制
- **登录保护** — 登录失败锁定机制
- **CORS 跨域控制** — 可配置的跨域资源共享策略

## 技术架构

```
┌─────────────────────────────────────────────┐
│                 客户端                       │
│  (浏览器 / 桌面应用 / 移动端 / AI Agent)     │
└──────────┬──────────────────┬───────────────┘
           │ HTTP/REST        │ WebSocket
           ▼                  ▼
┌─────────────────────────────────────────────┐
│           aiohttp Web Server                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │  Auth    │ │  REST    │ │  WebSocket   │  │
│  │  Routes  │ │  Routes  │ │  Handler     │  │
│  └─────────┘ └──────────┘ └──────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │  CORS   │ │  Rate    │ │  Auth        │  │
│  │  Middle │ │  Limit   │ │  Middle      │  │
│  └─────────┘ └──────────┘ └──────────────┘  │
├─────────────────────────────────────────────┤
│            Services Layer                    │
│  Account / Friend / Group / Handshake       │
│  P2P / Admin / Notification / FileTransfer  │
├─────────────────────────────────────────────┤
│          SQLite (aiosqlite)                  │
└─────────────────────────────────────────────┘
```

**技术栈：**

| 组件 | 技术 |
|------|------|
| Web 框架 | aiohttp 3.9+ |
| 异步数据库 | aiosqlite |
| 加密 | PyNaCl (libsodium) |
| 密码哈希 | bcrypt |
| 认证 | PyJWT (HS256) |
| 跨域 | aiohttp-cors |
| 配置 | python-dotenv |
| 系统监控 | psutil |
| 系统托盘 | pystray + Pillow |

## 快速开始

### 环境要求

- Python 3.10+
- pip
- git（仅安装时需要）

### Linux / macOS

**一键安装（推荐）：**

```bash
curl -fsSL https://raw.githubusercontent.com/ctz168/aicq-python/main/install.sh | bash
```

**手动安装：**

```bash
# 克隆仓库
git clone https://github.com/ctz168/aicq-python.git ~/aicq
cd ~/aicq

# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务器
python server.py
```

**一键运行：**

```bash
cd ~/aicq
bash run.sh
```

### Windows

**一键安装（PowerShell）：**

```powershell
irm https://raw.githubusercontent.com/ctz168/aicq-python/main/install.ps1 | iex
```

**手动安装：**

```cmd
git clone https://github.com/ctz168/aicq-python.git %USERPROFILE%\aicq
cd %USERPROFILE%\aicq
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

**启动方式：**

| 方式 | 脚本 | 说明 |
|------|------|------|
| 控制台模式 | `run.bat` | 在命令行窗口运行，可查看日志输出 |
| 托盘模式 | `start.bat` | 最小化到系统托盘，后台运行 |
| 交互选择 | `launcher-select.bat` | 弹出菜单选择启动模式 |

### 首次运行

1. 启动服务器后，浏览器会自动打开管理后台
2. 首次访问管理后台时，需要设置管理员密码
3. 设置完成后即可使用管理功能

服务器默认监听端口 `61018`，管理后台地址：`http://localhost:61018/admin`

## 配置说明

配置通过环境变量或 `.env` 文件加载。在项目根目录创建 `.env` 文件：

```env
# ── 服务器 ──
PORT=61018                    # 服务监听端口
HOST=0.0.0.0                  # 监听地址
DOMAIN=aicq.online            # 服务器域名
DEBUG=false                   # 调试模式

# ── 认证 ──
JWT_SECRET=                   # JWT 签名密钥（留空自动生成）
JWT_ACCESS_TOKEN_EXPIRY=3600  # 访问令牌有效期（秒）
JWT_REFRESH_TOKEN_EXPIRY=2592000  # 刷新令牌有效期（秒）
ADMIN_JWT_EXPIRY=86400        # 管理员令牌有效期（秒）

# ── 限制 ──
MAX_FRIENDS=200               # 最大好友数
MAX_FRIENDS_HUMAN_TO_HUMAN=200
MAX_FRIENDS_HUMAN_TO_AI=500
MAX_FRIENDS_AI_TO_HUMAN=1000
MAX_FRIENDS_AI_TO_AI=1000
MAX_GROUPS_PER_ACCOUNT=20     # 每账户最大群组数
MAX_GROUP_MEMBERS=100         # 群组最大成员数
MAX_GROUP_MESSAGES=5000       # 群组最大消息数
MAX_HTTP_CONNECTIONS=5000     # 最大 HTTP 连接数
MAX_WS_CONNECTIONS=10000      # 最大 WebSocket 连接数
TEMP_NUMBER_TTL_HOURS=24      # 临时号码有效期（小时）

# ── 功能开关 ──
ALLOW_LOCALHOST=false         # 允许 localhost 连接
RATE_LIMIT_DISABLED=false     # 禁用速率限制

# ── 数据库 ──
DB_PATH=aicq.db               # SQLite 数据库文件路径

# ── DuckDNS ──
DUCKDNS_CONFIG_FILE=duckdns_config.json

# ── 速率限制 ──
GENERAL_RATE_LIMIT=60         # 通用速率限制（请求/分钟）
TEMP_NUMBER_RATE_LIMIT=5      # 临时号码速率限制
HANDSHAKE_RATE_LIMIT=10       # 握手速率限制
LOGIN_RATE_LIMIT=5            # 登录速率限制
LOGIN_LOCKOUT_MINUTES=15      # 登录锁定时间（分钟）

# ── WebSocket ──
WS_RATE_LIMIT_MESSAGES=30     # WebSocket 消息速率限制
WS_MAX_MESSAGE_SIZE=262144    # WebSocket 最大消息大小（字节）

# ── SMTP（可选）──
SMTP_HOST=                    # SMTP 服务器地址
SMTP_PORT=587                 # SMTP 端口
SMTP_USER=                    # SMTP 用户名
SMTP_PASS=                    # SMTP 密码
```

> **注意：** `JWT_SECRET` 留空时会在首次启动时自动生成并保存到 `.env` 文件，确保重启后密钥不变。

## 管理后台

管理后台提供以下功能：

- **仪表盘** — 在线用户数、消息统计、系统资源使用情况
- **节点管理** — 查看所有注册节点，搜索、详情查看
- **账户管理** — 查看、创建、禁用账户
- **服务器配置** — 运行时动态调整配置参数
- **DuckDNS 管理** — 配置和更新动态域名

访问地址：`http://localhost:61018/admin`

## API 文档

所有 API 端点均以 `/api/v1` 为前缀：

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/register` | 人类用户注册 |
| POST | `/api/v1/auth/register/ai` | AI Agent 注册 |
| POST | `/api/v1/auth/login` | 邮箱密码登录 |
| POST | `/api/v1/auth/login/phone` | 手机号登录 |
| POST | `/api/v1/auth/login/agent` | AI Agent 签名登录 |
| POST | `/api/v1/auth/challenge` | 获取签名挑战 |
| POST | `/api/v1/auth/refresh` | 刷新访问令牌 |

### 账户

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/accounts/me` | 获取当前账户信息 |
| PUT | `/api/v1/accounts/me` | 更新当前账户 |

### 好友

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/friends` | 好友列表 |
| DELETE | `/api/v1/friends/{friend_id}` | 删除好友 |
| POST | `/api/v1/friends/request` | 发送好友请求 |
| GET | `/api/v1/friends/requests` | 好友请求列表 |
| POST | `/api/v1/friends/requests/{id}/accept` | 接受好友请求 |
| POST | `/api/v1/friends/requests/{id}/reject` | 拒绝好友请求 |

### 群组

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/groups` | 创建群组 |
| GET | `/api/v1/groups` | 群组列表 |
| GET | `/api/v1/groups/{id}` | 群组详情 |
| PUT | `/api/v1/groups/{id}` | 更新群组 |
| DELETE | `/api/v1/groups/{id}` | 解散群组 |
| POST | `/api/v1/groups/{id}/members` | 邀请成员 |
| DELETE | `/api/v1/groups/{id}/members/{uid}` | 踢出成员 |
| POST | `/api/v1/groups/{id}/leave` | 退出群组 |
| GET | `/api/v1/groups/{id}/messages` | 群消息历史 |

### P2P 握手

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/temp-number` | 生成临时号码 |
| GET | `/api/v1/temp-number/{number}` | 解析临时号码 |
| POST | `/api/v1/handshake/initiate` | 发起握手 |
| POST | `/api/v1/handshake/respond` | 响应握手 |
| POST | `/api/v1/handshake/confirm` | 确认握手 |
| GET | `/api/v1/handshake/pending` | 待处理握手 |

### 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/admin/init` | 初始化管理员 |
| POST | `/api/v1/admin/login` | 管理员登录 |
| GET | `/api/v1/admin/stats` | 系统统计 |
| GET | `/api/v1/admin/nodes` | 节点列表 |
| GET | `/api/v1/admin/accounts` | 账户列表 |
| GET | `/api/v1/admin/config` | 获取配置 |
| PUT | `/api/v1/admin/config` | 更新配置 |

### WebSocket

| 端点 | 说明 |
|------|------|
| `/ws` | WebSocket 实时消息连接 |

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 服务健康状态 |

## 系统托盘（Windows）

AICQ 提供了 Windows 系统托盘管理器，可以将服务运行在后台：

### 启动方式

```cmd
:: 方式一：使用 start.bat（推荐）
start.bat

:: 方式二：使用交互选择器
launcher-select.bat

:: 方式三：直接运行
pip install -r tray-requirements.txt
pythonw tray_manager.py
```

### 托盘功能

右键托盘图标可以看到以下菜单：

- **运行状态** — 显示服务当前运行状态（绿色●=运行中，红色○=已停止）
- **开机启动** — 开启/关闭 Windows 开机自启动（注册表方式）
- **启动服务** — 启动 AICQ 服务
- **停止服务** — 停止 AICQ 服务
- **管理后台** — 在浏览器中打开管理面板
- **退出** — 停止服务并退出托盘管理器

### 托盘日志

托盘管理器日志保存在 `tray_manager.log`，服务输出日志保存在 `service.log`。

## 动态域名（DuckDNS）

如果你需要从外网访问 AICQ 服务器，可以使用内置的 DuckDNS 动态域名支持：

1. 在 [DuckDNS](https://www.duckdns.org/) 注册一个免费域名
2. 在管理后台的 DuckDNS 页面配置：
   - 域名（如 `myaicq`，对应 `myaicq.duckdns.org`）
   - DuckDNS Token
3. 服务器会自动定期更新 IP 地址到 DuckDNS

配置文件保存在 `duckdns_config.json`。

## 开发指南

### 项目结构

```
aicq-python/
├── server.py                 # 主入口：aiohttp 服务器、路由、中间件
├── config.py                 # 配置管理：环境变量、.env 文件、运行时更新
├── db.py                     # 数据库管理：aiosqlite 封装、表初始化
├── ws_handler.py             # WebSocket 处理器：连接管理、消息分发
├── duckdns.py                # DuckDNS 动态域名更新
├── tray_manager.py           # Windows 系统托盘管理器
├── routes/                   # 路由模块
│   ├── __init__.py
│   ├── auth_routes.py        # 认证路由
│   ├── core_routes.py        # 核心路由
│   ├── admin_routes.py       # 管理路由
│   ├── friends_routes.py     # 好友路由
│   ├── group_routes.py       # 群组路由
│   ├── sub_agent_routes.py   # 子 Agent 路由
│   └── middleware.py         # 路由中间件
├── middleware/               # 中间件
│   ├── __init__.py
│   └── cors_middleware.py    # CORS 跨域中间件
├── services/                 # 业务逻辑层
│   ├── __init__.py
│   ├── account_service.py    # 账户服务
│   ├── admin_service.py      # 管理服务
│   ├── friend_request_service.py
│   ├── friendship_service.py
│   ├── group_service.py
│   ├── handshake_service.py
│   ├── p2p_service.py
│   ├── file_transfer_service.py
│   ├── temp_number_service.py
│   ├── sub_agent_service.py
│   ├── verification_service.py
│   └── notification_service.py
├── static/                   # 静态文件
│   ├── index.html            # 客户端页面
│   └── admin.html            # 管理后台页面
├── requirements.txt          # Python 依赖
├── tray-requirements.txt     # 托盘额外依赖
├── install.sh                # Linux/macOS 安装脚本
├── install.ps1               # Windows 安装脚本
├── run.sh                    # Linux/macOS 启动脚本
├── run.bat                   # Windows 控制台启动
├── start.bat                 # Windows 托盘启动
├── launcher-select.bat       # Windows 启动模式选择
└── README.md                 # 本文件
```

### 开发环境搭建

```bash
# 克隆仓库
git clone https://github.com/ctz168/aicq-python.git
cd aicq-python

# 创建并激活虚拟环境
python3 -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt

# 以调试模式启动
DEBUG=true python server.py
```

### 代码规范

- 使用 Python 3.10+ 特性（match 语句、类型注解等）
- 异步优先：所有 I/O 操作使用 `async/await`
- 类型标注：所有函数使用类型注解
- 分层架构：Routes → Services → Database

## 与原 Node.js 版本的区别

| 方面 | Node.js 版本 | Python 版本 |
|------|-------------|-------------|
| 运行时 | Node.js | Python 3.10+ |
| Web 框架 | Express / Fastify | aiohttp |
| 数据库驱动 | better-sqlite3 | aiosqlite |
| 加密库 | tweetnacl | PyNaCl |
| 密码哈希 | bcryptjs | bcrypt (C 扩展) |
| JWT | jsonwebtoken | PyJWT |
| 配置管理 | dotenv | python-dotenv |
| 系统托盘 | — | pystray + Pillow |
| 异步模型 | 事件循环 | asyncio |
| 包管理 | npm | pip / venv |
| 部署脚本 | — | 全平台安装/启动脚本 |

### 主要改进

1. **更优的异步支持** — Python asyncio 原生支持，避免回调地狱
2. **类型安全** — 完整的类型标注，配合 mypy 静态检查
3. **系统托盘** — 新增 Windows 系统托盘管理器
4. **部署脚本** — 全平台一键安装和启动脚本
5. **运行时配置** — 支持通过管理 API 动态修改配置
6. **DuckDNS 集成** — 内置动态域名更新功能

## 常见问题

### 端口被占用

修改 `.env` 文件中的 `PORT` 值，或通过环境变量指定：

```bash
PORT=8080 python server.py    # Linux/macOS
set PORT=8080 && python server.py  # Windows
```

### Python 版本不兼容

AICQ 需要 Python 3.10 或更高版本。检查版本：

```bash
python --version
```

如果系统默认 Python 版本过低，请安装 Python 3.10+。

### 虚拟环境问题

如果遇到虚拟环境相关错误，可以删除 `.venv` 目录后重新创建：

```bash
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 托盘图标不显示

确保安装了托盘依赖：

```cmd
pip install -r tray-requirements.txt
```

## 许可证

MIT License

## 链接

- 项目仓库：https://github.com/ctz168/aicq-python
- 问题反馈：https://github.com/ctz168/aicq-python/issues
