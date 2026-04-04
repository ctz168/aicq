/**
 * Identity Service — manages agent identity keys and certificates.
 *
 * Handles key generation, persistence, public key fingerprinting,
 * and QR-based private key export/import for human takeover scenarios.
 */

import * as crypto from "crypto";
import QRCode from "qrcode";
import {
  generateSigningKeyPair,
  generateKeyExchangeKeyPair,
  getPublicKeyFingerprint,
  encryptWithPassword,
  decryptWithPassword,
  encodeBase64,
  decodeBase64,
} from "@aicq/crypto";
import type { PluginStore } from "../store.js";
import type { Logger } from "../types.js";

export class IdentityService {
  private store: PluginStore;
  private logger: Logger;
  private exportTimers: Map<string, NodeJS.Timeout> = new Map();

  /** Set of valid export tokens — timer invalidates by removing the token. */
  private validExportTokens: Set<string> = new Set();

  constructor(store: PluginStore, logger: Logger) {
    this.store = store;
    this.logger = logger;
  }

  /**
   * Initialize identity — generate new keys or load existing ones.
   */
  initialize(agentId?: string): void {
    if (agentId) {
      this.store.agentId = agentId;
    }

    // Check if we already have keys loaded from persistence
    if (this.store.identityKeys.publicKey.length > 0) {
      this.logger.info("[Identity] Loaded existing identity keys");
      return;
    }

    // Generate fresh keys
    this.regenerateKeys();
    this.logger.info("[Identity] Generated new identity keys");
  }

  /**
   * Get the Ed25519 public key.
   */
  getPublicKey(): Uint8Array {
    return this.store.identityKeys.publicKey;
  }

  /**
   * Get the hex fingerprint of the Ed25519 public key.
   */
  getPublicKeyFingerprint(): string {
    return getPublicKeyFingerprint(this.store.identityKeys.publicKey);
  }

  /**
   * Get the agent ID.
   */
  getAgentId(): string {
    return this.store.agentId;
  }

  /**
   * Export the private key as an encrypted QR code data URL.
   *
   * The QR contains a JSON payload with:
   *   - agentId
   *   - identitySecretKey (encrypted with password)
   *   - identityPublicKey
   *   - createdAt timestamp
   *   - token (random 32-byte hex, validated on import)
   *
   * Valid for 60 seconds — after that the timer invalidates the export token.
   *
   * @returns QR code data URL (string starting with "data:image/png;base64,")
   */
  async exportPrivateKeyQR(password: string): Promise<string> {
    // Generate a random export token for validation on import
    const exportToken = crypto.randomBytes(32).toString("hex");

    // Serialize the private key data
    const exportPayload = {
      a: this.store.agentId,
      pk: encodeBase64(this.store.identityKeys.publicKey),
      sk: encodeBase64(this.store.identityKeys.secretKey),
      ek_pk: encodeBase64(this.store.exchangeKeys.publicKey),
      ek_sk: encodeBase64(this.store.exchangeKeys.secretKey),
      t: Date.now(),
      token: exportToken,
    };

    const payloadJson = JSON.stringify(exportPayload);
    const payloadBytes = new TextEncoder().encode(payloadJson);

    // Encrypt with password
    const encrypted = encryptWithPassword(payloadBytes, password);

    // Pack into a transferable format
    const transferData = {
      v: 1,
      s: encodeBase64(encrypted.salt),
      i: encodeBase64(encrypted.iv),
      e: encodeBase64(encrypted.encrypted),
    };

    const transferJson = JSON.stringify(transferData);

    // Generate QR code
    const qrDataUrl = await QRCode.toDataURL(transferJson, {
      errorCorrectionLevel: "M",
      width: 400,
      margin: 2,
    });

    // Register the token as valid
    this.validExportTokens.add(exportToken);

    // Set 60-second auto-expiry timer that removes the token
    const exportId = encodeBase64(this.store.identityKeys.publicKey).slice(0, 16);
    const existingTimer = this.exportTimers.get(exportId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.validExportTokens.delete(exportToken);
      this.exportTimers.delete(exportId);
      this.logger.info("[Identity] Export QR expired for agent " + this.store.agentId);
    }, 60_000);

    this.exportTimers.set(exportId, timer);

    this.logger.info("[Identity] Private key exported as QR (60s validity)");
    return qrDataUrl;
  }

  /**
   * Import a private key from a QR code scan result.
   *
   * Validates the export token is still in the valid set (not expired/timer-deleted).
   *
   * @param data  The JSON string extracted from the QR code
   * @param password  The password used to encrypt the key
   * @returns true if import succeeded
   */
  importPrivateKeyFromQR(data: string, password: string): boolean {
    try {
      const transferData = JSON.parse(data);

      if (transferData.v !== 1) {
        this.logger.warn("[Identity] Unknown export format version:", transferData.v);
        return false;
      }

      const salt = decodeBase64(transferData.s);
      const iv = decodeBase64(transferData.i);
      const encrypted = decodeBase64(transferData.e);

      const decrypted = decryptWithPassword(salt, iv, encrypted, password);
      if (!decrypted) {
        this.logger.warn("[Identity] Decryption failed — wrong password or corrupted data");
        return false;
      }

      const payload = JSON.parse(new TextDecoder().decode(decrypted));

      // Check age — reject exports older than 60 seconds
      const age = Date.now() - payload.t;
      if (age > 60_000) {
        this.logger.warn("[Identity] Export data expired (" + Math.round(age / 1000) + "s old)");
        return false;
      }

      // Validate the export token is still in the valid set
      if (payload.token && typeof payload.token === "string") {
        if (!this.validExportTokens.has(payload.token)) {
          this.logger.warn("[Identity] Export token expired or already used — QR code is no longer valid");
          return false;
        }
        // Remove token after successful use (one-time use)
        this.validExportTokens.delete(payload.token);
      }

      // Restore keys
      this.store.agentId = payload.a;
      this.store.identityKeys = {
        publicKey: decodeBase64(payload.pk),
        secretKey: decodeBase64(payload.sk),
      };
      this.store.exchangeKeys = {
        publicKey: decodeBase64(payload.ek_pk),
        secretKey: decodeBase64(payload.ek_sk),
      };

      this.store.save();
      this.logger.info("[Identity] Private key imported successfully for agent " + this.store.agentId);
      return true;
    } catch (err) {
      this.logger.error("[Identity] Failed to import private key:", err);
      return false;
    }
  }

  /**
   * Regenerate all identity and exchange keys.
   *
   * WARNING: This invalidates all existing sessions and friendships.
   */
  regenerateKeys(): void {
    this.store.identityKeys = generateSigningKeyPair();
    this.store.exchangeKeys = generateKeyExchangeKeyPair();
    this.store.save();
  }

  /**
   * Clean up all export timers and valid tokens.
   */
  cleanup(): void {
    for (const timer of this.exportTimers.values()) {
      clearTimeout(timer);
    }
    this.exportTimers.clear();
    this.validExportTokens.clear();
  }
}
