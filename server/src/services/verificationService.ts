import { store } from '../db/memoryStore';
import { VerificationCode } from '../models/types';

// In production, replace console.log with actual email/SMS sending
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)).slice(0, 6);
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function sendVerificationCode(
  target: string,
  type: 'email' | 'phone',
  purpose: 'register' | 'login' | 'reset_password'
): Promise<{ verificationId: string; expiresAt: number }> {
  // Check rate limiting
  const existing = store.verificationCodes.get(`${type}:${target}:${purpose}`);
  if (existing && Date.now() - existing.createdAt < 60_000) {
    throw new Error('请求过于频繁，请60秒后重试');
  }

  // Production mode guard: reject if no real provider is configured
  if (process.env.NODE_ENV === 'production') {
    const hasSmtpConfig = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
    const hasSmsConfig = !!process.env.SMS_PROVIDER && !!process.env.SMS_API_KEY;
    if (!hasSmtpConfig && !hasSmsConfig) {
      throw new Error(
        '验证码发送服务未配置。生产环境必须配置 SMTP（邮件）或 SMS 服务商。' +
        '请设置环境变量 SMTP_HOST/SMTP_USER/SMTP_PASS 或 SMS_PROVIDER/SMS_API_KEY 后重启服务。'
      );
    }
  }

  const code = generateCode();
  const id = generateId();
  const maxAttempts = 5;
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  const record: VerificationCode = {
    id,
    target,
    code,
    type,
    purpose,
    attempts: 0,
    maxAttempts,
    expiresAt,
    createdAt: Date.now(),
    verifiedAt: null,
  };

  store.verificationCodes.set(`${type}:${target}:${purpose}`, record);

  // Send the code (replace with real SMS/email provider in production)
  console.warn('\n⚠️  WARNING: sendVerificationCode is a DEVELOPMENT-MODE STUB.');
  console.warn('  Verification codes are logged to console only. No email/SMS is sent.');
  console.warn('  Integrate a real email (SMTP) or SMS provider before deploying to production.\n');
  if (type === 'email') {
    console.log(`[verification] Email verification code for ${target}: ${code}`);
  } else {
    console.log(`[verification] SMS verification code for ${target}: ${code}`);
  }

  return { verificationId: id, expiresAt };
}

export function verifyCode(
  target: string,
  type: 'email' | 'phone',
  purpose: string,
  code: string
): boolean {
  const key = `${type}:${target}:${purpose}`;
  const record = store.verificationCodes.get(key);

  if (!record) {
    throw new Error('验证码不存在或已过期');
  }

  if (record.expiresAt <= Date.now()) {
    store.verificationCodes.delete(key);
    throw new Error('验证码已过期');
  }

  record.attempts++;
  if (record.attempts >= record.maxAttempts) {
    store.verificationCodes.delete(key);
    throw new Error('验证码错误次数过多，请重新获取');
  }

  if (record.code !== code) {
    return false;
  }

  record.verifiedAt = Date.now();
  store.verificationCodes.delete(key);
  return true;
}

export function cleanupExpiredCodes(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, record] of store.verificationCodes) {
    if (record.expiresAt <= now) {
      store.verificationCodes.delete(key);
      removed++;
    }
  }
  return removed;
}
