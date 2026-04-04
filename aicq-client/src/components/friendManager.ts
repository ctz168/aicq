/**
 * Friend management — add, remove, search, and query friend list.
 *
 * Orchestrates temp number resolution and handshake to complete
 * the full friend-adding flow.
 */


import { APIClient } from '../services/apiClient.js';
import { WSClient } from '../services/wsClient.js';
import { HandshakeHandler } from '../handshake/handshakeHandler.js';
import { ClientStore } from '../store.js';
import { P2PClient } from '../p2p/p2pClient.js';
import type { FriendInfo } from '../types.js';

export class FriendManager {
  private api: APIClient;
  private ws: WSClient;
  private handshake: HandshakeHandler;
  private store: ClientStore;
  private p2p: P2PClient;

  constructor(
    api: APIClient,
    ws: WSClient,
    handshake: HandshakeHandler,
    store: ClientStore,
    p2p: P2PClient,
  ) {
    this.api = api;
    this.ws = ws;
    this.handshake = handshake;
    this.store = store;
    this.p2p = p2p;

    this._setupListeners();
  }

  /* ──────────────── Presence listeners ──────────────── */

  private _setupListeners(): void {
    this.ws.on('presence', (event: any) => {
      const { nodeId, online } = event;
      const friends = this.store.friends;
      const friend = friends.get(nodeId);
      if (friend) {
        friend.isOnline = online;
        friend.lastSeen = new Date().toISOString();
        this.store.addFriend(friend);
        this.store.save();
      }
    });
  }

  /* ──────────────── Add friend ──────────────── */

  /**
   * Add a friend by their temporary number.
   *
   * Flow:
   *  1. Resolve temp number → get target node info
   *  2. Initiate authenticated handshake
   *  3. Complete handshake (session key derived)
   *  4. Friend is added to store by HandshakeHandler
   */
  async addFriend(tempNumber: string): Promise<FriendInfo> {
    // Step 1: Resolve temp number
    let targetNodeId: string;
    try {
      const resolved = await this.api.resolveTempNumber(tempNumber);
      targetNodeId = resolved.nodeId;
    } catch (err) {
      throw new Error(`Failed to resolve temp number: ${err}`);
    }

    // Check if already friends
    if (this.store.friends.get(targetNodeId)) {
      throw new Error('Already friends with this user');
    }

    // Step 2 & 3: Handshake (adds friend to store on completion)
    await this.handshake.initiateHandshake(tempNumber);

    // Step 4: Retrieve the added friend
    const friend = this.store.friends.get(targetNodeId);
    if (!friend) {
      throw new Error('Handshake completed but friend was not added to store');
    }

    // Attempt P2P connection
    this.p2p.connect(targetNodeId);

    return friend;
  }

  /* ──────────────── Remove friend ──────────────── */

  /**
   * Remove a friend and clean up all associated state.
   */
  async removeFriend(friendId: string): Promise<void> {
    // Close P2P connection
    this.p2p.disconnect(friendId);

    // Remove session key
    this.store.removeSession(friendId);

    // Remove from server
    try {
      await this.api.removeFriend(friendId);
    } catch {
      // Non-fatal: local removal still proceeds
    }

    // Remove from store
    this.store.removeFriend(friendId);
    this.store.save();
  }

  /* ──────────────── Query ──────────────── */

  /** Get all friends from local store. */
  getFriends(): FriendInfo[] {
    return Array.from(this.store.friends.values());
  }

  /** Get total friend count. */
  getFriendCount(): number {
    return this.store.getFriendCount();
  }

  /**
   * Search friends by query string.
   * Matches against ID prefix and fingerprint.
   */
  searchFriends(query: string): FriendInfo[] {
    const lower = query.toLowerCase();
    return this.getFriends().filter(
      (f) =>
        f.id.toLowerCase().includes(lower) ||
        f.fingerprint.toLowerCase().includes(lower),
    );
  }

  /** Check if a given ID is in the friend list. */
  isFriend(id: string): boolean {
    return this.store.friends.has(id);
  }

  /** Get all friends currently marked as online. */
  getOnlineFriends(): FriendInfo[] {
    return this.getFriends().filter((f) => f.isOnline);
  }

  /* ──────────────── Cleanup ──────────────── */

  destroy(): void {
    // Nothing specific to clean up
  }
}
