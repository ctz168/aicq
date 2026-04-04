/**
 * File transfer manager with breakpoint resume support.
 *
 * Features:
 *  - Split files into 64 KB chunks
 *  - SHA-256 hash verification
 *  - Progress tracking with speed calculation
 *  - Pause / resume / cancel
 *  - Query missing chunks for breakpoint resume
 *  - Send via P2P (preferred) or WebSocket relay fallback
 */

import * as fs from 'fs';
import * as crypto from 'crypto';

import { APIClient } from '../services/apiClient.js';
import { WSClient } from '../services/wsClient.js';
import { ClientStore } from '../store.js';
import { P2PClient } from '../p2p/p2pClient.js';
import type {
  FileTransferInfo,
  FileMetadata,
  ProgressCallback,
} from '../types.js';

const CHUNK_SIZE = 64 * 1024; // 64 KB

/** Internal state for an active file transfer. */
interface ActiveTransfer {
  sessionId: string;
  friendId: string;
  direction: 'send' | 'receive';
  filePath: string;
  fileHash: string;
  fileSize: number;
  totalChunks: number;
  chunksSent: boolean[];
  chunksReceived: boolean[];
  status: 'pending' | 'transferring' | 'paused' | 'completed' | 'failed';
  progressCallback?: ProgressCallback;
  startTime: number;
  bytesTransferred: number;
  abortController?: AbortController;
}

export class FileManager {
  private api: APIClient;
  private ws: WSClient;
  private store: ClientStore;
  private p2p: P2PClient;

  private activeTransfers = new Map<string, ActiveTransfer>();

  /** Callback for file progress events. */
  private progressCallbacks: ((info: FileTransferInfo) => void)[] = [];

  constructor(
    api: APIClient,
    ws: WSClient,
    store: ClientStore,
    p2p: P2PClient,
  ) {
    this.api = api;
    this.ws = ws;
    this.store = store;
    this.p2p = p2p;

    this._setupListeners();
  }

  /* ──────────────── Callbacks ──────────────── */

  onProgress(callback: (info: FileTransferInfo) => void): void {
    this.progressCallbacks.push(callback);
  }

  private notifyProgress(info: FileTransferInfo): void {
    for (const cb of this.progressCallbacks) {
      try { cb(info); } catch { /* ignore */ }
    }
  }

  /* ──────────────── WebSocket listeners ──────────────── */

  private _setupListeners(): void {
    this.ws.on('file_chunk', (msg: any) => {
      if (msg.data?.type === 'file_chunk_data') {
        this._handleIncomingChunk(msg.from, msg.data);
      }
    });
  }

  /* ──────────────── Send file ──────────────── */

