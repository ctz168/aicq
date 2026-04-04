/**
 * Authenticated key-exchange handshake handler.
 *
 * Orchestrates the 3-step Noise-XK-inspired handshake using @aicq/crypto
 * primitives and the server's relay API.
 */

import type { KeyPair, HandshakeRequest, HandshakeResponse } from '@aicq/crypto';
import {
  generateKeyExchangeKeyPair,
  getPublicKeyFingerprint,
  createHandshakeRequest,
  createHandshakeResponse,
  completeHandshake,
  encodeBase64,
  decodeBase64,
} from '@aicq/crypto';
import { APIClient } from '../services/apiClient.js';
import { WSClient } from '../services/wsClient.js';
import { IdentityManager } from '../services/identityManager.js';
import { ClientStore } from '../store.js';
import type { HandshakeProgress, FriendInfo } from '../types.js';

/** Incoming handshake request waiting for user action. */
interface PendingIncomingHandshake {
  sessionId: string;
  requesterId: string;
  requesterPublicKey: string;
  request: HandshakeRequest;
  timestamp: number;
}

export class HandshakeHandler {
  private api: APIClient;
  private ws: WSClient;
  private identity: IdentityManager;
  private store: ClientStore;

  /** Active outgoing handshake ephemeral keys, keyed by sessionId. */
  private outgoingEphemeral = new Map<
    string,
    { keys: KeyPair; request: HandshakeRequest; targetNodeId: string }
  >();

  /** Incoming handshake requests awaiting user accept/reject. */
  private incomingRequests = new Map<string, PendingIncomingHandshake>();

  /** Progress callback set by the caller. */
  private progressCallback: ((progress: HandshakeProgress) => void) | null = null;

  constructor(
    api: APIClient,
    ws: WSClient,
    identity: IdentityManager,
    store: ClientStore,
  ) {
    this.api = api;
    this.ws = ws;
    this.identity = identity;
    this.store = store;

    this._setupListeners();
  }

  /* ──────────────── Progress callback ──────────────── */

  onProgress(callback: (progress: HandshakeProgress) => void): void {
    this.progressCallback = callback;
  }

  private emitProgress(progress: HandshakeProgress): void {
    this.progressCallback?.(progress);
  }

  /* ──────────────── WebSocket listeners ──────────────── */

  private _setupListeners(): void {
    // Listen for incoming handshake signals relayed via the server
    this.ws.on('signal', (msg: any) => {
      if (msg.data?.type === 'handshake_request') {
        this._handleIncomingRequest(msg.data);
      } else if (msg.data?.type === 'handshake_response') {
        this._handleResponse(msg.data);
      } else if (msg.data?.type === 'handshake_confirm') {
        this._handleConfirm(msg.data);
      }
    });
  }

  /* ──────────────── Initiate (outgoing) ──────────────── */

  /**
   * Initiate a handshake with a peer identified by their temp number.
   *
   * Flow:
   *  1. Resolve temp number → get targetNodeId
   *  2. Generate ephemeral X25519 key pair
   *  3. Create handshake request (identity PK + ephemeral PK)
   *  4. Submit to server via API
   *  5. Send handshake_request signal to target via WebSocket
   *  6. Wait for response
   *  7. Process response, derive session key, send confirm
   *  8. Wait for confirm ack
   *  9. Store session key, add friend
   */
  async initiateHandshake(tempNumber: string): Promise<void> {
    // Step 1: Resolve temp number
    this.emitProgress({ status: 'initiating', detail: 'Resolving temp number...' });
    let targetNodeId: string;
    try {
      const resolved = await this.api.resolveTempNumber(tempNumber);
      targetNodeId = resolved.nodeId;
    } catch (err) {
      this.emitProgress({ status: 'failed', detail: `Temp number resolution failed: ${err}` });
      throw err;
    }

    // Step 2: Generate ephemeral key pair
    const ephemeralKeys = generateKeyExchangeKeyPair();

    // Step 3: Create handshake request
    const request: HandshakeRequest = {
      identityPublicKey: this.identity.getPublicKey(),
      ephemeralPublicKey: ephemeralKeys.publicKey,
    };

    // Step 4: Submit to server
    this.emitProgress({ status: 'initiating', detail: 'Starting handshake session...' });
    let sessionId: string;
    try {
      const result = await this.api.initiateHandshake(tempNumber);
      sessionId = result.sessionId;
    } catch (err) {
      this.emitProgress({ status: 'failed', detail: `Failed to initiate handshake: ${err}` });
      throw err;
    }

    // Store ephemeral keys for later
    this.outgoingEphemeral.set(sessionId, {
      keys: ephemeralKeys,
      request,
      targetNodeId,
    });

    // Step 5: Send signal to target via WebSocket
    this.ws.send('signal', {
      to: targetNodeId,
      data: {
        type: 'handshake_request',
        sessionId,
        identityPublicKey: encodeBase64(request.identityPublicKey),
        ephemeralPublicKey: encodeBase64(request.ephemeralPublicKey),
      },
    });

    // Step 6: Wait for response via WebSocket
    this.emitProgress({
      status: 'waiting_response',
      detail: 'Waiting for peer to accept...',
      peerInfo: { id: targetNodeId, publicKey: '', fingerprint: '' },
    });

    try {
      const responseMsg = await this.ws.waitForResponse(
        sessionId,
        'signal',
        120_000, // 2 minute timeout
      );

      if (responseMsg.data?.type !== 'handshake_response') {
        throw new Error('Unexpected response type');
      }

      // Step 7: Process response, derive session key
      this.emitProgress({ status: 'processing_response', detail: 'Processing response...' });
      await this._completeOutgoingHandshake(sessionId, responseMsg.data);
    } catch (err) {
      this.outgoingEphemeral.delete(sessionId);
      this.emitProgress({ status: 'failed', detail: `Handshake failed: ${err}` });
      throw err;
    }
  }

