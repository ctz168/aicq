/**
 * Server Client — handles REST API calls and WebSocket communication
 * with the AICQ relay server.
 *
 * Features:
 *   - Initial connection burst: retries for 1 minute, then stops
 *   - Hourly reconnection check after initial burst fails
 *   - Connection state tracking (online/offline/reconnecting)
 *   - Offline message flush on reconnection
 *   - Configurable timeouts
 */

import WebSocket from "ws";
import type { Logger, FriendInfo, FileTransferSession, ConnectionState, ConnectionStateCallback } from "../types.js";
import type { PluginStore } from "../store.js";

/** REST API response wrapper. */
interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Configuration for the ServerClient. */
export interface ServerClientConfig {
  /** Initial reconnect delay in ms (default: 1000). */
  initialReconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 60000). */
  maxReconnectDelay?: number;
  /** Multiplier for exponential backoff (default: 2). */
  reconnectBackoffFactor?: number;
  /** WebSocket heartbeat interval in ms (default: 30000). */
  heartbeatIntervalMs?: number;
  /** HTTP request timeout in ms (default: 30000). */
  requestTimeoutMs?: number;
  /** How long (ms) to keep retrying before giving up (default: 60000 = 1 min). */
  initialRetryWindowMs?: number;
  /** How often (ms) to check connection after giving up (default: 3600000 = 1 hour). */
  hourlyCheckIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<ServerClientConfig> = {
  initialReconnectDelay: 1000,
  maxReconnectDelay: 60000,
  reconnectBackoffFactor: 2,
  heartbeatIntervalMs: 30000,
  requestTimeoutMs: 30000,
  initialRetryWindowMs: 60000,
  hourlyCheckIntervalMs: 3600000,
};

export class ServerClient {
  private serverUrl: string;
  private store: PluginStore;
  private logger: Logger;
  private config: Required<ServerClientConfig>;

  /** JWT auth token obtained from server registration/login. */
  private authToken: string = "";

  private ws: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private wsConnected = false;

  /** Current connection state. */
  private connectionState: ConnectionState = "offline";

  /** Reconnect state for exponential backoff. */
  private reconnectDelay: number = DEFAULT_CONFIG.initialReconnectDelay;
  private reconnectAttempts: number = 0;

  /** Timestamp when initial connection burst started. */
  private connectStartTimestamp: number = 0;

  /** Whether we are in the hourly check mode (past initial retry window). */
  private hourlyCheckMode: boolean = false;

  /** Timer for hourly reconnection check. */
  private hourlyCheckTimer: NodeJS.Timeout | null = null;

  /** Callbacks for connection state changes. */
  private stateChangeCallbacks: ConnectionStateCallback[] = [];

  /** WebSocket message callbacks by type. */
  private wsHandlers: Map<string, Array<(data: unknown) => void>> = new Map();

