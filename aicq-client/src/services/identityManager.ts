/**
 * Identity management — Ed25519 signing keys + X25519 key-exchange keys.
 *
 * Supports:
 *  - Generating fresh keys on first run
 *  - Loading existing keys from the persistent store
 *  - Exporting private key as an encrypted QR code (password-protected)
 *  - Importing private key from an encrypted QR code
 *  - Key regeneration
 */

import type { KeyPair } from '@aicq/crypto';
import {
  generateSigningKeyPair,
  generateKeyExchangeKeyPair,
  getPublicKeyFingerprint,
  encryptWithPassword,
  decryptWithPassword,
  encodeBase64,
  decodeBase64,
} from '@aicq/crypto';
import QRCode from 'qrcode';
import { ClientStore } from '../store.js';

const QR_VALIDITY_MS = 60_000; // 60 seconds
const MAX_QR_PER_WINDOW = 3;
const QR_RATE_WINDOW_MS = 5 * 60_000; // 5 minutes

interface QRGenerationRecord {
  timestamp: number;
}

export class IdentityManager {
  private store: ClientStore;
  private signingKeys: KeyPair | null = null;
  private exchangeKeys: KeyPair | null = null;

  /** Rate-limit tracking for QR export. */
  private qrGenerationHistory: QRGenerationRecord[] = [];

  constructor(store: ClientStore) {
    this.store = store;
  }

  /* ──────────────── Initialise ──────────────── */

  /**
   * Generate or load Ed25519 + X25519 identity keys.
   * If `userId` is provided and differs from the stored one, new keys are
   * generated.
   */
  initialize(userId?: string): void {
    // Try to load from store first
    if (this.store.userId && (!userId || userId === this.store.userId)) {
      const sk = this.store.signingKeys;
      const ek = this.store.exchangeKeys;
      if (sk && ek) {
        this.signingKeys = { publicKey: sk.publicKey, secretKey: sk.secretKey };
        this.exchangeKeys = { publicKey: ek.publicKey, secretKey: ek.secretKey };
        return;
      }
    }

    // Generate fresh keys
    this.regenerateKeys();

    if (userId) {
      this.store.userId = userId;
    }

    this.store.signingKeys = this.signingKeys!;
    this.store.exchangeKeys = this.exchangeKeys!;
    this.store.save();
  }

  /** Generate a fresh Ed25519 + X25519 key pair. */
  regenerateKeys(): void {
    this.signingKeys = generateSigningKeyPair();
    this.exchangeKeys = generateKeyExchangeKeyPair();

    this.store.signingKeys = this.signingKeys!;
    this.store.exchangeKeys = this.exchangeKeys!;
    this.store.save();
  }

  /* ──────────────── Accessors ──────────────── */

  getUserId(): string {
    return this.store.userId;
  }

  getPublicKey(): Uint8Array {
    if (!this.signingKeys) throw new Error('Identity not initialised');
    return this.signingKeys.publicKey;
  }

  getSigningSecretKey(): Uint8Array {
    if (!this.signingKeys) throw new Error('Identity not initialised');
    return this.signingKeys.secretKey;
  }

  getExchangePublicKey(): Uint8Array {
    if (!this.exchangeKeys) throw new Error('Identity not initialised');
    return this.exchangeKeys.publicKey;
  }

  getExchangeSecretKey(): Uint8Array {
    if (!this.exchangeKeys) throw new Error('Identity not initialised');
    return this.exchangeKeys.secretKey;
  }

  getPublicKeyFingerprint(): string {
    return getPublicKeyFingerprint(this.getPublicKey());
  }

  /* ──────────────── QR export / import ──────────────── */

