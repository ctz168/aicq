import { v4 as uuidv4 } from 'uuid';
import { store, getOrCreateNode } from '../db/memoryStore';
import {
  HandshakeSession,
  HandshakeStatus,
} from '../models/types';
import { config } from '../config';

const HANDSHAKE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Initiate a handshake by targeting a temp number.
 * Creates a handshake session and returns the session ID along with
 * the target node's info so the requester can start the crypto exchange.
 */
export function initiateHandshake(
  requesterId: string,
  targetTempNumber: string,
): HandshakeSession {
  // Ensure requester is registered
  const requesterNode = store.nodes.get(requesterId);
  if (!requesterNode) {
    throw new Error('Requester node not registered');
  }

  // Resolve temp number
  const tempRecord = store.tempNumbers.get(targetTempNumber);
  if (!tempRecord) {
    throw new Error('Temp number not found or expired');
  }
  if (tempRecord.nodeId === requesterId) {
    throw new Error('Cannot handshake with yourself');
  }

  const targetNode = store.nodes.get(tempRecord.nodeId);
  if (!targetNode) {
    throw new Error('Target node not registered');
  }

  // Check friend limits
  if (requesterNode.friends.size >= config.maxFriends) {
    throw new Error('Requester has reached maximum friend limit');
  }
  if (targetNode.friends.size >= config.maxFriends) {
    throw new Error('Target has reached maximum friend limit');
  }

  const now = Date.now();
  const session: HandshakeSession = {
    id: uuidv4(),
    requesterId,
    targetNodeId: tempRecord.nodeId,
    status: HandshakeStatus.Initiated,
    responseData: null,
    confirmData: null,
    createdAt: now,
    expiresAt: now + HANDSHAKE_TTL_MS,
  };

  store.handshakeSessions.set(session.id, session);
  store.persistHandshakeSession(session);

  // Add pending request for target node
  const pending = store.pendingRequests.get(tempRecord.nodeId) || [];
  pending.push({
    fromNodeId: requesterId,
    tempNumber: targetTempNumber,
    sessionId: session.id,
    createdAt: now,
  });
  store.pendingRequests.set(tempRecord.nodeId, pending);
  store.persistPendingRequests(tempRecord.nodeId, pending);

  return session;
}

/**
 * Submit an encrypted response from the target node.
 * The server passes raw bytes only and never interprets crypto content.
 */
export function submitResponse(
  sessionId: string,
  responseData: Buffer,
): HandshakeSession {
  const session = store.handshakeSessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  if (session.status !== HandshakeStatus.Initiated) {
    throw new Error('Session is not in initiated state');
  }
  if (session.expiresAt <= Date.now()) {
    session.status = HandshakeStatus.Failed;
    throw new Error('Session has expired');
  }

  session.responseData = responseData;
  session.status = HandshakeStatus.Responded;

  return session;
}

/**
 * Submit confirmation from the requester.
 * Marks the handshake as complete and adds both nodes to each other's friend lists.
 */
export function submitConfirm(
  sessionId: string,
  confirmData: Buffer,
): HandshakeSession {
  const session = store.handshakeSessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  if (session.status !== HandshakeStatus.Responded) {
    throw new Error('Session is not in responded state');
  }
  if (session.expiresAt <= Date.now()) {
    session.status = HandshakeStatus.Failed;
    throw new Error('Session has expired');
  }

  session.confirmData = confirmData;
  session.status = HandshakeStatus.Confirmed;

  // Add bidirectional friendship
  const nodeA = store.nodes.get(session.requesterId);
  const nodeB = store.nodes.get(session.targetNodeId);

  if (nodeA && nodeB) {
    if (!nodeA.friends.has(session.targetNodeId)) {
      nodeA.friends.add(session.targetNodeId);
      nodeA.friendCount = nodeA.friends.size;
      store.persistNode(nodeA);
    }
    if (!nodeB.friends.has(session.requesterId)) {
      nodeB.friends.add(session.requesterId);
      nodeB.friendCount = nodeB.friends.size;
      store.persistNode(nodeB);
    }
  }

  // Clean up pending request
  const pending = store.pendingRequests.get(session.targetNodeId) || [];
  const filtered = pending.filter((p) => p.sessionId !== sessionId);
  store.pendingRequests.set(session.targetNodeId, filtered);
  store.persistPendingRequests(session.targetNodeId, filtered);

  return session;
}
