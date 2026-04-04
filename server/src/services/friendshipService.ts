import { store } from '../db/memoryStore';
import { config } from '../config';
import type { FriendPermission } from '../models/types';

/**
 * Get the list of friend IDs for a node.
 */
export function getFriends(nodeId: string): string[] {
  const node = store.nodes.get(nodeId);
  if (!node) return [];
  return Array.from(node.friends);
}

/**
 * Get the friend count for a node.
 */
export function getFriendCount(nodeId: string): number {
  const node = store.nodes.get(nodeId);
  if (!node) return 0;
  return node.friends.size;
}

/**
 * Add a bidirectional friendship between two nodes.
 * Returns true if successful, false if either node has reached the friend limit
 * or the friendship already exists.
 */
export function addFriend(nodeA: string, nodeB: string): boolean {
  if (nodeA === nodeB) return false;

  const a = store.nodes.get(nodeA);
  const b = store.nodes.get(nodeB);
  if (!a || !b) return false;

  if (a.friends.size >= config.maxFriends) return false;
  if (b.friends.size >= config.maxFriends) return false;

  if (a.friends.has(nodeB) && b.friends.has(nodeA)) return false;

  a.friends.add(nodeB);
  a.friendCount = a.friends.size;
  b.friends.add(nodeA);
  b.friendCount = b.friends.size;

  return true;
}

/**
 * Clean up permissions for a removed friendship.
 * Removes permission entries from both sides (nodeA's grants to nodeB and vice versa).
 */
function cleanupPermissions(nodeA: string, nodeB: string): void {
  store.nodePermissions.get(nodeA)?.delete(nodeB);
  store.nodePermissions.get(nodeB)?.delete(nodeA);
}

/**
 * Remove a bidirectional friendship between two nodes.
 * Also cleans up any associated permissions.
 * Returns true if the friendship existed and was removed.
 */
export function removeFriend(nodeA: string, nodeB: string): boolean {
  const a = store.nodes.get(nodeA);
  const b = store.nodes.get(nodeB);
  if (!a || !b) return false;

  const aHad = a.friends.has(nodeB);
  const bHad = b.friends.has(nodeA);

  if (!aHad && !bHad) return false;

  a.friends.delete(nodeB);
  a.friendCount = a.friends.size;
  b.friends.delete(nodeA);
  b.friendCount = b.friends.size;

  // Clean up permissions for both sides
  cleanupPermissions(nodeA, nodeB);

  return true;
}

/**
 * Check if two nodes are friends.
 */
export function areFriends(nodeA: string, nodeB: string): boolean {
  const a = store.nodes.get(nodeA);
  if (!a) return false;
  return a.friends.has(nodeB);
}

// ─── Node-Level Friend Permission Management ──────────────────

/**
 * Get the permissions that nodeId has granted to friendId.
 * Uses areFriends() to validate the friendship at the Node layer.
 * Returns the permission array or empty array if not friends or no permissions set.
 */
export function getFriendPermissions(nodeId: string, friendId: string): FriendPermission[] {
  if (!areFriends(nodeId, friendId)) {
    return [];
  }
  const perms = store.nodePermissions.get(nodeId)?.get(friendId);
  return perms || ['chat']; // default: chat only
}

/**
 * Set the permissions that nodeId grants to friendId.
 * Uses areFriends() to validate the friendship at the Node layer.
 * Both must be friends. Returns true on success.
 */
export function setFriendPermissions(
  nodeId: string,
  friendId: string,
  permissions: FriendPermission[],
): boolean {
  if (!areFriends(nodeId, friendId)) return false;

  // Always ensure at least 'chat' is present if any permission is granted
  if (permissions.length > 0 && !permissions.includes('chat')) {
    permissions = ['chat', ...permissions];
  }

  let friendPerms = store.nodePermissions.get(nodeId);
  if (!friendPerms) {
    friendPerms = new Map();
    store.nodePermissions.set(nodeId, friendPerms);
  }

  if (permissions.length === 0) {
    // Remove all permissions (effectively blocks the friend)
    friendPerms.delete(friendId);
  } else {
    friendPerms.set(friendId, permissions);
  }

  return true;
}

/**
 * Check if nodeId has granted a specific permission to friendId.
 */
export function hasFriendPermission(
  nodeId: string,
  friendId: string,
  permission: FriendPermission,
): boolean {
  const perms = getFriendPermissions(nodeId, friendId);
  return perms.includes(permission);
}

/**
 * Initialize default permissions when a new friendship is established.
 * By default, only 'chat' is granted.
 */
export function initDefaultPermissions(nodeId: string, friendId: string): void {
  // Only set if not already set
  const existing = store.nodePermissions.get(nodeId)?.get(friendId);
  if (!existing) {
    let friendPerms = store.nodePermissions.get(nodeId);
    if (!friendPerms) {
      friendPerms = new Map();
      store.nodePermissions.set(nodeId, friendPerms);
    }
    friendPerms.set(friendId, ['chat']);
  }
}
