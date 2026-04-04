/**
 * Tool handler: chat-export-key
 *
 * Exports the agent's private key as an encrypted QR code for human takeover.
 * The QR code is valid for 60 seconds after generation.
 */

import type { IdentityService } from "../services/identityService.js";
import type { Logger } from "../types.js";

export class ChatExportKeyTool {
  private identityService: IdentityService;
  private logger: Logger;

  /** Rate limiting: max 3 exports per 5 minutes. */
  private exportTimestamps: number[] = [];
  private readonly maxExports = 3;
  private readonly rateLimitWindowMs = 5 * 60 * 1000;

  constructor(identityService: IdentityService, logger: Logger) {
    this.identityService = identityService;
    this.logger = logger;
  }

  /**
   * Handle a chat-export-key tool invocation.
   */
  async handle(params: Record<string, unknown>): Promise<unknown> {
    const password = params.password as string;

    if (!password) {
      return { error: "Missing required parameter: password" };
    }

    if (password.length < 8) {
      return { error: "Password must be at least 8 characters long" };
    }

    // Rate limit check
    const now = Date.now();
    this.exportTimestamps = this.exportTimestamps.filter(
      (t) => now - t < this.rateLimitWindowMs,
    );

    if (this.exportTimestamps.length >= this.maxExports) {
      return {
        error: `Rate limit exceeded. Max ${this.maxExports} exports per 5 minutes. Please wait.`,
        retryAfterMs: Math.min(...this.exportTimestamps.map((t) => this.rateLimitWindowMs - (now - t))),
      };
    }

    // Generate QR code
    this.exportTimestamps.push(now);

    try {
      const qrDataUrl = await this.identityService.exportPrivateKeyQR(password);

      this.logger.info("[ExportKeyTool] Private key exported as QR code");

      return {
        success: true,
        qrCodeDataUrl: qrDataUrl,
        expiresIn: 60,
        warning: "This QR code expires in 60 seconds. Only share it with the intended human operator.",
      };
    } catch (err) {
      this.logger.error("[ExportKeyTool] Failed to export key:", err);
      return { error: "Failed to generate QR code: " + (err instanceof Error ? err.message : String(err)) };
    }
  }

  /**
   * Check if the rate limit allows an export.
   */
  isRateLimited(): boolean {
    const now = Date.now();
    this.exportTimestamps = this.exportTimestamps.filter(
      (t) => now - t < this.rateLimitWindowMs,
    );
    return this.exportTimestamps.length >= this.maxExports;
  }
}
