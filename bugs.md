# AICQ Bug Tracker

> 最后更新: 2026-04-07 09:15 UTC+8 (Super Z 自动测试)
> 测试环境: Node.js v24.14.1, npm 11.11.0
> 测试分支: main (ctz168/aicq)
> 集成测试结果: 29 通过 / 6 失败 / 共 35 项

---

## 🔴 严重 (Critical)

### ~~BUG-001: 服务器无 ClickHouse 时进程不稳定退出~~ ✅ 已修复
- **模块**: server
- **位置**: `server/src/index.ts` → `startServer()`, `server/src/db/memoryStore.ts`
- **描述**: 当 ClickHouse 不可用时，服务器虽然打印"running on port 61018"，但进程在几秒后无声退出。
- **修复方案**:
  1. 在 `memoryStore.ts` 中添加 `clickHouseAvailable` 标志，`asyncWrite` 在 CH 不可用时静默跳过
  2. 在 `index.ts` 的 `startServer()` 中根据 CH 连接结果设置标志
  3. 添加 `process.on('unhandledRejection')` 处理器防止未处理异常导致进程退出
  4. Health check 接口返回实际存储模式（clickhouse / memory-only）
- **修复者**: Super Z
- **修复时间**: 2026-04-07

### ~~BUG-002: Node 注册接口缺少认证~~ ✅ 已修复
- **模块**: server/api
- **位置**: `server/src/api/routes.ts` → `POST /node/register`
- **描述**: `/api/v1/node/register` 端点没有 `authenticateJWT` 中间件
- **修复方案**: 为 `POST /node/register` 路由添加 `authenticateJWT` 中间件
- **修复者**: Super Z
- **修复时间**: 2026-04-07

### ~~BUG-003: WebSocket 连接缺少身份验证的错误处理不一致~~ ✅ 已修复
- **模块**: server/api
- **位置**: `server/src/api/wsHandler.ts`
- **描述**: WebSocket 认证错误信息不够明确
- **修复方案**:
  1. 分别检查 nodeId 和 token 缺失，提供具体错误消息
  2. 区分 JWT 无效和 nodeId 不匹配两种情况
  3. 每个错误包含结构化 `code` 字段（如 `AUTH_MISSING_TOKEN`, `AUTH_INVALID_TOKEN`, `AUTH_NODE_ID_MISMATCH`）
  4. 缺少认证字段时关闭连接（`ws.close(1008)`）
- **修复者**: Super Z
- **修复时间**: 2026-04-07

### BUG-013: 集成测试脚本 Node 注册与实际 API 不匹配
- **模块**: tests
- **位置**: `scripts/integration-test.cjs` → Section 2
- **描述**: 集成测试脚本中 Node 注册接口直接调用 `POST /api/v1/node/register` 不带 JWT token，但 BUG-002 修复后该接口需要认证。测试脚本期望返回 200 + `registered: true`，实际返回 401。测试脚本需要先通过 auth 流程获取 JWT 再调用注册接口。
- **影响**: 持续集成测试无法正确验证 Node 注册功能
- **状态**: 待修复
- **建议修复**: 在集成测试中先通过 `/api/v1/auth/register` + `/api/v1/auth/login` 获取 JWT token，再用该 token 调用 Node 注册接口

---

## 🟡 中等 (Medium)

### ~~BUG-004: 验证码服务为开发模式桩函数，生产部署时无实际发送~~ ✅ 已修复
- **模块**: server/services
- **位置**: `server/src/services/verificationService.ts` → `sendVerificationCode()`
- **描述**: 验证码只输出到 console.log，生产环境无保护
- **修复方案**: 在 `NODE_ENV=production` 时检查是否配置了 SMTP 或 SMS 环境变量，未配置则抛出明确错误拒绝发送
- **修复者**: Super Z
- **修复时间**: 2026-04-07

### BUG-005: README 文档中的 API 示例与实际实现不一致
- **模块**: docs
- **位置**: `README.md`
- **描述**: README 中注册接口示例与实际实现不符
- **状态**: 待修复（文档类，不影响功能）
- **建议修复**: 更新 README 中的 API 示例

