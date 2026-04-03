import { store } from '../db/memoryStore';
import { config } from '../config';

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
