import dotenv from 'dotenv';

dotenv.config();

// ─── JWT Secret Validation ────────────────────────────────────────
// In production, JWT_SECRET must be explicitly set. No hardcoded fallback allowed.
const jwtSecret = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: JWT_SECRET environment variable is not set in production mode. ' +
        'Refusing to start without a secure secret. Set a strong random JWT_SECRET (min 32 chars).'
      );
    }
    // Development mode: use a deterministic insecure fallback
    console.warn(
      '\n⚠️  WARNING: Using default insecure JWT secret for development. ' +
      'Set JWT_SECRET environment variable before deploying to production.\n'
    );
    return 'aicq-dev-only-jwt-secret-do-not-use-in-production';
  }
  return secret;
})();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  domain: process.env.DOMAIN || 'aicq.online',
  jwtSecret,
  allowLocalhost: process.env.ALLOW_LOCALHOST === 'true',
  maxFriends: parseInt(process.env.MAX_FRIENDS || '200', 10),
  tempNumberTtlHours: parseInt(process.env.TEMP_NUMBER_TTL_HOURS || '24', 10),
  qrCodeValiditySeconds: parseInt(process.env.QR_CODE_VALIDITY_SECONDS || '60', 10),
  maxGroupsPerAccount: parseInt(process.env.MAX_GROUPS_PER_ACCOUNT || '20', 10),
  maxGroupMembers: parseInt(process.env.MAX_GROUP_MEMBERS || '100', 10),
  maxConnections: parseInt(process.env.MAX_HTTP_CONNECTIONS || '5000', 10),
  maxWsConnections: parseInt(process.env.MAX_WS_CONNECTIONS || '10000', 10),
  maxGroupMessages: parseInt(process.env.MAX_GROUP_MESSAGES || '5000', 10),
} as const;

export type Config = typeof config;
