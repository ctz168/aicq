import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  domain: process.env.DOMAIN || 'aicq.online',
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
