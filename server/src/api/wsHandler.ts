import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import {
  registerOnlineNode,
  unregisterOnlineNode,
  getNodeIdBySocket,
  relaySignal,
  isOnline,
  getSignalingChannel,
  canAcceptConnection,
} from '../services/p2pDiscoveryService';
import { verifyJWT } from '../services/accountService';
import { isWsRateLimited, isWsMessageTooLarge, cleanupWsRateLimit } from '../middleware/wsRateLimit';
import { config } from '../config';
import * as groupService from '../services/groupService';
import * as friendshipService from '../services/friendshipService';
import { store } from '../db/memoryStore';
import { v4 as uuidv4 } from 'uuid';

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
    // Check max connections
    if (!canAcceptConnection()) {
      ws.close(1013, 'Server full');
      return;
    }

    let nodeId: string | null = null;

    ws.on('message', (rawData: WebSocket.Data) => {
      // Check message size
      let rawSize = 0;
      if (Buffer.isBuffer(rawData)) {
        rawSize = rawData.length;
      } else if (typeof rawData === 'string') {
        rawSize = Buffer.byteLength(rawData, 'utf8');
      } else if (rawData instanceof ArrayBuffer) {
        rawSize = rawData.byteLength;
      } else if (Array.isArray(rawData)) {
        rawSize = rawData.reduce((sum, buf) => sum + (buf.length || 0), 0);
      }
      if (isWsMessageTooLarge(rawSize)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Message too large' }));
        return;
      }

      try {
        const message: WsMessage = JSON.parse(rawData.toString());

        // Skip rate limiting for online (it's the auth step)
        if (message.type !== 'online' && isWsRateLimited(ws)) {
          return;
        }

        handleMessage(ws, message, (assignedNodeId) => {
          nodeId = assignedNodeId;
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      if (nodeId) {
        unregisterOnlineNode(nodeId);
        broadcastOnlineStatus(nodeId, false);
      }
      cleanupWsRateLimit(ws);
    });

    ws.on('error', () => {
      if (nodeId) {
        unregisterOnlineNode(nodeId);
      }
      cleanupWsRateLimit(ws);
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
      const token: string = message.token;
      if (!id && !token) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication failed: missing both "nodeId" and "token". Send { type: "online", nodeId: "<your-id>", token: "<JWT token>" } to authenticate.', code: 'AUTH_MISSING_FIELDS' }));
        ws.close(1008, 'Authentication failed');
        return;
      }
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication failed: missing "nodeId" field. Provide the node ID that matches the JWT subject (sub).', code: 'AUTH_MISSING_NODE_ID' }));
        ws.close(1008, 'Authentication failed');
        return;
      }
      if (!token) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication failed: missing "token" field. Provide a valid JWT token obtained from the /api/v1/auth/login endpoint.', code: 'AUTH_MISSING_TOKEN' }));
        ws.close(1008, 'Authentication failed');
        return;
      }

      // Verify JWT token for WebSocket authentication
      const jwtSecret = config.jwtSecret;
      const payload = verifyJWT(token, jwtSecret);
      if (!payload) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication failed: JWT token is invalid or expired. Obtain a new token from /api/v1/auth/login.', code: 'AUTH_INVALID_TOKEN' }));
        ws.close(1008, 'Authentication failed');
        return;
      }
      if (payload.sub !== id) {
        ws.send(JSON.stringify({ type: 'error', error: `Authentication failed: nodeId "${id}" does not match JWT subject "${payload.sub}". The nodeId must match the account ID used to obtain the token.`, code: 'AUTH_NODE_ID_MISMATCH' }));
        ws.close(1008, 'Authentication failed');
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

    case 'ping': {
      // Heartbeat ping — respond with pong
      const id: string | null = getNodeIdBySocket(ws);
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now(),
        ...(id ? { nodeId: id } : {}),
      }));
      break;
    }

    case 'relay': {
      // Encrypted message relay (used by aicq-chat plugin for E2E encrypted messages)
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const toId: string = message.targetId;
      const payload: unknown = message.payload;

      if (!toId || !payload) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing targetId or payload' }));
        return;
      }

      // Verify sender and receiver are friends
      const senderNode = store.nodes.get(id);
      if (!senderNode?.friends.has(toId)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Can only relay to friends' }));
        return;
      }

      // Forward the relay message to the target
      const relayed = relaySignal(id, toId, {
        type: 'relay',
        fromId: id,
        payload,
        timestamp: Date.now(),
      });

      if (!relayed) {
        ws.send(JSON.stringify({ type: 'error', error: 'Target node is offline' }));
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

      // ─── 权限检查：chat 权限 ───
      if (!friendshipService.hasFriendPermission(toId, id, 'chat')) {
        ws.send(JSON.stringify({ type: 'error', error: '对方未授予你聊天权限' }));
        return;
      }

      if (!isOnline(toId)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Target is offline' }));
        return;
      }

      relaySignal(id, toId, { type: 'message', data: content });

      // 发送推送通知
      sendPushNotification(toId, {
        chatId: id,
        senderId: id,
        senderName: getSenderName(id),
        messagePreview: typeof content === 'string' ? content : JSON.stringify(content),
        isGroup: false,
      });
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

      // ─── 权限检查：发送文件需要 chat 权限 ───
      if (!friendshipService.hasFriendPermission(toId, id, 'chat')) {
        ws.send(JSON.stringify({ type: 'error', error: '对方未授予你聊天权限' }));
        return;
      }

      relaySignal(id, toId, { type: 'file_chunk', data: chunkData });
      break;
    }

    // ─── Exec 权限校验的 tool 执行消息 ──────────────────────────

    case 'exec_request': {
      // AI agent 请求执行操作（需要 exec 权限）
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const toId: string = message.to;
      if (!toId) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing to field' }));
        return;
      }

      // 检查是否好友
      const senderNode = store.nodes.get(id);
      if (!senderNode?.friends.has(toId)) {
        ws.send(JSON.stringify({ type: 'error', error: '只能向好友发送执行请求' }));
        return;
      }

      // ─── 权限检查：exec 权限 ───
      if (!friendshipService.hasFriendPermission(toId, id, 'exec')) {
        ws.send(JSON.stringify({ type: 'error', error: '对方未授予你执行权限（exec）' }));
        return;
      }

      // 转发执行请求
      if (isOnline(toId)) {
        relaySignal(id, toId, { type: 'exec_request', data: message.data, fromId: id });
        ws.send(JSON.stringify({ type: 'exec_request_ack', toId, status: 'forwarded' }));
      } else {
        ws.send(JSON.stringify({ type: 'error', error: 'Target is offline' }));
      }
      break;
    }

    // ─── 权限变更通知 ──────────────────────────────────────────

    case 'permission_changed': {
      // 当一方修改了好友权限，通知对方
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const targetId: string = message.friendId;
      const newPermissions: string[] = message.permissions || [];

      if (!targetId || !Array.isArray(newPermissions)) {
        ws.send(JSON.stringify({ type: 'error', error: '缺少 friendId 或 permissions' }));
        return;
      }

      // 验证确实是好友关系
      const node = store.nodes.get(id);
      if (!node?.friends.has(targetId)) {
        ws.send(JSON.stringify({ type: 'error', error: '只能修改好友的权限' }));
        return;
      }

      // 更新权限
      const validPerms = newPermissions.filter((p) => ['chat', 'exec'].includes(p));
      const success = friendshipService.setFriendPermissions(id, targetId, validPerms as import('../models/types').FriendPermission[]);

      if (!success) {
        ws.send(JSON.stringify({ type: 'error', error: '更新权限失败' }));
        return;
      }

      // 通知被修改权限的好友
      if (isOnline(targetId)) {
        relaySignal(id, targetId, {
          type: 'permission_update',
          fromId: id,
          permissions: validPerms,
          timestamp: Date.now(),
        });
      }

      ws.send(JSON.stringify({
        type: 'permission_changed_ack',
        friendId: targetId,
        permissions: validPerms,
      }));
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

        // 存储群消息到历史记录
        const group = store.groups.get(groupId);
        const senderMember = group?.members.get(id);
        const msgRecord = {
          id: uuidv4(),
          groupId,
          fromId: id,
          senderName: senderMember?.displayName || id.slice(0, 8),
          type: msgType,
          content,
          media: message.media,
          fileInfo: message.fileInfo,
          timestamp: Date.now(),
        };

        if (!store.groupMessages.has(groupId)) {
          store.groupMessages.set(groupId, []);
        }
        store.groupMessages.get(groupId)!.push(msgRecord);
        store.persistGroupMessage(msgRecord);

        // 发送推送通知给每个在线的群成员
        if (group) {
          for (const [memberId] of group.members) {
            if (memberId === id) continue;
            sendPushNotification(memberId, {
              chatId: groupId,
              senderId: id,
              senderName: senderMember?.displayName || id.slice(0, 8),
              messagePreview: content,
              isGroup: true,
            });
          }
        }

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

    // ─── 推送通知相关 ─────────────────────────────────────────

    case 'get_notifications': {
      // 获取用户的通知列表
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const limit = message.limit || 50;
      const userNotifications: any[] = [];
      for (const notification of store.notifications.values()) {
        if (notification.accountId === id) {
          userNotifications.push(notification);
        }
      }
      // 按时间倒序排列
      userNotifications.sort((a, b) => b.createdAt - a.createdAt);
      ws.send(JSON.stringify({
        type: 'notifications',
        data: userNotifications.slice(0, limit),
        count: userNotifications.length,
      }));
      break;
    }

    case 'mark_notification_read': {
      // 标记通知为已读
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const notificationId: string = message.notificationId;
      if (!notificationId) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing notificationId' }));
        return;
      }

      const notification = store.notifications.get(notificationId);
      if (notification && notification.accountId === id) {
        notification.read = true;
        store.notifications.set(notificationId, notification);
        ws.send(JSON.stringify({ type: 'mark_notification_read_ack', notificationId, read: true }));
      } else {
        ws.send(JSON.stringify({ type: 'error', error: '通知不存在' }));
      }
      break;
    }

    // ─── 群消息历史 ─────────────────────────────────────────────

    case 'get_group_messages': {
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

      const group = store.groups.get(groupId);
      if (!group || !group.members.has(id)) {
        ws.send(JSON.stringify({ type: 'error', error: '你不是群成员' }));
        return;
      }

      const limit = Math.min(message.limit || 50, 200);
      const before = message.before || Date.now();
      const messages = store.groupMessages.get(groupId) || [];

      // 过滤：获取 before 之前的消息，倒序排列
      const filtered = messages
        .filter((m) => m.timestamp < before)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      ws.send(JSON.stringify({
        type: 'group_messages',
        groupId,
        messages: filtered,
        count: filtered.length,
      }));
      break;
    }

    // ─── Sub-Agent 相关 ────────────────────────────────────────

    case 'subagent_start': {
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const { parentMessageId, task, context } = message;
      if (!parentMessageId || !task) {
        ws.send(JSON.stringify({ type: 'error', error: '缺少必填字段: parentMessageId, task' }));
        return;
      }

      // 动态导入 subAgentService 避免循环依赖
      import('../services/subAgentService').then((svc) => {
        try {
          const session = svc.startSubAgent(parentMessageId, task, context, id);
          ws.send(JSON.stringify({
            type: 'subagent_start_ack',
            data: { id: session.id, status: session.status },
          }));

          // 模拟流式输出
          simulateStreaming(ws, session.id, task, id);
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'error', error: err.message }));
        }
      }).catch(() => {
        ws.send(JSON.stringify({ type: 'error', error: '内部错误' }));
      });
      break;
    }

    case 'subagent_input': {
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const subAgentId: string = message.subAgentId;
      const input: string = message.input;
      if (!subAgentId || !input) {
        ws.send(JSON.stringify({ type: 'error', error: '缺少必填字段: subAgentId, input' }));
        return;
      }

      import('../services/subAgentService').then((svc) => {
        try {
          const session = svc.sendInput(subAgentId, input, id);
          ws.send(JSON.stringify({
            type: 'subagent_input_ack',
            data: { id: session.id, status: session.status, output: session.output },
          }));

          // 如果恢复运行，继续流式输出
          if (session.status === 'running') {
            simulateStreaming(ws, session.id, session.task, id);
          }
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'error', error: err.message }));
        }
      }).catch(() => {
        ws.send(JSON.stringify({ type: 'error', error: '内部错误' }));
      });
      break;
    }

    case 'subagent_abort': {
      const id: string | null = getNodeIdBySocket(ws);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const subAgentId: string = message.subAgentId;
      if (!subAgentId) {
        ws.send(JSON.stringify({ type: 'error', error: '缺少必填字段: subAgentId' }));
        return;
      }

      import('../services/subAgentService').then((svc) => {
        try {
          const session = svc.abortSubAgent(subAgentId, id);
          ws.send(JSON.stringify({
            type: 'subagent_abort_ack',
            data: { id: session.id, status: session.status },
          }));
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'error', error: err.message }));
        }
      }).catch(() => {
        ws.send(JSON.stringify({ type: 'error', error: '内部错误' }));
      });
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

