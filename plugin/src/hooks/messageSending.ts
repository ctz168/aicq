/**
 * Hook: message_sending
 *
 * Intercepts outgoing messages targeted at the "encrypted-chat" channel.
 * Encrypts the message body and signs it before it leaves the plugin.
 */

import { encryptMessage, encodeBase64 } from "@aicq/crypto";
import type { PluginStore } from "../store.js";
import type { HandshakeManager } from "../handshake/handshakeManager.js";
import type { Logger, MessageEnvelope } from "../types.js";

export class MessageSendingHook {
  private store: PluginStore;
  private handshakeManager: HandshakeManager;
  private logger: Logger;

  constructor(
    store: PluginStore,
    handshakeManager: HandshakeManager,
    logger: Logger,
  ) {
    this.store = store;
    this.handshakeManager = handshakeManager;
    this.logger = logger;
  }

  /**
   * Intercept an outgoing message for encryption.
   *
   * If the message is destined for the encrypted-chat channel, encrypt
   * and sign it.  Otherwise pass through unchanged.
   *
   * @param message  The outgoing message object
   * @param metadata  Optional metadata (may contain channel, targetId, etc.)
   * @returns The (possibly modified) message envelope
   */
  async intercept(
    message: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<MessageEnvelope | unknown> {
    const meta = metadata || {};
    const channel = meta.channel as string;
    const targetId = meta.targetId as string;

    // Only intercept messages to the encrypted-chat channel
    if (channel !== "encrypted-chat") {
      return message;
    }

    if (!targetId) {
      this.logger.warn("[MessageHook] No targetId in metadata for encrypted-chat");
      return message;
    }

    const friend = this.store.getFriend(targetId);
    if (!friend) {
      this.logger.warn("[MessageHook] Target is not a friend:", targetId);
      return message;
    }

    // Get session key
    let sessionKey = this.handshakeManager.getSessionKey(targetId);
    if (!sessionKey && friend.sessionKey) {
      sessionKey = friend.sessionKey;
    }

    if (!sessionKey) {
      this.logger.warn("[MessageHook] No session key for target:", targetId);
      return message;
    }

    // Serialize the message to a string
    const plaintext = typeof message === "string" ? message : JSON.stringify(message);

    // Encrypt and sign
    const wireData = encryptMessage(
      plaintext,
      sessionKey,
      this.store.identityKeys.secretKey,
      this.store.identityKeys.publicKey,
    );

    // Update session message count
    const session = this.store.getSession(targetId);
    if (session) {
      session.messageCount++;
      this.store.save();
    }

    this.logger.debug("[MessageHook] Intercepted and encrypted message for " + targetId);

    return {
      targetId,
      encryptedData: encodeBase64(wireData),
      timestamp: Date.now(),
    } satisfies MessageEnvelope;
  }
}
