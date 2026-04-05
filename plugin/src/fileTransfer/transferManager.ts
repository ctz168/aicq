/**
 * File Transfer Manager — handles file sending/receiving between peers.
 *
 * Splits files into chunks, tracks progress, supports pause/resume
 * with missing chunk queries, and verifies file hashes on completion.
 */

import * as fs from "fs";
import * as path from "path";
import { nacl } from "@aicq/crypto";
import type { PluginStore } from "../store.js";
import type { ServerClient } from "../services/serverClient.js";
import type { P2PConnectionManager } from "../p2p/connectionManager.js";
import type { EncryptedChatChannel } from "../channels/encryptedChat.js";
import type {
  FileTransferSession,
  FileChunkBuffer,
  Logger,
} from "../types.js";

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB chunks

export class FileTransferManager {
  private store: PluginStore;
  private serverClient: ServerClient;
  private p2pManager: P2PConnectionManager;
  private chatChannel: EncryptedChatChannel;
  private logger: Logger;

  /** Active file transfer sessions keyed by session ID. */
  private sessions: Map<string, FileTransferSession> = new Map();

  /** Active send pause/resume state. */
  private pausedSends: Set<string> = new Set();

  constructor(
    store: PluginStore,
    serverClient: ServerClient,
    p2pManager: P2PConnectionManager,
    chatChannel: EncryptedChatChannel,
    logger: Logger,
  ) {
    this.store = store;
    this.serverClient = serverClient;
    this.p2pManager = p2pManager;
    this.chatChannel = chatChannel;
    this.logger = logger;
  }

  /**
   * Send a file to a receiver.
   *
   * @param receiverId  The friend ID of the receiver
   * @param filePath  Absolute path to the file
   * @param chunkSize  Optional chunk size in bytes (default 64KB)
   */
  async sendFile(
    receiverId: string,
    filePath: string,
    chunkSize: number = DEFAULT_CHUNK_SIZE,
  ): Promise<void> {
    const friend = this.store.getFriend(receiverId);
    if (!friend) {
      throw new Error("Cannot send file — " + receiverId + " is not a friend");
    }

    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const fileSize = fileBuffer.length;

    // Compute hash
    const hash = nacl.hash(new Uint8Array(fileBuffer));
    const fileHash = Array.from(hash.slice(0, 32))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Split into chunks
    const totalChunks = Math.ceil(fileSize / chunkSize);
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      chunks.push(fileBuffer.slice(start, end));
    }

    // Initiate transfer via server
    const session = await this.serverClient.initiateFileTransfer(receiverId, {
      fileName,
      fileSize,
      fileHash,
      totalChunks,
      chunkSize,
    });

    if (!session) {
      throw new Error("Failed to initiate file transfer with server");
    }

    const sessionId = session.sessionId;

    // Create local session tracking
    const transferSession: FileTransferSession = {
      sessionId,
      senderId: this.store.agentId,
      receiverId,
      fileName,
      fileSize,
      fileHash,
      totalChunks,
      chunkSize,
      sentChunks: new Set(),
      receivedChunks: new Set(),
      status: "transferring",
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, transferSession);

    this.logger.info(
      `[FileTransfer] Sending ${fileName} (${fileSize} bytes, ${totalChunks} chunks) to ${receiverId}`,
    );

    // Send chunks
    for (let i = 0; i < chunks.length; i++) {
      // Check if paused
      while (this.pausedSends.has(sessionId)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Check if cancelled
      const current = this.sessions.get(sessionId);
      if (!current || current.status === "cancelled") {
        this.logger.info("[FileTransfer] Transfer cancelled:", sessionId);
        return;
      }

      const chunkData = Buffer.from(chunks[i]);

      // Send via P2P or WebSocket
      if (this.p2pManager.isConnected(receiverId)) {
        this.p2pManager.send(receiverId, chunkData);
      } else {
        this.serverClient.sendRelayMessage(receiverId, {
          type: "file_chunk",
          sessionId,
          chunkIndex: i,
          data: chunkData.toString("base64"),
        });
      }

      transferSession.sentChunks.add(i);
    }

    transferSession.status = "completed";
    this.logger.info("[FileTransfer] File sent successfully:", sessionId);
  }

