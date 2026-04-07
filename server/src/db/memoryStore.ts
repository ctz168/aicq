/**
 * PersistentStore — 带有 ClickHouse 持久化的内存存储
 *
 * 策略：
 * - 所有读写操作走内存缓存（与原 MemoryStore 完全兼容）
 * - 写操作时异步同步到 ClickHouse
 * - 启动时从 ClickHouse 加载全量数据到内存
 * - 定期清理时同步到 ClickHouse
 *
 * 这样所有 service 文件完全不需要修改，因为接口100%兼容。
 */
import {
  NodeRecord,
  TempNumberRecord,
  HandshakeSession,
  FileTransferRecord,
  PendingRequest,
  Account,
  VerificationCode,
  Session,
  Group,
  FriendRequest,
  PushNotification,
  SubAgentSession,
  GroupMessage,
  FriendPermission,
} from '../models/types';
import { config } from '../config';
import { getClickHouseClient } from './clickhouse';

// ─── Retry helper for CH operations ───────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T | undefined> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) {
        console.warn(`[store] ClickHouse operation failed after ${retries} retries:`, err instanceof Error ? err.message : err);
        return undefined;
      }
    }
  }
  return undefined;
}

// ─── ClickHouse availability flag ─────────────────
let clickHouseAvailable = false;

export function setClickHouseAvailable(available: boolean): void {
  clickHouseAvailable = available;
}

export function isClickHouseAvailable(): boolean {
  return clickHouseAvailable;
}

// ─── Async fire-and-forget write helper ──────────────
function asyncWrite(label: string, fn: () => Promise<void>): void {
  if (!clickHouseAvailable) {
    // Silently skip writes when ClickHouse is not available
    return;
  }
  fn().catch((err) => {
    console.warn(`[store] async write failed (${label}):`, err instanceof Error ? err.message : err);
  });
}

export class MemoryStore {
  nodes = new Map<string, NodeRecord>();
  tempNumbers = new Map<string, TempNumberRecord>();
  handshakeSessions = new Map<string, HandshakeSession>();
  fileTransfers = new Map<string, FileTransferRecord>();
  pendingRequests = new Map<string, PendingRequest[]>();
  accounts = new Map<string, Account>();
  verificationCodes = new Map<string, VerificationCode>();
  sessions = new Map<string, Session>();
  groups = new Map<string, Group>();
  friendRequests = new Map<string, FriendRequest>();
  notifications = new Map<string, PushNotification>();
  groupMessages = new Map<string, GroupMessage[]>();
  subAgents = new Map<string, SubAgentSession>();
  nodePermissions = new Map<string, Map<string, FriendPermission[]>>();

  // Index maps
  emailIndex = new Map<string, string>();
  phoneIndex = new Map<string, string>();
  publicKeyIndex = new Map<string, string>();

  // ─── Index Maintenance ─────────────────────────────────

  rebuildIndexes(): void {
    this.emailIndex.clear();
    this.phoneIndex.clear();
    this.publicKeyIndex.clear();
    for (const [id, account] of this.accounts) {
      if (account.email) this.emailIndex.set(account.email, id);
      if (account.phone) this.phoneIndex.set(account.phone, id);
      if (account.publicKey) this.publicKeyIndex.set(account.publicKey, id);
    }
  }

