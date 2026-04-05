import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { store } from '../db/memoryStore';
import { config } from '../config';
import { getClickHouseClient, closeClickHouse as chClose } from '../db/clickhouse';
import { verifyJWT, generateToken } from './accountService';
import type { Account, FriendPermission } from '../models/types';

// ─── Admin Credentials Store ────────────────────────────────────────

interface AdminCredentials {
  username: string;
  passwordHash: string;
  createdAt: number;
}

interface AdminSession {
  id: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory admin state
let adminCredentials: AdminCredentials | null = null;
const adminSessions = new Map<string, AdminSession>();

// Blacklist: accountId -> { reason, addedAt }
const blacklist = new Map<string, { reason: string; addedAt: number }>();

const BCRYPT_ROUNDS = 12;
const ADMIN_SESSION_TTL = 24 * 3600; // 24 hours in seconds

// ─── Admin Auth ────────────────────────────────────────────────────

export function isInitialized(): boolean {
  return adminCredentials !== null;
}

export async function initializeAdmin(username: string, password: string): Promise<{ token: string; expiresIn: number }> {
  if (adminCredentials) {
    throw new Error('管理员已初始化，无法重复设置');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  adminCredentials = {
    username,
    passwordHash,
    createdAt: Date.now(),
  };

  console.log(`[admin] Admin initialized: ${username}`);
  return createAdminSession();
}

export async function loginAdmin(username: string, password: string): Promise<{ token: string; expiresIn: number }> {
  if (!adminCredentials) {
    throw new Error('管理员未初始化');
  }

  if (username !== adminCredentials.username) {
    throw new Error('用户名或密码错误');
  }

  const valid = await bcrypt.compare(password, adminCredentials.passwordHash);
  if (!valid) {
    throw new Error('用户名或密码错误');
  }

  console.log(`[admin] Admin logged in: ${username}`);
  return createAdminSession();
}

function createAdminSession(): { token: string; expiresIn: number } {
  const { token, expiresAt } = generateToken(
    { sub: 'admin', type: 'admin' },
    config.jwtSecret + '-admin',
    ADMIN_SESSION_TTL,
  );

  const sessionId = uuidv4();
  adminSessions.set(sessionId, {
    id: sessionId,
    token,
    createdAt: Date.now(),
    expiresAt: expiresAt * 1000,
  });

  return { token, expiresIn: ADMIN_SESSION_TTL };
}

export function verifyAdminSession(token: string): boolean {
  const payload = verifyJWT(token, config.jwtSecret + '-admin');
  if (!payload) return false;
  if (payload.sub !== 'admin' || payload.type !== 'admin') return false;

  // Verify session exists
  for (const [, session] of adminSessions) {
    if (session.token === token && session.expiresAt > Date.now()) {
      return true;
    }
  }

  return false;
}

export function logoutAdmin(token: string): void {
  for (const [id, session] of adminSessions) {
    if (session.token === token) {
      adminSessions.delete(id);
      return;
    }
  }
}

// ─── Dashboard Stats ───────────────────────────────────────────────

export function getDashboardStats(): {
  totalNodes: number;
  totalAccounts: number;
  totalFriendships: number;
  totalGroups: number;
  totalBlacklisted: number;
} {
  let totalFriendships = 0;
  for (const [, node] of store.nodes) {
    totalFriendships += node.friends.size;
  }
  // Each friendship is counted twice (once per node), so divide by 2
  totalFriendships = Math.floor(totalFriendships / 2);

  return {
    totalNodes: store.nodes.size,
    totalAccounts: store.accounts.size,
    totalFriendships,
    totalGroups: store.groups.size,
    totalBlacklisted: blacklist.size,
  };
}

// ─── Node Management ───────────────────────────────────────────────

export function getNodeList(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): {
  nodes: {
    id: string;
    friendCount: number;
    lastSeen: string | null;
    status: 'online' | 'offline';
  }[];
  total: number;
  page: number;
  pageSize: number;
} {
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const search = (params.search || '').trim().toLowerCase();

  let nodes = Array.from(store.nodes.values());

  if (search) {
    nodes = nodes.filter(
      (n) =>
        n.id.toLowerCase().includes(search) ||
        n.publicKey.toLowerCase().includes(search),
    );
  }

  // Sort by lastSeen descending (most recent first)
  nodes.sort((a, b) => b.lastSeen - a.lastSeen);

  const total = nodes.length;
  const start = (page - 1) * pageSize;
  const paged = nodes.slice(start, start + pageSize);

  const now = Date.now();

  return {
    nodes: paged.map((n) => ({
      id: n.id,
      friendCount: n.friends.size,
      lastSeen: n.lastSeen ? new Date(n.lastSeen).toISOString() : null,
      status: ((now - n.lastSeen) < 5 * 60 * 1000 ? 'online' : 'offline') as 'online' | 'offline',
    })),
    total,
    page,
    pageSize,
  };
}

export function getNodeDetail(nodeId: string): Record<string, any> | null {
  const node = store.nodes.get(nodeId);
  if (!node) return null;

  const now = Date.now();
  const permissionsMap = store.nodePermissions.get(nodeId);

  const friends = Array.from(node.friends).map((friendId) => {
    const friendAccount = store.accounts.get(friendId);
    const perms = permissionsMap?.get(friendId) || ['chat'];
    return {
      friendId,
      friendType: friendAccount?.type || 'human',
      permission: perms.join(', '),
      addedAt: friendAccount ? new Date(friendAccount.createdAt).toISOString() : '',
    };
  });

  return {
    id: node.id,
    friendCount: node.friends.size,
    lastSeen: node.lastSeen ? new Date(node.lastSeen).toISOString() : null,
    status: ((now - node.lastSeen) < 5 * 60 * 1000 ? 'online' : 'offline') as 'online' | 'offline',
    friends,
  };
}

// ─── Account Management ────────────────────────────────────────────

/** Helper: transform an Account to the format the admin frontend expects */
function formatAccountForFrontend(a: Account) {
  return {
    id: a.id,
    type: a.type,
    email: a.email || null,
    phone: a.phone || null,
    displayName: a.displayName || null,
    status: a.status,
    createdAt: new Date(a.createdAt).toISOString(),
    lastLogin: a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : null,
  };
}

export function getAccountList(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): {
  accounts: ReturnType<typeof formatAccountForFrontend>[];
  total: number;
  page: number;
  pageSize: number;
} {
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const search = (params.search || '').trim().toLowerCase();

  let accounts = Array.from(store.accounts.values());

  if (search) {
    accounts = accounts.filter(
      (a) =>
        a.id.toLowerCase().includes(search) ||
        (a.email && a.email.toLowerCase().includes(search)) ||
        (a.phone && a.phone.toLowerCase().includes(search)) ||
        (a.displayName && a.displayName.toLowerCase().includes(search)) ||
        (a.agentName && a.agentName.toLowerCase().includes(search)),
    );
  }

  // Sort by createdAt descending
  accounts.sort((a, b) => b.createdAt - a.createdAt);

  const total = accounts.length;
  const start = (page - 1) * pageSize;
  const paged = accounts.slice(start, start + pageSize);

  return {
    accounts: paged.map((a) => formatAccountForFrontend(a)),
    total,
    page,
    pageSize,
  };
}

export function getAccountDetail(accountId: string): ReturnType<typeof formatAccountForFrontend> | null {
  const account = store.accounts.get(accountId);
  return account ? formatAccountForFrontend(account) : null;
}

export async function createAccount(params: {
  email?: string;
  phone?: string;
  password?: string;
  displayName?: string;
  publicKey?: string;
}): Promise<ReturnType<typeof formatAccountForFrontend>> {
  let { email, phone, password, displayName, publicKey } = params;

  if (!email && !phone) {
    throw new Error('必须提供邮箱或手机号');
  }

  // Admin-created accounts get a placeholder key; real key is set during normal registration
  if (!publicKey) {
    publicKey = crypto.randomBytes(32).toString('base64');
  }

  // Check for existing accounts with same email/phone
  if (email) {
    const existingEmail = store.emailIndex.get(email);
    if (existingEmail) {
      throw new Error('该邮箱已被注册');
    }
  }

  if (phone) {
    const existingPhone = store.phoneIndex.get(phone);
    if (existingPhone) {
      throw new Error('该手机号已被注册');
    }
  }

  // Check publicKey uniqueness
  const existingKey = store.publicKeyIndex.get(publicKey);
  if (existingKey) {
    throw new Error('该公钥已被使用');
  }

  const accountId = uuidv4();
  let passwordHash: string | undefined;
  if (password) {
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  const account: Account = {
    id: accountId,
    type: 'human',
    email: email || undefined,
    phone: phone || undefined,
    passwordHash,
    displayName: displayName || (email ? email.split('@')[0] : phone || 'User'),
    publicKey,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    status: 'active',
    friends: [],
    maxFriends: config.maxFriends,
    visitPermissions: [],
  };

  store.setAccount(account);
  console.log(`[admin] Account created: ${account.id} (${email || phone})`);
  return formatAccountForFrontend(account);
}

export function deleteAccount(accountId: string): boolean {
  const account = store.accounts.get(accountId);
  if (!account) {
    throw new Error('账号不存在');
  }

  // Remove from indexes
  if (account.email) store.emailIndex.delete(account.email);
  if (account.phone) store.phoneIndex.delete(account.phone);
  if (account.publicKey) store.publicKeyIndex.delete(account.publicKey);

  // Remove account
  store.accounts.delete(accountId);

  // Remove associated sessions
  for (const [sessionId, session] of store.sessions) {
    if (session.accountId === accountId) {
      store.sessions.delete(sessionId);
    }
  }

  // Remove from blacklist
  blacklist.delete(accountId);

  // Remove friend relationships from all nodes
  for (const [, node] of store.nodes) {
    if (node.friends.has(accountId)) {
      node.friends.delete(accountId);
      node.friendCount = node.friends.size;
    }
  }

  // Remove from all groups
  for (const [groupId, group] of store.groups) {
    if (group.members.has(accountId)) {
      group.members.delete(accountId);
    }
  }

  // Remove node record if exists
  store.nodes.delete(accountId);

  // Also delete from ClickHouse (fire-and-forget)
  (async () => {
    try {
      const ch = await getClickHouseClient();
      await ch.exec({
        query: 'ALTER TABLE accounts DELETE WHERE id = {id:String}',
        query_params: { id: accountId },
      });
      await ch.exec({
        query: 'ALTER TABLE nodes DELETE WHERE id = {id:String}',
        query_params: { id: accountId },
      });
    } catch (err) {
      console.warn('[admin] Failed to delete account from ClickHouse:', err instanceof Error ? err.message : err);
    }
  })();

  console.log(`[admin] Account deleted: ${accountId}`);
  return true;
}

export type AccountUpdateFields = Partial<{
  email: string;
  phone: string;
  displayName: string;
  agentName: string;
  status: 'active' | 'disabled' | 'suspended';
  publicKey: string;
  password: string; // special: will be hashed
  maxFriends: number;
}>;

export async function updateAccount(accountId: string, updates: AccountUpdateFields): Promise<ReturnType<typeof formatAccountForFrontend>> {
  const account = store.accounts.get(accountId);
  if (!account) {
    throw new Error('账号不存在');
  }

  // Handle email change
  if (updates.email !== undefined) {
    if (updates.email && store.emailIndex.get(updates.email) && store.emailIndex.get(updates.email) !== accountId) {
      throw new Error('该邮箱已被其他账号使用');
    }
    if (account.email) store.emailIndex.delete(account.email);
    account.email = updates.email || undefined;
    if (account.email) store.emailIndex.set(account.email, accountId);
  }

  // Handle phone change
  if (updates.phone !== undefined) {
    if (updates.phone && store.phoneIndex.get(updates.phone) && store.phoneIndex.get(updates.phone) !== accountId) {
      throw new Error('该手机号已被其他账号使用');
    }
    if (account.phone) store.phoneIndex.delete(account.phone);
    account.phone = updates.phone || undefined;
    if (account.phone) store.phoneIndex.set(account.phone, accountId);
  }

  // Handle publicKey change
  if (updates.publicKey !== undefined) {
    if (updates.publicKey && store.publicKeyIndex.get(updates.publicKey) && store.publicKeyIndex.get(updates.publicKey) !== accountId) {
      throw new Error('该公钥已被其他账号使用');
    }
    if (account.publicKey) store.publicKeyIndex.delete(account.publicKey);
    account.publicKey = updates.publicKey;
    if (account.publicKey) store.publicKeyIndex.set(account.publicKey, accountId);
  }

  // Handle password change
  if (updates.password !== undefined) {
    if (updates.password) {
      account.passwordHash = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
    } else {
      account.passwordHash = undefined;
    }
  }

  // Handle simple field updates
  if (updates.displayName !== undefined) account.displayName = updates.displayName;
  if (updates.agentName !== undefined) account.agentName = updates.agentName;
  if (updates.status !== undefined) account.status = updates.status;
  if (updates.maxFriends !== undefined) account.maxFriends = updates.maxFriends;

  store.setAccount(account);
  console.log(`[admin] Account updated: ${accountId}`);
  return formatAccountForFrontend(account);
}

// ─── Config Management ─────────────────────────────────────────────

// Whitelisted config fields that can be viewed/modified via admin API
const ADMIN_CONFIG_WHITELIST = [
  'port', 'maxFriends', 'maxFriendsHumanToHuman', 'maxFriendsHumanToAI',
  'maxFriendsAIToHuman', 'maxFriendsAIToAI', 'maxGroupsCreate', 'maxGroupsJoin',
  'maxGroupMembers', 'maxConnections', 'maxWsConnections', 'tempNumberTtlHours',
];

export function getConfig(): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const key of ADMIN_CONFIG_WHITELIST) {
    if (key in config) {
      safe[key] = (config as any)[key];
    }
  }
  return safe;
}

export function updateConfig(updates: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  for (const [key, value] of Object.entries(updates)) {
    if (!ADMIN_CONFIG_WHITELIST.includes(key)) {
      console.warn(`[admin] Attempted to change protected config '${key}', blocked`);
      continue;
    }
    (config as any)[key] = value;
  }

  console.log('[admin] Config updated:', Object.keys(updates).join(', '));
  return getConfig();
}

// ─── Blacklist Management ──────────────────────────────────────────

export function getBlacklist() {
  return Array.from(blacklist.entries()).map(([accountId, entry]) => ({
    id: accountId, // Use accountId as the unique id for the frontend
    accountId,
    reason: entry.reason,
    createdAt: new Date(entry.addedAt).toISOString(),
  }));
}

export function addToBlacklist(accountId: string, reason: string) {
  // Verify account exists
  const account = store.accounts.get(accountId);
  if (!account) {
    throw new Error('账号不存在');
  }

  if (blacklist.has(accountId)) {
    throw new Error('该账号已在黑名单中');
  }

  const entry = {
    reason: reason || '管理员手动添加',
    addedAt: Date.now(),
  };

  blacklist.set(accountId, entry);

  // Disable the account
  account.status = 'suspended';
  store.setAccount(account);

  // Remove all active sessions
  for (const [sessionId, session] of store.sessions) {
    if (session.accountId === accountId) {
      store.sessions.delete(sessionId);
    }
  }

  console.log(`[admin] Account blacklisted: ${accountId} (${reason})`);
  return {
    id: accountId,
    accountId,
    reason: entry.reason,
    createdAt: new Date(entry.addedAt).toISOString(),
  };
}

export function removeFromBlacklist(accountId: string): boolean {
  if (!blacklist.has(accountId)) {
    throw new Error('该账号不在黑名单中');
  }

  blacklist.delete(accountId);

  // Re-enable the account
  const account = store.accounts.get(accountId);
  if (account && account.status === 'suspended') {
    account.status = 'active';
    store.setAccount(account);
  }

  console.log(`[admin] Account removed from blacklist: ${accountId}`);
  return true;
}

export function isBlacklisted(accountId: string): boolean {
  return blacklist.has(accountId);
}

// ─── Service Management ──────────────────────────────────────────

// Track server start time
const serverStartTime = Date.now();

export function getServiceStatus(): {
  status: 'running';
  uptime: number;
  uptimeFormatted: string;
  port: number;
  domain: string;
  nodeEnv: string;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  startedAt: number;
} {
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  // Format uptime as Xd Xh Xm Xs
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  let uptimeFormatted = '';
  if (days > 0) uptimeFormatted += `${days}天 `;
  if (hours > 0) uptimeFormatted += `${hours}小时 `;
  if (minutes > 0) uptimeFormatted += `${minutes}分钟 `;
  uptimeFormatted += `${seconds}秒`;

  return {
    status: 'running',
    uptime,
    uptimeFormatted: uptimeFormatted.trim(),
    port: config.port,
    domain: config.domain,
    nodeEnv: process.env.NODE_ENV || 'development',
    memoryUsage: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    startedAt: serverStartTime,
  };
}

export function stopServer(): void {
  console.log('[admin] Server stop requested by admin');
  // Use SIGTERM for graceful shutdown
  setTimeout(() => {
    process.kill(process.pid, 'SIGTERM');
  }, 500);
}

export function restartServer(): void {
  console.log('[admin] Server restart requested by admin');
  // Use SIGTERM for graceful shutdown; a process manager (PM2/systemd) should auto-restart
  setTimeout(() => {
    process.kill(process.pid, 'SIGTERM');
  }, 500);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ClickHouse Database Management
// ═══════════════════════════════════════════════════════════════════════════

export interface ClickHouseStatus {
  connected: boolean;
  url: string;
  database: string;
  user: string;
  version: string;
  latencyMs: number;
  totalRows: number;
  totalBytes: string;
  totalBytesRaw: number;
}

export async function getClickHouseStatus(): Promise<ClickHouseStatus> {
  const startTime = Date.now();
  try {
    const ch = await getClickHouseClient();

    // Test connection with a simple query
    const versionRows = await ch.query({
      query: 'SELECT version()',
      format: 'JSONEachRow',
    });
    let version = '';
    for await (const row of versionRows.stream()) {
      version = (row as any).version() || (row as any).version || 'unknown';
    }

    // Get database size
    const sizeRows = await ch.query({
      query: `SELECT
        formatReadableSize(sum(bytes_on_disk)) as totalBytes,
        sum(rows) as totalRows,
        sum(bytes_on_disk) as totalBytesRaw
      FROM system.parts
      WHERE database = '{db:String}' AND active`,
      format: 'JSONEachRow',
      query_params: { db: config.clickhouseDatabase },
    });
    let totalRows = 0;
    let totalBytes = '0 B';
    let totalBytesRaw = 0;
    for await (const row of sizeRows.stream()) {
      totalRows = Number((row as any).totalRows) || 0;
      totalBytes = (row as any).totalBytes || '0 B';
      totalBytesRaw = Number((row as any).totalBytesRaw) || 0;
    }

    return {
      connected: true,
      url: config.clickhouseUrl,
      database: config.clickhouseDatabase,
      user: config.clickhouseUser,
      version: String(version),
      latencyMs: Date.now() - startTime,
      totalRows,
      totalBytes: String(totalBytes),
      totalBytesRaw,
    };
  } catch (err) {
    return {
      connected: false,
      url: config.clickhouseUrl,
      database: config.clickhouseDatabase,
      user: config.clickhouseUser,
      version: '',
      latencyMs: Date.now() - startTime,
      totalRows: 0,
      totalBytes: '0 B',
      totalBytesRaw: 0,
    };
  }
}

export interface TableInfo {
  name: string;
  engine: string;
  rows: number;
  bytes: string;
  bytesRaw: number;
  parts: number;
  createdAt: string;
}

export interface TableDetail extends TableInfo {
  columns: ColumnInfo[];
  sampleData: Record<string, any>[];
  sampleDataCount: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  defaultKind: string;
  defaultExpression: string;
  comment: string;
  isInPartitionKey: boolean;
  isInSortingKey: boolean;
  isInPrimaryKey: boolean;
}

export async function getClickHouseTables(): Promise<TableInfo[]> {
  const ch = await getClickHouseClient();

  const rows = await ch.query({
    query: `SELECT
      table as name,
      engine,
      sum(rows) as rows,
      formatReadableSize(sum(bytes_on_disk)) as bytes,
      sum(bytes_on_disk) as bytesRaw,
      uniqExact(partition) as parts,
      min(metadata_modification_time) as created_at
    FROM system.parts
    WHERE database = '{db:String}' AND active
    GROUP BY table, engine
    ORDER BY bytesRaw DESC`,
    format: 'JSONEachRow',
    query_params: { db: config.clickhouseDatabase },
  });

  const tables: TableInfo[] = [];
  for await (const row of rows.stream()) {
    const r = row as any;
    tables.push({
      name: r.name,
      engine: r.engine,
      rows: Number(r.rows) || 0,
      bytes: r.bytes || '0 B',
      bytesRaw: Number(r.bytesRaw) || 0,
      parts: Number(r.parts) || 0,
      createdAt: r.created_at || '',
    });
  }

  return tables;
}

export async function getClickHouseTableDetail(tableName: string): Promise<TableDetail | null> {
  const ch = await getClickHouseClient();

  // Sanitize table name to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error('无效的表名');
  }

  // Check table exists
  const existsRows = await ch.query({
    query: `SELECT count() as cnt FROM system.tables WHERE database = '{db:String}' AND name = '{table:String}'`,
    format: 'JSONEachRow',
    query_params: { db: config.clickhouseDatabase, table: tableName },
  });
  let exists = false;
  for await (const row of existsRows.stream()) {
    exists = Number((row as any).cnt) > 0;
  }
  if (!exists) return null;

  // Get table info
  const infoRows = await ch.query({
    query: `SELECT
      table as name,
      engine,
      sum(rows) as rows,
      formatReadableSize(sum(bytes_on_disk)) as bytes,
      sum(bytes_on_disk) as bytesRaw,
      uniqExact(partition) as parts,
      min(metadata_modification_time) as created_at
    FROM system.parts
    WHERE database = '{db:String}' AND table = '{table:String}' AND active
    GROUP BY table, engine`,
    format: 'JSONEachRow',
    query_params: { db: config.clickhouseDatabase, table: tableName },
  });

  let tableInfo: Partial<TableDetail> = {};
  for await (const row of infoRows.stream()) {
    const r = row as any;
    tableInfo = {
      name: r.name,
      engine: r.engine,
      rows: Number(r.rows) || 0,
      bytes: r.bytes || '0 B',
      bytesRaw: Number(r.bytesRaw) || 0,
      parts: Number(r.parts) || 0,
      createdAt: r.created_at || '',
    };
  }

  // Get columns
  const colRows = await ch.query({
    query: `SELECT
      name,
      type,
      default_kind,
      default_expression,
      comment,
      is_in_partition_key,
      is_in_sorting_key,
      is_in_primary_key
    FROM system.columns
    WHERE database = '{db:String}' AND table = '{table:String}'
    ORDER BY position`,
    format: 'JSONEachRow',
    query_params: { db: config.clickhouseDatabase, table: tableName },
  });

  const columns: ColumnInfo[] = [];
  for await (const row of colRows.stream()) {
    const r = row as any;
    columns.push({
      name: r.name,
      type: r.type,
      defaultKind: r.default_kind || '',
      defaultExpression: r.default_expression || '',
      comment: r.comment || '',
      isInPartitionKey: r.is_in_partition_key === 1,
      isInSortingKey: r.is_in_sorting_key === 1,
      isInPrimaryKey: r.is_in_primary_key === 1,
    });
  }

  // Get sample data (last 10 rows)
  let sampleData: Record<string, any>[] = [];
  try {
    const sampleRows = await ch.query({
      query: `SELECT * FROM \`${config.clickhouseDatabase}\`.\`${tableName}\` LIMIT 10`,
      format: 'JSONEachRow',
    });
    for await (const row of sampleRows.stream()) {
      sampleData.push(row as Record<string, any>);
    }
  } catch {
    // Some tables may not support SELECT directly, ignore
  }

  return {
    ...tableInfo,
    name: tableName,
    engine: tableInfo.engine || '',
    rows: tableInfo.rows || 0,
    bytes: tableInfo.bytes || '0 B',
    bytesRaw: tableInfo.bytesRaw || 0,
    parts: tableInfo.parts || 0,
    createdAt: tableInfo.createdAt || '',
    columns,
    sampleData,
    sampleDataCount: sampleData.length,
  };
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  queryTimeMs: number;
  error?: string;
}

export async function executeClickHouseQuery(query: string): Promise<QueryResult> {
  // Basic safety: only allow SELECT statements
  const trimmed = query.trim().toUpperCase();
  if (
    !trimmed.startsWith('SELECT') &&
    !trimmed.startsWith('EXPLAIN') &&
    !trimmed.startsWith('SHOW') &&
    !trimmed.startsWith('DESCRIBE')
  ) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      queryTimeMs: 0,
      error: '只允许执行 SELECT / SHOW / DESCRIBE 查询',
    };
  }

  // Prevent dangerous operations
  const forbidden = ['ALTER', 'DROP', 'DELETE', 'INSERT', 'UPDATE', 'CREATE', 'TRUNCATE', 'ATTACH', 'DETACH', 'OPTIMIZE'];
  for (const word of forbidden) {
    if (trimmed.includes(word)) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        queryTimeMs: 0,
        error: `不允许执行包含 ${word} 的操作`,
      };
    }
  }

  const startTime = Date.now();
  try {
    const ch = await getClickHouseClient();
    const resultRows = await ch.query({
      query,
      format: 'JSONEachRow',
    });

    const rows: Record<string, any>[] = [];
    const columnSet = new Set<string>();
    for await (const row of resultRows.stream()) {
      const r = row as Record<string, any>;
      rows.push(r);
      for (const key of Object.keys(r)) {
        columnSet.add(key);
      }
    }

    return {
      columns: Array.from(columnSet),
      rows,
      rowCount: rows.length,
      queryTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      queryTimeMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : '查询执行失败',
    };
  }
}