  /**
   * Export the private signing key as an encrypted QR code.
   *
   * The QR payload format:
   *   aicq:privkey:v1:{base64(salt)}:{base64(iv)}:{base64(encrypted)}:{expiresAt}
   *
   * @returns Object with QR data URL and expiration time.
   * @throws Error if rate-limited.
   */
  async exportPrivateKeyQR(password: string): Promise<{
    qrDataUrl: string;
    expiresAt: Date;
  }> {
    // Rate-limit check
    const now = Date.now();
    this.qrGenerationHistory = this.qrGenerationHistory.filter(
      (r) => now - r.timestamp < QR_RATE_WINDOW_MS,
    );
    if (this.qrGenerationHistory.length >= MAX_QR_PER_WINDOW) {
      throw new Error(
        `Rate limit: max ${MAX_QR_PER_WINDOW} QR exports per ${QR_RATE_WINDOW_MS / 1000}s`,
      );
    }

    if (!this.signingKeys) throw new Error('Identity not initialised');

    // Serialise the private key + userId
    const payloadObj = {
      userId: this.getUserId(),
      signingSecretKey: encodeBase64(this.signingKeys.secretKey),
      exchangeSecretKey: encodeBase64(this.exchangeKeys!.secretKey),
    };
    const payloadBytes = Buffer.from(JSON.stringify(payloadObj), 'utf-8');

    // Encrypt with password
    const encrypted = encryptWithPassword(payloadBytes, password);

    // Build QR data string
    const expiresAt = new Date(now + QR_VALIDITY_MS);
    const qrPayload = [
      'aicq:privkey:v1',
      encodeBase64(encrypted.salt),
      encodeBase64(encrypted.iv),
      encodeBase64(encrypted.encrypted),
      expiresAt.getTime().toString(36),
    ].join(':');

    // Generate QR code image
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      width: 400,
      margin: 2,
    });

    // Record for rate limiting
    this.qrGenerationHistory.push({ timestamp: now });

    return { qrDataUrl, expiresAt };
  }

  /**
   * Import a private key from an encrypted QR code payload.
   *
   * @returns true if import succeeded, false otherwise.
   */
  async importPrivateKeyFromQR(
    imageData: string,
    password: string,
  ): Promise<boolean> {
    try {
      // If imageData is a data URL, extract the payload
      let qrPayload: string;
      if (imageData.startsWith('data:image')) {
        // For data URLs we'd need to decode the QR image.
        // In a browser environment this would use a canvas + jsQR.
        // In Node.js we accept the raw QR string directly.
        throw new Error(
          'Direct QR image decoding not supported in Node.js. Pass the decoded QR string instead.',
        );
      }
      qrPayload = imageData;

      // Parse the QR payload
      if (!qrPayload.startsWith('aicq:privkey:v1:')) {
        return false;
      }

      const parts = qrPayload.split(':');
      if (parts.length < 7) return false;

      // Format: aicq:privkey:v1:{salt}:{iv}:{encrypted}:{expiry}
      const salt = decodeBase64(parts[3]);
      const iv = decodeBase64(parts[4]);
      const encrypted = decodeBase64(parts[5]);
      const expiresAt = parseInt(parts[6], 36);

      // Check expiry
      if (Date.now() > expiresAt) {
        throw new Error('QR code has expired');
      }

      // Decrypt
      const decrypted = decryptWithPassword(salt, iv, encrypted, password);
      if (!decrypted) {
        throw new Error('Decryption failed — wrong password?');
      }

      // Parse payload
      const payloadObj = JSON.parse(Buffer.from(decrypted).toString('utf-8'));
      if (!payloadObj.signingSecretKey || !payloadObj.exchangeSecretKey) {
        throw new Error('Invalid key payload structure');
      }

      // Import keys
      const signingSecretKey = decodeBase64(payloadObj.signingSecretKey);
      const exchangeSecretKey = decodeBase64(payloadObj.exchangeSecretKey);

      // Derive Ed25519 public key from the 64-byte seed+public combined secret key
      // tweetnacl stores the 32-byte public key at bytes 32-63 of the secret key
      if (signingSecretKey.length === 64) {
        this.signingKeys = {
          publicKey: Buffer.from(signingSecretKey.slice(32, 64)),
          secretKey: Buffer.from(signingSecretKey.slice(0, 32)),
        };
      } else {
        // If only the 32-byte seed is provided, we cannot derive the public key
        // without the full nacl library available here. Store what we have.
        console.warn('[IdentityManager] Signing secret key is not 64 bytes, public key may be incomplete');
        this.signingKeys = {
          publicKey: Buffer.alloc(32), // Placeholder — will need to be derived
          secretKey: signingSecretKey,
        };
      }

      // For X25519 exchange keys, compute the public key from the secret key
      // using scalar multiplication with the base point
      if (exchangeSecretKey.length === 32) {
        try {
          const nacl = await import('tweetnacl');
          this.exchangeKeys = {
            publicKey: Buffer.from(nacl.scalarMult.base(exchangeSecretKey)),
            secretKey: exchangeSecretKey,
          };
        } catch {
          console.warn('[IdentityManager] tweetnacl not available, exchange public key not derived');
          this.exchangeKeys = {
            publicKey: Buffer.alloc(32),
            secretKey: exchangeSecretKey,
          };
        }
      } else if (exchangeSecretKey.length === 64) {
        // Combined format (secret + public)
        this.exchangeKeys = {
          publicKey: Buffer.from(exchangeSecretKey.slice(32, 64)),
          secretKey: Buffer.from(exchangeSecretKey.slice(0, 32)),
        };
      } else {
        this.exchangeKeys = {
          publicKey: Buffer.alloc(32),
          secretKey: exchangeSecretKey,
        };
      }

      // Update store
      this.store.userId = payloadObj.userId;
      this.store.signingKeys = {
        publicKey: this.signingKeys.publicKey,
        secretKey: this.signingKeys.secretKey,
      };
      this.store.exchangeKeys = {
        publicKey: this.exchangeKeys.publicKey,
        secretKey: this.exchangeKeys.secretKey,
      };
      this.store.save();

      return true;
    } catch (err) {
      console.error('[IdentityManager] Import failed:', err);
      return false;
    }
  }
}
