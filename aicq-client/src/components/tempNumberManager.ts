/**
 * Temporary number management for friend discovery.
 *
 * Temp numbers are 6-digit codes that can be shared via QR codes for
 * easy friend adding. The manager handles requesting, QR generation,
 * parsing, and cleanup.
 */

import QRCode from 'qrcode';
import { APIClient } from '../services/apiClient.js';
import { ClientStore } from '../store.js';
import type { TempNumberInfo } from '../types.js';

/** Parsed QR code data. */
export interface ParsedQR {
  type: 'temp-number' | 'private-key';
  data: string;
}

export class TempNumberManager {
  private api: APIClient;
  private store: ClientStore;

  constructor(api: APIClient, store: ClientStore) {
    this.api = api;
    this.store = store;

    // Clean up expired numbers on init
    this.cleanupExpired();
  }

  /* ──────────────── Request ──────────────── */

  /**
   * Request a new 6-digit temporary number from the server.
   *
   * @returns The temporary number string.
   */
  async requestNew(): Promise<string> {
    const number = await this.api.requestTempNumber();

    // We don't get expiresAt from the request API directly,
    // so we'll use the resolve API to get it, or estimate it.
    // Default TTL is 10 minutes (600000 ms)
    const now = Date.now();
    const expiresAt = now + 600_000; // 10 min default

    const info: TempNumberInfo = {
      number,
      expiresAt,
      createdAt: now,
    };

    this.store.addTempNumber(info);
    this.store.save();

    return number;
  }

  /* ──────────────── QR code generation ──────────────── */

  /**
   * Generate a QR code containing the temp number.
   *
   * QR format: `aicq:add:{number}`
   *
   * @returns Data URL of the QR code image.
   */
  async generateQR(number: string): Promise<string> {
    const qrData = `aicq:add:${number}`;
    return QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      width: 300,
      margin: 2,
    });
  }

  /* ──────────────── QR parsing ──────────────── */

  /**
   * Parse a QR code data string.
   *
   * Supported formats:
   *   - `aicq:add:{6-digit-number}` → temp number
   *   - `aicq:privkey:v1:{...}`   → private key export
   *
   * @returns Parsed data, or null if format is unrecognised.
   */
  scanAndParse(qrData: string): ParsedQR | null {
    const trimmed = qrData.trim();

    // Temp number format
    if (trimmed.startsWith('aicq:add:')) {
      const number = trimmed.slice('aicq:add:'.length);
      if (/^\d{6}$/.test(number)) {
        return { type: 'temp-number', data: number };
      }
      return null;
    }

    // Private key format
    if (trimmed.startsWith('aicq:privkey:v1:')) {
      return { type: 'private-key', data: trimmed };
    }

    return null;
  }

  /* ──────────────── Query ──────────────── */

  /** Get all active (non-expired) temporary numbers. */
  getActiveNumbers(): TempNumberInfo[] {
    this.cleanupExpired();
    return this.store.tempNumbers;
  }

  /* ──────────────── Revoke ──────────────── */

  /**
   * Revoke a temporary number.
   */
  async revoke(number: string): Promise<void> {
    await this.api.revokeTempNumber(number);
    this.store.removeTempNumber(number);
    this.store.save();
  }

  /* ──────────────── Cleanup ──────────────── */

  /** Remove expired numbers from the store. */
  cleanupExpired(): void {
    const now = Date.now();
    let changed = false;

    for (const info of this.store.tempNumbers) {
      if (info.expiresAt <= now) {
        this.store.removeTempNumber(info.number);
        changed = true;
      }
    }

    if (changed) {
      this.store.save();
    }
  }
}