export interface OptimizeResult {
  tables: { name: string; success: boolean; error?: string }[];
  totalMs: number;
}

export async function optimizeClickHouse(): Promise<OptimizeResult> {
  const startTime = Date.now();
  const tables = await getClickHouseTables();
  const results: { name: string; success: boolean; error?: string }[] = [];

  const ch = await getClickHouseClient();

  for (const table of tables) {
    try {
      // Only optimize MergeTree family tables
      if (table.engine.includes('MergeTree') || table.engine.includes('ReplacingMergeTree')) {
        await ch.exec({
          query: `OPTIMIZE TABLE \`${config.clickhouseDatabase}\`.\`${table.name}\` FINAL`,
        });
        results.push({ name: table.name, success: true });
      } else {
        results.push({ name: table.name, success: true });
      }
    } catch (err) {
      results.push({
        name: table.name,
        success: false,
        error: err instanceof Error ? err.message : '优化失败',
      });
    }
  }

  return {
    tables: results,
    totalMs: Date.now() - startTime,
  };
}

export interface CleanupResult {
  deletedRows: number;
  tables: { name: string; deletedRows: number }[];
  totalMs: number;
}

export async function cleanupClickHouseData(): Promise<CleanupResult> {
  const startTime = Date.now();
  const ch = await getClickHouseClient();

  const tablesToCleanup = [
    { name: 'temp_numbers', condition: "expires_at < now64(3)" },
    { name: 'sessions', condition: "expires_at < now64(3)" },
    { name: 'handshake_sessions', condition: "expires_at < now64(3)" },
    { name: 'verification_codes', condition: "expires_at < now64(3)" },
    { name: 'notifications', condition: "created_at < now64(3) - INTERVAL 7 DAY" },
  ];

  const results: { name: string; deletedRows: number }[] = [];
  let totalDeleted = 0;

  for (const table of tablesToCleanup) {
    try {
      await ch.exec({
        query: `ALTER TABLE \`${config.clickhouseDatabase}\`.\`${table.name}\` DELETE WHERE ${table.condition}`,
      });
      results.push({ name: table.name, deletedRows: -1 });
      totalDeleted += 0;
    } catch (err) {
      results.push({ name: table.name, deletedRows: 0 });
    }
  }

  return {
    deletedRows: totalDeleted,
    tables: results,
    totalMs: Date.now() - startTime,
  };
}
