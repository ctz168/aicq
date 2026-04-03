/**
 * Encrypted Chat Channel — handles incoming/outgoing encrypted messages
 * on the "encrypted-chat" channel.
 *
 * Decrypts incoming wire-format messages, verifies signatures, and emits
 * plaintext to the agent's conversation engine.  Encrypts outgoing messages
 * using the session key and signs them with the identity key.
 */

import * as fs from "fs";
import {
  encryptMessage,
  decryptMessage,
  encodeBase64,
  decodeBase64,
  nacl,
} from "@aicq/crypto";
import type { Logger, FileChunkBuffer, OpenClawAPI } from "../types.js";
import type { PluginStore } from "../store.js";
import type { HandshakeManager } from "../handshake/handshakeManager.js";
import type { P2PConnectionManager } from "../p2p/connectionManager.js";
import type { ServerClient } from "../services/serverClient.js";

export class EncryptedChatChannel {
  private store: PluginStore;
  private handshakeManager: HandshakeManager;
  private p2pManager: P2PConnectionManager;
  private serverClient: ServerClient;
  private logger: Logger;
  private api: OpenClawAPI | null = null;

  /** Active file chunk receive buffers keyed by sessionId. */
  private fileChunkBuffers: Map<string, FileChunkBuffer> = new Map();

  constructor(
    store: PluginStore,
    handshakeManager: HandshakeManager,
    p2pManager: P2PConnectionManager,
    serverClient: ServerClient,
    logger: Logger,
  ) {
    this.store = store;
    this.handshakeManager = handshakeManager;
    this.p2pManager = p2pManager;
    this.serverClient = serverClient;
    this.logger = logger;
  }

  /**
   * Set the OpenClaw API reference (for emitting events).
   */
  setAPI(api: OpenClawAPI): void {
    this.api = api;
  }

  /**
   * Handle an incoming encrypted message from a peer.
   *
   * @param encryptedData  Raw binary wire-format message
   * @param fromId  The sender's agent ID
   */
  onMessage(encryptedData: Buffer, fromId: string): void {
    const friend = this.store.getFriend(fromId);
    if (!friend) {
      this.logger.warn("[Chat] Received message from unknown peer:", fromId);
      return;
    }

    // Get or establish session key
    let sessionKey = this.handshakeManager.getSessionKey(fromId);
    if (!sessionKey && friend.sessionKey) {
      sessionKey = friend.sessionKey;
    }

    if (!sessionKey) {
      this.logger.warn("[Chat] No session key for peer:", fromId);
      return;
    }

    // Decrypt and verify
    const plaintext = decryptMessage(
      new Uint8Array(encryptedData),
      sessionKey,
      friend.publicKey,
    );

    if (plaintext === null) {
      this.logger.warn("[Chat] Failed to decrypt or verify message from:", fromId);
      return;
    }

    this.logger.info("[Chat] Decrypted message from " + fromId + " (" + plaintext.length + " chars)");

    // Emit plaintext to the agent's conversation engine
    if (this.api) {
      this.api.emit("chat:message", {
        from: fromId,
        message: plaintext,
        timestamp: Date.now(),
      });
    }

    // Update last message timestamp
    friend.lastMessageAt = new Date();
    this.store.save();
  }