  /**
   * Complete the outgoing handshake after receiving the response.
   */
  private async _completeOutgoingHandshake(
    sessionId: string,
    responseData: any,
  ): Promise<void> {
    const state = this.outgoingEphemeral.get(sessionId);
    if (!state) throw new Error('No outgoing handshake state found');

    const targetIdentityPubKey = decodeBase64(responseData.identityPublicKey);
    const targetEphemeralPubKey = decodeBase64(responseData.ephemeralPublicKey);
    const proof = decodeBase64(responseData.proof);

    const response: HandshakeResponse = {
      identityPublicKey: targetIdentityPubKey,
      ephemeralPublicKey: targetEphemeralPubKey,
      proof,
    };

    // Derive session key and verify proof
    const myIdentityKeys: KeyPair = {
      publicKey: this.identity.getPublicKey(),
      secretKey: this.identity.getSigningSecretKey(),
    };

    const sessionKey = completeHandshake(
      response,
      state.request,
      myIdentityKeys,
      state.keys,
    );

    // Store session key
    this.store.setSessionKey(state.targetNodeId, sessionKey);

    // Submit confirm to server API
    this.emitProgress({ status: 'confirming', detail: 'Confirming handshake...' });
    // We send a simple confirm signal back — the proof of successful
    // key derivation is enough.  For the server we submit a minimal confirm.
    await this.api.submitHandshakeConfirm(
      sessionId,
      Buffer.from(sessionKey.slice(0, 16)), // truncated proof of derivation
    );

    // Send confirm to peer via WebSocket
    this.ws.send('signal', {
      to: state.targetNodeId,
      data: {
        type: 'handshake_confirm',
        sessionId,
      },
    });

    // Add friend to store
    const friendInfo: FriendInfo = {
      id: state.targetNodeId,
      publicKey: encodeBase64(targetIdentityPubKey),
      fingerprint: getPublicKeyFingerprint(targetIdentityPubKey),
      addedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isOnline: false,
    };
    this.store.addFriend(friendInfo);
    this.store.save();

    // Cleanup
    this.outgoingEphemeral.delete(sessionId);

    this.emitProgress({
      status: 'completed',
      detail: `Handshake complete with ${state.targetNodeId}`,
      peerInfo: {
        id: state.targetNodeId,
        publicKey: encodeBase64(targetIdentityPubKey),
        fingerprint: friendInfo.fingerprint,
      },
    });
  }

  /* ──────────────── Incoming handshake ──────────────── */

  /**
   * Called when an incoming handshake request arrives via WebSocket.
   * Stores the request and notifies the user via progress callback.
   */
  private _handleIncomingRequest(data: any): void {
    const sessionId: string = data.sessionId;
    const requesterId: string = data.requesterId;
    const identityPubKey = decodeBase64(data.identityPublicKey);
    const ephemeralPubKey = decodeBase64(data.ephemeralPublicKey);

    const request: HandshakeRequest = {
      identityPublicKey: identityPubKey,
      ephemeralPublicKey: ephemeralPubKey,
    };

    this.incomingRequests.set(sessionId, {
      sessionId,
      requesterId,
      requesterPublicKey: encodeBase64(identityPubKey),
      request,
      timestamp: Date.now(),
    });

    this.emitProgress({
      status: 'incoming_request',
      detail: `Incoming handshake from ${requesterId.slice(0, 8)}...`,
      peerInfo: {
        id: requesterId,
        publicKey: encodeBase64(identityPubKey),
        fingerprint: getPublicKeyFingerprint(identityPubKey),
      },
    });
  }