  /**
   * Send a file to a friend with progress tracking.
   *
   * @param friendId  Target friend's node ID.
   * @param filePath  Absolute path to the file on disk.
   * @param onProgress Optional progress callback.
   */
  async sendFile(
    friendId: string,
    filePath: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    // Check friend exists
    if (!this.store.friends.get(friendId)) {
      throw new Error(`Friend ${friendId} not found`);
    }

    // Read file and compute hash
    const fileBuffer = fs.readFileSync(filePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileSize = fileBuffer.length;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

    // Initiate transfer session on server
    const fileInfo: FileMetadata = {
      fileName: filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'unknown',
      fileSize,
      fileHash,
      chunks: totalChunks,
      chunkSize: CHUNK_SIZE,
    };

    let sessionId: string;
    try {
      const result = await this.api.initiateFileTransfer(friendId, fileInfo);
      sessionId = result.sessionId;
    } catch (err) {
      throw new Error(`Failed to initiate file transfer: ${err}`);
    }

    // Track state
    const transfer: ActiveTransfer = {
      sessionId,
      friendId,
      direction: 'send',
      filePath,
      fileHash,
      fileSize,
      totalChunks,
      chunksSent: new Array(totalChunks).fill(false),
      chunksReceived: new Array(totalChunks).fill(false),
      status: 'transferring',
      progressCallback: onProgress,
      startTime: Date.now(),
      bytesTransferred: 0,
    };

    this.activeTransfers.set(sessionId, transfer);

    // Update store
    const storeInfo: FileTransferInfo = {
      sessionId,
      fileName: fileInfo.fileName,
      fileSize,
      progress: 0,
      status: 'transferring',
      chunks: [...transfer.chunksSent],
    };
    this.store.setFileTransfer(sessionId, storeInfo);

    // Send chunks
    try {
      for (let i = 0; i < totalChunks; i++) {
        if (transfer.status === 'paused' || transfer.status === 'failed') {
          break;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const chunk = fileBuffer.slice(start, end);

        const sent = this._sendChunk(friendId, sessionId, i, chunk);
        if (!sent) {
          transfer.status = 'paused';
          break;
        }

        transfer.chunksSent[i] = true;
        transfer.bytesTransferred += chunk.length;

        // Report chunk to server
        try {
          await this.api.reportChunk(sessionId, i);
        } catch {
          // Non-fatal
        }

        // Update progress
        const progress = transfer.bytesTransferred / fileSize;
        storeInfo.progress = progress;
        storeInfo.chunks = [...transfer.chunksSent];
        this.store.setFileTransfer(sessionId, storeInfo);
        this.notifyProgress(storeInfo);

        if (onProgress) {
          const elapsed = (Date.now() - transfer.startTime) / 1000;
          onProgress({
            sent: transfer.bytesTransferred,
            total: fileSize,
            speed: formatSpeed(transfer.bytesTransferred / elapsed),
          });
        }
      }

      if (transfer.status === 'transferring') {
        transfer.status = 'completed';
        storeInfo.status = 'completed';
        storeInfo.progress = 1;
        this.store.setFileTransfer(sessionId, storeInfo);
        this.notifyProgress(storeInfo);
      }
    } catch (err) {
      transfer.status = 'failed';
      storeInfo.status = 'failed';
      this.store.setFileTransfer(sessionId, storeInfo);
      this.notifyProgress(storeInfo);
      throw err;
    }
  }

  /* ──────────────── Receive file ──────────────── */

  /**
   * Receive a file from a sender.
   *
   * Chunks arrive via WebSocket and are assembled. On completion, the SHA-256
   * hash is verified before the temp file is renamed.
   *
   * @param senderId  Sender's node ID.
   * @param sessionId Server-side transfer session ID.
   * @param savePath  Where to save the completed file.
   * @param onProgress Optional progress callback.
   */
  async receiveFile(
    senderId: string,
    sessionId: string,
    savePath: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    // Get session info from server
    const session = await this.api.getFileTransferSession(sessionId);

    const transfer: ActiveTransfer = {
      sessionId,
      friendId: senderId,
      direction: 'receive',
      filePath: savePath,
      fileHash: session.fileHash,
      fileSize: session.fileSize,
      totalChunks: session.totalChunks,
      chunksSent: new Array(session.totalChunks).fill(false),
      chunksReceived: new Array(session.totalChunks).fill(false),
      status: 'transferring',
      progressCallback: onProgress,
      startTime: Date.now(),
      bytesTransferred: 0,
    };

    // Pre-fill already received chunks
    for (let i = 0; i < session.chunksReceived.length; i++) {
      if (session.chunksReceived[i]) {
        transfer.chunksReceived[i] = true;
        transfer.bytesTransferred += Math.min(CHUNK_SIZE, session.fileSize - i * CHUNK_SIZE);
      }
    }

    this.activeTransfers.set(sessionId, transfer);

    const storeInfo: FileTransferInfo = {
      sessionId,
      fileName: session.fileName,
      fileSize: session.fileSize,
      progress: transfer.bytesTransferred / session.fileSize,
      status: 'transferring',
      chunks: [...transfer.chunksReceived],
    };
    this.store.setFileTransfer(sessionId, storeInfo);

    // The actual chunk receiving happens in _handleIncomingChunk.
    // We wait for completion or check status periodically.
    // For now, return a promise that resolves when complete.
    return new Promise<void>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const t = this.activeTransfers.get(sessionId);
        if (!t) {
          clearInterval(checkInterval);
          return;
        }

        if (t.status === 'completed') {
          clearInterval(checkInterval);
          // Verify hash
          const tempPath = savePath + '.tmp';
          try {
            const data = fs.readFileSync(tempPath);
            const hash = crypto.createHash('sha256').update(data).digest('hex');
            if (hash !== session.fileHash) {
              fs.unlinkSync(tempPath);
              reject(new Error('File hash verification failed'));
              return;
            }
            fs.renameSync(tempPath, savePath);
            resolve();
          } catch (err) {
            reject(err);
          }
        } else if (t.status === 'failed') {
          clearInterval(checkInterval);
          reject(new Error('File transfer failed'));
        }
      }, 1000);
    });
  }

  /* ──────────────── Incoming chunk handler ──────────────── */

  private _handleIncomingChunk(fromId: string, data: any): void {
    const { sessionId, chunkIndex, chunkData } = data;

    // Find the active transfer
    let transfer: ActiveTransfer | null = null;
    for (const t of this.activeTransfers.values()) {
      if (t.sessionId === sessionId && t.friendId === fromId && t.direction === 'receive') {
        transfer = t;
        break;
      }
    }

    if (!transfer || transfer.status !== 'transferring') {
      return;
    }

    if (chunkIndex < 0 || chunkIndex >= transfer.totalChunks) {
      return;
    }

    // Write chunk to temp file
    try {
      const tempPath = transfer.filePath + '.tmp';
      const chunk = Buffer.from(chunkData, 'base64');
      const offset = chunkIndex * CHUNK_SIZE;

      // Ensure directory exists
      const dir = tempPath.substring(0, tempPath.lastIndexOf('/'));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // If file doesn't exist, create it with the right size
      if (!fs.existsSync(tempPath)) {
        const fd = fs.openSync(tempPath, 'w');
        // Pre-allocate — write a single byte at the end
        if (transfer.fileSize > 0) {
          fs.writeSync(fd, Buffer.alloc(1), 0, 1, transfer.fileSize - 1);
        }
        fs.closeSync(fd);
      }

      const fd = fs.openSync(tempPath, 'r+');
      fs.writeSync(fd, chunk, 0, chunk.length, offset);
      fs.closeSync(fd);

      transfer.chunksReceived[chunkIndex] = true;
      transfer.bytesTransferred = transfer.chunksReceived
        .filter(Boolean)
        .reduce((sum, received, idx) => {
          return sum + (received ? Math.min(CHUNK_SIZE, transfer!.fileSize - idx * CHUNK_SIZE) : 0);
        }, 0);

      // Report chunk to server
      this.api.reportChunk(sessionId, chunkIndex).catch(() => {
        // Non-fatal
      });

      // Update progress
      const progress = transfer.bytesTransferred / transfer.fileSize;
      const storeInfo = this.store.getFileTransfer(sessionId);
      if (storeInfo) {
        storeInfo.progress = progress;
        storeInfo.chunks = [...transfer.chunksReceived];
        this.store.setFileTransfer(sessionId, storeInfo);
        this.notifyProgress(storeInfo);
      }

      if (transfer.progressCallback) {
        const elapsed = (Date.now() - transfer.startTime) / 1000;
        transfer.progressCallback({
          sent: transfer.bytesTransferred,
          total: transfer.fileSize,
          speed: formatSpeed(transfer.bytesTransferred / elapsed),
        });
      }

      // Check completion
      if (transfer.chunksReceived.every(Boolean)) {
        transfer.status = 'completed';
        const info = this.store.getFileTransfer(sessionId);
        if (info) {
          info.status = 'completed';
          info.progress = 1;
          this.store.setFileTransfer(sessionId, info);
          this.notifyProgress(info);
        }
      }
    } catch (err) {
      console.error(`[FileManager] Failed to write chunk ${chunkIndex}:`, err);
    }
  }

  /* ──────────────── Pause / Resume / Cancel ──────────────── */

  pauseTransfer(sessionId: string): void {
    const transfer = this.activeTransfers.get(sessionId);
    if (!transfer) return;

    transfer.status = 'paused';
    const info = this.store.getFileTransfer(sessionId);
    if (info) {
      info.status = 'paused';
      this.store.setFileTransfer(sessionId, info);
      this.notifyProgress(info);
    }
  }

  async resumeTransfer(sessionId: string): Promise<void> {
    const transfer = this.activeTransfers.get(sessionId);
    if (!transfer) {
      throw new Error('No active transfer found');
    }

    if (transfer.direction === 'send') {
      // Query missing chunks and resend
      try {
        const missing = await this.api.getFileMissingChunks(sessionId);
        if (missing.length === 0) {
          transfer.status = 'completed';
          return;
        }

        transfer.status = 'transferring';
        const fileBuffer = fs.readFileSync(transfer.filePath);

        for (const chunkIndex of missing) {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, transfer.fileSize);
          const chunk = fileBuffer.slice(start, end);

          this._sendChunk(transfer.friendId, sessionId, chunkIndex, chunk);
          transfer.chunksSent[chunkIndex] = true;
          transfer.bytesTransferred += chunk.length;

          await this.api.reportChunk(sessionId, chunkIndex);

          const info = this.store.getFileTransfer(sessionId);
          if (info) {
            info.progress = transfer.bytesTransferred / transfer.fileSize;
            this.store.setFileTransfer(sessionId, info);
            this.notifyProgress(info);
          }
        }

        transfer.status = 'completed';
        const finalInfo = this.store.getFileTransfer(sessionId);
        if (finalInfo) {
          finalInfo.status = 'completed';
          finalInfo.progress = 1;
          this.store.setFileTransfer(sessionId, finalInfo);
          this.notifyProgress(finalInfo);
        }
      } catch (err) {
        transfer.status = 'failed';
        throw err;
      }
    } else {
      // Receive resume
      transfer.status = 'transferring';
      // The WebSocket listener will handle incoming chunks
    }
  }

  cancelTransfer(sessionId: string): void {
    const transfer = this.activeTransfers.get(sessionId);
    if (!transfer) return;

    transfer.status = 'failed';
    this.activeTransfers.delete(sessionId);

    const info = this.store.getFileTransfer(sessionId);
    if (info) {
      info.status = 'failed';
      this.store.setFileTransfer(sessionId, info);
      this.notifyProgress(info);
    }

    // Clean up temp file
    const tempPath = transfer.filePath + '.tmp';
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore
      }
    }
  }

  /* ──────────────── Query ──────────────── */

  getTransferProgress(sessionId: string): {
    sent: number;
    total: number;
    speed: string;
  } {
    const transfer = this.activeTransfers.get(sessionId);
    if (!transfer) {
      return { sent: 0, total: 0, speed: '0 B/s' };
    }

    const elapsed = (Date.now() - transfer.startTime) / 1000;
    return {
      sent: transfer.bytesTransferred,
      total: transfer.fileSize,
      speed: formatSpeed(transfer.bytesTransferred / Math.max(elapsed, 0.1)),
    };
  }

  isTransferActive(): boolean {
    for (const t of this.activeTransfers.values()) {
      if (t.status === 'transferring' || t.status === 'pending') {
        return true;
      }
    }
    return false;
  }

  /* ──────────────── Helpers ──────────────── */

  private _sendChunk(
    friendId: string,
    sessionId: string,
    chunkIndex: number,
    chunk: Buffer,
  ): boolean {
    // Try P2P first
    if (this.p2p.isConnected(friendId)) {
      const payload = Buffer.from(
        JSON.stringify({
          type: 'file_chunk_data',
          sessionId,
          chunkIndex,
          chunkData: chunk.toString('base64'),
        }),
        'utf-8',
      );
      return this.p2p.send(friendId, payload);
    }

    // Fall back to WebSocket relay
    this.ws.send('file_chunk', {
      to: friendId,
      data: {
        type: 'file_chunk_data',
        sessionId,
        chunkIndex,
        chunkData: chunk.toString('base64'),
      },
    });

    return true; // Assume success via WS
  }

  /* ──────────────── Cleanup ──────────────── */

  destroy(): void {
    for (const [sessionId, transfer] of this.activeTransfers) {
      if (transfer.status === 'transferring') {
        this.cancelTransfer(sessionId);
      }
    }
    this.activeTransfers.clear();
    this.progressCallbacks.length = 0;
  }
}

/* ──────────────── Utility ──────────────── */

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(1)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  if (bytesPerSecond < 1024 * 1024 * 1024)
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}
