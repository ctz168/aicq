import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import {
  registerOnlineNode,
  unregisterOnlineNode,
  getNodeIdBySocket,
  relaySignal,
  isOnline,
  getSignalingChannel,
} from '../services/p2pDiscoveryService';
import * as groupService from '../services/groupService';
import { store } from '../db/memoryStore';

/** Interface for parsed WebSocket messages */
interface WsMessage {
  type: string;
  [key: string]: any;
}

/**
 * Set up the WebSocket handler on the given WebSocketServer.
 */
export function setupWebSocketHandler(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let nodeId: string | null = null;

    ws.on('message', (rawData: WebSocket.Data) => {
      try {
        const message: WsMessage = JSON.parse(rawData.toString());
        handleMessage(ws, message, (assignedNodeId) => {
          nodeId = assignedNodeId;
        });
      } catch (err) {
        // Ignore malformed messages
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      if (nodeId) {
        unregisterOnlineNode(nodeId);
        broadcastOnlineStatus(nodeId, false);
      }
    });

    ws.on('error', () => {
      if (nodeId) {
        unregisterOnlineNode(nodeId);
      }
    });
  });
}

/**
 * Handle an individual WebSocket message.
 */
function handleMessage(
  ws: WebSocket,
  message: WsMessage,
  setNodeId: (id: string) => void,
): void {
  switch (message.type) {
    case 'online': {
      // Node announces it's online
      const id: string = message.nodeId;
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing nodeId' }));
        return;
      }

      // Ensure the node is registered
      if (!store.nodes.has(id)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Node not registered' }));
        return;
      }

      registerOnlineNode(id, ws);
      setNodeId(id);

      ws.send(JSON.stringify({ type: 'online_ack', nodeId: id }));
      broadcastOnlineStatus(id, true);
      break;
    }

    case 'offline': {
      // Node announces it's going offline
      const id: string | null = getNodeIdBySocket(ws);
      if (id) {
        unregisterOnlineNode(id);
        broadcastOnlineStatus(id, false);
      }
      break;
    }

    case 'signal': {
      // WebRTC signaling relay (ICE candidates, SDP offer/answer)
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const toId: string = message.to;
      const signalData: any = message.data;

      if (!toId || !signalData) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing to or data fields' }));
        return;
      }

      // Verify the sender and receiver are friends, in handshake, or in the same group
      const senderNode = store.nodes.get(id);
      const isFriendOrHandshake =
        senderNode?.friends.has(toId) ||
        Array.from(store.handshakeSessions.values()).some(
          (s) =>
            (s.requesterId === id && s.targetNodeId === toId) ||
            (s.requesterId === toId && s.targetNodeId === id),
        );

      // 检查是否在同一个群组中
      let inSameGroup = false;
      for (const group of store.groups.values()) {
        if (group.members.has(id) && group.members.has(toId)) {
          inSameGroup = true;
          break;
        }
      }

      if (!isFriendOrHandshake && !inSameGroup) {
        ws.send(
          JSON.stringify({ type: 'error', error: 'Cannot signal non-friend/non-group node' }),
        );
        return;
      }

      const relayed = relaySignal(id, toId, signalData);
      if (!relayed) {
        ws.send(JSON.stringify({ type: 'error', error: 'Target node is offline' }));
      }
      break;
    }

    case 'message': {
      // DEPRECATED: messages should go P2P. Kept as fallback.
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const toId: string = message.to;
      const content: any = message.data;

      if (!toId || !content) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing to or data fields' }));
        return;
      }

      const senderNode = store.nodes.get(id);
      if (!senderNode?.friends.has(toId)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Can only message friends' }));
        return;
      }

      if (!isOnline(toId)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Target is offline' }));
        return;
      }

      relaySignal(id, toId, { type: 'message', data: content });
      break;
    }

    case 'file_chunk': {
      // File chunk relay for nodes that can't do P2P file transfer
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const toId: string = message.to;
      const chunkData: any = message.data;

      if (!toId || !chunkData) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing to or data fields' }));
        return;
      }

      const senderNode = store.nodes.get(id);
      if (!senderNode?.friends.has(toId)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Can only send files to friends' }));
        return;
      }

      relaySignal(id, toId, { type: 'file_chunk', data: chunkData });
      break;
    }

    case 'group_message': {
      // 群组消息：广播给所有在线群成员
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const groupId: string = message.groupId;
      const msgType: string = message.msgType || 'text';
      const content: string = message.content;

      if (!groupId || !content) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing groupId or content' }));
        return;
      }

      try {
        const delivered = groupService.sendMessage(groupId, id, {
          type: msgType as any,
          content,
          media: message.media,
          fileInfo: message.fileInfo,
        });
        ws.send(JSON.stringify({ type: 'group_message_ack', groupId, delivered }));
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'error', error: err.message }));
      }
      break;
    }

    case 'group_typing': {
      // 群组输入指示器
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const groupId: string = message.groupId;
      if (!groupId) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing groupId' }));
        return;
      }

      try {
        groupService.broadcastTyping(groupId, id);
      } catch (err: any) {
        // 输入指示器失败不返回错误
      }
      break;
    }

    default: {
      ws.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${message.type}` }));
    }
  }
}

/**
 * Broadcast online/offline status to all of a node's friends.
 */
function broadcastOnlineStatus(nodeId: string, online: boolean): void {
  const node = store.nodes.get(nodeId);
  if (!node) return;

  const statusMessage = JSON.stringify({
    type: 'presence',
    nodeId,
    online,
    timestamp: Date.now(),
  });

  for (const friendId of node.friends) {
    const friendSocket = getSignalingChannel(friendId);
    if (friendSocket && friendSocket.readyState === 1) {
      try {
        friendSocket.send(statusMessage);
      } catch {
        // Ignore send errors
      }
    }
  }
}