  /* ──────────────── Accept / Reject ──────────────── */

  /**
   * Accept an incoming handshake request.
   */
  async acceptHandshake(requestId: string): Promise<void> {
    const pending = this.incomingRequests.get(requestId);
    if (!pending) {
      throw new Error('No pending handshake request found');
    }

    // Generate ephemeral key pair
    const ephemeralKeys = generateKeyExchangeKeyPair();

    // Create response
    const myIdentityKeys: KeyPair = {
      publicKey: this.identity.getPublicKey(),
      secretKey: this.identity.getSigningSecretKey(),
    };

    const response = createHandshakeResponse(
      pending.request,
      myIdentityKeys,
      ephemeralKeys,
    );

    // Derive session key (responder side) using the same function
    // that the initiator will use, ensuring both sides agree.
    const sessionKey = completeHandshake(
      response,
      pending.request,
      myIdentityKeys,
      ephemeralKeys,
    );

    // Store session key
    this.store.setSessionKey(pending.requesterId, sessionKey);

    // Submit response to server API
    const responseBuf = Buffer.from(
      JSON.stringify({
        identityPublicKey: encodeBase64(response.identityPublicKey),
        ephemeralPublicKey: encodeBase64(response.ephemeralPublicKey),
        proof: encodeBase64(response.proof),
      }),
      'utf-8',
    );
    await this.api.submitHandshakeResponse(pending.sessionId, responseBuf);

    // Send response to requester via WebSocket
    this.ws.send('signal', {
      to: pending.requesterId,
      data: {
        type: 'handshake_response',
        sessionId: pending.sessionId,
        identityPublicKey: encodeBase64(response.identityPublicKey),
        ephemeralPublicKey: encodeBase64(response.ephemeralPublicKey),
        proof: encodeBase64(response.proof),
      },
    });

    // Wait for confirm from initiator
    this.emitProgress({
      status: 'confirming',
      detail: 'Waiting for confirmation...',
    });

    try {
      await this.ws.waitForResponse(pending.sessionId, 'signal', 60_000);
    } catch (err) {
      console.warn('[Handshake] Confirm timeout:', err);
    }

    // Add friend
    const friendInfo: FriendInfo = {
      id: pending.requesterId,
      publicKey: pending.requesterPublicKey,
      fingerprint: getPublicKeyFingerprint(pending.request.identityPublicKey),
      addedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isOnline: true,
    };
    this.store.addFriend(friendInfo);
    this.store.save();

    this.incomingRequests.delete(requestId);

    this.emitProgress({
      status: 'completed',
      detail: `Friend ${pending.requesterId.slice(0, 8)}... added`,
      peerInfo: {
        id: pending.requesterId,
        publicKey: pending.requesterPublicKey,
        fingerprint: friendInfo.fingerprint,
      },
    });
  }

  /**
   * Reject an incoming handshake request.
   */
  rejectHandshake(requestId: string): void {
    const pending = this.incomingRequests.get(requestId);
    if (!pending) return;

    // Notify the requester
    this.ws.send('signal', {
      to: pending.requesterId,
      data: {
        type: 'handshake_rejected',
        sessionId: pending.sessionId,
      },
    });

    this.incomingRequests.delete(requestId);

    this.emitProgress({
      status: 'rejected',
      detail: 'Handshake request rejected',
    });
  }

  /* ──────────────── Response / Confirm handlers (outgoing) ──────────────── */

  private _handleResponse(_data: any): void {
    // The waitForResponse mechanism in WSClient handles response routing.
    // No buffering needed here.
  }

  private _handleConfirm(_data: any): void {
    // The waitForResponse mechanism in WSClient handles confirm routing.
    // No buffering needed here.
  }

  /* ──────────────── Session key lookup ──────────────── */

  /** Retrieve the session key for a given peer. */
  getSessionKey(peerId: string): Uint8Array | null {
    return this.store.getSessionKey(peerId);
  }

  /* ──────────────── Cleanup ──────────────── */

  destroy(): void {
    this.outgoingEphemeral.clear();
    this.incomingRequests.clear();
    this.progressCallback = null;
  }
}
