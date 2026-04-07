# AICQ Bug Tracker

> 最后更新: 2026-04-07 00:45 UTC+8
> 测试环境: Node.js v24.14.1, npm 11.11.0
> 测试分支: main (ctz168/aicq)

---

## 🔴 严重 (Critical)

### BUG-001: 服务器无 ClickHouse 时进程不稳定退出
- **模块**: server
- **位置**: `server/src/index.ts` → `startServer()`
- **描述**: 当 ClickHouse 不可用时，服务器虽然打印"running on port 61018"，但进程在几秒后无声退出。`ts-node-dev` 模式和 `node dist/index.js` 模式均有此问题。后台运行时（nohup/&）进程可能在无 ClickHouse 连接时无法保持存活，导致自动化测试难以可靠执行。
- **复现步骤**:
  1. 确保本地未运行 ClickHouse
  2. 启动 `npm run dev:server`
  3. 服务器打印启动成功日志
  4. 等待 5-10 秒后尝试连接 → 连接被拒绝
- **影响**: 开发者本地测试困难，CI/CD 环境中如未预装 ClickHouse 会导致测试失败
- **建议修复**: 在 ClickHouse 不可用时添加内存存储模式的降级处理，确保进程保持稳定；或使用 SQLite 作为本地开发的降级方案

### BUG-002: Node 注册接口缺少认证
- **模块**: server/api
- **位置**: `server/src/api/routes.ts` → `POST /node/register`
- **描述**: `/api/v1/node/register` 端点没有 `authenticateJWT` 中间件，任何人都可以注册节点并关联任意 publicKey，无需认证令牌。
- **复现步骤**:
  1. 不携带 Authorization header
  2. `POST /api/v1/node/register` `{"id":"malicious-node","publicKey":"fake-key"}`
  3. 返回 200 成功注册
- **影响**: 安全漏洞，攻击者可以伪造节点身份
- **建议修复**: 添加 `authenticateJWT` 中间件，验证注册者的身份

### BUG-003: WebSocket 连接缺少身份验证的错误处理不一致
- **模块**: server/api
- **位置**: `server/src/api/wsHandler.ts`
- **描述**: WebSocket 连接时发送 `{"type":"online","nodeId":"test-ws-node"}` 返回 `{"type":"error","error":"Missing nodeId or token"}`，但错误信息不够明确，没有指示需要哪种 token（JWT 或其他格式），也没有文档说明 WebSocket 认证协议。
- **影响**: 客户端开发者难以正确实现 WebSocket 认证
- **建议修复**: 提供更明确的错误消息和 WebSocket 认证文档

---

## 🟡 中等 (Medium)

### BUG-004: 验证码服务为开发模式桩函数，生产部署时无实际发送
- **模块**: server/services
- **位置**: `server/src/services/verificationService.ts` → `sendVerificationCode()`
- **描述**: 验证码只输出到 console.log，没有集成任何邮件/短信服务商。虽然代码中有 WARNING 注释，但缺少配置开关或环境变量来强制阻止生产环境使用此 stub。
- **影响**: 如果部署时忘记集成邮件/短信服务，用户将永远收不到验证码
- **建议修复**: 在生产模式下（NODE_ENV=production）检测到 stub 模式时拒绝启动或抛出警告

### BUG-005: README 文档中的 API 示例与实际实现不一致
- **模块**: docs
- **位置**: `README.md`
- **描述**: README 中注册接口示例为 `{"username":"...", "password":"...", "displayName":"..."}`，但实际实现要求 `{"target":"...", "type":"email/phone", "code":"...", "password":"...", "publicKey":"..."}`。登录接口也类似，README 使用 username/password，实际使用 target/type/password/code。注册需要先调用 send-code 获取验证码的流程在 README 中也未提及。
- **影响**: 新开发者按文档操作会频繁遇到 400 错误
- **建议修复**: 更新 README 中的 API 示例，添加完整的注册/登录流程说明

### BUG-006: Step-3.5-Flash 模型返回空内容
- **模块**: models
- **位置**: `openclaw.json` → models.providers.modelscope
- **描述**: 调用 ModelScope 的 `stepfun-ai/Step-3.5-Flash` 模型时，返回的 `content` 字段为空字符串，`finish_reason` 为 `length`（被截断），即使 `max_tokens=50` 也无法获得有效输出。
- **复现步骤**:
  ```bash
  curl -X POST "https://api-inference.modelscope.cn/v1/chat/completions" \
    -H "Authorization: Bearer ms-3eca52df-ea14-481b-9e72-73b988b612f7" \
    -d '{"model":"stepfun-ai/Step-3.5-Flash","messages":[{"role":"user","content":"Hello"}],"max_tokens":50}'
  ```
