# AICQ 开发任务追踪

> 实时更新进度 · 最后更新: 2026-04-03

## 项目信息

- 项目名称: **aicq** (AI Chat with Quality)
- 服务器域名: **aicq.online**
- Git: GitHub
- 通讯类型: 文本聊天 + 文件传输(断点续传)

---

## 总进度

| 模块 | 进度 | 状态 |
|------|------|------|
| aicq-crypto (共享加密库) | ████████████████████ 100% | ✅ 已完成 |
| aicq-server (服务端) | ████████████████████ 100% | ✅ 已完成 |
| aicq-plugin (OpenClaw插件) | ████████████████████ 100% | ✅ 已完成 |
| aicq-client (客户端) | ████████████████████ 100% | ✅ 已完成 |
| 根目录配置 | ████████████████████ 100% | ✅ 已完成 |
| Git推送 | ████████████████████ 100% | ✅ 已完成 |
| 联调测试 | ░░░░░░░░░░░░░░░░░░░░ 0% | ⏳ 待开始 |
| 多端打包(APK/iOS/WebView) | ░░░░░░░░░░░░░░░░░░░░ 0% | ⏳ 待开始 |

---

## 详细任务清单

### 一、aicq-crypto 共享加密库 ✅

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 1.1 | 项目配置 (package.json, tsconfig.json) | ✅ 完成 | |
| 1.2 | nacl.ts - tweetnacl 工具封装 | ✅ 完成 | UTF8/Base64编解码 |
| 1.3 | types.ts - 类型定义 | ✅ 完成 | KeyPair, HandshakeRequest等 |
| 1.4 | keygen.ts - 密钥生成 | ✅ 完成 | Ed25519签名 + X25519交换 |
| 1.5 | signer.ts - 签名验签 | ✅ 完成 | Ed25519 detached签名 |
| 1.6 | keyExchange.ts - 密钥交换 | ✅ 完成 | X25519 ECDH + HKDF |
| 1.7 | cipher.ts - 对称加密 | ✅ 完成 | XSalsa20-Poly1305 |
| 1.8 | message.ts - 消息加解密 | ✅ 完成 | 二进制格式打包/解包 |
| 1.9 | password.ts - 密码加密 | ✅ 完成 | PBKDF2-like + secretbox |
| 1.10 | handshake.ts - 握手协议 | ✅ 完成 | 3-way Noise-XK握手 |
| 1.11 | index.ts - 统一导出 | ✅ 完成 | |
| 1.12 | 编译通过 | ✅ 完成 | 10个模块, 0错误 |

### 二、aicq-server 服务端框架 ✅

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 2.1 | 项目配置 | ✅ 完成 | Express + ws + helmet |
| 2.2 | config.ts - 配置加载 | ✅ 完成 | PORT=3000, DOMAIN=aicq.online |
| 2.3 | models/types.ts - 数据模型 | ✅ 完成 | 5个接口 + 1个枚举 |
| 2.4 | db/memoryStore.ts - 内存存储 | ✅ 完成 | 可替换为Redis |
| 2.5 | services/tempNumberService.ts | ✅ 完成 | 6位号码, 24h有效, 不限使用次数 |
| 2.6 | services/handshakeService.ts | ✅ 完成 | 3阶段握手, 好友上限200 |
| 2.7 | services/friendshipService.ts | ✅ 完成 | 双向好友, 200人上限 |
| 2.8 | services/p2pDiscoveryService.ts | ✅ 完成 | STUN/TURN/WebRTC信令中继 |
| 2.9 | services/fileTransferService.ts | ✅ 完成 | 分块追踪, 断点续传支持 |
| 2.10 | api/routes.ts - REST API | ✅ 完成 | 14个端点 |
| 2.11 | api/wsHandler.ts - WebSocket | ✅ 完成 | 信号/在线/消息/文件块 |
| 2.12 | middleware/rateLimit.ts | ✅ 完成 | 3级限流 |
| 2.13 | index.ts - 启动入口 | ✅ 完成 | HTTP+WS, 优雅关闭 |
| 2.14 | .env.example | ✅ 完成 | |
| 2.15 | 编译通过 | ✅ 完成 | 0错误 |

