/**
 * Peer-to-peer connection manager.
 *
 * In a Node.js environment where true WebRTC DataChannels are not available,
 * this implementation uses WebSocket relay with session-key-encrypted data
 * channels through the server, providing a similar security model.
 *
 * In a browser/WebView wrapper (Capacitor, WKWebView), this can be replaced
 * with real WebRTC DataChannels using the same interface.
 */

// Encryption is handled at the ChatManager message level.
// The P2P layer provides transport pass-through via WebSocket relay.
import { WSClient } from '../services/wsClient.js';
import { ClientStore } from '../store.js';
import type { ConnectionCallback, DataCallback } from '../types.js';

/** Represents a single P2P peer connection state. */
interface P2PPeerConnection {
  peerId: string;
  connected: boolean;
  /** Outbound channel key for encrypting data TO this peer. */
  channelKey: Uint8Array | null;
  /** Next nonce sequence number (counter mode). */
  nonceCounter: number;
  /** Connection state callbacks. */
  connectionCallbacks: ConnectionCallback[];
  /** Data callbacks. */
  dataCallbacks: DataCallback[];
}

export class P2PClient {
  private ws: WSClient;
  private store: ClientStore;
  private connections = new Map<string, P2PPeerConnection>();

  /** Global "any peer data" callback for ChatManager routing. */
  private anyDataCallback: ((peerId: string, data: Buffer) => void) | null = null;

  constructor(ws: WSClient, store: ClientStore) {
    this.ws = ws;
    this.store = store;
    this._setupListeners();
  }

  /* ──────────────── Global data callback ──────────────── */

  onAnyData(callback: (peerId: string, data: Buffer) => void): void {
    this.anyDataCallback = callback;
  }

  /* ──────────────── WebSocket listener ──────────────── */

  private _setupListeners(): void {
    // Listen for P2P data relayed via WebSocket
    this.ws.on('signal', (msg: any) => {
      if (msg.data?.type === 'p2p_data') {
        this._handleIncomingData(msg.from, msg.data);
      } else if (msg.data?.type === 'p2p_open') {
        this._handleConnectionOpen(msg.from, msg.data);
      } else if (msg.data?.type === 'p2p_close') {
        this._handleConnectionClose(msg.from);
      }
    });
  }

  /* ──────────────── Connect ──────────────── */

  /**
   * Initiate a P2P connection to a peer.
   *
   * Uses the existing session key as the channel encryption key and sends
   * a "p2p_open" signal via the WebSocket relay.
   */
  connect(peerId: string, signalData?: any): void {
    if (this.connections.has(peerId) && this.connections.get(peerId)!.connected) {
      return; // Already connected
    }

    const sessionKey = this.store.getSessionKey(peerId);
    if (!sessionKey) {
      console.warn(`[P2P] Cannot connect to ${peerId}: no session key`);
      return;
    }

    const conn: P2PPeerConnection = {
      peerId,
      connected: false,
      channelKey: sessionKey,
      nonceCounter: 0,
      connectionCallbacks: [],
      dataCallbacks: [],
    };

    this.connections.set(peerId, conn);

    // Send open signal
    this.ws.send('signal', {
      to: peerId,
      data: {
        type: 'p2p_open',
        fromId: this.store.userId,
        nonce: Date.now(),
      },
    });

    console.log(`[P2P] Connection initiated to ${peerId}`);
  }

  /* ──────────────── Disconnect ──────────────── */

  disconnect(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (!conn) return;

    conn.connected = false;
    this.ws.send('signal', {
      to: peerId,
      data: {
        type: 'p2p_close',
        fromId: this.store.userId,
      },
    });

    for (const cb of conn.connectionCallbacks) {
      try { cb(false); } catch { /* ignore */ }
    }

    this.connections.delete(peerId);
    console.log(`[P2P] Disconnected from ${peerId}`);
  }

  /* ──────────────── Send ──────────────── */

