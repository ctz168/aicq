/**
 * Chat message management — encrypt, send, receive, decrypt, store.
 *
 * Messages are encrypted using the session key established during the
 * handshake and signed with the identity signing key.
 */

import { v4 as uuidv4 } from 'uuid';
import { encryptMessage, decryptMessage } from '@aicq/crypto';
import { ClientStore } from '../store.js';
import { P2PClient } from '../p2p/p2pClient.js';
import { WSClient } from '../services/wsClient.js';
import { IdentityManager } from '../services/identityManager.js';
import type { ChatMessage, FileMetadata } from '../types.js';

export class ChatManager {
  private store: ClientStore;
  private p2p: P2PClient;
  private ws: WSClient;
  private identity: IdentityManager;

  /** Debounced save timer to avoid blocking the event loop on hot paths. */
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Emitter-like callbacks for external consumers. */
  private messageCallbacks: ((msg: ChatMessage) => void)[] = [];

  constructor(
    store: ClientStore,
    p2p: P2PClient,
    ws: WSClient,
    identity: IdentityManager,
  ) {
    this.store = store;
    this.p2p = p2p;
    this.ws = ws;
    this.identity = identity;

    this._setupListeners();
  }

  /* ──────────────── Callbacks ──────────────── */

  onMessage(callback: (msg: ChatMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  private notifyMessage(msg: ChatMessage): void {
    for (const cb of this.messageCallbacks) {
      try {
        cb(msg);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /* ──────────────── WebSocket listeners ──────────────── */

  private _setupListeners(): void {
    // Listen for incoming messages via WebSocket fallback
    this.ws.on('message', (msg: any) => {
      if (msg.data?.type === 'encrypted_message') {
        const message = this.receiveMessage(
          Buffer.from(msg.data.payload, 'base64'),
          msg.from ?? msg.data.fromId,
        );
        if (message) {
          this.notifyMessage(message);
        }
      }
    });

    // Listen for P2P data messages
    this.p2p.onAnyData((peerId: string, data: Buffer) => {
      const message = this.receiveMessage(data, peerId);
      if (message) {
        this.notifyMessage(message);
      }
    });
  }

  /* ──────────────── Send ──────────────── */

  /**
   * Send a text message to a friend.
   *
   * 1. Check friend exists
   * 2. Get session key
   * 3. Encrypt with session key + sign with identity key
   * 4. Send via P2P (preferred) or WS fallback
   * 5. Store in history
   */
  async sendMessage(friendId: string, content: string): Promise<ChatMessage> {
    const sessionKey = this.store.getSessionKey(friendId);
    if (!sessionKey) {
      throw new Error(`No session key for friend ${friendId}`);
    }

    // Create message record
    const message: ChatMessage = {
      id: uuidv4(),
      fromId: this.identity.getUserId(),
      toId: friendId,
      type: 'text',
      content,
      timestamp: Date.now(),
      status: 'sent',
    };

    // Encrypt and sign
    const wireData = encryptMessage(
      content,
      sessionKey,
      this.identity.getSigningSecretKey(),
      this.identity.getPublicKey(),
    );

    // Send via P2P if connected, otherwise fall back to WebSocket
    let delivered = false;
    if (this.p2p.isConnected(friendId)) {
      delivered = this.p2p.send(friendId, Buffer.from(wireData));
    }

    if (!delivered) {
      // WebSocket fallback
      this.ws.send('message', {
        to: friendId,
        data: {
          type: 'encrypted_message',
          fromId: this.identity.getUserId(),
          payload: Buffer.from(wireData).toString('base64'),
        },
      });
    }

    message.status = delivered ? 'delivered' : 'sent';
    this.store.addMessage(friendId, message);
    this._debouncedSave();

    return message;
  }

  /**
   * Send file metadata (file-info message) to a friend.
   * This tells the peer about an upcoming file transfer.
   */
  async sendFileInfo(
    friendId: string,
    fileInfo: FileMetadata,
  ): Promise<ChatMessage> {
    const content = JSON.stringify(fileInfo);

    const message: ChatMessage = {
      id: uuidv4(),
      fromId: this.identity.getUserId(),
      toId: friendId,
      type: 'file-info',
      content,
      timestamp: Date.now(),
      status: 'sent',
    };

    // Send as a regular text message (the metadata is small enough)
    const sessionKey = this.store.getSessionKey(friendId);
    if (!sessionKey) {
      throw new Error(`No session key for friend ${friendId}`);
    }

    const wireData = encryptMessage(
      content,
      sessionKey,
      this.identity.getSigningSecretKey(),
      this.identity.getPublicKey(),
    );

    let delivered = false;
    if (this.p2p.isConnected(friendId)) {
      delivered = this.p2p.send(friendId, Buffer.from(wireData));
    }

    if (!delivered) {
      this.ws.send('message', {
        to: friendId,
        data: {
          type: 'encrypted_message',
          fromId: this.identity.getUserId(),
          payload: Buffer.from(wireData).toString('base64'),
        },
      });
    }

    message.status = delivered ? 'delivered' : 'sent';
    this.store.addMessage(friendId, message);
    this._debouncedSave();

    return message;
  }

  /* ──────────────── Receive ──────────────── */

  /**
   * Decrypt, verify, and store an incoming message.
   *
   * @returns The ChatMessage record, or null if decryption/verification fails.
   */
  receiveMessage(data: Buffer, fromId: string): ChatMessage | null {
    const friendInfo = this.store.friends.get(fromId);
    if (!friendInfo) {
      console.warn(`[ChatManager] Received message from unknown peer: ${fromId}`);
      return null;
    }

    const sessionKey = this.store.getSessionKey(fromId);
    if (!sessionKey) {
      console.warn(`[ChatManager] No session key for peer: ${fromId}`);
      return null;
    }

    const senderPubKey = Buffer.from(friendInfo.publicKey, 'base64');
    const plaintext = decryptMessage(data, sessionKey, senderPubKey);

    if (plaintext === null) {
      console.warn(`[ChatManager] Failed to decrypt message from ${fromId}`);
      return null;
    }

    // Determine message type
    let type: ChatMessage['type'] = 'text';
    try {
      const parsed = JSON.parse(plaintext);
      if (parsed.fileName && parsed.fileSize && parsed.fileHash) {
        type = 'file-info';
      }
    } catch {
      // Not JSON → plain text
    }

    const message: ChatMessage = {
      id: uuidv4(),
      fromId,
      toId: this.identity.getUserId(),
      type,
      content: plaintext,
      timestamp: Date.now(),
      status: 'delivered',
    };

    this.store.addMessage(fromId, message);
    this._debouncedSave();

    return message;
  }

  /* ──────────────── History ──────────────── */

  /** Get chat history for a friend, optionally limited to the last N messages. */
  getChatHistory(friendId: string, limit?: number): ChatMessage[] {
    return this.store.getMessages(friendId, limit);
  }

  /** Delete a specific message from history. */
  deleteMessage(messageId: string): void {
    this.store.deleteMessage(messageId);
    this._debouncedSave();
  }

  /** Mark all messages from a friend as read. */
  markAsRead(friendId: string): void {
    this.store.markAllRead(friendId);
    this._debouncedSave();
  }

  /* ──────────────── Typing indicator ──────────────── */

  /** Send a typing indicator to a friend. */
  sendTyping(friendId: string): void {
    this.ws.send('typing', {
      toId: friendId,
      fromId: this.identity.getUserId(),
    });
  }

  /* ──────────────── Cleanup ──────────────── */

  destroy(): void {
    this.messageCallbacks.length = 0;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this.store.save();
    }
  }

  /* ──────────────── Debounced save ──────────────── */

  /**
   * Debounced store.save() — coalesces rapid calls into at most one
   * write per 500 ms window, avoiding synchronous I/O on every message.
   */
  private _debouncedSave(): void {
    if (this._saveTimer) return; // already scheduled
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.store.save();
    }, 500);
  }
}