/**
 * 获取发送者的显示名称
 */
function getSenderName(accountId: string): string {
  const account = store.accounts.get(accountId);
  if (account?.displayName) return account.displayName;
  if (account?.agentName) return account.agentName;
  const node = store.nodes.get(accountId);
  if (node) return accountId.slice(0, 8);
  return accountId.slice(0, 8);
}

/**
 * 发送推送通知给指定用户
 */
function sendPushNotification(
  accountId: string,
  data: {
    chatId: string;
    senderId: string;
    senderName: string;
    messagePreview: string;
    isGroup: boolean;
  },
): void {
  const notificationId = uuidv4();
  const notification = {
    id: notificationId,
    accountId,
    chatId: data.chatId,
    senderId: data.senderId,
    senderName: data.senderName,
    messagePreview: data.messagePreview.slice(0, 200),
    isGroup: data.isGroup,
    read: false,
    createdAt: Date.now(),
  };

  store.notifications.set(notificationId, notification);
  store.persistNotification(notification);

  // 通过 WebSocket 发送推送
  if (isOnline(accountId)) {
    relaySignal('system', accountId, {
      type: 'push_message',
      data: {
        notificationId,
        chatId: data.chatId,
        senderName: data.senderName,
        messagePreview: data.messagePreview.slice(0, 200),
        timestamp: Date.now(),
        isGroup: data.isGroup,
      },
    });
  }
}

