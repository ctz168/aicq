import WebSocket from 'ws';
import { store } from '../db/memoryStore';
import { config } from '../config';

/** Map of nodeId -> WebSocket for online node tracking */
const onlineSockets = new Map<string, WebSocket>();

/** Reverse map: WebSocket -> nodeId for O(1) lookup */
const socketToNodeMap = new WeakMap<WebSocket, string>();

/**
 * Get the WebSocket connection for an online node.
 * Returns null if the node is offline.
 */
export function getSignalingChannel(nodeId: string): WebSocket | null {
  return onlineSockets.get(nodeId) || null;
}

/**
 * Check if the server can accept more WebSocket connections.
 */
export function canAcceptConnection(): boolean {
  return onlineSockets.size < config.maxWsConnections;
}

/**
 * Register a node as online with its WebSocket connection.
 */
export function registerOnlineNode(nodeId: string, ws: WebSocket): void {
  onlineSockets.set(nodeId, ws);
  socketToNodeMap.set(ws, nodeId); // Add reverse map

  // Also update the node record
  const node = store.nodes.get(nodeId);
  if (node) {
    node.lastSeen = Date.now();
    node.socketId = (ws as any).id || null;
  }
}

/**
 * Unregister a node (went offline).
 */
export function unregisterOnlineNode(nodeId: string): void {
  const ws = onlineSockets.get(nodeId);
  if (ws) {
    socketToNodeMap.delete(ws); // Clean reverse map
  }
  onlineSockets.delete(nodeId);

  const node = store.nodes.get(nodeId);
  if (node) {
    node.lastSeen = Date.now();
    node.socketId = null;
  }
}

/**
 * Get the node ID associated with a WebSocket, if any. O(1) lookup.
 */
export function getNodeIdBySocket(ws: WebSocket): string | null {
  return socketToNodeMap.get(ws) || null;
}

/**
 * Check if a node is currently online.
 */
export function isOnline(nodeId: string): boolean {
  return onlineSockets.has(nodeId);
}

/**
 * Relay a WebRTC signaling message from one node to another.
 * Supports ICE candidate exchange and SDP offer/answer relay.
 * Returns true if the message was successfully relayed.
 */
export function relaySignal(
  fromId: string,
  toId: string,
  signalData: any,
): boolean {
  const targetSocket = onlineSockets.get(toId);
  if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    targetSocket.send(
      JSON.stringify({
        type: 'signal',
        from: fromId,
        to: toId,
        data: signalData,
        timestamp: Date.now(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the count of currently online nodes.
 */
export function getOnlineCount(): number {
  return onlineSockets.size;
}

/**
 * Send a message directly to an online node (not wrapped in signal envelope).
 * The message is sent as-is with JSON.stringify.
 * Returns true if the message was successfully sent.
 */
export function sendDirectMessage(toId: string, message: any): boolean {
  const targetSocket = onlineSockets.get(toId);
  if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    targetSocket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the IDs of all currently online nodes.
 */
export function getOnlineNodeIds(): string[] {
  return Array.from(onlineSockets.keys());
}
