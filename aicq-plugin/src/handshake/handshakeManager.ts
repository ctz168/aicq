/**
 * Handshake Manager — orchestrates the authenticated key-exchange protocol
 * between two AICQ nodes.
 *
 * Uses the @aicq/crypto handshake primitives:
 *   - createHandshakeRequest()
 *   - createHandshakeResponse()
 *   - completeHandshake()
 *
 * Handles both initiator and responder roles, with optional auto-accept
 * for friend requests.
 */

import {
  generateKeyExchangeKeyPair,
  createHandshakeRequest,
  createHandshakeResponse,
  completeHandshake,
  encodeBase64,
  decodeBase64,
  getPublicKeyFingerprint,
  computeSharedSecret,
  deriveSessionKey,
} from "@aicq/crypto";
import type { HandshakeRequest, HandshakeResponse, KeyPair } from "@aicq/crypto";
import type { PluginStore } from "../store.js";
import type { ServerClient } from "../services/serverClient.js";
import type { PluginConfig, Logger, SessionState, HandshakeState } from "../types.js";

/** Pending handshake promise resolvers. */
interface PendingInitiate {
  resolve: (session: SessionState) => void;
  reject: (err: Error) => void;
}

export class HandshakeManager {
  private store: PluginStore;
  private serverClient: ServerClient;
  private config: PluginConfig;
  private logger: Logger;

  /** Pending initiate calls waiting for response/confirm. */
  private pendingInitiates: Map<string, PendingInitiate> = new Map();