  /**
   * Receive a file from a sender.
   *
   * Sets up a chunk buffer and registers it with the chat channel.
   *
   * @param senderId  The friend ID of the sender
   * @param sessionId  The file transfer session ID
   * @param savePath  Where to save the completed file
   * @param fileName  The original file name
   * @param totalChunks  Total number of chunks expected
   * @param fileHash  SHA-256 hash of the complete file
   */
  receiveFile(
    senderId: string,
    sessionId: string,
    savePath: string,
    fileName: string,
    totalChunks: number,
    fileHash: string,
  ): void {
    const buffer: FileChunkBuffer = {
      sessionId,
      senderId,
      fileName,
      totalChunks,
      receivedChunks: new Map(),
      fileHash,
      savePath,
    };

    this.chatChannel.registerFileBuffer(sessionId, buffer);

    // Create local session tracking
    const transferSession: FileTransferSession = {
      sessionId,
      senderId,
      receiverId: this.store.agentId,
      fileName,
      fileSize: 0, // unknown until complete
      fileHash,
      totalChunks,
      chunkSize: 0,
      sentChunks: new Set(),
      receivedChunks: new Set(),
      status: "transferring",
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, transferSession);

    this.logger.info(
      `[FileTransfer] Receiving ${fileName} (${totalChunks} chunks) from ${senderId}`,
    );
  }

  /**
   * Get transfer progress.
   */
  getProgress(sessionId: string): { sent: number; total: number; percentage: number } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { sent: 0, total: 0, percentage: 0 };
    }

    const sent = Math.max(session.sentChunks.size, session.receivedChunks.size);
    const total = session.totalChunks;
    const percentage = total > 0 ? Math.round((sent / total) * 100) : 0;

    return { sent, total, percentage };
  }

  /**
   * Pause an active file transfer.
   */
  pauseTransfer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn("[FileTransfer] Cannot pause — session not found:", sessionId);
      return;
    }

    if (session.status !== "transferring") {
      this.logger.warn("[FileTransfer] Cannot pause — session not transferring:", sessionId);
      return;
    }

    session.status = "paused";
    this.pausedSends.add(sessionId);
    this.logger.info("[FileTransfer] Transfer paused:", sessionId);
  }

  /**
   * Resume a paused file transfer.
   */
  async resumeTransfer(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn("[FileTransfer] Cannot resume — session not found:", sessionId);
      return;
    }

    if (session.status !== "paused") {
      this.logger.warn("[FileTransfer] Cannot resume — session not paused:", sessionId);
      return;
    }

    session.status = "transferring";
    this.pausedSends.delete(sessionId);
    this.logger.info("[FileTransfer] Transfer resumed:", sessionId);

    // If we're the receiver, query missing chunks
    if (session.receiverId === this.store.agentId) {
      const missingChunks = await this.serverClient.getFileMissingChunks(sessionId);
      if (missingChunks.length > 0) {
        this.logger.info(
          `[FileTransfer] ${missingChunks.length} missing chunks for resume`,
        );
        // Request missing chunks from sender
        this.serverClient.sendRelayMessage(session.senderId, {
          type: "file_chunk_request",
          sessionId,
          missingChunks,
        });
      }
    }
  }

  /**
   * Cancel a file transfer.
   */
  cancelTransfer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = "cancelled";
    this.pausedSends.delete(sessionId);
    this.chatChannel.removeFileBuffer(sessionId);
    this.sessions.delete(sessionId);

    this.logger.info("[FileTransfer] Transfer cancelled:", sessionId);
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): FileTransferSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clean up all transfers.
   */
  cleanup(): void {
    for (const [, session] of this.sessions) {
      if (session.status === "transferring" || session.status === "paused") {
        session.status = "cancelled";
      }
    }
    this.sessions.clear();
    this.pausedSends.clear();
  }
}
