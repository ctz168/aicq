import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  domain: process.env.DOMAIN || 'aicq.online',
  maxFriends: parseInt(process.env.MAX_FRIENDS || '200', 10),
  tempNumberTtlHours: parseInt(process.env.TEMP_NUMBER_TTL_HOURS || '24', 10),
  qrCodeValiditySeconds: parseInt(process.env.QR_CODE_VALIDITY_SECONDS || '60', 10),
} as const;

export type Config = typeof config;
