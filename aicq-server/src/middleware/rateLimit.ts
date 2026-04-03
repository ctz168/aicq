import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

/**
 * If RATE_LIMIT_DISABLED env var is set, return a no-op middleware
 * so integration tests can run without hitting rate limits.
 */
function noOp(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

const disabled = process.env.RATE_LIMIT_DISABLED === 'true';

/**
 * General rate limiter: 60 requests per minute per IP.
 * Applied to all API endpoints by default.
 */
export const generalLimiter = disabled
  ? noOp
  : rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      message: {
        error: 'Too many requests',
        retryAfter: '1m',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

/**
 * Temp number rate limiter: 5 requests per minute per IP.
 * Prevents abuse of temp number generation.
 */
export const tempNumberLimiter = disabled
  ? noOp
  : rateLimit({
      windowMs: 60 * 1000,
      max: 5,
      message: {
        error: 'Too many temp number requests',
        retryAfter: '1m',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

/**
 * Handshake rate limiter: 10 requests per minute per IP.
 */
export const handshakeLimiter = disabled
  ? noOp
  : rateLimit({
      windowMs: 60 * 1000,
      max: 10,
      message: {
        error: 'Too many handshake requests',
        retryAfter: '1m',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
