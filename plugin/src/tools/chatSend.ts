/**
 * Tool handler: chat-send
 *
 * Sends encrypted messages to friends.  Supports text and file-info message
 * types.  Verifies the target is a valid friend before sending.
 */

import type { PluginStore } from "../store.js";
import type { EncryptedChatChannel } from "../channels/encryptedChat.js";
import type { HandshakeManager } from "../handshake/handshakeManager.js";
import type { Logger } from "../types.js";

export class ChatSendTool {
  private store: PluginStore;
  private chatChannel: EncryptedChatChannel;
  private handshakeManager: HandshakeManager;
  private logger: Logger;

  constructor(
    store: PluginStore,
    chatChannel: EncryptedChatChannel,
    handshakeManager: HandshakeManager,
    logger: Logger,
  ) {
    this.store = store;
    this.chatChannel = chatChannel;
    this.handshakeManager = handshakeManager;
    this.logger = logger;
  }

  /**
   * Handle a chat-send tool invocation.
   */
  async handle(params: Record<string, unknown>): Promise<unknown> {
    const target = params.target as string;
    const message = params.message as string;
    const type = (params.type as string) || "text";
    const fileInfo = params.fileInfo as Record<string, unknown> | undefined;

    if (!target) {
      return { error: "Missing required parameter: target (friend ID)" };
    }
    if (!message && type !== "file-info") {
      return { error: "Missing required parameter: message" };
    }

    // Verify target is a friend
    const friend = this.store.getFriend(target);
    if (!friend) {
      return { error: "Target is not in your friend list: " + target };
    }

    // Check if we have a session key
    let sessionKey = this.handshakeManager.getSessionKey(target);
    if (!sessionKey && friend.sessionKey) {
      sessionKey = friend.sessionKey;
    }

    if (!sessionKey) {
      return { error: "No session established with " + target + ". Please try again after handshake completes." };
    }

    // Build the message payload based on type
    let payload: string;

    switch (type) {
      case "text":
        payload = message;
        break;

      case "file-info":
        if (!fileInfo) {
          return { error: "Missing fileInfo parameter for type=file-info" };
        }
        payload = JSON.stringify({
          __type: "file-info",
          fileName: fileInfo.fileName,
          fileSize: fileInfo.fileSize,
          fileHash: fileInfo.fileHash,
          chunks: fileInfo.chunks,
          timestamp: Date.now(),
        });
        break;

      default:
        return { error: "Unknown message type: " + type };
    }

    // Send via encrypted channel
    const sent = this.chatChannel.send(target, payload);

    if (!sent) {
      return { error: "Failed to send message to " + target };
    }

    this.logger.info("[SendTool] Sent " + type + " message to " + target);

    return {
      success: true,
      target,
      type,
      timestamp: Date.now(),
      ...(type === "text" ? { messageLength: message.length } : {}),
    };
  }
}