  constructor(
    store: PluginStore,
    serverClient: ServerClient,
    config: PluginConfig,
    logger: Logger,
  ) {
    this.store = store;
    this.serverClient = serverClient;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Register WebSocket handlers for handshake signals.
   */
  setupWsHandlers(): void {
    // Handle incoming handshake request (responder side)
    this.serverClient.onWsMessage("handshake_request", (data) => {
      void this.handleIncomingRequest(data as Record<string, unknown>);
    });

    // Handle handshake response (initiator side)
    this.serverClient.onWsMessage("handshake_response", (data) => {
      this.handleResponse(data as Record<string, unknown>);
    });

    // Handle handshake confirm (responder side)
    this.serverClient.onWsMessage("handshake_confirm", (data) => {
      this.handleConfirm(data as Record<string, unknown>);
    });
  }

  /**
   * Initiate a handshake with a peer identified by their temp number.
   *
   * @returns A promise that resolves with the SessionState when complete
   */
  async initiate(tempNumber: string): Promise<SessionState | null> {
    try {
      // Get target info from server
      const targetInfo = await this.serverClient.initiateHandshake(tempNumber);
      if (!targetInfo) {
        this.logger.error("[Handshake] Failed to get target info for temp number:", tempNumber);
        return null;
      }

      const targetPublicKey = decodeBase64(targetInfo.targetPublicKey);
      const sessionId = targetInfo.sessionId;

      // Generate ephemeral key pair
      const ephemeralKeys = generateKeyExchangeKeyPair();

      // Create handshake request
      const request = createHandshakeRequest(
        this.store.identityKeys.publicKey,
        ephemeralKeys.publicKey,
      );

      // Serialize and submit to server
      const requestData = {
        identityPublicKey: encodeBase64(request.identityPublicKey),
        ephemeralPublicKey: encodeBase64(request.ephemeralPublicKey),
      };

      await this.serverClient.submitHandshakeResponse(sessionId, requestData);

      // Store pending handshake state
      this.store.setPendingHandshake(sessionId, {
        sessionId,
        peerId: targetInfo.targetPublicKey, // will be updated when we get the response
        request,
        ephemeralKeys,
        createdAt: new Date(),
      });

      // Wait for response via WebSocket
      return new Promise<SessionState>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingInitiates.delete(sessionId);
          this.store.removePendingHandshake(sessionId);
          reject(new Error("Handshake timed out"));
        }, 30_000);

        this.pendingInitiates.set(sessionId, {
          resolve: (session) => {
            clearTimeout(timeout);
            resolve(session);
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });
      });
    } catch (err) {
      this.logger.error("[Handshake] Initiate failed:", err);
      return null;
    }
  }

  /**
   * Handle an incoming handshake request (responder side).
   *
   * If autoAccept is enabled, auto-respond.  Otherwise queue for agent decision.
   */
  async handleIncomingRequest(data: Record<string, unknown>): Promise<void> {
    const sessionId = data.sessionId as string;
    const requesterId = data.requesterId as string;
    const requestData = data.requestData as Record<string, unknown>;

    if (!sessionId || !requesterId || !requestData) {
      this.logger.warn("[Handshake] Invalid incoming handshake request");
      return;
    }

    this.logger.info("[Handshake] Incoming handshake request from " + requesterId);

    const request: HandshakeRequest = {
      identityPublicKey: decodeBase64(requestData.identityPublicKey as string),
      ephemeralPublicKey: decodeBase64(requestData.ephemeralPublicKey as string),
    };

    if (this.config.autoAcceptFriends) {
      // Auto-respond
      await this.respondToHandshake(sessionId, requesterId, request);
    } else {
      // Queue as pending friend request
      this.store.addPendingRequest({
        requesterId,
        tempNumber: sessionId, // use sessionId as temp identifier
        timestamp: new Date(),
      });

      this.logger.info("[Handshake] Queued friend request from " + requesterId);
    }
  }

  /**
   * Respond to a handshake request (responder side).
   */
  async respondToHandshake(
    sessionId: string,
    requesterId: string,
    request: HandshakeRequest,
  ): Promise<void> {
    // Generate our ephemeral key pair
    const ephemeralKeys = generateKeyExchangeKeyPair();

    // Create handshake response using identity keys
    const myIdentityKeys: KeyPair = {
      publicKey: this.store.identityKeys.publicKey,
      secretKey: this.store.identityKeys.secretKey,
    };

    const response = createHandshakeResponse(
      request,
      myIdentityKeys,
      ephemeralKeys,
    );

    // Derive session key
    const sessionKey = completeHandshake(
      response,
      request,
      myIdentityKeys,
      ephemeralKeys,
    );

    // Submit response to server
    const responseData = {
      identityPublicKey: encodeBase64(response.identityPublicKey),
      ephemeralPublicKey: encodeBase64(response.ephemeralPublicKey),
      proof: encodeBase64(response.proof),
    };

    await this.serverClient.submitHandshakeResponse(sessionId, responseData);

    // Store session
    const session: SessionState = {
      peerId: requesterId,
      sessionKey,
      ephemeralSecretKey: ephemeralKeys.secretKey,
      createdAt: new Date(),
      messageCount: 0,
    };

    this.store.setSession(requesterId, session);

    this.logger.info("[Handshake] Responded to handshake from " + requesterId);
  }

  /**
   * Handle a handshake response from the server (initiator side).
   */
  handleResponse(data: Record<string, unknown>): void {
    const sessionId = data.sessionId as string;
    if (!sessionId) return;

    const pending = this.store.getPendingHandshake(sessionId);
    const initiate = this.pendingInitiates.get(sessionId);
    if (!pending || !initiate) {
      this.logger.warn("[Handshake] Received response for unknown session:", sessionId);
      return;
    }

    const responseData = data.responseData as Record<string, unknown>;
    if (!responseData) {
      initiate.reject(new Error("Invalid handshake response data"));
      return;
    }

    const response: HandshakeResponse = {
      identityPublicKey: decodeBase64(responseData.identityPublicKey as string),
      ephemeralPublicKey: decodeBase64(responseData.ephemeralPublicKey as string),
      proof: decodeBase64(responseData.proof as string),
    };

    try {
      // Complete the handshake (initiator side)
      const myIdentityKeys: KeyPair = {
        publicKey: this.store.identityKeys.publicKey,
        secretKey: this.store.identityKeys.secretKey,
      };

      const sessionKey = completeHandshake(
        response,
        pending.request,
        myIdentityKeys,
        pending.ephemeralKeys,
      );

      // Determine peer ID from the response
      const peerId = getPublicKeyFingerprint(response.identityPublicKey);

      const session: SessionState = {
        peerId,
        sessionKey,
        ephemeralSecretKey: pending.ephemeralKeys.secretKey,
        createdAt: new Date(),
        messageCount: 0,
      };

      this.store.setSession(peerId, session);
      this.store.removePendingHandshake(sessionId);
      this.pendingInitiates.delete(sessionId);

      this.logger.info("[Handshake] Handshake completed with peer:", peerId);
      initiate.resolve(session);
    } catch (err) {
      this.logger.error("[Handshake] Failed to complete handshake:", err);
      this.store.removePendingHandshake(sessionId);
      this.pendingInitiates.delete(sessionId);
      initiate.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Handle a handshake confirm from the server (responder side).
   */
  handleConfirm(_data: Record<string, unknown>): void {
    // Confirmation is handled as part of the response flow
    // The responder already derived the session key when creating the response
    this.logger.debug("[Handshake] Received handshake confirm");
  }

  /**
   * Get the session key for a peer.
   */
  getSessionKey(peerId: string): Uint8Array | null {
    const session = this.store.getSession(peerId);
    return session?.sessionKey ?? null;
  }

  /**
   * Rotate the session key with a peer.
   *
   * Triggered after 100 messages or 1 hour of session age.
   * Performs a new ephemeral key exchange while maintaining the identity keys.
   */
  rotateSessionKey(peerId: string): void {
    const session = this.store.getSession(peerId);
    if (!session) {
      this.logger.warn("[Handshake] Cannot rotate — no session with:", peerId);
      return;
    }

    const friend = this.store.getFriend(peerId);
    if (!friend) {
      this.logger.warn("[Handshake] Cannot rotate — not friends with:", peerId);
      return;
    }

    // Generate new ephemeral key pair
    const newEphemeralKeys = generateKeyExchangeKeyPair();

    // Derive new session key using new ephemeral + existing identity keys
    const ee = computeSharedSecret(newEphemeralKeys.secretKey, friend.publicKey);
    const se = computeSharedSecret(this.store.exchangeKeys.secretKey, friend.publicKey);
    const es = computeSharedSecret(newEphemeralKeys.secretKey, friend.publicKey);

    // Combine shared secrets for key derivation
    const combined = new Uint8Array(96);
    combined.set(ee, 0);
    combined.set(se, 32);
    combined.set(es, 64);

    const newSessionKey = deriveSessionKey(combined, "aicq-session-rotate-" + Date.now());

    // Update session
    const updatedSession: SessionState = {
      peerId,
      sessionKey: newSessionKey,
      ephemeralSecretKey: newEphemeralKeys.secretKey,
      createdAt: new Date(),
      messageCount: 0,
    };

    this.store.setSession(peerId, updatedSession);
    this.logger.info("[Handshake] Session key rotated with:", peerId);
  }
}