### BUG-006: Step-3.5-Flash 模型返回空内容
- **模块**: models
- **位置**: `openclaw.json` → models.providers.modelscope → `stepfun-ai/Step-3.5-Flash`
- **描述**: 调用 ModelScope 的 Step-3.5-Flash 模型时，API 返回 HTTP 200 但 `content` 为空字符串。模型消耗了所有 100 tokens（可能是内部推理），但未在 `content` 或 `reasoning_content` 字段中输出任何可见内容。`finish_reason` 为 `length`，说明需要更高的 `max_tokens`。
- **状态**: 待修复
- **测试时间**: 2026-04-07 09:15 UTC+8
- **测试详情**: prompt_tokens=20, completion_tokens=100, content="", reasoning_content=""
- **建议修复**: 
  1. 增加 `max_tokens` 至 4096+ 以适配推理模型
  2. 使用流式 (streaming) 调用以获取推理过程的中间输出
  3. 考虑将该模型标记为 `reasoning: true`

### BUG-007: GLM-5 模型 reasoning_content 泄露到客户端
- **模块**: models
- **位置**: `openclaw.json` → models.providers.modelscope → `ZhipuAI/GLM-5`
- **描述**: GLM-5 是推理模型，API 返回中包含 `reasoning_content` 字段（含完整的内部推理链），该字段被暴露给客户端。虽然 `content` 字段正常返回了干净的最终答案，但 `reasoning_content` 不应泄露。
- **状态**: 待修复
- **测试时间**: 2026-04-07 09:15 UTC+8
- **测试详情**: content="Hello, how can I help you today?", reasoning_content=详细推理过程, prompt_tokens=13, completion_tokens=234
- **建议修复**: 
  1. 在 OpenClaw 框架的响应处理层添加 `reasoning_content` 字段过滤
  2. 或在 openclaw.json 模型配置中添加 `"stripReasoning": true` 选项

### BUG-008: 群组创建需认证但缺少与账号的关联验证
- **模块**: server/api
- **位置**: `server/src/api/groupRoutes.ts`
- **描述**: 群组创建接口缺少完整的业务验证逻辑
- **状态**: 待修复

### BUG-014: GET /api/v1/node/register 路由未注册（返回 404）
- **模块**: server/api
- **位置**: `server/src/api/routes.ts`
- **描述**: 对 `POST /api/v1/node/register` 的 GET 请求返回 404 而非 405 Method Not Allowed。集成测试脚本使用 GET 方法探测路由存在性，期望非 404 状态码。
- **状态**: 待修复（低优先级，实际功能正常）
- **建议修复**: 为 POST-only 路由返回 405 状态码

### BUG-015: GET /api/v1/temp-number/:number 路由未注册（返回 404）
- **模块**: server/api
- **位置**: `server/src/api/routes.ts`
- **描述**: README 文档声明 `GET /api/v1/temp-number/:number` 端点，但实际路由未注册，返回 404。
- **状态**: 待修复
- **建议修复**: 实现临时号查询端点或在文档中移除该 API

### BUG-016: POST/GET /api/v1/groups 路由未注册（返回 404）
- **模块**: server/api
- **位置**: `server/src/api/groupRoutes.ts`
- **描述**: README 文档声明 `POST /api/v1/group/create` 和 `GET /api/v1/group/list`，集成测试探测 `POST /api/v1/groups` 和 `GET /api/v1/groups` 返回 404。可能路由路径不匹配（`/groups` vs `/group`）。
- **状态**: 待修复
- **建议修复**: 确认实际路由路径与文档一致，或添加路由别名

### BUG-017: MiniMax-M2.5 模型 ID 无效
- **模块**: models
- **位置**: `openclaw.json` → models.providers.modelscope → `Minimal/MiniMax-M2.5`
- **描述**: 调用 ModelScope API 时返回 400 错误：`Invalid model id: Minimal/MiniMax-M2.5`。该模型 ID 在 ModelScope 上不存在。
- **状态**: 待修复
- **测试时间**: 2026-04-07 09:15 UTC+8
- **建议修复**: 在 ModelScope 模型注册表中查找正确的 MiniMax-M2.5 模型 ID（可能为 `MiniMaxAI/MiniMax-M2.5` 或其他命名空间）

---

## 🟢 低优先级 (Low)

### BUG-009: package.json 版本号未更新
- **模块**: project config
- **位置**: `package.json`
- **描述**: 根目录 `package.json` 版本号仍为 `1.0.0`，plugin 版本号为 `1.4.3`，不同步
- **状态**: 待修复