  /**
   * Send encrypted data to a peer.
   *
   * @returns true if sent successfully, false if not connected.
   */
  send(peerId: string, data: Buffer): boolean {
    const conn = this.connections.get(peerId);
    if (!conn || !conn.connected) {
      return false;
    }

    // P2P layer is a transport pass-through — encryption happens at ChatManager level.
    this.ws.send('file_chunk', {
      to: peerId,
      data: {
        type: 'p2p_data',
        fromId: this.store.userId,
        payload: data.toString('base64'),
      },
    });

    return true;
  }

  /* ──────────────── Status ──────────────── */

  isConnected(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return conn !== undefined && conn.connected;
  }

  /* ──────────────── Callbacks ──────────────── */

  onConnectionChange(peerId: string, callback: ConnectionCallback): void {
    let conn = this.connections.get(peerId);
    if (!conn) {
      conn = {
        peerId,
        connected: false,
        channelKey: null,
        nonceCounter: 0,
        connectionCallbacks: [],
        dataCallbacks: [],
      };
      this.connections.set(peerId, conn);
    }
    conn.connectionCallbacks.push(callback);
  }

  onData(peerId: string, callback: DataCallback): void {
    let conn = this.connections.get(peerId);
    if (!conn) {
      conn = {
        peerId,
        connected: false,
        channelKey: null,
        nonceCounter: 0,
        connectionCallbacks: [],
        dataCallbacks: [],
      };
      this.connections.set(peerId, conn);
    }
    conn.dataCallbacks.push(callback);
  }

  /* ──────────────── Internal handlers ──────────────── */

  private _handleConnectionOpen(fromId: string, data: any): void {
    const sessionKey = this.store.getSessionKey(fromId);
    if (!sessionKey) {
      console.warn(`[P2P] Incoming connection from ${fromId} but no session key`);
      return;
    }

    let conn = this.connections.get(fromId);
    if (!conn) {
      conn = {
        peerId: fromId,
        connected: false,
        channelKey: sessionKey,
        nonceCounter: 0,
        connectionCallbacks: [],
        dataCallbacks: [],
      };
      this.connections.set(fromId, conn);
    }

    conn.connected = true;
    conn.channelKey = sessionKey;

    // Notify callbacks
    for (const cb of conn.connectionCallbacks) {
      try { cb(true); } catch { /* ignore */ }
    }

    console.log(`[P2P] Connected to ${fromId}`);
  }

  private _handleConnectionClose(fromId: string): void {
    const conn = this.connections.get(fromId);
    if (!conn) return;

    conn.connected = false;

    for (const cb of conn.connectionCallbacks) {
      try { cb(false); } catch { /* ignore */ }
    }

    this.connections.delete(fromId);
    console.log(`[P2P] Peer ${fromId} disconnected`);
  }

  private _handleIncomingData(fromId: string, data: any): void {
    const conn = this.connections.get(fromId);
    if (!conn) {
      console.warn(`[P2P] Data from ${fromId} but no active connection`);
      return;
    }

    try {
      // P2P layer acts as a pure transport pass-through.
      // Encryption is handled at the message level (ChatManager.encryptMessage).
      // The relay server provides transport security via WSS.
      const raw = Buffer.from(data.payload, 'base64');

      // Notify per-peer callbacks
      for (const cb of conn.dataCallbacks) {
        try { cb(raw); } catch (err) {
          console.warn(`[P2P] Data callback error for ${fromId}:`, err);
        }
      }

      // Notify global callback
      if (this.anyDataCallback) {
        this.anyDataCallback(fromId, raw);
      }
    } catch (err) {
      console.error(`[P2P] Failed to process data from ${fromId}:`, err);
    }
  }

  /* ──────────────── Cleanup ──────────────── */

  destroy(): void {
    for (const [peerId] of this.connections) {
      this.disconnect(peerId);
    }
    this.connections.clear();
    this.anyDataCallback = null;
  }
}
