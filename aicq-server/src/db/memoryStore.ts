import {
  NodeRecord,
  TempNumberRecord,
  HandshakeSession,
  FileTransferRecord,
  PendingRequest,
  Account,
  VerificationCode,
  Session,
  Group,
} from '../models/types';
import { config } from '../config';

export class MemoryStore {
  /** Registered nodes keyed by node ID */
  nodes = new Map<string, NodeRecord>();

  /** Active temp numbers keyed by 6-digit string */
  tempNumbers = new Map<string, TempNumberRecord>();

  /** Active handshake sessions keyed by session ID */
  handshakeSessions = new Map<string, HandshakeSession>();

  /** Active file transfers keyed by session ID */
  fileTransfers = new Map<string, FileTransferRecord>();

  /** Pending friend requests keyed by target node ID */
  pendingRequests = new Map<string, PendingRequest[]>();

  /** Registered user accounts */
  accounts = new Map<string, Account>();

  /** Verification codes */
  verificationCodes = new Map<string, VerificationCode>();

  /** Active sessions */
  sessions = new Map<string, Session>();

  /** Groups keyed by group ID */
  groups = new Map<string, Group>();

  /**
   * Remove expired temp numbers from the store.
   * Should be called periodically (e.g. every minute).
   */
  cleanupExpiredTempNumbers(): number {
    const now = Date.now();
    let removed = 0;
    for (const [number, record] of this.tempNumbers) {
      if (record.expiresAt <= now) {
        this.tempNumbers.delete(number);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Remove expired handshake sessions.
   * Sessions expire after 10 minutes.
   */
  cleanupExpiredHandshakeSessions(): number {
    const now = Date.now();
    let removed = 0;
    for (const [sessionId, session] of this.handshakeSessions) {
      if (session.expiresAt <= now) {
        this.handshakeSessions.delete(sessionId);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Remove completed/cancelled file transfers older than 1 hour.
   */
  cleanupOldFileTransfers(): number {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    let removed = 0;
    for (const [sessionId, transfer] of this.fileTransfers) {
      if (
        (transfer.completedAt || transfer.cancelledAt) &&
        now - (transfer.completedAt || transfer.cancelledAt!) > oneHour
      ) {
        this.fileTransfers.delete(sessionId);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Remove expired verification codes.
   */
  cleanupExpiredCodes(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, record] of this.verificationCodes) {
      if (record.expiresAt <= now) {
        this.verificationCodes.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Remove expired sessions.
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let removed = 0;
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
        removed++;
      }
    }
    return removed;
  }
}

/** Singleton store instance */
export const store = new MemoryStore();

/** Helper: get or create a node record */
export function getOrCreateNode(nodeId: string, publicKey: string): NodeRecord {
  let node = store.nodes.get(nodeId);
  if (!node) {
    node = {
      id: nodeId,
      publicKey,
      lastSeen: Date.now(),
      socketId: null,
      friendCount: 0,
      friends: new Set<string>(),
    };
    store.nodes.set(nodeId, node);
  }
  return node;
}

/** Start periodic cleanup (every 60 seconds) */
export function startPeriodicCleanup(): NodeJS.Timeout {
  const interval = setInterval(() => {
    store.cleanupExpiredTempNumbers();
    store.cleanupExpiredHandshakeSessions();
    store.cleanupOldFileTransfers();
    store.cleanupExpiredCodes();
    store.cleanupExpiredSessions();
  }, 60_000);

  // Don't prevent process exit
  if (interval.unref) {
    interval.unref();
  }

  return interval;
}
