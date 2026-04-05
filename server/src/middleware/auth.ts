import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../services/accountService';
import { config } from '../config';

declare global {
  namespace Express {
    interface Request {
      authenticatedAccount?: {
        id: string;
        type: string;
        displayName?: string;
      };
      authenticatedNodeId?: string;
    }
  }
}

/**
 * Extract and validate JWT from Authorization header.
 * Sets req.authenticatedAccount on success.
 * Public endpoints (auth/register, auth/login, node/register) should NOT use this.
 */
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供认证令牌' });
    return;
  }

  const token = authHeader.substring(7);
  const jwtSecret = config.jwtSecret;

  const payload = verifyJWT(token, jwtSecret);
  if (!payload) {
    res.status(401).json({ error: '认证令牌无效或已过期' });
    return;
  }

  req.authenticatedAccount = {
    id: payload.sub as string,
    type: (payload.type as string) || 'human',
    displayName: payload.displayName as string | undefined,
  };

  next();
}

/**
 * Optional auth - sets account info if token is present but doesn't reject if missing.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const jwtSecret = config.jwtSecret;
    const payload = verifyJWT(token, jwtSecret);
    if (payload) {
      req.authenticatedAccount = {
        id: payload.sub as string,
        type: (payload.type as string) || 'human',
        displayName: payload.displayName as string | undefined,
      };
    }
  }
  next();
}

/**
 * Create a login rate limiter per IP + target.
 * Tracks failed attempts and temporarily blocks after threshold.
 */
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const target = req.body.target || ip;
  const key = `${ip}:${target}`;

  const now = Date.now();
  const record = loginAttempts.get(key);

  if (record) {
    if (record.lockedUntil > now) {
      const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: `登录尝试过多，请 ${retryAfter} 秒后再试` });
      return;
    }

    // Reset if lock period expired
    if (record.count >= 5 && now > record.lockedUntil) {
      loginAttempts.delete(key);
    }
  }

  // Monkey-patch res to track failures
  const originalJson = res.json.bind(res);
  (res as any).json = function(data: any) {
    // Detect failed login (status 401)
    if (res.statusCode === 401) {
      const current = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
      current.count++;
      if (current.count >= 5) {
        current.lockedUntil = now + 15 * 60 * 1000; // Lock for 15 minutes
      }
      loginAttempts.set(key, current);
    }
    return originalJson(data);
  };

  next();
}