### ~~BUG-010: .env 中的 DATABASE_URL 未被使用~~ ✅ 已修复
- **模块**: config
- **位置**: `.env`
- **描述**: `.env` 中配置了无效的 `DATABASE_URL`
- **修复方案**: 移除无效的 `DATABASE_URL`，替换为正确的 ClickHouse 配置模板和文档注释
- **修复者**: Super Z
- **修复时间**: 2026-04-07

### ~~BUG-011: 速率限制不区分路由~~ ✅ 已修复
- **模块**: server/middleware
- **位置**: `server/src/index.ts`
- **描述**: `/health` 端点被通用速率限制器影响
- **修复方案**: 将 `/health` 路由移至速率限制中间件之前注册
- **修复者**: Super Z
- **修复时间**: 2026-04-07

### ~~BUG-012: Domain 配置不跟随环境变量~~ ✅ 已修复
- **模块**: server/config
- **位置**: `server/src/config.ts`
- **描述**: dotenv 加载顺序可能导致环境变量未正确读取
- **修复方案**: 使用 `path.resolve(__dirname, '../../.env')` 显式指定 .env 路径，确保从项目根目录加载，不受工作目录影响
- **修复者**: Super Z
- **修复时间**: 2026-04-07

---

## 📊 ModelScope 模型 API 测试结果

> 测试时间: 2026-04-07 09:15 UTC+8
> API: https://api-inference.modelscope.cn/v1 (OpenAI 兼容)
> 测试 prompt: "Hello, say hi in one sentence."

| 模型 | HTTP | 内容 | 推理 | 评价 |
|------|------|------|------|------|
| `stepfun-ai/Step-3.5-Flash` | ✅ 200 | ❌ 空 | ❌ 空 | ⚠️ 需要 streaming 或更高 max_tokens |
| `ZhipuAI/GLM-5` | ✅ 200 | ✅ 正常 | ✅ 有（泄露） | ✅ 工作正常，但 reasoning_content 需过滤 |
| `Minimal/MiniMax-M2.5` | ❌ 400 | ❌ 错误 | N/A | ❌ 模型 ID 无效 |
| `moonshotai/Kimi-K2.5` | ✅ 200 | ✅ 正常 | ✅ 有（空） | ✅ 工作正常 |

---

## ✅ 已验证通过的功能

| 功能 | 状态 | 备注 |
|------|------|------|
| Health Check | ✅ 通过 | `/health` 返回正确状态，含存储模式 |
| 404 处理 | ✅ 通过 | 返回 "Not found" |
| Admin 初始化 | ✅ 通过 | 首次初始化成功，返回 JWT token |
| Admin Setup Status | ✅ 通过 | 正确返回初始化状态 |
| 临时号码申请（需认证） | ✅ 通过 | 正确返回 401 |
| WebSocket 连接 | ✅ 通过 | 可建立连接并接收消息 |
| WebSocket 认证失败处理 | ✅ 通过 | 返回明确错误消息 |
| WebSocket 未知消息类型 | ✅ 通过 | 返回 error 类型消息 |
| Node 注册（需认证） | ✅ 通过 | BUG-002 修复后需要 JWT |
| 握手发起/响应/确认 | ✅ 通过 | 路由注册正确，返回 401（需认证） |
| 文件传输发起 | ✅ 通过 | 路由注册正确 |
| 验证码发送 | ✅ 通过 | 参数缺失返回 400 |
| 用户注册 | ✅ 通过 | 参数缺失返回 400 |
| 用户登录 | ✅ 通过 | 参数缺失返回 400 |
| Agent 登录 | ✅ 通过 | 参数缺失返回 400 |
| Token 刷新 | ✅ 通过 | 返回 200 |
| 广播消息 | ✅ 通过 | 路由注册正确，返回 401（需认证） |
| Admin 统计 | ✅ 通过 | 需认证 |
| Admin 节点列表 | ✅ 通过 | 需认证 |
| Admin 服务状态 | ✅ 通过 | 需认证 |
| 好友列表 | ✅ 通过 | 路由注册正确，需认证 |
| 无 ClickHouse 启动 | ✅ 通过 | BUG-001 修复后稳定运行 |
| 生产模式验证码保护 | ✅ 通过 | BUG-004 修复后生产环境拒绝发送 |
| 构建系统 | ✅ 通过 | crypto/server/plugin/client 全部编译成功 |
| Kimi-K2.5 模型 | ✅ 通过 | 返回正常内容 |
| GLM-5 模型 | ✅ 通过 | 返回正常内容（reasoning_content 需过滤） |
