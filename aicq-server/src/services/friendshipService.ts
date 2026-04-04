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
 * Remove a bidirectional friendship between two nodes.
 * Returns true if the friendship existed and was removed.
 */
export function removeFriend(nodeA: string, nodeB: string): boolean {
  const a = store.nodes.get(nodeA);
  const b = store.nodes.get(nodeB);
  if (!a || !b) return false;

  const aHad = a.friends.has(nodeB);
  const bHad = b.friends.has(nodeA);

  a.friends.delete(nodeB);
  a.friendCount = a.friends.size;
  b.friends.delete(nodeA);
  b.friendCount = b.friends.size;

  return aHad || bHad;
}

/**
 * Check if two nodes are friends.
 */
export function areFriends(nodeA: string, nodeB: string): boolean {
  const a = store.nodes.get(nodeA);
  if (!a) return false;
  return a.friends.has(nodeB);
}

// ─── Account-Level Friend Permission Management ──────────────────

/**
 * Get the permissions that accountId has granted to friendId.
 * Returns the permission array or empty array if not friends or no permissions set.
 */
export function getFriendPermissions(accountId: string, friendId: string): FriendPermission[] {
  const account = store.accounts.get(accountId);
  if (!account) return [];
  if (!account.friends.includes(friendId)) return [];
  return account.friendPermissions[friendId] || ['chat']; // default: chat only
}

/**
 * Set the permissions that accountId grants to friendId.
 * Both must be friends. Returns true on success.
 */
export function setFriendPermissions(
  accountId: string,
  friendId: string,
  permissions: FriendPermission[],
): boolean {
  const account = store.accounts.get(accountId);
  if (!account) return false;
  if (!account.friends.includes(friendId)) return false;

  // Always ensure at least 'chat' is present if any permission is granted
  if (permissions.length > 0 && !permissions.includes('chat')) {
    permissions = ['chat', ...permissions];
  }

  if (permissions.length === 0) {
    // Remove all permissions (effectively blocks the friend)
    delete account.friendPermissions[friendId];
  } else {
    account.friendPermissions[friendId] = permissions;
  }

  store.accounts.set(accountId, account);
  return true;
}

/**
 * Check if accountId has granted a specific permission to friendId.
 */
export function hasFriendPermission(
  accountId: string,
  friendId: string,
  permission: FriendPermission,
): boolean {
  const perms = getFriendPermissions(accountId, friendId);
  return perms.includes(permission);
}

/**
 * Initialize default permissions when a new friendship is established.
 * By default, only 'chat' is granted.
 */
export function initDefaultPermissions(accountId: string, friendId: string): void {
  const account = store.accounts.get(accountId);
  if (!account) return;
  // Only set if not already set
  if (!account.friendPermissions[friendId]) {
    account.friendPermissions[friendId] = ['chat'];
    store.accounts.set(accountId, account);
  }
}