- **影响**: 使用 Step-3.5-Flash 模型的 Agent（如 Translator Agent）无法正常工作
- **建议修复**: 检查 API 兼容性或更换模型

### BUG-007: GLM-5 模型 reasoning_content 泄露到客户端
- **模块**: models
- **位置**: `openclaw.json` → models.providers.modelscope
- **描述**: GLM-5 模型返回的响应中包含 `reasoning_content` 字段（完整的思维链过程），这些内部推理过程被暴露给客户端。虽然 `content` 字段正常，但 `reasoning_content` 不应被传递到前端。
- **影响**: 泄露 AI 推理过程，影响用户体验和模型安全
- **建议修复**: 在 API 响应处理层过滤 `reasoning_content` 字段

### BUG-008: 群组创建需认证但缺少与账号的关联验证
- **模块**: server/api
- **位置**: `server/src/api/groupRoutes.ts`
- **描述**: 群组创建接口虽然需要 JWT 认证，但没有验证创建者身份（需要从 token 中提取 accountId），缺少对群组成员数的校验等业务逻辑验证。
- **建议修复**: 增加完整的业务验证逻辑

---

## 🟢 低优先级 (Low)

### BUG-009: package.json 版本号未更新
- **模块**: project config
- **位置**: `package.json`
- **描述**: 根目录 `package.json` 版本号仍为 `1.0.0`，但插件版本已到 `1.4.3`（`plugin/package.json`）。版本号不一致，影响发布流程。
- **建议修复**: 统一版本管理策略，使用 `release.sh` 脚本自动更新

### BUG-010: .env 中的 DATABASE_URL 未被使用
- **模块**: config
- **位置**: `.env`
- **描述**: `.env` 中配置了 `DATABASE_URL=file:/home/z/my-project/db/custom.db`，但项目实际使用 ClickHouse 作为数据库，此配置项未被任何代码引用。
- **建议修复**: 移除无效配置或添加文档说明

### BUG-011: 速率限制不区分路由
- **模块**: server/middleware
- **位置**: `server/src/middleware/rateLimit.ts`
- **描述**: 通用速率限制器 `generalLimiter` 应用于所有路由（包括 /health），导致高频健康检查可能触发 429 响应，影响监控系统。
- **复现步骤**: 连续请求 `/health` 110 次后返回 `429 Too Many Requests`
- **建议修复**: 将 `/health` 端点从速率限制中排除，或设置更高的阈值

### BUG-012: Domain 配置不跟随环境变量
- **模块**: server/config
- **位置**: `server/src/config.ts`
- **描述**: 即使在 `.env` 中设置 `DOMAIN=localhost`，health 接口返回的 `domain` 字段仍为 `aicq.online`，因为默认值 `process.env.DOMAIN || 'aicq.online'` 可能未正确读取环境变量（dotenv 加载顺序问题）。
- **建议修复**: 确保 dotenv 在 config 模块加载之前完成初始化

---

## ✅ 已验证通过的功能

| 功能 | 状态 | 备注 |
|------|------|------|
| Health Check | ✅ 通过 | `/health` 返回正确状态 |
| Admin 初始化 | ✅ 通过 | 首次初始化成功 |
| Admin 登录 | ✅ 通过 | JWT token 正确返回 |
| Admin 统计 | ✅ 通过 | 返回正确的零值统计 |
| Admin 服务状态 | ✅ 通过 | 包含 uptime、memory 等信息 |
| Admin 配置查询 | ✅ 通过 | 返回完整配置信息 |
| Admin 节点列表 | ✅ 通过 | 返回空列表 |
| Admin 账户列表 | ✅ 通过 | 返回空列表 |
| Admin 黑名单 | ✅ 通过 | 返回空列表 |
| 验证码发送 | ✅ 通过 | 正确生成6位验证码 |
| 速率限制 | ✅ 通过 | 429 正确触发 |
| JWT 认证 | ✅ 通过 | 无效 token 返回 401 |
| 缺失 token | ✅ 通过 | 返回"未提供认证令牌" |
| 404 处理 | ✅ 通过 | 返回"Not found" |
| WebSocket 连接 | ✅ 通过 | 可建立连接并接收消息 |
| GLM-5 API 调用 | ✅ 通过 | 正常返回内容 |
| Node 注册 | ✅ 通过（有安全问题） | 功能正常但缺少认证 |
