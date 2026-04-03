/**
 * WebSocket client for real-time communication with the Aicq server.
 *
 * Features:
 *  - Auto-reconnect with exponential back-off
 *  - Heartbeat every 30 seconds
 *  - Typed message routing for all server event types
 */

import WebSocket from 'ws';
import EventEmitter from 'events';

export type WSEventType =
  | 'signal'
  | 'friend_request'
  | 'handshake_response'
  | 'handshake_confirm'
  | 'message'
  | 'file_chunk'
  | 'typing'
  | 'presence'
  | 'connected'
  | 'disconnected'
  | 'error';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WSClient extends EventEmitter {
  private wsUrl: string;
  private nodeId: string | null = null;
  private socket: WebSocket | null = null;

  /** Reconnect back-off state. */
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30_000; // 30 s
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Heartbeat interval handle. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs = 30_000;
  private readonly heartbeatTimeoutMs = 10_000;

  /** Pending handshake requests keyed by sessionId. */
  private pendingRequests = new Map<string, PendingRequest>();

  /** Whether the client is intentionally closed. */
  private _closed = false;

  constructor(wsUrl: string) {
    super();
    this.wsUrl = wsUrl;
  }

  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  get id(): string | null {
    return this.nodeId;
  }

  /* ──────────────── Connect / Disconnect ──────────────── */

  /** Connect to the WebSocket server and announce online status. */
  connect(nodeId: string): void {
    this.nodeId = nodeId;
    this._closed = false;
    this._doConnect();
  }

  /** Disconnect gracefully. */
  disconnect(): void {
    this._closed = true;
    this._clearTimers();
    if (this.socket) {
      try {
        this.socket.close(1000, 'Client disconnect');
      } catch {
        // Ignore
      }
      this.socket = null;
    }
  }

  private _doConnect(): void {
    if (this._closed) return;

    try {
      this.socket = new WebSocket(this.wsUrl);
    } catch (err) {
      this.emit('error', err);
      this._scheduleReconnect();
      return;
    }

    this.socket.on('open', () => {
      this.reconnectAttempts = 0;
      // Announce online
      this._send({ type: 'online', nodeId: this.nodeId });
      this._startHeartbeat();
      this.emit('connected');
    });

    this.socket.on('message', (raw: WebSocket.Data) => {
      this._handleMessage(raw.toString());
    });

    this.socket.on('close', (code, reason) => {
      this._stopHeartbeat();
      this.socket = null;
      this.emit('disconnected', { code, reason: reason.toString() });
      if (!this._closed) {
        this._scheduleReconnect();
      }
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });
  }

  /* ──────────────── Message handling ──────────────── */

  private _handleMessage(raw: string): void {
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // Ignore malformed messages
    }

    const type = msg.type as string;

    switch (type) {
      case 'online_ack':
        // Silently acknowledge
        break;

      case 'signal':
        this.emit('signal', msg);
        break;

      case 'presence':
        this.emit('presence', {
          nodeId: msg.nodeId,
          online: msg.online as boolean,
          timestamp: msg.timestamp as number,
        });
        break;

      case 'message':
        this.emit('message', msg);
        break;

      case 'file_chunk':
        this.emit('file_chunk', msg);
        break;

      case 'typing':
        this.emit('typing', {
          fromId: msg.fromId,
          toId: msg.toId,
        });
        break;

      case 'handshake_response':
        this.emit('handshake_response', msg);
        // Resolve pending if any
        this._resolvePending(msg.sessionId, msg);
        break;

      case 'handshake_confirm':
        this.emit('handshake_confirm', msg);
        this._resolvePending(msg.sessionId, msg);
        break;

      case 'error':
        this.emit('error', new Error(msg.error ?? 'Server error'));
        break;

      default:
        // Unknown message type – ignore
        break;
    }
  }

  /* ──────────────── Send ──────────────── */

  /** Send a typed message to the server. */
  send(type: string, data: Record<string, any>): void {
    this._send({ type, ...data });
  }

  private _send(payload: Record<string, any>): void {
    if (!this.connected) {
      this.emit('error', new Error('WebSocket is not connected'));
      return;
    }
    this.socket!.send(JSON.stringify(payload));
  }

  /* ──────────────── Pending request resolution ──────────────── */

  /**
   * Register a promise that resolves when a matching message arrives.
   * Returns a promise with a timeout.
   */
  waitForResponse(
    sessionId: string,
    eventType: string,
    timeoutMs = 30_000,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(`${eventType}:${sessionId}`);
        reject(new Error(`Timeout waiting for ${eventType} (${sessionId})`));
      }, timeoutMs);

      this.pendingRequests.set(`${eventType}:${sessionId}`, {
        resolve,
        reject,
        timer,
      });

      // One-time listener to resolve
      const handler = (msg: any) => {
        if (msg.sessionId === sessionId) {
          this.off(eventType, handler);
          this.pendingRequests.delete(`${eventType}:${sessionId}`);
          resolve(msg);
        }
      };
      this.on(eventType, handler);
    });
  }

  private _resolvePending(sessionId: string, data: any): void {
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (key.endsWith(`:${sessionId}`)) {
        clearTimeout(pending.timer);
        pending.resolve(data);
        this.pendingRequests.delete(key);
        break;
      }
    }
  }

  /* ──────────────── Heartbeat ──────────────── */

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this._send({ type: 'ping' });
      }
    }, this.heartbeatIntervalMs);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /* ──────────────── Reconnect ──────────────── */

  private _scheduleReconnect(): void {
    if (this._closed) return;

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    this.reconnectAttempts++;

    console.log(
      `[WSClient] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this._doConnect();
    }, delay);
  }

  private _clearTimers(): void {
    this._stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /* ──────────────── Cleanup ──────────────── */

  destroy(): void {
    this.disconnect();
    this.removeAllListeners();
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('WSClient destroyed'));
    }
    this.pendingRequests.clear();
  }
}
