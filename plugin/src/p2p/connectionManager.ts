/**
 * P2P Connection Manager — manages peer-to-peer connections using WebRTC
 * data channels for direct encrypted communication.
 *
 * Falls back to WebSocket relay when P2P is unavailable.
 * Handles connection lifecycle, signaling, and auto-reconnect.
 */

import type { P2PConnection } from "../types.js";
import type { Logger } from "../types.js";
import type { ServerClient } from "../services/serverClient.js";

/**
 * Simple in-process P2P connection mock (production would use WebRTC).
 *
 * For the initial implementation, connections are simulated as direct
 * WebSocket tunnels through the relay server.  A real WebRTC integration
 * would replace the internals of this class.
 */
class SimpleP2PConnection implements P2PConnection {
  peerId: string;
  connected = false;
  createdAt: Date;

  private sendFn: (peerId: string, data: Buffer) => boolean;
  private closeFn: (peerId: string) => void;

  constructor(
    peerId: string,
    sendFn: (peerId: string, data: Buffer) => boolean,
    closeFn: (peerId: string) => void,
  ) {
    this.peerId = peerId;
    this.createdAt = new Date();
    this.connected = true;
    this.sendFn = sendFn;
    this.closeFn = closeFn;
  }

  send(data: Buffer): boolean {
    if (!this.connected) return false;
    return this.sendFn(this.peerId, data);
  }

  close(): void {
    this.connected = false;
    this.closeFn(this.peerId);
  }
}

export class P2PConnectionManager {
  private connections: Map<string, P2PConnection> = new Map();
  private serverClient: ServerClient;
  private logger: Logger;

  /** Signal callbacks for WebRTC offer/answer exchange. */
  private signalCallbacks: Map<string, Array<(signalData: unknown) => void>> = new Map();

  /** Reconnect timers. */
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(serverClient: ServerClient, logger: Logger) {
    this.serverClient = serverClient;
    this.logger = logger;
  }

  /**
   * Set up WebSocket handlers for P2P signaling.
   */
  setupWsHandlers(): void {
    // Handle incoming signal data for WebRTC
    this.serverClient.onWsMessage("p2p_signal", (data) => {
      const msg = data as Record<string, unknown>;
      const peerId = msg.peerId as string;
      const signalData = msg.signalData;
      this.handleIncomingSignal(peerId, signalData);
    });

    // Handle P2P connection established confirmation
    this.serverClient.onWsMessage("p2p_connected", (data) => {
      const msg = data as Record<string, unknown>;
      const peerId = msg.peerId as string;
      this.logger.info("[P2P] Connection confirmed with:", peerId);
    });

    // Handle P2P data received via relay fallback
    this.serverClient.onWsMessage("p2p_relay_data", (data) => {
      const msg = data as Record<string, unknown>;
      const peerId = msg.senderId as string;
      const payload = msg.payload as string;

      if (peerId && payload) {
        const buf = Buffer.from(payload, "base64");
        this.emitToSignalCallbacks(peerId, { type: "data", data: buf });
      }
    });
  }

  /**
   * Connect to a peer using signal data from the server.
   *
   * In a full WebRTC implementation, this would:
   *   1. Create an RTCPeerConnection
   *   2. Set remote description from signalData
   *   3. Create answer and send via signaling
   *
   * For now, establishes a logical connection via the relay server.
   */
  connect(peerId: string, _signalData?: unknown): void {
    if (this.connections.has(peerId)) {
      this.logger.debug("[P2P] Already connected to:", peerId);
      return;
    }

    this.logger.info("[P2P] Connecting to peer:", peerId);

    // Create a connection that uses the relay server for transport
    const connection = new SimpleP2PConnection(
      peerId,
      (targetId, data) => {
        // Send via relay
        this.serverClient.sendRelayMessage(targetId, {
          type: "p2p_data",
          payload: Buffer.from(data).toString("base64"),
        });
        return true;
      },
      (targetId) => {
        this.logger.info("[P2P] Disconnected from:", targetId);
      },
    );

    this.connections.set(peerId, connection);

    // Notify server of P2P connection attempt
    this.serverClient.wsSend({
      type: "p2p_connect",
      peerId,
    });
  }

  /**
   * Disconnect from a peer.
   */
  disconnect(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
      this.logger.info("[P2P] Disconnected from:", peerId);
    }

    // Clear reconnect timer
    const timer = this.reconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(peerId);
    }
  }

  /**
   * Send data to a peer via P2P.
   *
   * @returns true if sent, false if not connected
   */
  send(peerId: string, data: Buffer): boolean {
    const conn = this.connections.get(peerId);
    if (!conn || !conn.connected) {
      return false;
    }
    return conn.send(data);
  }

  /**
   * Check if connected to a peer.
   */
  isConnected(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return conn?.connected ?? false;
  }

  /**
   * Register a callback for signal events from a specific peer.
   */
  onSignal(peerId: string, callback: (signalData: unknown) => void): void {
    const existing = this.signalCallbacks.get(peerId) || [];
    existing.push(callback);
    this.signalCallbacks.set(peerId, existing);
  }

  /**
   * Send a signal to a peer through the server.
   */
  sendSignal(peerId: string, signalData: unknown): void {
    this.serverClient.wsSend({
      type: "p2p_signal",
      peerId,
      signalData,
    });
  }

  /**
   * Get all connected peer IDs.
   */
  getConnectedPeers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.connected)
      .map(([peerId]) => peerId);
  }

  /**
   * Clean up all connections.
   */
  cleanup(): void {
    for (const [peerId, conn] of this.connections) {
      conn.close();
      this.logger.debug("[P2P] Cleaned up connection:", peerId);
    }
    this.connections.clear();

    for (const [, timer] of this.reconnectTimers) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    this.signalCallbacks.clear();
  }

  // ----------------------------------------------------------------
  //  Internal
  // ----------------------------------------------------------------

  private handleIncomingSignal(peerId: string, signalData: unknown): void {
    this.logger.debug("[P2P] Received signal from:", peerId);

    // If we don't have a connection, create one
    if (!this.connections.has(peerId)) {
      this.connect(peerId, signalData);
    }

    this.emitToSignalCallbacks(peerId, signalData);
  }

  private emitToSignalCallbacks(peerId: string, data: unknown): void {
    const callbacks = this.signalCallbacks.get(peerId);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (err) {
          this.logger.error("[P2P] Signal callback error:", err);
        }
      }
    }
  }
}
