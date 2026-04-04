import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { store } from '../db/memoryStore';
import { config } from '../config';
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

export interface NodeListItem {
  id: string;
  publicKey: string;
  friendCount: number;
  lastSeen: number;
  isOnline: boolean;
}

export interface NodeListResponse {
  nodes: NodeListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function getNodeList(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): NodeListResponse {
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
      publicKey: n.publicKey,
      friendCount: n.friends.size,
      lastSeen: n.lastSeen,
      isOnline: (now - n.lastSeen) < 5 * 60 * 1000, // online if seen within 5 min
    })),
    total,
    page,
    pageSize,
  };
}

export interface FriendInfo {
  nodeId: string;
  lastSeen: number;
  isOnline: boolean;
  permissions: FriendPermission[];
}

export interface NodeDetail {
  id: string;
  publicKey: string;
  lastSeen: number;
  isOnline: boolean;
  socketId: string | null;
  gatewayUrl?: string;
  friends: FriendInfo[];
}

export function getNodeDetail(nodeId: string): NodeDetail | null {
  const node = store.nodes.get(nodeId);
  if (!node) return null;

  const now = Date.now();
  const permissionsMap = store.nodePermissions.get(nodeId);

  const friends: FriendInfo[] = Array.from(node.friends).map((friendId) => {
    const friendNode = store.nodes.get(friendId);
    const perms = permissionsMap?.get(friendId) || ['chat'];
    return {
      nodeId: friendId,
      lastSeen: friendNode?.lastSeen || 0,
      isOnline: friendNode ? (now - friendNode.lastSeen) < 5 * 60 * 1000 : false,
      permissions: perms,
    };
  });

  return {
    id: node.id,
    publicKey: node.publicKey,
    lastSeen: node.lastSeen,
    isOnline: (now - node.lastSeen) < 5 * 60 * 1000,
    socketId: node.socketId,
    gatewayUrl: node.gatewayUrl,
    friends,
  };
}

// ─── Account Management ────────────────────────────────────────────

export interface AccountListItem {
  id: string;
  type: 'human' | 'ai';
  email?: string;
  phone?: string;
  displayName?: string;
  agentName?: string;
  status: 'active' | 'disabled' | 'suspended';
  createdAt: number;
  lastLoginAt: number;
  friendCount: number;
}

export interface AccountListResponse {
  accounts: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function getAccountList(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): AccountListResponse {
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
    accounts: paged.map((a) => ({
      id: a.id,
      type: a.type,
      email: a.email,
      phone: a.phone,
      displayName: a.displayName,
      agentName: a.agentName,
      status: a.status,
      createdAt: a.createdAt,
      lastLoginAt: a.lastLoginAt,
      friendCount: a.friends.length,
    })),
    total,
    page,
    pageSize,
  };
}

export function getAccountDetail(accountId: string): Account | null {
  return store.accounts.get(accountId) || null;
}

export async function createAccount(params: {
  email?: string;
  phone?: string;
  password?: string;
  displayName?: string;
  publicKey: string;
}): Promise<Account> {
  const { email, phone, password, displayName, publicKey } = params;

  if (!email && !phone) {
    throw new Error('必须提供邮箱或手机号');
  }

  if (!publicKey) {
    throw new Error('必须提供公钥');
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
  return account;
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

export async function updateAccount(accountId: string, updates: AccountUpdateFields): Promise<Account> {
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
  return account;
}

// ─── Config Management ─────────────────────────────────────────────

export function getConfig(): Record<string, string | number | boolean> {
  return { ...config };
}

export function updateConfig(updates: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'jwtSecret') {
      // Don't allow changing jwtSecret via admin API
      console.warn('[admin] Attempted to change jwtSecret via admin API, blocked');
      continue;
    }
    if (key in config) {
      (config as any)[key] = value;
    } else {
      // Allow adding new config fields
      (config as any)[key] = value;
    }
  }

  console.log('[admin] Config updated:', Object.keys(updates).join(', '));
  return { ...config };
}

// ─── Blacklist Management ──────────────────────────────────────────

export interface BlacklistEntry {
  accountId: string;
  reason: string;
  addedAt: number;
}

export function getBlacklist(): BlacklistEntry[] {
  return Array.from(blacklist.entries()).map(([accountId, entry]) => ({
    accountId,
    reason: entry.reason,
    addedAt: entry.addedAt,
  }));
}

export function addToBlacklist(accountId: string, reason: string): BlacklistEntry {
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
  return { accountId, ...entry };
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
