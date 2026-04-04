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
  FriendRequest,
  PushNotification,
  SubAgentSession,
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

  /** Friend requests keyed by request ID */
  friendRequests = new Map<string, FriendRequest>();

  /** Push notifications keyed by notification ID */
  notifications = new Map<string, PushNotification>();

  /** Group message history keyed by group ID */
  groupMessages = new Map<string, any[]>();

  /** Sub-agent sessions keyed by session ID */
  subAgents = new Map<string, SubAgentSession>();

  // ─── Index maps for O(1) lookups ─────────────────────────────
  /** email -> accountId */
  emailIndex = new Map<string, string>();
  /** phone -> accountId */
  phoneIndex = new Map<string, string>();
  /** publicKey -> accountId */
  publicKeyIndex = new Map<string, string>();

  /**
   * Rebuild all index maps from the accounts store.
   * Call this after bulk operations or on startup.
   */
  rebuildIndexes(): void {
    this.emailIndex.clear();
    this.phoneIndex.clear();
    this.publicKeyIndex.clear();
    for (const [id, account] of this.accounts) {
      if (account.email) this.emailIndex.set(account.email, id);
      if (account.phone) this.phoneIndex.set(account.phone, id);
      if (account.publicKey) this.publicKeyIndex.set(account.publicKey, id);
    }
  }

  /**
   * Set an account while maintaining index consistency.
   * Removes old index entries if the account already existed.
   */
  setAccount(account: Account): void {
    // Remove old indexes if account exists
    const existing = this.accounts.get(account.id);
    if (existing) {
      if (existing.email) this.emailIndex.delete(existing.email);
      if (existing.phone) this.phoneIndex.delete(existing.phone);
      if (existing.publicKey) this.publicKeyIndex.delete(existing.publicKey);
    }
    this.accounts.set(account.id, account);
    if (account.email) this.emailIndex.set(account.email, account.id);
    if (account.phone) this.phoneIndex.set(account.phone, account.id);
    if (account.publicKey) this.publicKeyIndex.set(account.publicKey, account.id);
  }

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

  /**
   * Remove old push notifications (older than 7 days)
   */
  cleanupOldNotifications(): number {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const [id, notification] of this.notifications) {
      if (now - notification.createdAt > sevenDays) {
        this.notifications.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Trim group messages to MAX_GROUP_MESSAGES per group.
   */
  cleanupBoundedGroupMessages(): number {
    const MAX_GROUP_MESSAGES = config.maxGroupMessages;
    let trimmed = 0;
    for (const [groupId, messages] of this.groupMessages) {
      if (messages.length > MAX_GROUP_MESSAGES) {
        const removed = messages.length - MAX_GROUP_MESSAGES;
        this.groupMessages.set(groupId, messages.slice(-MAX_GROUP_MESSAGES));
        trimmed += removed;
      }
    }
    return trimmed;
  }

  /**
   * Remove old completed/error sub-agent sessions.
   */
  cleanupCompletedSubAgents(): number {
    const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.subAgents) {
      if ((session.status === 'completed' || session.status === 'error') && now - session.updatedAt > MAX_AGE) {
        this.subAgents.delete(id);
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
    store.cleanupOldNotifications();
    store.cleanupBoundedGroupMessages();
    store.cleanupCompletedSubAgents();
  }, 60_000);

  // Don't prevent process exit
  if (interval.unref) {
    interval.unref();
  }

  return interval;
}
