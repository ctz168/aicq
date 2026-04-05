/**
 * In-memory state store for the AICQ plugin.
 *
 * Manages identity keys, friends, sessions, temp numbers, pending requests,
 * handshake state, and offline message queue. Persists to a JSON file with
 * atomic writes and debounced saving for reliability and performance.
 *
 * Secret key fields (identitySecretKey, exchangeSecretKey) are encrypted
 * at rest using AES-256-GCM with a machine-derived encryption key.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import type { KeyPair } from "@aicq/crypto";
import type {
  FriendRecord,
  SessionState,
  HandshakeState,
  PendingFriendRequest,
  TempNumberRecord,
  OfflineMessage,
} from "./types.js";

/** Serialized form of the store for JSON persistence. */
interface SerializedStore {
  agentId: string;
  identityPublicKey: string;  // base64
  identitySecretKey: string;  // base64 (encrypted at rest)
  exchangePublicKey: string;  // base64
  exchangeSecretKey: string;  // base64 (encrypted at rest)
  encryptionSalt: string;     // base64, salt used to derive encryption key
  encryptionKeyId: string;    // hex, key derivation identifier
  friends: Array<{
    id: string;
    publicKey: string;
    publicKeyFingerprint: string;
    addedAt: string;
    lastMessageAt: string;
    sessionKey?: string;
    permissions?: ('chat' | 'exec')[];
    friendType?: 'human' | 'ai';
    aiName?: string;
    aiAvatar?: string;
  }>;
  sessions: Array<{
    peerId: string;
    sessionKey: string;
    ephemeralSecretKey: string;
    createdAt: string;
    messageCount: number;
  }>;
  tempNumbers: Array<{ number: string; expiresAt: string }>;
  pendingRequests: Array<{ requesterId: string; tempNumber: string; timestamp: string }>;
  offlineMessages: Array<{
    id: string;
    targetId: string;
    encryptedData: string;
    timestamp: number;
    retryCount: number;
    maxRetries: number;
  }>;
}

function encodeBuffer(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64");
}

