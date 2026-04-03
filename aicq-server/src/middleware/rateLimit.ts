import rateLimit from 'express-rate-limit';

/**
 * General rate limiter: 60 requests per minute per IP.
 * Applied to all API endpoints by default.
 */
export const generalLimiter = rateLimit({
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
export const tempNumberLimiter = rateLimit({
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
export const handshakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    error: 'Too many handshake requests',
    retryAfter: '1m',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
