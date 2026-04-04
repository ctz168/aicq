/**
 * In-memory state store for the AICQ plugin.
 *
 * Manages identity keys, friends, sessions, temp numbers, pending requests,
 * and handshake state.  Optionally persists to a JSON file.
 *
 * Secret key fields (identitySecretKey, exchangeSecretKey) are encrypted
 * at rest using AES-256-GCM with a machine-derived encryption key.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { KeyPair } from "@aicq/crypto";
import type {
  FriendRecord,
  SessionState,
  HandshakeState,
  PendingFriendRequest,
  TempNumberRecord,
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
 * Returns a base64 string of: salt(16) || iv(12) || ciphertext || authTag(16).
 */
function aes256GcmEncrypt(plaintext: Uint8Array, key: Uint8Array): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: salt is not needed per-field (key already derived), iv + ciphertext + tag
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

  private dataDir: string = "";
  private storePath: string = "";
  private encryptionSalt: Uint8Array = crypto.randomBytes(16);

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
   * Save the current state to disk.
   *
   * Secret keys are encrypted at rest using AES-256-GCM with a key
   * derived from the node ID and a stored random salt.
   */
  save(): void {
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
    };

    try {
      fs.writeFileSync(this.storePath, JSON.stringify(serialized, null, 2), "utf-8");
    } catch (err) {
      console.error("[PluginStore] Failed to save state:", err);
    }
  }

  /**
   * Load state from disk, if available.
   *
   * Decrypts secret keys using AES-256-GCM with the stored salt and
   * node ID.  Falls back to plaintext if the data was stored before
   * encryption was added (backward compatibility).
   */
  load(): boolean {
    if (!this.storePath || !fs.existsSync(this.storePath)) {
      return false;
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

      return true;
    } catch (err) {
      console.error("[PluginStore] Failed to load state:", err);
      return false;
    }
  }

  /**
   * Add a friend record.
   */
  addFriend(friend: FriendRecord): void {
    this.friends.set(friend.id, friend);
    this.save();
  }

  /**
   * Remove a friend by ID and clean up associated session.
   */
  removeFriend(friendId: string): boolean {
    const removed = this.friends.delete(friendId);
    if (removed) {
      this.sessions.delete(friendId);
      this.save();
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
    this.save();
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

  /**
   * Add a temp number record.
   */
  addTempNumber(number: string, expiresAt: Date): void {
    this.tempNumbers.push({ number, expiresAt });
    this.save();
  }

  /**
   * Revoke (remove) a temp number.
   */
  revokeTempNumber(number: string): boolean {
    const idx = this.tempNumbers.findIndex((t) => t.number === number);
    if (idx !== -1) {
      this.tempNumbers.splice(idx, 1);
      this.save();
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
      this.save();
    }
  }

  /**
   * Add a pending friend request.
   */
  addPendingRequest(request: PendingFriendRequest): void {
    this.pendingRequests.push(request);
    this.save();
  }

  /**
   * Remove a pending friend request.
   */
  removePendingRequest(requesterId: string): boolean {
    const idx = this.pendingRequests.findIndex((p) => p.requesterId === requesterId);
    if (idx !== -1) {
      this.pendingRequests.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

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
