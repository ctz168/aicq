import { Router, Request, Response } from 'express';
import {
  isInitialized,
  initializeAdmin,
  loginAdmin,
  verifyAdminSession,
  getDashboardStats,
  getNodeList,
  getNodeDetail,
  getAccountList,
  getAccountDetail,
  createAccount,
  deleteAccount,
  updateAccount,
  getConfig,
  updateConfig,
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  getServiceStatus,
  stopServer,
  restartServer,
  getClickHouseStatus,
  getClickHouseTables,
  getClickHouseTableDetail,
  executeClickHouseQuery,
  optimizeClickHouse,
  cleanupClickHouseData,
} from '../services/adminService';

const router = Router();

// ─── Admin Auth Middleware ──────────────────────────────────────────

function authenticateAdmin(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供认证令牌' });
    return;
  }

  const token = authHeader.substring(7);
  if (!verifyAdminSession(token)) {
    res.status(401).json({ error: '管理员认证令牌无效或已过期' });
    return;
  }

  next();
}

// ─── Setup Status (no auth required) ──────────────────────────────

router.get('/admin/setup-status', (_req: Request, res: Response) => {
  res.json({ initialized: isInitialized() });
});

// ─── Admin Init (first time only) ─────────────────────────────────

router.post('/admin/init', async (req: Request, res: Response) => {
  try {
    if (isInitialized()) {
      res.status(400).json({ error: '管理员已初始化，无法重复设置' });
      return;
    }

    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: '必须提供用户名和密码' });
      return;
    }

    if (username.length < 3) {
      res.status(400).json({ error: '用户名至少3个字符' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: '密码至少6个字符' });
      return;
    }

    const result = await initializeAdmin(username, password);
    res.status(201).json({
      token: result.token,
      expiresIn: result.expiresIn,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '初始化失败';
    const status = message.includes('已初始化') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

// ─── Admin Login ──────────────────────────────────────────────────

router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: '必须提供用户名和密码' });
      return;
    }

    const result = await loginAdmin(username, password);
    res.json({
      token: result.token,
      expiresIn: result.expiresIn,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '登录失败';
    res.status(401).json({ error: message });
  }
});

// ─── Dashboard Stats (auth required) ──────────────────────────────

router.get('/admin/stats', authenticateAdmin, (_req: Request, res: Response) => {
  try {
    const stats = getDashboardStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// ─── Node Management (auth required) ─────────────────────────────

router.get('/admin/nodes', authenticateAdmin, (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = getNodeList({ search, page, pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '获取节点列表失败' });
  }
});

router.get('/admin/nodes/:id', authenticateAdmin, (req: Request, res: Response) => {
  try {
    const detail = getNodeDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: '节点不存在' });
      return;
    }
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: '获取节点详情失败' });
  }
});

// ─── Account Management (auth required) ──────────────────────────

router.get('/admin/accounts', authenticateAdmin, (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = getAccountList({ search, page, pageSize });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '获取账号列表失败' });
  }
});

router.post('/admin/accounts', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { email, phone, password, displayName, publicKey } = req.body;
    const account = await createAccount({ email, phone, password, displayName, publicKey });
    res.status(201).json(account);
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建账号失败';
    res.status(400).json({ error: message });
  }
});

router.get('/admin/accounts/:id', authenticateAdmin, (req: Request, res: Response) => {
  try {
    const account = getAccountDetail(req.params.id);
    if (!account) {
      res.status(404).json({ error: '账号不存在' });
      return;
    }
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: '获取账号详情失败' });
  }
});

router.put('/admin/accounts/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      res.status(400).json({ error: '没有提供更新内容' });
      return;
    }

    const account = await updateAccount(req.params.id, updates);
    res.json(account);
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新账号失败';
    const status = message.includes('不存在') ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

router.delete('/admin/accounts/:id', authenticateAdmin, (req: Request, res: Response) => {
  try {
    deleteAccount(req.params.id);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除账号失败';
    const status = message.includes('不存在') ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

// ─── Config Management (auth required) ───────────────────────────

router.get('/admin/config', authenticateAdmin, (_req: Request, res: Response) => {
  try {
    const currentConfig = getConfig();
    res.json(currentConfig);
  } catch (err) {
    res.status(500).json({ error: '获取配置失败' });
  }
});

router.put('/admin/config', authenticateAdmin, (req: Request, res: Response) => {
  try {
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      res.status(400).json({ error: '没有提供更新内容' });
      return;
    }

    const updatedConfig = updateConfig(updates);
    res.json(updatedConfig);
  } catch (err) {
    res.status(500).json({ error: '更新配置失败' });
  }
});

// ─── Blacklist Management (auth required) ────────────────────────

router.get('/admin/blacklist', authenticateAdmin, (_req: Request, res: Response) => {
  try {
    const list = getBlacklist();
    res.json({ items: list, total: list.length });
  } catch (err) {
    res.status(500).json({ error: '获取黑名单失败' });
  }
});

router.post('/admin/blacklist', authenticateAdmin, (req: Request, res: Response) => {
  try {
    const { accountId, reason } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '必须提供账号ID' });
      return;
    }

    const entry = addToBlacklist(accountId, reason);
    res.status(201).json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : '添加到黑名单失败';
    const status = message.includes('不存在') ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

router.delete('/admin/blacklist/:id', authenticateAdmin, (req: Request, res: Response) => {
  try {
    removeFromBlacklist(req.params.id);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '从黑名单移除失败';
    const status = message.includes('不在') ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

// ─── Service Management (auth required) ─────────────────────────
// 服务状态/停止/重启

router.get('/admin/service/status', authenticateAdmin, (_req: Request, res: Response) => {
  try {
    const status = getServiceStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: '获取服务状态失败' });
  }
});

router.post('/admin/service/stop', authenticateAdmin, (_req: Request, res: Response) => {
  try {
    res.json({ success: true, message: '服务正在关闭...' });
    // Send response before stopping
    stopServer();
  } catch (err) {
    res.status(500).json({ error: '停止服务失败' });
  }
});

router.post('/admin/service/restart', authenticateAdmin, (_req: Request, res: Response) => {
  try {
    res.json({ success: true, message: '服务正在重启...' });
    // Send response before restarting
    restartServer();
  } catch (err) {
    res.status(500).json({ error: '重启服务失败' });
  }
});

// ─── Database Management (auth required) ─────────────────────────
// ClickHouse 数据库连接、表管理、查询

router.get('/admin/database/status', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const status = await getClickHouseStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: '获取数据库状态失败' });
  }
});

router.get('/admin/database/tables', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const tables = await getClickHouseTables();
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: '获取表列表失败' });
  }
});

router.get('/admin/database/tables/:name', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const detail = await getClickHouseTableDetail(req.params.name);
    if (!detail) {
      res.status(404).json({ error: '表不存在' });
      return;
    }
    res.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取表详情失败';
    const status = message.includes('无效') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/admin/database/query', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: '必须提供查询语句' });
      return;
    }
    if (query.length > 5000) {
      res.status(400).json({ error: '查询语句过长（最大 5000 字符）' });
      return;
    }
    const result = await executeClickHouseQuery(query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '执行查询失败' });
  }
});

router.post('/admin/database/optimize', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await optimizeClickHouse();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '优化数据库失败' });
  }
});

router.post('/admin/database/cleanup', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await cleanupClickHouseData();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '清理过期数据失败' });
  }
});

export default router;
