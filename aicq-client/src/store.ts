/**
 * Persistent JSON-based client store.
 *
 * Serialises all client state (identity keys, friends, sessions, chat
 * history, temp numbers, file transfers) to a single JSON file on disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  FriendInfo,
  ChatMessage,
  TempNumberInfo,
  FileTransferInfo,
} from './types.js';

/** Key-pair bytes stored as base64 strings for JSON persistence. */
interface SerializableKeyPair {
  publicKey: string; // base64
  secretKey: string; // base64
}

/** Session record for JSON persistence. */
interface SerializableSession {
  sessionKey: string; // base64
  createdAt: string; // ISO timestamp
}

/** Shape of the on-disk JSON file. */
interface StoreData {
  version: number;
  userId: string;
  signingKeys: SerializableKeyPair | null;
  exchangeKeys: SerializableKeyPair | null;
  friends: Record<string, FriendInfo>;
  sessions: Record<string, SerializableSession>;
  chatHistory: Record<string, ChatMessage[]>;
  tempNumbers: TempNumberInfo[];
  fileTransfers: Record<string, FileTransferInfo>;
}

const STORE_VERSION = 1;

export class ClientStore {
  private storePath: string;
  private data: StoreData;

  constructor(storePath: string) {
    this.storePath = storePath;
    this.data = {
      version: STORE_VERSION,
      userId: '',
      signingKeys: null,
      exchangeKeys: null,
      friends: {},
      sessions: {},
      chatHistory: {},
      tempNumbers: [],
      fileTransfers: {},
    };
  }

  /* ──────────────── Persistence ──────────────── */

