import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/memoryStore';
import { FileTransferRecord } from '../models/types';

/**
 * Initiate a file transfer session between two nodes.
 */
export function initiateTransfer(
  senderId: string,
  receiverId: string,
  fileInfo: {
    fileName: string;
    fileSize: number;
    fileHash: string;
    chunks: number;
    chunkSize: number;
  },
): FileTransferRecord {
  const senderNode = store.nodes.get(senderId);
  if (!senderNode) {
    throw new Error('Sender node not registered');
  }

  const receiverNode = store.nodes.get(receiverId);
  if (!receiverNode) {
    throw new Error('Receiver node not registered');
  }

  const now = Date.now();
  const transfer: FileTransferRecord = {
    id: uuidv4(),
    senderId,
    receiverId,
    fileName: fileInfo.fileName,
    fileSize: fileInfo.fileSize,
    fileHash: fileInfo.fileHash,
    totalChunks: fileInfo.chunks,
    chunkSize: fileInfo.chunkSize,
    chunksReceived: new Array(fileInfo.chunks).fill(false),
    createdAt: now,
    completedAt: null,
    cancelledAt: null,
  };

  store.fileTransfers.set(transfer.id, transfer);
  store.persistFileTransfer(transfer);

  return transfer;
}

/**
 * Get a file transfer session by ID.
 */
export function getTransferSession(
  sessionId: string,
): FileTransferRecord | null {
  const record = store.fileTransfers.get(sessionId);
  if (!record) return null;
  return record;
}

/**
 * Report that a specific chunk has been received.
 * Used to track progress for breakpoint resume support.
 */
export function reportChunkProgress(
  sessionId: string,
  chunkIndex: number,
): void {
  const transfer = store.fileTransfers.get(sessionId);
  if (!transfer) {
    throw new Error('Transfer session not found');
  }
  if (transfer.cancelledAt) {
    throw new Error('Transfer has been cancelled');
  }
  if (transfer.completedAt) {
    throw new Error('Transfer already completed');
  }

  if (chunkIndex < 0 || chunkIndex >= transfer.totalChunks) {
    throw new Error('Invalid chunk index');
  }

  transfer.chunksReceived[chunkIndex] = true;
  store.persistFileTransfer(transfer);
}

/**
 * Get the list of chunk indices that have NOT been received yet.
 * Used for resume after disconnection — the sender can resend only missing chunks.
 */
export function getMissingChunks(sessionId: string): number[] {
  const transfer = store.fileTransfers.get(sessionId);
  if (!transfer) return [];

  const missing: number[] = [];
  for (let i = 0; i < transfer.totalChunks; i++) {
    if (!transfer.chunksReceived[i]) {
      missing.push(i);
    }
  }
  return missing;
}

/**
 * Mark a transfer as completed.
 */
export function completeTransfer(sessionId: string): void {
  const transfer = store.fileTransfers.get(sessionId);
  if (!transfer) {
    throw new Error('Transfer session not found');
  }
  if (transfer.cancelledAt) {
    throw new Error('Transfer has been cancelled');
  }

  transfer.completedAt = Date.now();
  store.persistFileTransfer(transfer);
}

/**
 * Cancel an ongoing transfer.
 */
export function cancelTransfer(sessionId: string): void {
  const transfer = store.fileTransfers.get(sessionId);
  if (!transfer) {
    throw new Error('Transfer session not found');
  }
  if (transfer.completedAt) {
    throw new Error('Transfer already completed');
  }

  transfer.cancelledAt = Date.now();
  store.persistFileTransfer(transfer);
}