  /**
   * Send an encrypted message to a peer.
   *
   * Encrypts with the session key, signs with the Ed25519 identity key,
   * and sends via P2P if available, falling back to WebSocket relay.
   *
   * @returns true if the message was sent successfully
   */
  send(toId: string, plaintext: string): boolean {
    const friend = this.store.getFriend(toId);
    if (!friend) {
      this.logger.warn("[Chat] Cannot send to unknown peer:", toId);
      return false;
    }

    // Get or establish session key
    let sessionKey = this.handshakeManager.getSessionKey(toId);
    if (!sessionKey && friend.sessionKey) {
      sessionKey = friend.sessionKey;
    }

    if (!sessionKey) {
      this.logger.warn("[Chat] No session key established with:", toId);
      return false;
    }

    // Encrypt and sign
    const wireData = encryptMessage(
      plaintext,
      sessionKey,
      this.store.identityKeys.secretKey,
      this.store.identityKeys.publicKey,
    );

    const buf = Buffer.from(wireData);

    // Try P2P first, fall back to WebSocket relay
    if (this.p2pManager.isConnected(toId) && this.p2pManager.send(toId, buf)) {
      this.logger.debug("[Chat] Sent message via P2P to " + toId);
    } else {
      // WebSocket fallback
      this.serverClient.sendRelayMessage(toId, {
        channel: "encrypted-chat",
        data: encodeBase64(wireData),
      });
      this.logger.debug("[Chat] Sent message via relay to " + toId);
    }

    // Update session message count
    const session = this.store.getSession(toId);
    if (session) {
      session.messageCount++;
      // Trigger key rotation after 100 messages
      if (session.messageCount % 100 === 0) {
        this.handshakeManager.rotateSessionKey(toId);
      }
      this.store.save();
    }

    return true;
  }

  /**
   * Handle an incoming file chunk from a peer.
   *
   * Buffers chunks and assembles the file when all chunks are received.
   */
  handleFileChunk(
    fromId: string,
    chunkData: Buffer,
    chunkIndex: number,
    sessionId: string,
  ): void {
    let buffer = this.fileChunkBuffers.get(sessionId);

    if (!buffer) {
      this.logger.warn("[Chat] Received file chunk for unknown session:", sessionId);
      return;
    }

    buffer.receivedChunks.set(chunkIndex, new Uint8Array(chunkData));

    const received = buffer.receivedChunks.size;
    this.logger.debug(
      `[Chat] File chunk ${chunkIndex + 1}/${buffer.totalChunks} received for session ${sessionId}`,
    );

    // Check if all chunks received
    if (received >= buffer.totalChunks) {
      this.assembleFile(sessionId);
    }
  }

  /**
   * Register a file chunk buffer for receiving.
   */
  registerFileBuffer(sessionId: string, buffer: FileChunkBuffer): void {
    this.fileChunkBuffers.set(sessionId, buffer);
  }

  /**
   * Remove a file chunk buffer.
   */
  removeFileBuffer(sessionId: string): void {
    this.fileChunkBuffers.delete(sessionId);
  }

  /**
   * Get a file chunk buffer by session ID.
   */
  getFileBuffer(sessionId: string): FileChunkBuffer | undefined {
    return this.fileChunkBuffers.get(sessionId);
  }

  /**
   * Assemble received file chunks into the complete file.
   */
  private assembleFile(sessionId: string): void {
    const buffer = this.fileChunkBuffers.get(sessionId);
    if (!buffer) return;

    // Sort chunks by index and concatenate
    const sortedChunks = Array.from(buffer.receivedChunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, chunk]) => chunk);

    const totalSize = sortedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const fileData = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of sortedChunks) {
      fileData.set(chunk, offset);
      offset += chunk.length;
    }

    // Verify hash
    const hash = nacl.hash(fileData);
    const hashHex = Array.from(hash.slice(0, 32))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (hashHex !== buffer.fileHash) {
      this.logger.error("[Chat] File hash mismatch for session " + sessionId);
      if (this.api) {
        this.api.emit("chat:file-error", {
          sessionId,
          error: "Hash verification failed",
        });
      }
      return;
    }

    // Write to disk if save path specified
    if (buffer.savePath) {
      fs.writeFileSync(buffer.savePath, fileData);
      this.logger.info("[Chat] File saved to " + buffer.savePath);
    }

    // Emit completion event
    if (this.api) {
      this.api.emit("chat:file-complete", {
        sessionId,
        senderId: buffer.senderId,
        fileName: buffer.fileName,
        size: totalSize,
        savePath: buffer.savePath,
      });
    }

    // Clean up
    this.fileChunkBuffers.delete(sessionId);
  }

  /**
   * Clean up resources.
   */
  cleanup(): void {
    this.fileChunkBuffers.clear();
  }
}