  constructor(serverUrl: string, store: PluginStore, logger: Logger, config?: ServerClientConfig) {
    this.serverUrl = serverUrl;
    this.store = store;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check whether the initial retry window has elapsed.
   */
  private isInitialRetryWindowExpired(): boolean {
    if (this.connectStartTimestamp === 0) return false;
    return (Date.now() - this.connectStartTimestamp) >= this.config.initialRetryWindowMs;
  }

  /**
   * Set the JWT auth token for all subsequent requests.
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    this.logger.info("[Server] Auth token set (" + token.substring(0, 12) + "...)");
  }

  /**
   * Get the current auth token.
   */
  getAuthToken(): string {
    return this.authToken;
  }

  /**
   * Build common headers including Authorization when token is available.
   */
  public authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) {
      headers["Authorization"] = "Bearer " + this.authToken;
    }
    return headers;
  }

  // ----------------------------------------------------------------
  //  Connection state management
  // ----------------------------------------------------------------

  /**
   * Get the current connection state.
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Register a callback for connection state changes.
   */
  onConnectionStateChange(callback: ConnectionStateCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Remove a connection state callback.
   */
  offConnectionStateChange(callback: ConnectionStateCallback): void {
    this.stateChangeCallbacks = this.stateChangeCallbacks.filter((cb) => cb !== callback);
  }

  /**
   * Update connection state and notify listeners.
   */
  private setConnectionState(newState: ConnectionState): void {
    const previousState = this.connectionState;
    if (previousState === newState) return;

    this.connectionState = newState;
    this.logger.info(`[Server] Connection state: ${previousState} → ${newState}`);

    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(newState, previousState);
      } catch (err) {
        this.logger.error("[Server] Connection state callback error:", err);
      }
    }
  }

  // ----------------------------------------------------------------
  //  WebSocket connection
  // ----------------------------------------------------------------

  /**
   * Connect to the server via WebSocket and start heartbeat.
   * Strategy: retry aggressively for `initialRetryWindowMs` (default 1 minute),
   * then stop and switch to hourly checks.
   */
  connectWebSocket(): void {
    // Prevent duplicate connections
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.logger.debug("[Server] WebSocket already connecting/connected");
      return;
    }

    // Record start time on very first attempt
    if (this.connectStartTimestamp === 0 && !this.hourlyCheckMode) {
      this.connectStartTimestamp = Date.now();
    }

    // Build WebSocket URL
    let wsUrl: string;
    try {
      const baseUrl = this.serverUrl.replace(/^http/, "ws");
      const url = new URL(baseUrl + "/ws");
      url.port = "443";
      url.protocol = "wss:";
      wsUrl = url.toString();
    } catch {
      // Fallback for simple URL strings
      wsUrl = this.serverUrl.replace(/^https?/, "wss") + "/ws";
    }

    this.logger.info("[Server] Connecting WebSocket to " + wsUrl);
    this.setConnectionState("reconnecting");

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      this.logger.error("[Server] Failed to create WebSocket:", err);
      this.setConnectionState("offline");
      this.scheduleReconnect();
      return;
    }

    // Connection timeout
    const connectTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        this.logger.warn("[Server] WebSocket connection timeout");
        this.ws.terminate();
      }
    }, this.config.requestTimeoutMs);

    this.ws.on("open", async () => {
      clearTimeout(connectTimeout);
      this.wsConnected = true;
      this.reconnectDelay = this.config.initialReconnectDelay;
      this.reconnectAttempts = 0;
      this.connectStartTimestamp = 0;
      this.hourlyCheckMode = false;
      this.cancelHourlyCheck();
      this.logger.info("[Server] WebSocket connected");

      // Ensure we have a valid auth token before sending "online"
      // If token is missing or empty, try to authenticate first
      if (!this.authToken) {
        this.logger.info("[Server] No auth token — attempting agent authentication...");
        const authed = await this.authenticateAsAgent();
        if (!authed) {
          this.logger.warn("[Server] Agent auth failed on reconnect — closing socket");
          this.ws?.close(1008, "Auth required");
          return;
        }
      }

      this.setConnectionState("online");

      // Send "online" message with auth token
      this.wsSend({
        type: "online",
        nodeId: this.store.agentId,
        publicKey: Buffer.from(this.store.identityKeys.publicKey).toString("base64"),
        token: this.authToken,
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
      clearTimeout(connectTimeout);
      this.wsConnected = false;
      this.logger.info("[Server] WebSocket closed:", code, reason.toString());
      this.stopHeartbeat();
      this.setConnectionState("offline");
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      clearTimeout(connectTimeout);
      this.logger.error("[Server] WebSocket error:", err.message);
    });
  }

  /**
   * Disconnect the WebSocket and stop all reconnection attempts.
   */
  disconnectWebSocket(): void {
    this.stopHeartbeat();
    this.cancelReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
    this.connectStartTimestamp = 0;
    this.setConnectionState("offline");
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
   * Returns true if the message was sent, false if offline.
   */
  wsSend(data: unknown): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    this.logger.warn("[Server] Cannot send — WebSocket not open");
    return false;
  }

  // ----------------------------------------------------------------
  //  Reconnection: try for 1 min, then hourly
  // ----------------------------------------------------------------

  /**
   * Schedule a reconnection attempt.
   *
   * Phase 1 (initial retry window, default 1 minute):
   *   Retries with exponential backoff (1s → 2s → 4s → ... → 60s max).
   *   Once the window expires, stops retrying and switches to hourly checks.
   *
   * Phase 2 (hourly check mode):
   *   After the initial burst fails, sets up a timer that retries once
   *   every hour. If a retry succeeds, hourly mode is cancelled and
   *   normal operation resumes.
   */
  private scheduleReconnect(): void {
    // If we are in hourly check mode, do NOT schedule a quick reconnect
    if (this.hourlyCheckMode) {
      this.logger.info("[Server] Hourly check mode active — next attempt scheduled automatically");
      return;
    }

    // Check if the initial retry window has expired
    if (this.isInitialRetryWindowExpired()) {
      this.logger.warn(
        `[Server] Initial retry window (${this.config.initialRetryWindowMs / 1000}s) expired after ${this.reconnectAttempts} attempts. Switching to hourly check mode.`,
      );
      this.enterHourlyCheckMode();
      return;
    }

    if (this.wsReconnectTimer) return;

    // Exponential backoff with jitter (Phase 1)
    const jitter = 0.75 + Math.random() * 0.5;
    const delay = Math.min(
      this.reconnectDelay * jitter,
      this.config.maxReconnectDelay,
    );

    this.reconnectAttempts++;
    this.logger.info(
      `[Server] Reconnecting in ${Math.round(delay)}ms (attempt #${this.reconnectAttempts})`,
    );

    this.setConnectionState("reconnecting");

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.logger.info("[Server] Attempting WebSocket reconnect...");
      this.connectWebSocket();
    }, delay);

    // Increase delay for next attempt
    this.reconnectDelay = Math.min(
      this.reconnectDelay * this.config.reconnectBackoffFactor,
      this.config.maxReconnectDelay,
    );
  }

  /**
   * Enter hourly check mode: stop aggressive retries,
   * set up a single timer that fires once per hour.
   */
  private enterHourlyCheckMode(): void {
    this.hourlyCheckMode = true;
    this.reconnectDelay = this.config.initialReconnectDelay;
    this.reconnectAttempts = 0;

    // Cancel any pending quick reconnect
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    this.setConnectionState("offline");
    this.logger.info(
      `[Server] Entering hourly check mode — will retry every ${this.config.hourlyCheckIntervalMs / 60000} minutes`,
    );

    this.hourlyCheckTimer = setTimeout(() => {
      this.hourlyCheckTimer = null;
      this.logger.info("[Server] Hourly check: attempting to reconnect...");
      this.connectWebSocket();
    }, this.config.hourlyCheckIntervalMs);
  }

  /**
   * Cancel the hourly check timer.
   */
  private cancelHourlyCheck(): void {
    if (this.hourlyCheckTimer) {
      clearTimeout(this.hourlyCheckTimer);
      this.hourlyCheckTimer = null;
    }
    this.hourlyCheckMode = false;
  }

  /**
   * Cancel a pending reconnection.
   */
  private cancelReconnect(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.cancelHourlyCheck();
    this.reconnectDelay = this.config.initialReconnectDelay;
    this.reconnectAttempts = 0;
    this.connectStartTimestamp = 0;
  }

  // ----------------------------------------------------------------
  //  REST API methods
  // ----------------------------------------------------------------

  /**
   * Authenticate as an AI Agent using challenge-response.
   *
   * Flow:
   *   1. POST /api/v1/auth/challenge  → get challenge + challengeId
   *   2. Sign challenge with Ed25519 private key
   *   3. POST /api/v1/auth/login-agent  → get JWT token
   *
   * Returns true if authentication succeeded and token was set.
   */
  async authenticateAsAgent(): Promise<boolean> {
    const publicKeyBase64 = Buffer.from(this.store.identityKeys.publicKey).toString('base64');

    // Step 1: Request challenge
    const challengeResp = await this.fetchPost<{
      success?: boolean;
      challenge?: string;
      challengeId?: string;
    }>('/api/v1/auth/challenge', {
      publicKey: publicKeyBase64,
    });

    if (!challengeResp?.challenge || !challengeResp?.challengeId) {
      this.logger.warn('[Server] Failed to request agent challenge');
      return false;
    }

    // Step 2: Sign the challenge with Ed25519 private key
    let signature: Uint8Array;
    try {
      const message = Buffer.from(challengeResp.challenge, 'utf8');
      // Import nacl dynamically since it's bundled by esbuild
      const nacl = await import('tweetnacl');
      signature = nacl.sign.detached(message, this.store.identityKeys.secretKey);
    } catch (err) {
      this.logger.error('[Server] Failed to sign challenge:', err);
      return false;
    }

    // Step 3: Login with signed challenge
    const loginResp = await this.fetchPost<{
      success?: boolean;
      session?: { token?: string; refreshToken?: string; expiresAt?: number };
    }>('/api/v1/auth/login-agent', {
      publicKey: publicKeyBase64,
      signature: Buffer.from(signature).toString('base64'),
      challengeId: challengeResp.challengeId,
    });

    if (!loginResp?.session?.token) {
      this.logger.warn('[Server] Agent login failed — no token in response');
      return false;
    }

    this.setAuthToken(loginResp.session.token);
    this.logger.info('[Server] Agent authenticated successfully');
    return true;
  }

  /**
   * Register this node on the server.
   * Captures JWT token from response if returned.
   */
  async registerNode(agentId: string, publicKey: Uint8Array): Promise<boolean> {
    const res = await this.fetchPost<{ token?: string; ok?: boolean }>("/api/v1/node/register", {
      id: agentId,
      publicKey: Buffer.from(publicKey).toString("base64"),
    });
    if (res?.token) {
      this.setAuthToken(res.token);
    }
    return res?.ok ?? false;
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
   * Returns true if sent, false if offline.
   */
  sendRelayMessage(targetId: string, payload: unknown): boolean {
    return this.wsSend({
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      const resp = await fetch(url, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        // If 401 and we have a token, log a warning
        if (resp.status === 401 && this.authToken) {
          this.logger.warn(`[Server] 401 Unauthorized on ${path} — token may be expired`);
        }
        const text = await resp.text();
        this.logger.error(`[Server] API error ${resp.status} on ${path}: ${text}`);
        return null;
      }

      return await resp.json() as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        this.logger.error(`[Server] API request timeout for ${path}`);
      } else {
        this.logger.error(`[Server] API request failed for ${path}:`, err);
      }
      return null;
    }
  }

  private async fetchGet<T>(path: string): Promise<T | null> {
    const url = this.serverUrl + path;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: this.authToken ? { Authorization: "Bearer " + this.authToken } : {},
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const text = await resp.text();
        this.logger.error(`[Server] API error ${resp.status} on ${path}: ${text}`);
        return null;
      }
      return await resp.json() as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        this.logger.error(`[Server] GET request timeout for ${path}`);
      } else {
        this.logger.error(`[Server] GET request failed for ${path}:`, err);
      }
      return null;
    }
  }

  private async del(path: string, body?: unknown): Promise<boolean> {
    const url = this.serverUrl + path;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      const resp = await fetch(url, {
        method: "DELETE",
        headers: this.authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return resp.ok;
    } catch (err) {
      this.logger.error(`[Server] DELETE request failed for ${path}:`, err);
      return false;
    }
  }

  private async post(path: string, body: unknown): Promise<boolean> {
    const url = this.serverUrl + path;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      const resp = await fetch(url, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
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
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.wsSend({ type: "ping", agentId: this.store.agentId, timestamp: Date.now() });
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
