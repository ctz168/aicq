/**
 * Tool handler: chat-friend
 *
 * Manages the agent's friend list — add, list, remove friends,
 * request/revoke temporary discovery numbers.
 */

import type { PluginStore } from "../store.js";
import type { ServerClient } from "../services/serverClient.js";
import type { HandshakeManager } from "../handshake/handshakeManager.js";
import type { IdentityService } from "../services/identityService.js";
import type { PluginConfig, Logger } from "../types.js";
import { getPublicKeyFingerprint } from "@aicq/crypto";

export class ChatFriendTool {
  private store: PluginStore;
  private serverClient: ServerClient;
  private handshakeManager: HandshakeManager;
  private identityService: IdentityService;
  private config: PluginConfig;
  private logger: Logger;

  constructor(
    store: PluginStore,
    serverClient: ServerClient,
    handshakeManager: HandshakeManager,
    identityService: IdentityService,
    config: PluginConfig,
    logger: Logger,
  ) {
    this.store = store;
    this.serverClient = serverClient;
    this.handshakeManager = handshakeManager;
    this.identityService = identityService;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Handle a chat-friend tool action.
   */
  async handleAction(
    action: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (action) {
      case "add":
        return this.handleAdd(params);
      case "list":
        return this.handleList(params);
      case "remove":
        return this.handleRemove(params);
      case "request-temp-number":
        return this.handleRequestTempNumber();
      case "revoke-temp-number":
        return this.handleRevokeTempNumber(params);
      default:
        return { error: "Unknown action: " + action };
    }
  }

  /**
   * Add a friend by resolving their temp number and performing handshake.
   */
  private async handleAdd(params: Record<string, unknown>): Promise<unknown> {
    const target = params.target as string;
    if (!target) {
      return { error: "Missing 'target' parameter (6-digit temp number or friend ID)" };
    }

    // Check friend count limit
    if (this.store.getFriendCount() >= this.config.maxFriends) {
      return { error: "Friend limit reached (" + this.config.maxFriends + ")" };
    }

    // If target is already a friend ID (not 6 digits), skip resolution
    if (/^\d{6}$/.test(target)) {
      // Resolve temp number
      this.logger.info("[FriendTool] Resolving temp number: " + target);
      const resolved = await this.serverClient.resolveTempNumber(target);

      if (!resolved) {
        return { error: "Could not resolve temp number: " + target };
      }

      // Initiate handshake
      this.logger.info("[FriendTool] Initiating handshake with " + resolved.nodeId);
      const session = await this.handshakeManager.initiate(target);

      if (!session) {
        return { error: "Handshake failed with " + resolved.nodeId };
      }

      // Add friend
      const friendId = resolved.nodeId;
      const publicKey = Buffer.from(resolved.publicKey, "base64");
      this.store.addFriend({
        id: friendId,
        publicKey: new Uint8Array(publicKey),
        publicKeyFingerprint: getPublicKeyFingerprint(new Uint8Array(publicKey)),
        addedAt: new Date(),
        lastMessageAt: new Date(),
        sessionKey: session.sessionKey,
      });

      return {
        success: true,
        friendId,
        fingerprint: getPublicKeyFingerprint(new Uint8Array(publicKey)),
      };
    } else {
      // Direct friend ID addition (e.g., from a pending request)
      return { error: "Direct friend ID addition not supported — use temp number" };
    }
  }

  /**
   * List friends with their fingerprints.
   */
  private handleList(params: Record<string, unknown>): unknown {
    const limit = (params.limit as number) || 50;

    const friends = Array.from(this.store.friends.values())
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(0, limit)
      .map((f) => ({
        id: f.id,
        fingerprint: f.publicKeyFingerprint,
        addedAt: f.addedAt.toISOString(),
        lastMessageAt: f.lastMessageAt.toISOString(),
        hasSession: !!this.store.getSession(f.id),
      }));

    return {
      total: this.store.getFriendCount(),
      shown: friends.length,
      friends,
    };
  }

  /**
   * Remove a friend and clean up session.
   */
  private async handleRemove(params: Record<string, unknown>): Promise<unknown> {
    const target = params.target as string;
    if (!target) {
      return { error: "Missing 'target' parameter (friend ID)" };
    }

    const friend = this.store.getFriend(target);
    if (!friend) {
      return { error: "Friend not found: " + target };
    }

    // Remove locally
    this.store.removeFriend(target);

    // Remove on server
    await this.serverClient.removeFriend(target);

    this.logger.info("[FriendTool] Removed friend: " + target);
    return { success: true, removedFriendId: target };
  }

  /**
   * Request a temporary 6-digit number from the server.
   */
  private async handleRequestTempNumber(): Promise<unknown> {
    const tempNumber = await this.serverClient.requestTempNumber();

    if (!tempNumber) {
      return { error: "Failed to request temp number from server" };
    }

    // Store locally with 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    this.store.addTempNumber(tempNumber, expiresAt);

    this.logger.info("[FriendTool] Got temp number: " + tempNumber + " (expires in 10min)");
    return {
      success: true,
      tempNumber,
      expiresAt: expiresAt.toISOString(),
      shareWith: "Give this 6-digit number to the person you want to add as a friend",
    };
  }

  /**
   * Revoke a temporary number.
   */
  private async handleRevokeTempNumber(params: Record<string, unknown>): Promise<unknown> {
    const target = params.target as string;
    if (!target) {
      return { error: "Missing 'target' parameter (temp number to revoke)" };
    }

    const revoked = this.store.revokeTempNumber(target);
    if (!revoked) {
      return { error: "Temp number not found: " + target };
    }

    await this.serverClient.revokeTempNumber(target);

    this.logger.info("[FriendTool] Revoked temp number: " + target);
    return { success: true, revokedNumber: target };
  }
}
