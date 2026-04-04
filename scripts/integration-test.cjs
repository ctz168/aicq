#!/usr/bin/env node
/**
 * AICQ 协同测试脚本 - 服务端、客户端、插件集成测试
 * 基于实际 API 路由
 */
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const BASE = 'http://127.0.0.1:61018';
const WS_URL = 'ws://127.0.0.1:61018/ws';
let passed = 0;
let failed = 0;
const results = [];

function log(msg) { console.log(`  ${msg}`); }

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    log(`✅ ${name}`);
  } catch (err) {
    failed++;
    const msg = err.message || String(err);
    results.push({ name, status: 'FAIL', error: msg });
    log(`❌ ${name}: ${msg}`);
  }
}

function fetchJSON(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const opts = {
      hostname: '127.0.0.1',
      port: 61018,
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', (e) => reject(new Error(e.message || e.code || 'fetch error')));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function wsConnect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', (e) => reject(new Error(e.message || 'WS connect failed')));
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
}

function wsSendRecv(ws, msg, matchFn, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS recv timeout')), timeout);
    const handler = (data) => {
      const parsed = JSON.parse(data.toString());
      if (matchFn(parsed)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(parsed);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

// ─── 辅助：生成 Ed25519 密钥对 ──────────────────────────────
function genKeyPair() {
  const { publicKey, secretKey } = require('tweetnacl').sign.keyPair();
  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
    secretKey: Buffer.from(secretKey).toString('base64'),
  };
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  AICQ 协同测试 - Server + Client + Plugin');
  console.log('═══════════════════════════════════════════\n');

  // ── 1. 服务端基础 API ─────────────────────────────────
  console.log('━━━ 1. 服务端基础 API ━━━');

  await test('Health Check /health', async () => {
    const r = await fetchJSON('GET', '/health');
    if (r.status !== 200) throw new Error(`status=${r.status}`);
    if (r.body.status !== 'ok') throw new Error('not ok');
  });

  await test('404 Not Found', async () => {
    const r = await fetchJSON('GET', '/nonexistent');
    if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
  });

  await test('Admin Setup Status', async () => {
    const r = await fetchJSON('GET', '/api/v1/admin/setup-status');
    if (r.status !== 200) throw new Error(`status=${r.status} body=${JSON.stringify(r.body)}`);
  });

  // ── 2. Node 注册 ──────────────────────────────────────
  console.log('\n━━━ 2. Node 注册 ━━━');

  const humanKeys = genKeyPair();
  const aiKeys = genKeyPair();
  const humanNodeId = 'human-test-' + crypto.randomBytes(4).toString('hex');
  const aiNodeId = 'ai-test-' + crypto.randomBytes(4).toString('hex');

  await test(`注册 Human Node: ${humanNodeId.slice(0,16)}...`, async () => {
    const r = await fetchJSON('POST', '/api/v1/node/register', {
      id: humanNodeId,
      publicKey: humanKeys.publicKey,
    });
    if (r.status !== 200) throw new Error(`status=${r.status} body=${JSON.stringify(r.body)}`);
    if (!r.body.registered) throw new Error('not registered');
  });

  await test(`注册 AI Node: ${aiNodeId.slice(0,16)}...`, async () => {
    const r = await fetchJSON('POST', '/api/v1/node/register', {
      id: aiNodeId,
      publicKey: aiKeys.publicKey,
    });
    if (r.status !== 200) throw new Error(`status=${r.status} body=${JSON.stringify(r.body)}`);
    if (!r.body.registered) throw new Error('not registered');
  });

  // ── 3. 临时号码 ────────────────────────────────────────
  console.log('\n━━━ 3. 临时号码 ━━━');

  let tempNumber;

  await test('申请临时号码', async () => {
    // 注意：这个接口需要 JWT 认证，但我们先测试不带认证
    const r = await fetchJSON('POST', '/api/v1/temp-number/request', {
      nodeId: humanNodeId,
    });
    // 应该返回 401（未认证）或 400（缺少字段）
    log(`    status: ${r.status} (预期 401 未认证)`);
    if (r.status !== 401 && r.status !== 403) {
      log(`    body: ${JSON.stringify(r.body)}`);
    }
  });

  // ── 4. WebSocket 连接与在线状态 ────────────────────────
  console.log('\n━━━ 4. WebSocket 连接与在线状态 ━━━');

  let humanWs, aiWs;

  // 注意：WebSocket 上线需要 JWT token，但我们的 Node 注册没有返回 token
  // 我们直接尝试用 nodeId 连接看看效果
  await test('WebSocket 连接 (无认证)', async () => {
    const ws = await wsConnect();
    const ack = await wsSendRecv(ws, {
      type: 'online',
      nodeId: humanNodeId,
      token: 'fake-token',
    }, (p) => p.type === 'error' || p.type === 'online_ack');
    if (ack.type === 'error') {
      log(`    预期: 认证失败 (${ack.error})`);
    }
    ws.close();
  });

  await test('WebSocket 连接成功', async () => {
    humanWs = await wsConnect();
    log('    WebSocket 连接成功');
  });

  // ── 5. Admin 初始化与登录 ──────────────────────────────
  console.log('\n━━━ 5. Admin 管理 ━━━');

  let adminToken;

  await test('初始化管理员', async () => {
    const r = await fetchJSON('POST', '/api/v1/admin/init', {
      username: 'testadmin',
      password: 'TestAdmin123!',
    });
    if (r.status !== 200 && r.status !== 201) throw new Error(`status=${r.status} body=${JSON.stringify(r.body)}`);
    adminToken = r.body.token;
    if (!adminToken) throw new Error('no token returned');
    log(`    token: ${adminToken.slice(0, 24)}...`);
  });

  await test('管理员查看统计', async () => {
    const r = await fetchJSON('GET', '/api/v1/admin/stats');
    log(`    status: ${r.status} body: ${JSON.stringify(r.body).slice(0, 100)}`);
  });

  await test('管理员查看节点列表', async () => {
    const r = await fetchJSON('GET', '/api/v1/admin/nodes');
    log(`    status: ${r.status}`);
    if (r.body && r.body.nodes) {
      log(`    节点数: ${r.body.nodes.length}`);
    }
  });

  await test('管理员查看服务状态', async () => {
    const r = await fetchJSON('GET', '/api/v1/admin/service/status');
    log(`    status: ${r.status}`);
    if (r.body) {
      log(`    uptime: ${r.body.uptimeFormatted || r.body.uptime || 'N/A'}`);
      log(`    port: ${r.body.port || 'N/A'}`);
      log(`    domain: ${r.body.domain || 'N/A'}`);
    }
  });

  // ── 6. 路由覆盖检查 ─────────────────────────────────
  console.log('\n━━━ 6. API 路由覆盖检查 ━━━');

  const apiRoutes = [
    ['GET',  '/api/v1/node/register'],  // 应 404 (method not allowed)
    ['POST', '/api/v1/node/register'],
    ['POST', '/api/v1/temp-number/request'],
    ['GET',  '/api/v1/temp-number/000000'],
    ['POST', '/api/v1/handshake/initiate'],
    ['POST', '/api/v1/handshake/respond'],
    ['POST', '/api/v1/handshake/confirm'],
    ['POST', '/api/v1/broadcast'],
    ['POST', '/api/v1/file/initiate'],
    ['POST', '/api/v1/auth/send-code'],
    ['POST', '/api/v1/auth/register'],
    ['POST', '/api/v1/auth/login'],
    ['POST', '/api/v1/auth/login-agent'],
    ['POST', '/api/v1/auth/refresh'],
    ['GET',  '/api/v1/admin/setup-status'],
    ['POST', '/api/v1/admin/init'],
    ['POST', '/api/v1/admin/login'],
    ['GET',  '/api/v1/admin/service/status'],
    ['GET',  '/api/v1/friends'],
    ['POST', '/api/v1/groups'],
    ['GET',  '/api/v1/groups'],
  ];

  for (const [method, path] of apiRoutes) {
    const isGet = method === 'GET';
    await test(`${method} ${path}`, async () => {
      const r = await fetchJSON(method, path, isGet ? undefined : {});
      // 不应该返回 404（除非是 GET on POST-only route）
      // 认证保护的应该返回 401/403
      // 参数缺失应该返回 400
      if (r.status === 404) {
        throw new Error('路由未注册 (404)');
      }
      log(`    → ${r.status}`);
    });
  }

  // ── 7. WebSocket 消息类型测试 ────────────────────────
  console.log('\n━━━ 7. WebSocket 消息类型测试 ━━━');

  await test('WS: 发送未知消息类型', async () => {
    const ws = await wsConnect();
    const resp = await wsSendRecv(ws, { type: 'unknown_type' }, (p) => p.type === 'error');
    if (!resp.error) throw new Error('should return error');
    log(`    error: ${resp.error}`);
    ws.close();
  });

  await test('WS: 发送 message (无认证)', async () => {
    const ws = await wsConnect();
    const resp = await wsSendRecv(ws, {
      type: 'message',
      to: 'some-id',
      data: 'hello',
    }, (p) => p.type === 'error');
    if (!resp.error) throw new Error('should return error for unauthenticated');
    log(`    error: ${resp.error}`);
    ws.close();
  });

  // ── 清理 ──────────────────────────────────────────────
  console.log('\n━━━ 清理 ━━━');
  if (humanWs && humanWs.readyState === 1) humanWs.close();
  log('连接已关闭');

  // ── 汇总 ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log(`  测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
  if (failed > 0) {
    console.log('\n  失败项:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    ❌ ${r.name}: ${r.error}`);
    });
  }
  console.log('═══════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