### 三、aicq-plugin OpenClaw插件 ✅

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 3.1 | 项目配置 | ✅ 完成 | 依赖@aicq/crypto |
| 3.2 | openclaw.plugin.json 清单 | ✅ 完成 | Channel/Tool/Hook/Service声明 |
| 3.3 | types.ts - 类型定义 | ✅ 完成 | 18个接口 |
| 3.4 | config.ts - 配置加载 | ✅ 完成 | |
| 3.5 | store.ts - 状态管理 | ✅ 完成 | JSON持久化 |
| 3.6 | services/identityService.ts | ✅ 完成 | 密钥管理 + QR导出 |
| 3.7 | services/serverClient.ts | ✅ 完成 | REST + WebSocket |
| 3.8 | channels/encryptedChat.ts | ✅ 完成 | 加解密 + 签名验证 |
| 3.9 | tools/chatFriend.ts | ✅ 完成 | 添加/列表/删除/临时号 |
| 3.10 | tools/chatSend.ts | ✅ 完成 | 文本 + 文件信息消息 |
| 3.11 | tools/chatExportKey.ts | ✅ 完成 | QR私钥导出 |
| 3.12 | hooks/messageSending.ts | ✅ 完成 | 消息发送拦截加密 |
| 3.13 | hooks/beforeToolCall.ts | ✅ 完成 | 权限校验 |
| 3.14 | handshake/handshakeManager.ts | ✅ 完成 | Noise-XK握手 + 会话轮换 |
| 3.15 | p2p/connectionManager.ts | ✅ 完成 | P2P连接管理 |
| 3.16 | fileTransfer/transferManager.ts | ✅ 完成 | 文件分块 + 暂停/恢复 |
| 3.17 | index.ts - 插件入口 | ✅ 完成 | activate/deactivate |
| 3.18 | 编译通过 | ✅ 完成 | 18个模块, 0错误 |

### 四、aicq-client 客户端框架 ✅

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 4.1 | 项目配置 | ✅ 完成 | 依赖@aicq/crypto |
| 4.2 | types.ts - 类型定义 | ✅ 完成 | 7个接口 |
| 4.3 | config.ts - 配置加载 | ✅ 完成 | |
| 4.4 | store.ts - 持久化存储 | ✅ 完成 | JSON文件存储 |
| 4.5 | services/apiClient.ts | ✅ 完成 | 完整REST客户端 |
| 4.6 | services/wsClient.ts | ✅ 完成 | 自动重连 + 心跳 |
| 4.7 | services/identityManager.ts | ✅ 完成 | 密钥 + QR(60s) |
| 4.8 | handshake/handshakeHandler.ts | ✅ 完成 | 3步握手 |
| 4.9 | chat/chatManager.ts | ✅ 完成 | 消息加解密 + 历史 |
| 4.10 | p2p/p2pClient.ts | ✅ 完成 | WS中继P2P |
| 4.11 | fileTransfer/fileManager.ts | ✅ 完成 | 64KB分块 + 断点续传 |
| 4.12 | components/tempNumberManager.ts | ✅ 完成 | 6位号 + QR生成 |
| 4.13 | components/friendManager.ts | ✅ 完成 | 好友CRUD |
| 4.14 | index.ts - AICQClient入口 | ✅ 完成 | 统一门面 |
| 4.15 | 编译通过 | ✅ 完成 | 15个模块, 0错误 |

### 五、Git推送 ✅

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 5.1 | Git初始化 | ✅ 完成 | |
| 5.2 | 首次提交 | ✅ 完成 | |
| 5.3 | 推送到GitHub | ✅ 完成 | github.com/aicq-pro/aicq |

### 六、待办事项 ⏳

| # | 任务 | 状态 | 优先级 | 备注 |
|---|------|------|--------|------|
| 6.1 | aicq-crypto + server 联调 | ⏳ 待开始 | P0 | 验证握手流程 |
| 6.2 | aicq-plugin + server 联调 | ⏳ 待开始 | P0 | 验证消息收发 |
| 6.3 | aicq-client + server 联调 | ⏳ 待开始 | P0 | 验证完整流程 |
| 6.4 | 文件传输断点续传测试 | ⏳ 待开始 | P1 | 模拟断电场景 |
| 6.5 | 二维码生成/扫描测试 | ⏳ 待开始 | P1 | |
| 6.6 | React Native UI层 | ⏳ 待开始 | P2 | 聊天/好友/设置界面 |
| 6.7 | APK打包 | ⏳ 待开始 | P2 | Capacitor |
| 6.8 | iOS打包 | ⏳ 待开始 | P2 | Capacitor |
| 6.9 | WebView打包 | ⏳ 待开始 | P2 | |
| 6.10 | 安全审计 | ⏳ 待开始 | P1 | |
| 6.11 | 性能优化 | ⏳ 待开始 | P3 | |
| 6.12 | 部署aicq.online | ⏳ 待开始 | P1 | Docker + Nginx |

---

## 文件统计

```
aicq-crypto/   : 12 源文件,  10 编译模块
aicq-server/   : 15 源文件,  13 编译模块
aicq-plugin/   : 18 源文件,  18 编译模块
aicq-client/   : 14 源文件,  15 编译模块
────────────────────────────────────
总计           : 59 源文件,  56 编译模块
```