  setAccount(account: Account): void {
    const existing = this.accounts.get(account.id);
    if (existing) {
      if (existing.email) this.emailIndex.delete(existing.email);
      if (existing.phone) this.phoneIndex.delete(existing.phone);
      if (existing.publicKey) this.publicKeyIndex.delete(existing.publicKey);
    }
    this.accounts.set(account.id, account);
    if (account.email) this.emailIndex.set(account.email, account.id);
    if (account.phone) this.phoneIndex.set(account.phone, account.id);
    if (account.publicKey) this.publicKeyIndex.set(account.publicKey, account.id);

    // Async persist to ClickHouse
    asyncWrite('setAccount', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'accounts',
        values: [{
          id: account.id,
          type: account.type,
          email: account.email || null,
          phone: account.phone || null,
          password_hash: account.passwordHash || null,
          display_name: account.displayName || null,
          agent_name: account.agentName || null,
          fingerprint: account.fingerprint || null,
          public_key: account.publicKey,
          created_at: new Date(account.createdAt),
          last_login_at: new Date(account.lastLoginAt),
          status: account.status,
          friends: account.friends,
          max_friends: account.maxFriends,
          visit_permissions: account.visitPermissions,
        }],
        format: 'JSONEachRow',
      });
    });
  }

  // ─── Cleanup Methods ───────────────────────────────────

  cleanupExpiredTempNumbers(): number {
    const now = Date.now();
    let removed = 0;
    const toRemove: string[] = [];
    for (const [number, record] of this.tempNumbers) {
      if (record.expiresAt <= now) {
        toRemove.push(number);
        removed++;
      }
    }
    for (const n of toRemove) this.tempNumbers.delete(n);

    if (toRemove.length > 0) {
      asyncWrite('cleanupTempNumbers', async () => {
        const ch = await getClickHouseClient();
        await ch.exec({
          query: `ALTER TABLE temp_numbers DELETE WHERE number IN (${toRemove.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`,
        });
      });
    }
    return removed;
  }

  cleanupExpiredHandshakeSessions(): number {
    const now = Date.now();
    let removed = 0;
    const toRemove: string[] = [];
    for (const [sessionId, session] of this.handshakeSessions) {
      if (session.expiresAt <= now) {
        toRemove.push(sessionId);
        removed++;
      }
    }
    for (const id of toRemove) this.handshakeSessions.delete(id);

    if (toRemove.length > 0) {
      asyncWrite('cleanupHandshakes', async () => {
        const ch = await getClickHouseClient();
        await ch.exec({
          query: `ALTER TABLE handshake_sessions DELETE WHERE id IN (${toRemove.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`,
        });
      });
    }
    return removed;
  }

  cleanupOldFileTransfers(): number {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    let removed = 0;
    const toRemove: string[] = [];
    for (const [sessionId, transfer] of this.fileTransfers) {
      if (
        (transfer.completedAt || transfer.cancelledAt) &&
        now - (transfer.completedAt || transfer.cancelledAt!) > oneHour
      ) {
        toRemove.push(sessionId);
        removed++;
      }
    }
    for (const id of toRemove) this.fileTransfers.delete(id);

    if (toRemove.length > 0) {
      asyncWrite('cleanupFileTransfers', async () => {
        const ch = await getClickHouseClient();
        await ch.exec({
          query: `ALTER TABLE file_transfers DELETE WHERE id IN (${toRemove.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`,
        });
      });
    }
    return removed;
  }

  cleanupExpiredCodes(): number {
    const now = Date.now();
    let removed = 0;
    const toRemove: string[] = [];
    for (const [key, record] of this.verificationCodes) {
      if (record.expiresAt <= now) {
        toRemove.push(key);
        removed++;
      }
    }
    for (const k of toRemove) this.verificationCodes.delete(k);
    return removed;
  }

  cleanupExpiredSessions(): number {
    const now = Date.now();
    let removed = 0;
    const toRemove: string[] = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt <= now) {
        toRemove.push(sessionId);
        removed++;
      }
    }
    for (const id of toRemove) this.sessions.delete(id);

    if (toRemove.length > 0) {
      asyncWrite('cleanupSessions', async () => {
        const ch = await getClickHouseClient();
        await ch.exec({
          query: `ALTER TABLE sessions DELETE WHERE id IN (${toRemove.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`,
        });
      });
    }
    return removed;
  }

  cleanupOldNotifications(): number {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    let removed = 0;
    const toRemove: string[] = [];
    for (const [id, notification] of this.notifications) {
      if (now - notification.createdAt > sevenDays) {
        toRemove.push(id);
        removed++;
      }
    }
    for (const id of toRemove) this.notifications.delete(id);

    if (toRemove.length > 0) {
      asyncWrite('cleanupNotifications', async () => {
        const ch = await getClickHouseClient();
        await ch.exec({
          query: `ALTER TABLE notifications DELETE WHERE id IN (${toRemove.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`,
        });
      });
    }
    return removed;
  }

  cleanupBoundedGroupMessages(): number {
    const MAX_GROUP_MESSAGES = config.maxGroupMessages;
    let trimmed = 0;
    for (const [groupId, messages] of this.groupMessages) {
      if (messages.length > MAX_GROUP_MESSAGES) {
        const removed = messages.length - MAX_GROUP_MESSAGES;
        this.groupMessages.set(groupId, messages.slice(-MAX_GROUP_MESSAGES));
        trimmed += removed;
      }
    }
    return trimmed;
  }

  cleanupCompletedSubAgents(): number {
    const MAX_AGE = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let removed = 0;
    const toRemove: string[] = [];
    for (const [id, session] of this.subAgents) {
      if ((session.status === 'completed' || session.status === 'error') && now - session.updatedAt > MAX_AGE) {
        toRemove.push(id);
        removed++;
      }
    }
    for (const id of toRemove) this.subAgents.delete(id);
    return removed;
  }

  // ─── ClickHouse Persist Helpers (called by services indirectly) ────

  persistNode(node: NodeRecord): void {
    asyncWrite('persistNode', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'nodes',
        values: [{
          id: node.id,
          public_key: node.publicKey,
          last_seen: new Date(node.lastSeen),
          socket_id: node.socketId,
          friend_count: node.friendCount,
          friends: Array.from(node.friends),
          gateway_url: node.gatewayUrl || null,
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistFriendRequest(request: FriendRequest): void {
    asyncWrite('persistFriendRequest', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'friend_requests',
        values: [{
          id: request.id,
          from_id: request.fromId,
          to_id: request.toId,
          status: request.status,
          message: request.message || null,
          granted_permissions: request.grantedPermissions || [],
          created_at: new Date(request.createdAt),
          updated_at: new Date(request.updatedAt),
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistGroup(group: Group): void {
    asyncWrite('persistGroup', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'groups',
        values: [{
          id: group.id,
          name: group.name,
          owner_id: group.ownerId,
          members_json: JSON.stringify(Array.from(group.members.entries())),
          created_at: new Date(group.createdAt),
          updated_at: new Date(group.updatedAt),
          max_members: group.maxMembers,
          description: group.description || null,
          avatar: group.avatar || null,
        }],
        format: 'JSONEachRow',
      });
    });
  }

  deleteGroupFromDB(groupId: string): void {
    asyncWrite('deleteGroup', async () => {
      const ch = await getClickHouseClient();
      await ch.exec({
        query: 'ALTER TABLE groups DELETE WHERE id = {id:String}',
        query_params: { id: groupId },
      });
      await ch.exec({
        query: 'ALTER TABLE group_messages DELETE WHERE group_id = {id:String}',
        query_params: { id: groupId },
      });
    });
  }

  persistGroupMessage(msg: GroupMessage): void {
    asyncWrite('persistGroupMessage', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'group_messages',
        values: [{
          id: msg.id,
          group_id: msg.groupId,
          from_id: msg.fromId,
          sender_name: msg.senderName,
          type: msg.type,
          content: msg.content,
          media: msg.media ? JSON.stringify(msg.media) : null,
          file_info: msg.fileInfo ? JSON.stringify(msg.fileInfo) : null,
          timestamp: new Date(msg.timestamp),
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistHandshakeSession(session: HandshakeSession): void {
    asyncWrite('persistHandshake', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'handshake_sessions',
        values: [{
          id: session.id,
          requester_id: session.requesterId,
          target_node_id: session.targetNodeId,
          status: session.status,
          response_data: session.responseData ? session.responseData.toString('base64') : null,
          confirm_data: session.confirmData ? session.confirmData.toString('base64') : null,
          created_at: new Date(session.createdAt),
          expires_at: new Date(session.expiresAt),
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistTempNumber(record: TempNumberRecord): void {
    asyncWrite('persistTempNumber', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'temp_numbers',
        values: [{
          number: record.number,
          node_id: record.nodeId,
          expires_at: new Date(record.expiresAt),
          created_at: new Date(record.createdAt),
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistFileTransfer(transfer: FileTransferRecord): void {
    asyncWrite('persistFileTransfer', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'file_transfers',
        values: [{
          id: transfer.id,
          sender_id: transfer.senderId,
          receiver_id: transfer.receiverId,
          file_name: transfer.fileName,
          file_size: transfer.fileSize,
          file_hash: transfer.fileHash,
          total_chunks: transfer.totalChunks,
          chunk_size: transfer.chunkSize,
          chunks_received_json: JSON.stringify(transfer.chunksReceived),
          created_at: new Date(transfer.createdAt),
          completed_at: transfer.completedAt ? new Date(transfer.completedAt) : null,
          cancelled_at: transfer.cancelledAt ? new Date(transfer.cancelledAt) : null,
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistNotification(notification: PushNotification): void {
    asyncWrite('persistNotification', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'notifications',
        values: [{
          id: notification.id,
          account_id: notification.accountId,
          chat_id: notification.chatId,
          sender_id: notification.senderId,
          sender_name: notification.senderName,
          message_preview: notification.messagePreview,
          is_group: notification.isGroup ? 1 : 0,
          read_flag: notification.read ? 1 : 0,
          created_at: new Date(notification.createdAt),
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistSubAgent(session: SubAgentSession): void {
    asyncWrite('persistSubAgent', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'sub_agents',
        values: [{
          id: session.id,
          parent_message_id: session.parentMessageId,
          task: session.task,
          context: session.context || null,
          status: session.status,
          output: session.output,
          created_at: new Date(session.createdAt),
          updated_at: new Date(session.updatedAt),
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistNodePermission(nodeId: string, friendId: string, permissions: FriendPermission[]): void {
    asyncWrite('persistNodePermission', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'node_permissions',
        values: [{
          node_id: nodeId,
          friend_id: friendId,
          permissions: permissions,
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistSession(session: Session): void {
    asyncWrite('persistSession', async () => {
      const ch = await getClickHouseClient();
      await ch.insert({
        table: 'sessions',
        values: [{
          id: session.id,
          account_id: session.accountId,
          token: session.token,
          refresh_token: session.refreshToken,
          device_info: session.deviceInfo || null,
          created_at: new Date(session.createdAt),
          expires_at: new Date(session.expiresAt),
        }],
        format: 'JSONEachRow',
      });
    });
  }

  persistPendingRequests(targetNodeId: string, requests: PendingRequest[]): void {
    asyncWrite('persistPendingRequests', async () => {
      const ch = await getClickHouseClient();
      // First clear existing, then insert all
      await ch.exec({
        query: 'ALTER TABLE pending_requests DELETE WHERE target_node_id = {id:String}',
        query_params: { id: targetNodeId },
      });
      if (requests.length > 0) {
        await ch.insert({
          table: 'pending_requests',
          values: requests.map(r => ({
            target_node_id: targetNodeId,
            from_node_id: r.fromNodeId,
            temp_number: r.tempNumber,
            session_id: r.sessionId,
            created_at: new Date(r.createdAt),
          })),
          format: 'JSONEachRow',
        });
      }
    });
  }

  // ─── Load all data from ClickHouse into memory ────────

  async loadFromClickHouse(): Promise<void> {
    console.log('[store] Loading data from ClickHouse...');
    const ch = await getClickHouseClient();

    // Load accounts
    const accountRows = await ch.query({
      query: 'SELECT * FROM accounts',
      format: 'JSONEachRow',
    });
    for await (const row of accountRows.stream()) {
      const r = row as any;
      const account: Account = {
        id: r.id,
        type: r.type,
        email: r.email || undefined,
        phone: r.phone || undefined,
        passwordHash: r.password_hash || undefined,
        displayName: r.display_name || undefined,
        agentName: r.agent_name || undefined,
        fingerprint: r.fingerprint || undefined,
        publicKey: r.public_key,
        createdAt: new Date(r.created_at).getTime(),
        lastLoginAt: new Date(r.last_login_at).getTime(),
        status: r.status,
        friends: r.friends || [],
        maxFriends: r.max_friends || 200,
        visitPermissions: r.visit_permissions || [],
      };
      this.accounts.set(account.id, account);
    }
    this.rebuildIndexes();
    console.log(`[store] Loaded ${this.accounts.size} accounts`);

    // Load nodes
    const nodeRows = await ch.query({
      query: 'SELECT * FROM nodes',
      format: 'JSONEachRow',
    });
    for await (const row of nodeRows.stream()) {
      const r = row as any;
      const node: NodeRecord = {
        id: r.id,
        publicKey: r.public_key,
        lastSeen: new Date(r.last_seen).getTime(),
        socketId: r.socket_id || null,
        friendCount: r.friend_count || 0,
        friends: new Set(r.friends || []),
        gatewayUrl: r.gateway_url || undefined,
      };
      this.nodes.set(node.id, node);
    }
    console.log(`[store] Loaded ${this.nodes.size} nodes`);

    // Load temp numbers
    const tempRows = await ch.query({
      query: 'SELECT * FROM temp_numbers WHERE expires_at > now64(3)',
      format: 'JSONEachRow',
    });
    for await (const row of tempRows.stream()) {
      const r = row as any;
      this.tempNumbers.set(r.number, {
        number: r.number,
        nodeId: r.node_id,
        expiresAt: new Date(r.expires_at).getTime(),
        createdAt: new Date(r.created_at).getTime(),
      });
    }
    console.log(`[store] Loaded ${this.tempNumbers.size} temp numbers`);

    // Load friend requests
    const frRows = await ch.query({
      query: "SELECT * FROM friend_requests WHERE status = 'pending'",
      format: 'JSONEachRow',
    });
    for await (const row of frRows.stream()) {
      const r = row as any;
      this.friendRequests.set(r.id, {
        id: r.id,
        fromId: r.from_id,
        toId: r.to_id,
        status: r.status,
        message: r.message || undefined,
        grantedPermissions: r.granted_permissions || undefined,
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: new Date(r.updated_at).getTime(),
      });
    }
    console.log(`[store] Loaded ${this.friendRequests.size} pending friend requests`);

    // Load groups
    const groupRows = await ch.query({
      query: 'SELECT * FROM groups',
      format: 'JSONEachRow',
    });
    for await (const row of groupRows.stream()) {
      const r = row as any;
      const membersMap = new Map<string, any>();
      try {
        const membersArr: [string, any][] = JSON.parse(r.members_json || '[]');
        for (const [k, v] of membersArr) {
          membersMap.set(k, v);
        }
      } catch { /* ignore parse errors */ }

      this.groups.set(r.id, {
        id: r.id,
        name: r.name,
        ownerId: r.owner_id,
        members: membersMap,
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: new Date(r.updated_at).getTime(),
        maxMembers: r.max_members || 100,
        description: r.description || undefined,
        avatar: r.avatar || undefined,
      });
    }
    console.log(`[store] Loaded ${this.groups.size} groups`);

    // Load group messages (last N per group to avoid memory explosion)
    const msgRows = await ch.query({
      query: `SELECT * FROM group_messages
              WHERE timestamp > now64(3) - INTERVAL 7 DAY
              ORDER BY group_id, timestamp`,
      format: 'JSONEachRow',
    });
    for await (const row of msgRows.stream()) {
      const r = row as any;
      const msg: GroupMessage = {
        id: r.id,
        groupId: r.group_id,
        fromId: r.from_id,
        senderName: r.sender_name,
        type: r.type,
        content: r.content,
        media: r.media ? JSON.parse(r.media) : undefined,
        fileInfo: r.file_info ? JSON.parse(r.file_info) : undefined,
        timestamp: new Date(r.timestamp).getTime(),
      };
      if (!this.groupMessages.has(msg.groupId)) {
        this.groupMessages.set(msg.groupId, []);
      }
      this.groupMessages.get(msg.groupId)!.push(msg);
    }
    console.log(`[store] Loaded group messages for ${this.groupMessages.size} groups`);

    // Load node permissions
    const permRows = await ch.query({
      query: 'SELECT * FROM node_permissions',
      format: 'JSONEachRow',
    });
    for await (const row of permRows.stream()) {
      const r = row as any;
      if (!this.nodePermissions.has(r.node_id)) {
        this.nodePermissions.set(r.node_id, new Map());
      }
      this.nodePermissions.get(r.node_id)!.set(r.friend_id, r.permissions || []);
    }
    console.log(`[store] Loaded permissions for ${this.nodePermissions.size} nodes`);

    // Load sub-agents (only active ones)
    const subRows = await ch.query({
      query: "SELECT * FROM sub_agents WHERE status IN ('running', 'waiting_human')",
      format: 'JSONEachRow',
    });
    for await (const row of subRows.stream()) {
      const r = row as any;
      this.subAgents.set(r.id, {
        id: r.id,
        parentMessageId: r.parent_message_id,
        task: r.task,
        context: r.context || undefined,
        status: r.status,
        output: r.output || '',
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: new Date(r.updated_at).getTime(),
      });
    }
    console.log(`[store] Loaded ${this.subAgents.size} active sub-agents`);

    console.log('[store] All data loaded from ClickHouse');
  }
}

/** Singleton store instance */
export const store = new MemoryStore();

/** Helper: get or create a node record */
export function getOrCreateNode(nodeId: string, publicKey: string): NodeRecord {
  let node = store.nodes.get(nodeId);
  if (!node) {
    node = {
      id: nodeId,
      publicKey,
      lastSeen: Date.now(),
      socketId: null,
      friendCount: 0,
      friends: new Set<string>(),
    };
    store.nodes.set(nodeId, node);
    store.persistNode(node);
  }
  return node;
}

/** Start periodic cleanup (every 60 seconds) */
export function startPeriodicCleanup(): NodeJS.Timeout {
  const interval = setInterval(() => {
    store.cleanupExpiredTempNumbers();
    store.cleanupExpiredHandshakeSessions();
    store.cleanupOldFileTransfers();
    store.cleanupExpiredCodes();
    store.cleanupExpiredSessions();
    store.cleanupOldNotifications();
    store.cleanupBoundedGroupMessages();
    store.cleanupCompletedSubAgents();
    // Dynamically import to avoid circular dependency
    import('../services/accountService').then((svc) => {
      const removed = svc.cleanupExpiredChallenges();
      if (removed > 0) {
        console.log(`[cleanup] Removed ${removed} expired agent challenges`);
      }
    }).catch(() => {
      // ignore import errors
    });
  }, 60_000);

  // Don't prevent process exit
  if (interval.unref) {
    interval.unref();
  }

  return interval;
}