  /** Persist the current state to disk. */
  save(): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(this.storePath, json, 'utf-8');
  }

  /** Load state from disk (returns false if file doesn't exist). */
  load(): boolean {
    if (!fs.existsSync(this.storePath)) {
      return false;
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      // Merge carefully — keep defaults for missing fields
      this.data = {
        version: parsed.version ?? STORE_VERSION,
        userId: parsed.userId ?? '',
        signingKeys: parsed.signingKeys ?? null,
        exchangeKeys: parsed.exchangeKeys ?? null,
        friends: parsed.friends ?? {},
        sessions: parsed.sessions ?? {},
        chatHistory: parsed.chatHistory ?? {},
        tempNumbers: parsed.tempNumbers ?? [],
        fileTransfers: parsed.fileTransfers ?? {},
      };
      return true;
    } catch (err) {
      console.warn('[Store] Failed to load state, starting fresh:', err);
      return false;
    }
  }

  /* ──────────────── User identity ──────────────── */

  get userId(): string {
    return this.data.userId;
  }
  set userId(value: string) {
    this.data.userId = value;
  }

  get signingKeys(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
    const keys = this.data.signingKeys;
    if (!keys) return null;
    return {
      publicKey: Buffer.from(keys.publicKey, 'base64'),
      secretKey: Buffer.from(keys.secretKey, 'base64'),
    };
  }
  set signingKeys(kp: { publicKey: Uint8Array; secretKey: Uint8Array } | null) {
    this.data.signingKeys = kp
      ? {
          publicKey: Buffer.from(kp.publicKey).toString('base64'),
          secretKey: Buffer.from(kp.secretKey).toString('base64'),
        }
      : null;
  }

  get exchangeKeys(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
    const keys = this.data.exchangeKeys;
    if (!keys) return null;
    return {
      publicKey: Buffer.from(keys.publicKey, 'base64'),
      secretKey: Buffer.from(keys.secretKey, 'base64'),
    };
  }
  set exchangeKeys(kp: { publicKey: Uint8Array; secretKey: Uint8Array } | null) {
    this.data.exchangeKeys = kp
      ? {
          publicKey: Buffer.from(kp.publicKey).toString('base64'),
          secretKey: Buffer.from(kp.secretKey).toString('base64'),
        }
      : null;
  }

  /* ──────────────── Friends ──────────────── */

  get friends(): Map<string, FriendInfo> {
    return new Map(Object.entries(this.data.friends));
  }

  addFriend(info: FriendInfo): void {
    this.data.friends[info.id] = info;
  }

  removeFriend(id: string): void {
    delete this.data.friends[id];
  }

  getFriendCount(): number {
    return Object.keys(this.data.friends).length;
  }

  /* ──────────────── Sessions ──────────────── */

  get sessions(): Map<string, { sessionKey: Uint8Array; createdAt: Date }> {
    const result = new Map<string, { sessionKey: Uint8Array; createdAt: Date }>();
    for (const [id, s] of Object.entries(this.data.sessions)) {
      result.set(id, {
        sessionKey: Buffer.from(s.sessionKey, 'base64'),
        createdAt: new Date(s.createdAt),
      });
    }
    return result;
  }

  setSessionKey(peerId: string, sessionKey: Uint8Array): void {
    this.data.sessions[peerId] = {
      sessionKey: Buffer.from(sessionKey).toString('base64'),
      createdAt: new Date().toISOString(),
    };
  }

  getSessionKey(peerId: string): Uint8Array | null {
    const s = this.data.sessions[peerId];
    if (!s) return null;
    return Buffer.from(s.sessionKey, 'base64');
  }

  removeSession(peerId: string): void {
    delete this.data.sessions[peerId];
  }

  /* ──────────────── Chat history ──────────────── */

  get chatHistory(): Map<string, ChatMessage[]> {
    const result = new Map<string, ChatMessage[]>();
    for (const [id, msgs] of Object.entries(this.data.chatHistory)) {
      result.set(id, msgs);
    }
    return result;
  }

  addMessage(friendId: string, message: ChatMessage): void {
    if (!this.data.chatHistory[friendId]) {
      this.data.chatHistory[friendId] = [];
    }
    this.data.chatHistory[friendId].push(message);
  }

  getMessages(friendId: string, limit?: number): ChatMessage[] {
    const msgs = this.data.chatHistory[friendId] ?? [];
    if (limit && limit > 0) {
      return msgs.slice(-limit);
    }
    return [...msgs];
  }

  updateMessageStatus(messageId: string, status: ChatMessage['status']): void {
    for (const msgs of Object.values(this.data.chatHistory)) {
      const msg = msgs.find((m) => m.id === messageId);
      if (msg) {
        msg.status = status;
        break;
      }
    }
  }

  deleteMessage(messageId: string): void {
    for (const [friendId, msgs] of Object.entries(this.data.chatHistory)) {
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        msgs.splice(idx, 1);
        if (msgs.length === 0) {
          delete this.data.chatHistory[friendId];
        }
        break;
      }
    }
  }

  markAllRead(friendId: string): void {
    const msgs = this.data.chatHistory[friendId];
    if (!msgs) return;
    for (const msg of msgs) {
      if (msg.status === 'delivered') {
        msg.status = 'read';
      }
    }
  }

  /* ──────────────── Temp numbers ──────────────── */

  get tempNumbers(): TempNumberInfo[] {
    return [...this.data.tempNumbers];
  }

  addTempNumber(info: TempNumberInfo): void {
    this.data.tempNumbers.push(info);
  }

  removeTempNumber(number: string): void {
    this.data.tempNumbers = this.data.tempNumbers.filter(
      (t) => t.number !== number,
    );
  }

  /* ──────────────── File transfers ──────────────── */

  get fileTransfers(): Map<string, FileTransferInfo> {
    return new Map(Object.entries(this.data.fileTransfers));
  }

  setFileTransfer(sessionId: string, info: FileTransferInfo): void {
    this.data.fileTransfers[sessionId] = info;
  }

  getFileTransfer(sessionId: string): FileTransferInfo | null {
    return this.data.fileTransfers[sessionId] ?? null;
  }

  removeFileTransfer(sessionId: string): void {
    delete this.data.fileTransfers[sessionId];
  }

  isTransferActive(): boolean {
    return Object.values(this.data.fileTransfers).some(
      (t) => t.status === 'transferring' || t.status === 'pending',
    );
  }
}
