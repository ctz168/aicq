import { Router, Request, Response } from 'express';
import * as verificationService from '../services/verificationService';
import * as accountService from '../services/accountService';
import { generalLimiter } from '../middleware/rateLimit';
import { loginRateLimit } from '../middleware/auth';

const router = Router();

/**
 * POST /api/v1/auth/send-code
 * Send a verification code to email or phone.
 */
router.post('/auth/send-code', generalLimiter, async (req: Request, res: Response) => {
  try {
    const { target, type, purpose } = req.body;

    if (!target || !type || !purpose) {
      res.status(400).json({ error: 'Missing target, type, or purpose' });
      return;
    }

    if (!['email', 'phone'].includes(type)) {
      res.status(400).json({ error: 'Type must be email or phone' });
      return;
    }

    if (!['register', 'login', 'reset_password'].includes(purpose)) {
      res.status(400).json({ error: 'Purpose must be register, login, or reset_password' });
      return;
    }

    // Basic email/phone validation
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      res.status(400).json({ error: '邮箱格式无效' });
      return;
    }

    if (type === 'phone') {
      const phoneStr = String(target);
      if (!/^\d{4,15}$/.test(phoneStr)) {
        res.status(400).json({ error: '手机号格式无效' });
        return;
      }
    }

    const result = await verificationService.sendVerificationCode(target, type, purpose);
    res.json({
      success: true,
      expiresAt: result.expiresAt,
      message: '验证码已发送',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/v1/auth/register
 * Register a new human account.
 */
router.post('/auth/register', generalLimiter, async (req: Request, res: Response) => {
  try {
    const { target, type, code, password, displayName, publicKey } = req.body;

    if (!target || !type || !code || !password) {
      res.status(400).json({ error: 'Missing required fields: target, type, code, password' });
      return;
    }

    if (!publicKey) {
      res.status(400).json({ error: 'Missing publicKey' });
      return;
    }

    if (!['email', 'phone'].includes(type)) {
      res.status(400).json({ error: 'Type must be email or phone' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: '密码长度至少6位' });
      return;
    }

    const account = await accountService.registerHuman(target, type, code, password, displayName, publicKey);

    // Auto-login after registration
    const session = accountService.createSession(account);

    res.status(201).json({
      success: true,
      account: sanitizeAccount(account),
      session: sanitizeSession(session),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/v1/auth/login
 * Login with email+password or phone+code.
 */
router.post('/auth/login', generalLimiter, loginRateLimit, async (req: Request, res: Response) => {
  try {
    const { target, type, password, code } = req.body;

    if (!target || !type) {
      res.status(400).json({ error: 'Missing target or type' });
      return;
    }

    if (!password && !code) {
      res.status(400).json({ error: 'Missing password or code' });
      return;
    }

    const { account, session } = await accountService.loginHuman(target, type, password, code);

    res.json({
      success: true,
      account: sanitizeAccount(account),
      session: sanitizeSession(session),
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * POST /api/v1/auth/login-agent
 * AI Agent login with public key signature.
 */
router.post('/auth/login-agent', generalLimiter, async (req: Request, res: Response) => {
  try {
    const { publicKey, agentName, signature, challengeId } = req.body;

    if (!publicKey || !signature || !challengeId) {
      res.status(400).json({ error: 'Missing publicKey, signature, or challengeId' });
      return;
    }

    const { account, session } = await accountService.loginAgent(publicKey, agentName, signature, challengeId);

    res.json({
      success: true,
      account: sanitizeAccount(account),
      session: sanitizeSession(session),
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh an expired JWT token.
 */
router.post('/auth/refresh', generalLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Missing refreshToken' });
      return;
    }

    const session = accountService.refreshSession(refreshToken);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const account = accountService.getAccount(session.accountId);
    if (!account) {
      res.status(401).json({ error: 'Account not found' });
      return;
    }

    res.json({
      success: true,
      account: sanitizeAccount(account),
      session: sanitizeSession(session),
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────

function sanitizeAccount(account: any): any {
  return {
    id: account.id,
    type: account.type,
    email: account.email,
    phone: account.phone,
    displayName: account.displayName,
    agentName: account.agentName,
    publicKey: account.publicKey,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt,
    status: account.status,
    friendCount: account.friends?.length || 0,
    maxFriends: account.maxFriends,
    friendPermissions: account.friendPermissions || {},
  };
}

function sanitizeSession(session: any): any {
  return {
    sessionId: session.id,
    token: session.token,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  };
}

export default router;