function decodeBuffer(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Derive a 32-byte AES-256 encryption key from a node ID and random salt
 * using PBKDF2-SHA512.
 */
function deriveEncryptionKey(nodeId: string, salt: Uint8Array): Uint8Array {
  return Uint8Array.from(
    crypto.pbkdf2Sync(nodeId, salt, 100_000, 32, "sha512"),
  );
}

/**
 * Encrypt a Uint8Array using AES-256-GCM.
 * Returns a base64 string of: iv(12) || ciphertext || authTag(16).
 */
function aes256GcmEncrypt(plaintext: Uint8Array, key: Uint8Array): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv + ciphertext + tag
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64 string produced by aes256GcmEncrypt.
 */
function aes256GcmDecrypt(packedBase64: string, key: Uint8Array): Uint8Array | null {
  try {
    const packed = Buffer.from(packedBase64, "base64");
    if (packed.length < 29) return null; // iv(12) + authTag(16) = minimum 28 + 1 byte ciphertext

    const iv = packed.subarray(0, 12);
    const authTag = packed.subarray(packed.length - 16);
    const ciphertext = packed.subarray(12, packed.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return new Uint8Array(decrypted);
  } catch {
    return null;
  }
}

export class PluginStore {
  agentId: string = "";
  identityKeys: KeyPair = { publicKey: new Uint8Array(0), secretKey: new Uint8Array(0) };
  exchangeKeys: KeyPair = { publicKey: new Uint8Array(0), secretKey: new Uint8Array(0) };
  friends: Map<string, FriendRecord> = new Map();
  sessions: Map<string, SessionState> = new Map();
  tempNumbers: TempNumberRecord[] = [];
  pendingRequests: PendingFriendRequest[] = [];
  pendingHandshakes: Map<string, HandshakeState> = new Map();

  /** Offline message queue — messages waiting to be sent when back online. */
  offlineMessages: OfflineMessage[] = [];

  private dataDir: string = "";
  private storePath: string = "";
  private encryptionSalt: Uint8Array = crypto.randomBytes(16);

  /** Debounce timer for save operations. */
  private saveTimer: NodeJS.Timeout | null = null;
  private saveDebounceMs: number = 1000; // 1 second debounce
  private dirty: boolean = false;

  /**
   * Set the data directory for persistence.
   */
  setDataDir(dir: string): void {
    this.dataDir = dir;
    this.storePath = path.join(dir, "plugin-store.json");

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Get the encryption key derived from the node ID and stored salt.
   */
  private getEncryptionKey(): Uint8Array {
    return deriveEncryptionKey(this.agentId || "default-aicq-node", this.encryptionSalt);
  }

  /**
   * Mark the store as dirty and schedule a debounced save.
   * For operations that need immediate persistence (e.g., new keys), use saveNow().
   */
  markDirty(): void {
    this.dirty = true;
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.flushSave();
      }, this.saveDebounceMs);
    }
  }

  /**
   * Save the current state to disk immediately (atomic write).
   *
   * Uses write-to-temp + rename for crash safety. Secret keys are encrypted
   * at rest using AES-256-GCM with a key derived from the node ID and salt.
   */
  saveNow(): void {
    // Cancel any pending debounced save
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.flushSave();
  }

  /**
   * Internal save implementation — writes atomically via temp file + rename.
   */
  private flushSave(): void {
    if (!this.dirty && this.saveTimer === null) return;
    this.dirty = false;

    if (!this.storePath) return;

    const encKey = this.getEncryptionKey();
    const encryptedSecretSigningKey = aes256GcmEncrypt(this.identityKeys.secretKey, encKey);
    const encryptedSecretExchangeKey = aes256GcmEncrypt(this.exchangeKeys.secretKey, encKey);

    const serialized: SerializedStore = {
      agentId: this.agentId,
      identityPublicKey: encodeBuffer(this.identityKeys.publicKey),
      identitySecretKey: encryptedSecretSigningKey,
      exchangePublicKey: encodeBuffer(this.exchangeKeys.publicKey),
      exchangeSecretKey: encryptedSecretExchangeKey,
      encryptionSalt: encodeBuffer(this.encryptionSalt),
      encryptionKeyId: this.agentId,
      friends: Array.from(this.friends.entries()).map(([, f]) => ({
        id: f.id,
        publicKey: encodeBuffer(f.publicKey),
        publicKeyFingerprint: f.publicKeyFingerprint,
        addedAt: f.addedAt.toISOString(),
        lastMessageAt: f.lastMessageAt.toISOString(),
        sessionKey: f.sessionKey ? encodeBuffer(f.sessionKey) : undefined,
        permissions: f.permissions,
        friendType: f.friendType,
        aiName: f.aiName,
        aiAvatar: f.aiAvatar,
      })),
      sessions: Array.from(this.sessions.entries()).map(([, s]) => ({
        peerId: s.peerId,
        sessionKey: encodeBuffer(s.sessionKey),
        ephemeralSecretKey: encodeBuffer(s.ephemeralSecretKey),
        createdAt: s.createdAt.toISOString(),
        messageCount: s.messageCount,
      })),
      tempNumbers: this.tempNumbers.map((t) => ({
        number: t.number,
        expiresAt: t.expiresAt.toISOString(),
      })),
      pendingRequests: this.pendingRequests.map((p) => ({
        requesterId: p.requesterId,
        tempNumber: p.tempNumber,
        timestamp: p.timestamp.toISOString(),
      })),
      offlineMessages: this.offlineMessages,
    };

    // Atomic write: write to temp file, then rename
    try {
      const tmpPath = this.storePath + ".tmp";
      const jsonStr = JSON.stringify(serialized, null, 2);
      fs.writeFileSync(tmpPath, jsonStr, "utf-8");
      fs.renameSync(tmpPath, this.storePath);
    } catch (err) {
      console.error("[PluginStore] Failed to save state:", err);
    }
  }

  /**
   * @deprecated Use markDirty() or saveNow() for better performance.
   * Kept for backward compatibility — performs immediate save.
   */
  save(): void {
    this.saveNow();
  }

  /**
   * Load state from disk, if available.
   *
   * Decrypts secret keys using AES-256-GCM with the stored salt and
   * node ID. Falls back to plaintext if the data was stored before
   * encryption was added (backward compatibility).
   */
  load(): boolean {
    if (!this.storePath || !fs.existsSync(this.storePath)) {
      return false;
    }

    // Try to load from temp file if main file was corrupted (crash recovery)
    const tmpPath = this.storePath + ".tmp";
    if (!fs.existsSync(this.storePath) && fs.existsSync(tmpPath)) {
      try {
        fs.renameSync(tmpPath, this.storePath);
      } catch {
        // If rename fails, try reading from temp directly
      }
    }

    try {
      const raw = fs.readFileSync(this.storePath, "utf-8");
      const data: SerializedStore = JSON.parse(raw);

      this.agentId = data.agentId;

      // Load encryption salt if present (backward compat)
      if (data.encryptionSalt) {
        this.encryptionSalt = decodeBuffer(data.encryptionSalt);
      }

      // Try to decrypt secret keys
      const encKey = this.getEncryptionKey();
      let decryptedSigningKey: Uint8Array | null = null;
      let decryptedExchangeKey: Uint8Array | null = null;

      if (data.encryptionSalt) {
        // New format: encrypted at rest
        decryptedSigningKey = aes256GcmDecrypt(data.identitySecretKey, encKey);
        decryptedExchangeKey = aes256GcmDecrypt(data.exchangeSecretKey, encKey);
      }

      // If decryption failed, try loading as plaintext (old format fallback)
      if (!decryptedSigningKey || decryptedSigningKey.length === 0) {
        decryptedSigningKey = decodeBuffer(data.identitySecretKey);
      }
      if (!decryptedExchangeKey || decryptedExchangeKey.length === 0) {
        decryptedExchangeKey = decodeBuffer(data.exchangeSecretKey);
      }

      this.identityKeys = {
        publicKey: decodeBuffer(data.identityPublicKey),
        secretKey: decryptedSigningKey,
      };
      this.exchangeKeys = {
        publicKey: decodeBuffer(data.exchangePublicKey),
        secretKey: decryptedExchangeKey,
      };

      this.friends.clear();
      for (const f of data.friends) {
        this.friends.set(f.id, {
          id: f.id,
          publicKey: decodeBuffer(f.publicKey),
          publicKeyFingerprint: f.publicKeyFingerprint,
          addedAt: new Date(f.addedAt),
          lastMessageAt: new Date(f.lastMessageAt),
          sessionKey: f.sessionKey ? decodeBuffer(f.sessionKey) : undefined,
          permissions: f.permissions as ('chat' | 'exec')[] | undefined,
          friendType: f.friendType as 'human' | 'ai' | undefined,
          aiName: f.aiName,
          aiAvatar: f.aiAvatar,
        });
      }

      this.sessions.clear();
      for (const s of data.sessions) {
        this.sessions.set(s.peerId, {
          peerId: s.peerId,
          sessionKey: decodeBuffer(s.sessionKey),
          ephemeralSecretKey: decodeBuffer(s.ephemeralSecretKey),
          createdAt: new Date(s.createdAt),
          messageCount: s.messageCount,
        });
      }

      this.tempNumbers = data.tempNumbers.map((t) => ({
        number: t.number,
        expiresAt: new Date(t.expiresAt),
      }));

      this.pendingRequests = data.pendingRequests.map((p) => ({
        requesterId: p.requesterId,
        tempNumber: p.tempNumber,
        timestamp: new Date(p.timestamp),
      }));

      // Load offline message queue
      this.offlineMessages = (data.offlineMessages || []).map((m) => ({
        id: m.id,
        targetId: m.targetId,
        encryptedData: m.encryptedData,
        timestamp: m.timestamp,
        retryCount: m.retryCount || 0,
        maxRetries: m.maxRetries || 10,
      }));

      // Clean up temp file if load succeeded
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }

      return true;
    } catch (err) {
      console.error("[PluginStore] Failed to load state:", err);
      // Try to recover from temp file
      if (fs.existsSync(tmpPath)) {
        console.info("[PluginStore] Attempting recovery from temp file...");
        try {
          fs.renameSync(tmpPath, this.storePath);
          return this.load(); // Retry loading
        } catch {
          console.error("[PluginStore] Recovery from temp file failed");
        }
      }
      return false;
    }
  }

  // ----------------------------------------------------------------
  //  Offline message queue
  // ----------------------------------------------------------------

  /**
   * Add a message to the offline queue for later delivery.
   */
  enqueueOfflineMessage(targetId: string, encryptedData: string): OfflineMessage {
    const msg: OfflineMessage = {
      id: uuidv4(),
      targetId,
      encryptedData,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 10,
    };
    this.offlineMessages.push(msg);
    this.markDirty();
    return msg;
  }

  /**
   * Dequeue the next pending offline message.
   */
  dequeueOfflineMessage(): OfflineMessage | undefined {
    return this.offlineMessages.shift();
  }

  /**
   * Get the number of pending offline messages.
   */
  getOfflineMessageCount(): number {
    return this.offlineMessages.length;
  }

  /**
   * Peek at the offline message queue without removing.
   */
  peekOfflineMessages(): OfflineMessage[] {
    return [...this.offlineMessages];
  }

  /**
   * Clear all pending offline messages.
   */
  clearOfflineMessages(): void {
    this.offlineMessages = [];
    this.markDirty();
  }

  /**
   * Remove expired offline messages (older than 24 hours).
   */
  cleanupExpiredOfflineMessages(): number {
    const now = Date.now();
    const threshold = 24 * 60 * 60 * 1000; // 24 hours
    const before = this.offlineMessages.length;
    this.offlineMessages = this.offlineMessages.filter((m) => now - m.timestamp < threshold);
    if (this.offlineMessages.length !== before) {
      this.markDirty();
    }
    return before - this.offlineMessages.length;
  }

  // ----------------------------------------------------------------
  //  Friend management
  // ----------------------------------------------------------------

  /**
   * Add a friend record.
   */
  addFriend(friend: FriendRecord): void {
    this.friends.set(friend.id, friend);
    this.markDirty();
  }

  /**
   * Remove a friend by ID and clean up associated session.
   */
  removeFriend(friendId: string): boolean {
    const removed = this.friends.delete(friendId);
    if (removed) {
      this.sessions.delete(friendId);
      this.markDirty();
    }
    return removed;
  }

  /**
   * Get a friend by ID.
   */
  getFriend(friendId: string): FriendRecord | undefined {
    return this.friends.get(friendId);
  }

  /**
   * Get the total friend count.
   */
  getFriendCount(): number {
    return this.friends.size;
  }

  // ----------------------------------------------------------------
  //  Session management
  // ----------------------------------------------------------------

  /**
   * Set a session for a peer.
   */
  setSession(peerId: string, session: SessionState): void {
    this.sessions.set(peerId, session);
    // Also update the friend record with the session key
    const friend = this.friends.get(peerId);
    if (friend) {
      friend.sessionKey = session.sessionKey;
    }
    this.saveNow(); // Sessions are critical — save immediately
  }

  /**
   * Get a session by peer ID.
   */
  getSession(peerId: string): SessionState | undefined {
    return this.sessions.get(peerId);
  }

  /**
   * Remove a session by peer ID.
   */
  removeSession(peerId: string): boolean {
    return this.sessions.delete(peerId);
  }

  // ----------------------------------------------------------------
  //  Temp number management
  // ----------------------------------------------------------------

  /**
   * Add a temp number record.
   */
  addTempNumber(number: string, expiresAt: Date): void {
    this.tempNumbers.push({ number, expiresAt });
    this.markDirty();
  }

  /**
   * Revoke (remove) a temp number.
   */
  revokeTempNumber(number: string): boolean {
    const idx = this.tempNumbers.findIndex((t) => t.number === number);
    if (idx !== -1) {
      this.tempNumbers.splice(idx, 1);
      this.markDirty();
      return true;
    }
    return false;
  }

  /**
   * Clean up expired temp numbers.
   */
  cleanupExpiredTempNumbers(): void {
    const now = new Date();
    const before = this.tempNumbers.length;
    this.tempNumbers = this.tempNumbers.filter((t) => t.expiresAt > now);
    if (this.tempNumbers.length !== before) {
      this.markDirty();
    }
  }

  // ----------------------------------------------------------------
  //  Pending friend requests
  // ----------------------------------------------------------------

  /**
   * Add a pending friend request.
   */
  addPendingRequest(request: PendingFriendRequest): void {
    this.pendingRequests.push(request);
    this.markDirty();
  }

  /**
   * Remove a pending friend request.
   */
  removePendingRequest(requesterId: string): boolean {
    const idx = this.pendingRequests.findIndex((p) => p.requesterId === requesterId);
    if (idx !== -1) {
      this.pendingRequests.splice(idx, 1);
      this.markDirty();
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------------
  //  Handshake state
  // ----------------------------------------------------------------

  /**
   * Set a pending handshake state.
   */
  setPendingHandshake(sessionId: string, state: HandshakeState): void {
    this.pendingHandshakes.set(sessionId, state);
  }

  /**
   * Get a pending handshake by session ID.
   */
  getPendingHandshake(sessionId: string): HandshakeState | undefined {
    return this.pendingHandshakes.get(sessionId);
  }

  /**
   * Remove a pending handshake.
   */
  removePendingHandshake(sessionId: string): boolean {
    return this.pendingHandshakes.delete(sessionId);
  }
}