/**
 * STUB: Development-mode simulation for Sub-Agent streaming output.
 * In production, this should connect to a real AI backend.
 * If NODE_ENV=production, the function sends an error message instead of fake output.
 */
const activeStreamTimers = new Map<string, NodeJS.Timeout>();

function simulateStreaming(
  ws: WebSocket,
  subAgentId: string,
  task: string,
  requesterId: string,
): void {
  // In production, sub-agent backend is not configured — reject immediately
  if (process.env.NODE_ENV === 'production') {
    try {
      ws.send(JSON.stringify({
        type: 'subagent_completed',
        data: {
          id: subAgentId,
          output: '错误：Sub-Agent 后端未配置。请在生产环境中配置 AI 后端服务。',
          status: 'error',
        },
      }));
      // Mark session as error
      const prodSession = store.subAgents.get(subAgentId);
      if (prodSession) {
        prodSession.status = 'error';
        prodSession.output = 'Sub-Agent backend not configured for production.';
        prodSession.updatedAt = Date.now();
        store.subAgents.set(subAgentId, prodSession);
        store.persistSubAgent(prodSession);
      }
    } catch {
      // ignore send errors
    }
    return;
  }

  console.warn(`[ws] STUB: simulateStreaming called in non-production mode for subAgent ${subAgentId}`);

  // Clear previous timer
  const existingTimer = activeStreamTimers.get(subAgentId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    activeStreamTimers.delete(subAgentId);
  }

  const responses = [
    `正在处理任务: "${task.slice(0, 50)}..."`,
    '分析请求内容...',
    '检索相关信息...',
    '生成响应中...',
    '整理输出结果...',
    '任务处理完成。',
  ];

  let index = 0;
  const timer = setInterval(() => {
    const session = store.subAgents.get(subAgentId);
    if (!session || session.status !== 'running') {
      clearInterval(timer);
      activeStreamTimers.delete(subAgentId);
      return;
    }

    if (index < responses.length) {
      session.output += (session.output ? '\n' : '') + responses[index];
      session.updatedAt = Date.now();
      store.subAgents.set(subAgentId, session);
      store.persistSubAgent(session);

      // Send streaming chunk
      try {
        ws.send(JSON.stringify({
          type: 'subagent_chunk',
          data: {
            id: subAgentId,
            chunk: responses[index],
            output: session.output,
            status: 'running',
          },
        }));
      } catch {
        clearInterval(timer);
        activeStreamTimers.delete(subAgentId);
        return;
      }

      index++;
    } else {
      // Streaming complete
      session.status = 'completed';
      session.updatedAt = Date.now();
      store.subAgents.set(subAgentId, session);

      try {
        ws.send(JSON.stringify({
          type: 'subagent_completed',
          data: {
            id: subAgentId,
            output: session.output,
            status: 'completed',
          },
        }));
      } catch {
        // ignore
      }

      clearInterval(timer);
      activeStreamTimers.delete(subAgentId);
    }
  }, 800);

  activeStreamTimers.set(subAgentId, timer);
}
