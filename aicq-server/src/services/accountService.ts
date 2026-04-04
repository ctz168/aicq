import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import nacl from 'tweetnacl';
import { store } from '../db/memoryStore';
import { Account, Session, AccountType, FriendPermission } from '../models/types';

const BCRYPT_ROUNDS = 12;

// ─── Password Hashing (bcrypt with SHA-256 legacy fallback) ────────

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
    return bcrypt.compare(password, storedHash);
  }
  // Legacy SHA-256 fallback
  const [salt, hash] = storedHash.split(':');
  const computed = crypto.createHash('sha256').update(password + salt).digest('hex');
  return computed === hash;
}

// ─── JWT Token ────────────────────────────────────────────────────

// Generate JWT token (simple implementation, replace with jsonwebtoken in production)
function generateToken(payload: Record<string, unknown>, secret: string, expiresIn: number): { token: string; expiresAt: number } {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);

  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + expiresIn,
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  const token = `${header}.${body}.${signature}`;
  return { token, expiresAt: now + expiresIn };
}

/**
 * Verify a JWT token. Checks signature, algorithm, and expiration.
 * Exported for use by auth middleware.
 */
export function verifyJWT(token: string, secret: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = Buffer.from(parts[0], 'base64url').toString();
    const headerObj = JSON.parse(header);
    if (headerObj.alg !== 'HS256') return null;

    // Verify the signature
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');

    if (expectedSig !== parts[2]) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && (payload.exp as number) < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────

export async function registerHuman(
  target: string,
  type: 'email' | 'phone',
  code: string,
  password: string,
  displayName: string,
  publicKey: string
): Promise<Account> {
  // Verify the code
  const key = `${type}:${target}:register`;
  const codeRecord = store.verificationCodes.get(key);
  if (!codeRecord || codeRecord.code !== code) {
    throw new Error('验证码错误');
  }
  if (codeRecord.expiresAt <= Date.now()) {
    store.verificationCodes.delete(key);
    throw new Error('验证码已过期');
  }
  store.verificationCodes.delete(key);

  // Check if already registered
  const existing = findAccountByTarget(target, type);
  if (existing) {
    throw new Error('该' + (type === 'email' ? '邮箱' : '手机号') + '已注册');
  }

  const accountId = uuidv4();
  const passwordHash = await hashPassword(password);

  const account: Account = {
    id: accountId,
    type: 'human',
    email: type === 'email' ? target : undefined,
    phone: type === 'phone' ? target : undefined,
    passwordHash,
    displayName: displayName || (type === 'email' ? target.split('@')[0] : target),
    publicKey,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    status: 'active',
    friends: [],
    maxFriends: 200,
    friendPermissions: {},
    visitPermissions: [],
  };

  store.setAccount(account);
  console.log(`[account] Human registered: ${target} (${accountId})`);
  return account;
}

export async function loginHuman(
  target: string,
  type: 'email' | 'phone',
  password?: string,
  code?: string
): Promise<{ account: Account; session: Session }> {
  const account = findAccountByTarget(target, type);
  if (!account) {
    throw new Error('账号不存在');
  }
  if (account.status !== 'active') {
    throw new Error('账号已被禁用');
  }

  // Email login: verify password
  if (type === 'email' && password) {
    if (!account.passwordHash) {
      throw new Error('该账号未设置密码');
    }
    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) {
      throw new Error('密码错误');
    }
  }

  // Phone login: verify code
  if (type === 'phone' && code) {
    const key = `phone:${target}:login`;
    const codeRecord = store.verificationCodes.get(key);
    if (!codeRecord || codeRecord.code !== code) {
      throw new Error('验证码错误');
    }
    if (codeRecord.expiresAt <= Date.now()) {
      store.verificationCodes.delete(key);
      throw new Error('验证码已过期');
    }
    store.verificationCodes.delete(key);
  }

  if (!password && !code) {
    throw new Error('请提供密码或验证码');
  }

  // Update last login
  account.lastLoginAt = Date.now();
  store.setAccount(account);

  // Create session
  const session = createSession(account);
  return { account, session };
}

// ─── AI Agent Auth ─────────────────────────────────────────────

// Active challenges for agent auth
const agentChallenges = new Map<string, { challenge: string; publicKey: string; agentName?: string; expiresAt: number }>();

export function requestAgentChallenge(publicKey: string, agentName?: string): { challenge: string; challengeId: string; expiresAt: number } {
  const challengeId = uuidv4();
  const challenge = uuidv4();

  agentChallenges.set(challengeId, {
    challenge,
    publicKey,
    agentName,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
  });

  return { challenge, challengeId, expiresAt: Date.now() + 5 * 60 * 1000 };
}

