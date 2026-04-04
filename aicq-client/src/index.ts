/**
 * AICQ Client — Main entry point.
 *
 * `AICQClient` is the top-level facade that wires together all sub-modules:
 * identity, store, API, WebSocket, handshake, chat, P2P, file transfer,
 * temp number management, and friend management.
 *
 * Usage:
 * ```ts
 * import AICQClient from '@aicq/client';
 *
 * const client = new AICQClient({ serverUrl: 'https://aicq.online' });
 * await client.initialize();
 *
 * client.on('message', (msg) => console.log('New message:', msg));
 * const tempNumber = await client.tempNumberManager.requestNew();
 * console.log('Share this number:', tempNumber);
 *
 * // ... later
 * client.destroy();
 * ```
 */

import * as fs from 'fs';
import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';

import { loadConfig, getStorePath } from './config.js';
import { ClientStore } from './store.js';
import { APIClient } from './services/apiClient.js';
import { WSClient } from './services/wsClient.js';
import { IdentityManager } from './services/identityManager.js';
import { HandshakeHandler } from './handshake/handshakeHandler.js';
import { ChatManager } from './chat/chatManager.js';
import { P2PClient } from './p2p/p2pClient.js';
import { FileManager } from './fileTransfer/fileManager.js';
import { TempNumberManager } from './components/tempNumberManager.js';
import { FriendManager } from './components/friendManager.js';

import type { ClientConfig, HandshakeProgress, ChatMessage, FileTransferInfo, FriendInfo } from './types.js';

export class AICQClient extends EventEmitter {
  private config: ClientConfig;
  private store: ClientStore;
  private api: APIClient;
  private ws: WSClient;
  private identity: IdentityManager;
  private handshake: HandshakeHandler;
  private p2p: P2PClient;
  private chatManager: ChatManager;
  private fileManager: FileManager;
  private tempNumberManager: TempNumberManager;
  private friendManager: FriendManager;

  private _initialized = false;
  private _destroyed = false;

  constructor(configOverrides?: Partial<ClientConfig>) {
    super();
    this.config = loadConfig(configOverrides);
    this.store = new ClientStore(getStorePath(this.config.dataDir));
    this.api = new APIClient(this.config.serverUrl);
    if (!this.config.wsUrl) throw new Error('wsUrl is required in config');
    this.ws = new WSClient(this.config.wsUrl);
    this.identity = new IdentityManager(this.store);
    this.handshake = new HandshakeHandler(this.api, this.ws, this.identity, this.store);
    this.p2p = new P2PClient(this.ws, this.store);
    this.chatManager = new ChatManager(this.store, this.p2p, this.ws, this.identity);
    this.fileManager = new FileManager(this.api, this.ws, this.store, this.p2p);
    this.tempNumberManager = new TempNumberManager(this.api, this.store);
    this.friendManager = new FriendManager(
      this.api,
      this.ws,
      this.handshake,
      this.store,
      this.p2p,
    );

    this._wireEvents();
  }

  /* ──────────────── Initialise ──────────────── */

  /**
   * Initialise the client:
   *  1. Ensure data directory exists
   *  2. Load or generate identity keys
   *  3. Register with the server
   *  4. Connect WebSocket
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // 1. Ensure data directory
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }

    // 2. Load existing store or initialise fresh
    const storeLoaded = this.store.load();

    // 3. Initialise identity (load or generate keys)
    if (storeLoaded && this.store.userId) {
      this.identity.initialize(this.store.userId);
    } else {
      // Generate a new user ID
      const userId = uuidv4();
      this.identity.initialize(userId);
    }

    const userId = this.identity.getUserId();

    // 4. Register with server
    try {
      await this.api.register(userId, this.identity.getPublicKey());
    } catch (err) {
      console.warn(`[AICQClient] Server registration failed: ${err}`);
      // Continue — can operate in offline mode
    }

    // 5. Set node ID on API and connect WebSocket
    this.api.setNodeId(userId);
    this.ws.connect(userId);

    this._initialized = true;
    console.log(`[AICQClient] Initialised as ${userId.slice(0, 8)}... (fingerprint: ${this.identity.getPublicKeyFingerprint()})`);
  }

  /* ──────────────── Wire events ──────────────── */

  private _wireEvents(): void {
    // Chat messages → client event
    this.chatManager.onMessage((msg) => {
      this.emit('message', msg);
    });

    // Presence changes → friend_online / friend_offline
    this.ws.on('presence', (event: { nodeId: string; online: boolean }) => {
      const friend = this.store.friends.get(event.nodeId);
      if (friend) {
        if (event.online) {
          this.emit('friend_online', friend);
        } else {
          this.emit('friend_offline', friend);
        }
      }
    });

    // Typing indicator
    this.ws.on('typing', (event: { fromId: string; toId: string }) => {
      if (event.toId === this.identity.getUserId()) {
        this.emit('typing', event);
      }
    });

    // Handshake progress
    this.handshake.onProgress((progress: HandshakeProgress) => {
      this.emit('handshake_progress', progress);
    });

    // File transfer progress
    this.fileManager.onProgress((info: FileTransferInfo) => {
      this.emit('file_progress', info);
    });

    // WebSocket connection events
    this.ws.on('connected', () => {
      console.log('[AICQClient] Connected to server');
    });

    this.ws.on('disconnected', () => {
      console.log('[AICQClient] Disconnected from server');
    });
  }

  /* ──────────────── Public accessors ──────────────── */

  /** Chat message manager. */
  get chat(): ChatManager {
    this._ensureInitialized();
    return this.chatManager;
  }

  /** Friend list manager. */
  get friends(): FriendManager {
    this._ensureInitialized();
    return this.friendManager;
  }

  /** Temporary number manager. */
  get tempNumbers(): TempNumberManager {
    this._ensureInitialized();
    return this.tempNumberManager;
  }

  /** Identity / key management. */
  get identityMgr(): IdentityManager {
    this._ensureInitialized();
    return this.identity;
  }

  /** File transfer manager. */
  get files(): FileManager {
    this._ensureInitialized();
    return this.fileManager;
  }

  /** P2P connection manager. */
  get p2pConn(): P2PClient {
    this._ensureInitialized();
    return this.p2p;
  }

  /** Handshake handler (for accepting incoming requests). */
  get handshakeHandler(): HandshakeHandler {
    this._ensureInitialized();
    return this.handshake;
  }

  /* ──────────────── Convenience ──────────────── */

  /** Get the current user's ID. */
  getUserId(): string {
    return this.identity.getUserId();
  }

  /** Get the current user's public key fingerprint. */
  getFingerprint(): string {
    return this.identity.getPublicKeyFingerprint();
  }

  /* ──────────────── Lifecycle ──────────────── */

  /** Tear down all connections and save state. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    console.log('[AICQClient] Shutting down...');

    this.chatManager.destroy();
    this.fileManager.destroy();
    this.p2p.destroy();
    this.handshake.destroy();
    this.friendManager.destroy();
    this.ws.destroy();

    // Save final state
    this.store.save();

    this.removeAllListeners();
    this._initialized = false;

    console.log('[AICQClient] Shutdown complete');
  }

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('AICQClient has not been initialized. Call initialize() first.');
    }
  }
}

export default AICQClient;
