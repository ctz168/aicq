/**
 * Server Client — handles REST API calls and WebSocket communication
 * with the AICQ relay server.
 */

import WebSocket from "ws";
import type { Logger, FriendInfo, FileTransferSession } from "../types.js";
import type { PluginStore } from "../store.js";

/** REST API response wrapper. */
interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class ServerClient {
  private serverUrl: string;
  private store: PluginStore;
  private logger: Logger;

  private ws: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private wsConnected = false;

  /** WebSocket message callbacks by type. */
  private wsHandlers: Map<string, Array<(data: unknown) => void>> = new Map();

  constructor(serverUrl: string, store: PluginStore, logger: Logger) {
    this.serverUrl = serverUrl;
    this.store = store;
    this.logger = logger;
  }

  // ----------------------------------------------------------------
  //  WebSocket connection
  // ----------------------------------------------------------------

  /**
   * Connect to the server via WebSocket and start heartbeat.
   */
  connectWebSocket(): void {
    // Build WebSocket URL with explicit port 443
    const baseUrl = this.serverUrl.replace(/^http/, "ws");
    const url = new URL(baseUrl + "/ws");
    url.port = "443";
    url.protocol = "wss:";
    const wsUrl = url.toString();
    this.logger.info("[Server] Connecting WebSocket to " + wsUrl);

    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      this.wsConnected = true;
      this.logger.info("[Server] WebSocket connected");

      // Authenticate with the server using 'online' message type + nodeId
      // The server expects type: "online" with nodeId field for WS registration
      this.wsSend({
        type: "online",
        nodeId: this.store.agentId,
        publicKey: Buffer.from(this.store.identityKeys.publicKey).toString("base64"),
      });

      // Start heartbeat
      this.startHeartbeat();
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleWsMessage(msg);
      } catch (err) {
        this.logger.error("[Server] Failed to parse WS message:", err);
      }
    });

    this.ws.on("close", (code, reason) => {
      this.wsConnected = false;
      this.logger.info("[Server] WebSocket closed:", code, reason.toString());
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      this.logger.error("[Server] WebSocket error:", err.message);
    });
  }

  /**
   * Disconnect the WebSocket.
   */
  disconnectWebSocket(): void {
    this.stopHeartbeat();
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
  }

  /**
   * Check if the WebSocket is connected.
   */
  isConnected(): boolean {
    return this.wsConnected;
  }

  /**
   * Register a handler for a specific WebSocket message type.
   */
  onWsMessage(type: string, handler: (data: unknown) => void): void {
    const existing = this.wsHandlers.get(type) || [];
    existing.push(handler);
    this.wsHandlers.set(type, existing);
  }

  /**
   * Send a JSON message over the WebSocket.
   */
  wsSend(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.logger.warn("[Server] Cannot send — WebSocket not open");
    }
  }

  // ----------------------------------------------------------------
  //  REST API methods
  // ----------------------------------------------------------------

  /**
   * Register this node on the server.
   */
  async registerNode(agentId: string, publicKey: Uint8Array): Promise<boolean> {
    return this.post("/api/v1/node/register", {
      id: agentId,
      publicKey: Buffer.from(publicKey).toString("base64"),
    });
  }

  /**
   * Request a temporary 6-digit number for friend discovery.
   */
  async requestTempNumber(): Promise<string | null> {
    const res = await this.fetchPost<{ number: string }>("/api/v1/temp-number/request", {
      nodeId: this.store.agentId,
    });
    return res?.number ?? null;
  }

  /**
   * Resolve a temp number to a node ID and public key.
   */
  async resolveTempNumber(number: string): Promise<{ nodeId: string; publicKey: string } | null> {
    const res = await this.fetchGet<{ nodeId: string; publicKey?: string }>("/api/v1/temp-number/" + number);
    if (!res) return null;
    return { nodeId: res.nodeId, publicKey: res.publicKey || "" };
  }

  /**
   * Revoke a temp number.
   */
  async revokeTempNumber(number: string): Promise<boolean> {
    return this.del("/api/v1/temp-number/" + number + "?nodeId=" + this.store.agentId);
  }

  /**
   * Initiate a handshake with a target temp number.
   * Returns the session ID and target's public key.
   */
  async initiateHandshake(
    targetTempNumber: string,
  ): Promise<{ sessionId: string; targetPublicKey: string } | null> {
    // First resolve the temp number to get target's public key
    const targetInfo = await this.resolveTempNumber(targetTempNumber);
    if (!targetInfo || !targetInfo.publicKey) {
      this.logger.error("[Server] Cannot initiate handshake — could not resolve target or missing publicKey");
      return null;
    }
    // Then initiate handshake
    const result = await this.fetchPost<{ sessionId: string }>("/api/v1/handshake/initiate", {
      requesterId: this.store.agentId,
      targetTempNumber,
    });
    if (!result) return null;
    return { sessionId: result.sessionId, targetPublicKey: targetInfo.publicKey };
  }

  /**
   * Submit a handshake response (from the responder side).
   */
  async submitHandshakeResponse(
    sessionId: string,
    responseData: unknown,
  ): Promise<boolean> {
    return this.post("/api/v1/handshake/respond", {
      sessionId,
      responseData,
    });
  }

  /**
   * Submit a handshake confirmation (from the initiator side).
   */
  async submitHandshakeConfirm(
    sessionId: string,
    confirmData: unknown,
  ): Promise<boolean> {
    return this.post("/api/v1/handshake/confirm", {
      sessionId,
      confirmData,
    });
  }

  /**
   * List all friends from the server.
   */
  async listFriends(): Promise<FriendInfo[]> {
    const res = await this.fetchGet<{ friends: FriendInfo[] }>("/api/v1/friends?nodeId=" + this.store.agentId);
    return res?.friends ?? [];
  }

  /**
   * Remove a friend.
   */
  async removeFriend(friendId: string): Promise<boolean> {
    return this.del("/api/v1/friends/" + friendId, {
      nodeId: this.store.agentId,
    });
  }

  /**
   * Get the friend count from the server.
   */
  async getFriendCount(): Promise<number> {
    const res = await this.fetchGet<{ count: number }>("/api/v1/friends?nodeId=" + this.store.agentId);
    return res?.count ?? 0;
  }

  /**
   * Initiate a file transfer session with a receiver.
   */
  async initiateFileTransfer(
    receiverId: string,
    fileInfo: { fileName: string; fileSize: number; fileHash: string; totalChunks: number; chunkSize: number },
  ): Promise<FileTransferSession | null> {
    return this.fetchPost("/api/v1/file/initiate", {
      senderId: this.store.agentId,
      receiverId,
      ...fileInfo,
    });
  }

  /**
   * Query which chunks are missing for a file transfer (for resume).
   */
  async getFileMissingChunks(sessionId: string): Promise<number[]> {
    const res = await this.fetchGet<{ missingChunks: number[] }>("/api/v1/file/" + sessionId + "/missing");
    return res?.missingChunks ?? [];
  }

  /**
   * Send a relay message via the server (WebSocket fallback for P2P).
   */
  sendRelayMessage(targetId: string, payload: unknown): void {
    this.wsSend({
      type: "relay",
      targetId,
      payload,
      senderId: this.store.agentId,
    });
  }

  // ----------------------------------------------------------------
  //  Internal helpers
  // ----------------------------------------------------------------

  private async fetchPost<T>(path: string, body: unknown): Promise<T | null> {
    const url = this.serverUrl + path;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        this.logger.error(`[Server] API error ${resp.status} on ${path}: ${text}`);
        return null;
      }

      return await resp.json() as T;
    } catch (err) {
      this.logger.error(`[Server] API request failed for ${path}:`, err);
      return null;
    }
  }

  private async fetchGet<T>(path: string): Promise<T | null> {
    const url = this.serverUrl + path;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        const text = await resp.text();
        this.logger.error(`[Server] API error ${resp.status} on ${path}: ${text}`);
        return null;
      }
      return await resp.json() as T;
    } catch (err) {
      this.logger.error(`[Server] GET request failed for ${path}:`, err);
      return null;
    }
  }

  private async del(path: string, body?: unknown): Promise<boolean> {
    const url = this.serverUrl + path;
    try {
      const resp = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return resp.ok;
    } catch (err) {
      this.logger.error(`[Server] DELETE request failed for ${path}:`, err);
      return false;
    }
  }

  private async post(path: string, body: unknown): Promise<boolean> {
    const url = this.serverUrl + path;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return resp.ok;
    } catch (err) {
      this.logger.error(`[Server] API request failed for ${path}:`, err);
      return false;
    }
  }

  private handleWsMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;
    const handlers = this.wsHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(msg);
        } catch (err) {
          this.logger.error("[Server] WS handler error for type " + type + ":", err);
        }
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.wsSend({ type: "ping", agentId: this.store.agentId, timestamp: Date.now() });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectTimer) return;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.logger.info("[Server] Attempting WebSocket reconnect...");
      this.connectWebSocket();
    }, 5_000);
  }
}
