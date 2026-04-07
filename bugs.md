# AICQ Bug Tracker

> 最后更新: 2026-04-07 12:30 UTC+8
> 测试环境: Node.js v24.14.1, npm 11.11.0
> 测试分支: main (ctz168/aicq)

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
- **位置**: `openclaw.json` → models.providers.modelscope
- **描述**: 调用 ModelScope 的 Step-3.5-Flash 模型时返回空内容
- **状态**: 待修复（modelscope provider 已从 openclaw.json 移除，问题已规避）

### BUG-007: GLM-5 模型 reasoning_content 泄露到客户端
- **模块**: models
- **位置**: `openclaw.json` → models.providers.modelscope
- **描述**: GLM-5 模型返回的 `reasoning_content` 字段被暴露给客户端
- **状态**: 待修复（modelscope provider 已从 openclaw.json 移除，问题已规避。框架层面应添加响应过滤）
- **建议修复**: 在 OpenClaw 框架的响应处理层添加 `reasoning_content` 字段过滤

### BUG-008: 群组创建需认证但缺少与账号的关联验证
- **模块**: server/api
- **位置**: `server/src/api/groupRoutes.ts`
- **描述**: 群组创建接口缺少完整的业务验证逻辑
- **状态**: 待修复

---

## 🟢 低优先级 (Low)

### BUG-009: package.json 版本号未更新
- **模块**: project config
- **位置**: `package.json`
- **描述**: 根目录 `package.json` 版本号仍为 `1.0.0`
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

## ✅ 已验证通过的功能

| 功能 | 状态 | 备注 |
|------|------|------|
| Health Check | ✅ 通过 | `/health` 返回正确状态，含存储模式 |
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
| Node 注册（需认证） | ✅ 通过 | BUG-002 修复后需要 JWT |
| 无 ClickHouse 启动 | ✅ 通过 | BUG-001 修复后稳定运行 |
| 生产模式验证码保护 | ✅ 通过 | BUG-004 修复后生产环境拒绝发送 |
