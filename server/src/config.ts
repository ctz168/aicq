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

export interface Config {
  port: number;
  domain: string;
  jwtSecret: string;
  allowLocalhost: boolean;
  maxFriends: number;
  tempNumberTtlHours: number;
  qrCodeValiditySeconds: number;
  maxGroupsPerAccount: number;
  maxGroupMembers: number;
  maxConnections: number;
  maxWsConnections: number;
  maxGroupMessages: number;
  maxFriendsHumanToHuman: number;
  maxFriendsHumanToAI: number;
  maxFriendsAIToHuman: number;
  maxFriendsAIToAI: number;
  maxGroupsCreate: number;
  maxGroupsJoin: number;
  // ClickHouse
  clickhouseUrl: string;
  clickhouseUser: string;
  clickhousePassword: string;
  clickhouseDatabase: string;
  [key: string]: string | number | boolean;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '61018', 10),
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
  maxFriendsHumanToHuman: parseInt(process.env.MAX_FRIENDS_HUMAN_TO_HUMAN || '200', 10),
  maxFriendsHumanToAI: parseInt(process.env.MAX_FRIENDS_HUMAN_TO_AI || '500', 10),
  maxFriendsAIToHuman: parseInt(process.env.MAX_FRIENDS_AI_TO_HUMAN || '1000', 10),
  maxFriendsAIToAI: parseInt(process.env.MAX_FRIENDS_AI_TO_AI || '1000', 10),
  maxGroupsCreate: parseInt(process.env.MAX_GROUPS_CREATE || '20', 10),
  maxGroupsJoin: parseInt(process.env.MAX_GROUPS_JOIN || '50', 10),
  // ClickHouse configuration
  clickhouseUrl: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  clickhouseUser: process.env.CLICKHOUSE_USER || 'default',
  clickhousePassword: process.env.CLICKHOUSE_PASSWORD || '',
  clickhouseDatabase: process.env.CLICKHOUSE_DATABASE || 'aicq',
};