export async function loginAgent(
  publicKey: string,
  agentName: string | undefined,
  signature: string,
  challengeId: string
): Promise<{ account: Account; session: Session }> {
  const challengeData = agentChallenges.get(challengeId);
  if (!challengeData) {
    throw new Error('挑战不存在或已过期');
  }
  if (Date.now() > challengeData.expiresAt) {
    agentChallenges.delete(challengeId);
    throw new Error('挑战已过期，请重新发起');
  }
  if (challengeData.publicKey !== publicKey) {
    throw new Error('公钥与挑战不匹配');
  }

  agentChallenges.delete(challengeId);

  // Verify signature using tweetnacl
  const isValid = verifyAgentSignature(publicKey, challengeData.challenge, signature);
  if (!isValid) {
    throw new Error('签名验证失败');
  }

  // Find or auto-create account
  let account = findAccountByPublicKey(publicKey);
  if (!account) {
    account = createAgentAccount(publicKey, agentName || 'AI Agent');
  }

  account.lastLoginAt = Date.now();
  store.setAccount(account);

  const session = createSession(account);
  return { account, session };
}

function verifyAgentSignature(publicKeyBase64: string, challenge: string, signatureBase64: string): boolean {
  try {
    const message = Buffer.from(challenge, 'utf8');
    const signature = Buffer.from(signatureBase64, 'base64');
    const publicKey = Buffer.from(publicKeyBase64, 'base64');

    if (publicKey.length !== 32 || signature.length !== 64) return false;

    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

function createAgentAccount(publicKey: string, agentName: string): Account {
  const accountId = uuidv4();
  const account: Account = {
    id: accountId,
    type: 'ai',
    agentName,
    publicKey,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    status: 'active',
    friends: [],
    maxFriends: 200,
    friendPermissions: {},
    visitPermissions: [],
  };
  store.setAccount(account);
  console.log(`[account] AI Agent auto-registered: ${agentName} (${accountId})`);
  return account;
}

// ─── Helpers ────────────────────────────────────────────────────

/** O(1) lookup by email or phone using index maps */
function findAccountByTarget(target: string, type: 'email' | 'phone'): Account | undefined {
  const index = type === 'email' ? store.emailIndex : store.phoneIndex;
  const accountId = index.get(target);
  return accountId ? store.accounts.get(accountId) : undefined;
}

/** O(1) lookup by publicKey using index map */
function findAccountByPublicKey(publicKey: string): Account | undefined {
  const accountId = store.publicKeyIndex.get(publicKey);
  return accountId ? store.accounts.get(accountId) : undefined;
}

export function createSession(account: Account): Session {
  const jwtSecret = process.env.JWT_SECRET || 'aicq-default-jwt-secret-change-in-production';
  const { token, expiresAt } = generateToken(
    { sub: account.id, type: account.type, displayName: account.displayName || account.agentName },
    jwtSecret,
    3600 // 1 hour
  );
  const { token: refreshToken, expiresAt: refreshExpiresAt } = generateToken(
    { sub: account.id },
    jwtSecret + '-refresh',
    30 * 24 * 3600 // 30 days
  );

  const session: Session = {
    id: uuidv4(),
    accountId: account.id,
    token,
    refreshToken,
    createdAt: Date.now(),
    expiresAt: expiresAt * 1000,
  };

  store.sessions.set(session.id, session);
  return session;
}

export function refreshSession(refreshToken: string): Session | null {
  const jwtSecret = process.env.JWT_SECRET || 'aicq-default-jwt-secret-change-in-production';
  const payload = verifyJWT(refreshToken, jwtSecret + '-refresh');
  if (!payload) return null;

  const now = Math.floor(Date.now() / 1000);
  if ((payload.exp as number) < now) return null;

  const account = store.accounts.get(payload.sub as string);
  if (!account || account.status !== 'active') return null;

  return createSession(account);
}

export function getAccount(accountId: string): Account | undefined {
  return store.accounts.get(accountId);
}

export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let removed = 0;
  for (const [sessionId, session] of store.sessions) {
    if (session.expiresAt <= now) {
      store.sessions.delete(sessionId);
      removed++;
    }
  }
  return removed;
}

export function cleanupExpiredChallenges(): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, data] of agentChallenges) {
    if (data.expiresAt <= now) {
      agentChallenges.delete(id);
      removed++;
    }
  }
  return removed;
}
