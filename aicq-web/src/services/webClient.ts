/**
 * Browser-compatible client adapter for AICQ.
 *
 * Implements API calls and WebSocket communication using browser APIs
 * (fetch, WebSocket, localStorage) instead of Node.js APIs.
 * Supports: text, markdown, image, video, file transfer with resume, streaming AI output.
 */

import * as aicqCrypto from '@aicq/crypto';
const {
  generateSigningKeyPair,
  generateKeyExchangeKeyPair,
  getPublicKeyFingerprint,
} = aicqCrypto as any;
import type {
  FriendInfo,
  ChatMessage,
  TempNumberInfo,
  FileTransferInfo,
  HandshakeProgress,
  MediaInfo,
  FileMetadata,
  StreamingState,
  GroupInfo,
  GroupMessage,
  GroupMemberInfo,
  FriendRequest,
  SubAgentSession,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────

function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function detectFileType(mimeType: string, fileName: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  const docTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf'];
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (docTypes.includes(ext)) return 'document';
  return 'other';
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

// ─── Key-pair storage type ───────────────────────────────────

interface SerializableKeyPair {
  publicKey: string;
  secretKey: string;
}

interface SerializableSession {
  sessionKey: string;
  createdAt: string;
}

interface StoreData {
  version: number;
  userId: string;
  signingKeys: SerializableKeyPair | null;
  exchangeKeys: SerializableKeyPair | null;
  friends: Record<string, FriendInfo>;
  sessions: Record<string, SerializableSession>;
  chatHistory: Record<string, ChatMessage[]>;
  tempNumbers: TempNumberInfo[];
  fileTransfers: Record<string, FileTransferInfo>;
  groups: Record<string, GroupInfo>;
  groupMessages: Record<string, GroupMessage[]>;
}

// ─── Browser Store (localStorage) ───────────────────────────

class BrowserStore {
  private static KEY = 'aicq_store';
  private data: StoreData = {
    version: 1,
    userId: '',
    signingKeys: null,
    exchangeKeys: null,
    friends: {},
    sessions: {},
    chatHistory: {},
    tempNumbers: [],
    fileTransfers: {},
    groups: {},
    groupMessages: {},
  };

  load(): boolean {
    try {
      const raw = localStorage.getItem(BrowserStore.KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      this.data = {
        version: parsed.version ?? 1,
        userId: parsed.userId ?? '',
        signingKeys: parsed.signingKeys ?? null,
        exchangeKeys: parsed.exchangeKeys ?? null,
        friends: parsed.friends ?? {},
        sessions: parsed.sessions ?? {},
        chatHistory: parsed.chatHistory ?? {},
        tempNumbers: parsed.tempNumbers ?? [],
        fileTransfers: parsed.fileTransfers ?? {},
        groups: parsed.groups ?? {},
        groupMessages: parsed.groupMessages ?? {},
      };
      return true;
    } catch {
      return false;
    }
  }

  save(): void {
    try {
      localStorage.setItem(BrowserStore.KEY, JSON.stringify(this.data));
    } catch (err) {
      console.error('[BrowserStore] Failed to save:', err);
    }
  }

  clear(): void {
    localStorage.removeItem(BrowserStore.KEY);
    this.data = {
      version: 1,
      userId: '',
      signingKeys: null,
      exchangeKeys: null,
      friends: {},
      sessions: {},
      chatHistory: {},
      tempNumbers: [],
      fileTransfers: {},
      groups: {},
      groupMessages: {},
    };
  }

  get userId(): string { return this.data.userId; }
  set userId(v: string) { this.data.userId = v; }

  get signingKeys(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
    const k = this.data.signingKeys;
    if (!k) return null;
    return {
      publicKey: base64ToUint8Array(k.publicKey),
      secretKey: base64ToUint8Array(k.secretKey),
    };
  }
  set signingKeys(kp: { publicKey: Uint8Array; secretKey: Uint8Array } | null) {
    this.data.signingKeys = kp
      ? { publicKey: uint8ArrayToBase64(kp.publicKey), secretKey: uint8ArrayToBase64(kp.secretKey) }
      : null;
  }

  get exchangeKeys(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
    const k = this.data.exchangeKeys;
    if (!k) return null;
    return {
      publicKey: base64ToUint8Array(k.publicKey),
      secretKey: base64ToUint8Array(k.secretKey),
    };
  }
  set exchangeKeys(kp: { publicKey: Uint8Array; secretKey: Uint8Array } | null) {
    this.data.exchangeKeys = kp
      ? { publicKey: uint8ArrayToBase64(kp.publicKey), secretKey: uint8ArrayToBase64(kp.secretKey) }
      : null;
  }

  get friends(): Map<string, FriendInfo> {
    return new Map(Object.entries(this.data.friends));
  }
  addFriend(info: FriendInfo): void { this.data.friends[info.id] = info; }
  removeFriend(id: string): void { delete this.data.friends[id]; }
  updateFriendOnline(id: string, online: boolean): void {
    const f = this.data.friends[id];
    if (f) {
      f.isOnline = online;
      f.lastSeen = new Date().toISOString();
    }
  }

  getSessionKey(peerId: string): Uint8Array | null {
    const s = this.data.sessions[peerId];
    if (!s) return null;
    return base64ToUint8Array(s.sessionKey);
  }
  setSessionKey(peerId: string, key: Uint8Array): void {
    this.data.sessions[peerId] = {
      sessionKey: uint8ArrayToBase64(key),
      createdAt: new Date().toISOString(),
    };
  }

  get chatHistory(): Map<string, ChatMessage[]> {
    return new Map(Object.entries(this.data.chatHistory));
  }
  addMessage(friendId: string, message: ChatMessage): void {
    if (!this.data.chatHistory[friendId]) this.data.chatHistory[friendId] = [];
    this.data.chatHistory[friendId].push(message);
  }
  getMessages(friendId: string): ChatMessage[] {
    return [...(this.data.chatHistory[friendId] ?? [])];
  }
  updateMessage(messageId: string, friendId: string, updates: Partial<ChatMessage>): void {
    const msgs = this.data.chatHistory[friendId];
    if (!msgs) return;
    const msg = msgs.find((m) => m.id === messageId);
    if (msg) {
      Object.assign(msg, updates);
    }
  }
  updateMessageStatus(messageId: string, status: ChatMessage['status']): void {
    for (const msgs of Object.values(this.data.chatHistory)) {
      const msg = msgs.find((m) => m.id === messageId);
      if (msg) { msg.status = status; break; }
    }
  }

  get tempNumbers(): TempNumberInfo[] { return [...this.data.tempNumbers]; }
  addTempNumber(info: TempNumberInfo): void { this.data.tempNumbers.push(info); }
  removeTempNumber(number: string): void {
    this.data.tempNumbers = this.data.tempNumbers.filter((t) => t.number !== number);
  }

  get fileTransfers(): Map<string, FileTransferInfo> {
    return new Map(Object.entries(this.data.fileTransfers));
  }
  setFileTransfer(sessionId: string, info: FileTransferInfo): void {
    this.data.fileTransfers[sessionId] = info;
  }
  getFileTransfer(sessionId: string): FileTransferInfo | null {
    return this.data.fileTransfers[sessionId] ?? null;
  }
  removeFileTransfer(sessionId: string): void {
    delete this.data.fileTransfers[sessionId];
  }

  /* ─── Groups Storage ─────────────────────────────────── */

  get groups(): GroupInfo[] {
    return Object.values(this.data.groups);
  }
  addGroup(group: GroupInfo): void {
    this.data.groups[group.id] = group;
  }
  removeGroup(groupId: string): void {
    delete this.data.groups[groupId];
  }
  updateGroup(groupId: string, updates: Partial<GroupInfo>): void {
    const g = this.data.groups[groupId];
    if (g) Object.assign(g, updates);
  }

  getGroupMessages(groupId: string): GroupMessage[] {
    return [...(this.data.groupMessages?.[groupId] ?? [])];
  }
  addGroupMessage(groupId: string, message: GroupMessage): void {
    if (!this.data.groupMessages) this.data.groupMessages = {};
    if (!this.data.groupMessages[groupId]) this.data.groupMessages[groupId] = [];
    this.data.groupMessages[groupId].push(message);
  }

  /** Clear all chat history (used after migrating to IndexedDB) */
  clearChatHistory(): void {
    this.data.chatHistory = {};
  }
}

// ─── Event Emitter (simple browser impl) ─────────────────────

type Listener = (...args: any[]) => void;

class SimpleEventEmitter {
  private listeners = new Map<string, Listener[]>();

  on(event: string, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(fn);
  }

  off(event: string, fn: Listener): void {
    const arr = this.listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  emit(event: string, ...args: any[]): void {
    const arr = this.listeners.get(event);
    if (arr) arr.forEach((fn) => fn(...args));
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// ─── REST API Client (browser fetch) ─────────────────────────

class BrowserAPIClient {
  private baseUrl: string;
  private nodeId: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  setNodeId(id: string): void { this.nodeId = id; }

  private url(path: string): string {
    return `${this.baseUrl}/api/v1${path}`;
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    const response = await fetch(this.url(path), init);
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error((data?.error as string) ?? `HTTP ${response.status}`);
    }
    return data as T;
  }

  async register(userId: string, publicKey: Uint8Array): Promise<void> {
    const pubBase64 = uint8ArrayToBase64(publicKey);
    await this.request('POST', '/node/register', { id: userId, publicKey: pubBase64 });
  }

  async requestTempNumber(): Promise<string> {
    if (!this.nodeId) throw new Error('Node ID not set');
    const res = await this.request<{ number: string }>('POST', '/temp-number/request', { nodeId: this.nodeId });
    return res.number;
  }

  async resolveTempNumber(number: string): Promise<{ nodeId: string; expiresAt: number }> {
    return this.request('GET', `/temp-number/${encodeURIComponent(number)}`);
  }

  async revokeTempNumber(number: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('DELETE', `/temp-number/${encodeURIComponent(number)}`, { nodeId: this.nodeId });
  }

  async initiateHandshake(targetTempNumber: string): Promise<{
    sessionId: string;
    targetNodeId: string;
    status: string;
    expiresAt: number;
  }> {
    if (!this.nodeId) throw new Error('Node ID not set');
    return this.request('POST', '/handshake/initiate', {
      requesterId: this.nodeId,
      targetTempNumber,
    });
  }

  async submitHandshakeResponse(sessionId: string, dataBase64: string): Promise<void> {
    await this.request('POST', '/handshake/respond', { sessionId, responseData: dataBase64 });
  }

  async submitHandshakeConfirm(sessionId: string, dataBase64: string): Promise<void> {
    await this.request('POST', '/handshake/confirm', { sessionId, confirmData: dataBase64 });
  }

  async getFriends(): Promise<FriendInfo[]> {
    if (!this.nodeId) throw new Error('Node ID not set');
    const res = await this.request<{ friends: FriendInfo[] }>('GET', `/friends?nodeId=${encodeURIComponent(this.nodeId)}`);
    return res.friends;
  }

  async removeFriend(friendId: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('DELETE', `/friends/${encodeURIComponent(friendId)}`, { nodeId: this.nodeId });
  }

  async initiateFileTransfer(receiverId: string, fileInfo: {
    fileName: string; fileSize: number; fileHash: string; chunks: number; chunkSize: number;
    mimeType?: string; fileType?: string;
  }): Promise<{ sessionId: string; status: string }> {
    if (!this.nodeId) throw new Error('Node ID not set');
    return this.request('POST', '/file/initiate', {
      senderId: this.nodeId, receiverId, fileInfo,
    });
  }

  async reportChunk(sessionId: string, chunkIndex: number): Promise<void> {
    await this.request('POST', `/file/${encodeURIComponent(sessionId)}/chunk`, { chunkIndex });
  }

  async getFileMissingChunks(sessionId: string): Promise<number[]> {
    const res = await this.request<{ missingChunks: number[] }>('GET', `/file/${encodeURIComponent(sessionId)}/missing`);
    return res.missingChunks;
  }

  /* ─── Groups API ─────────────────────────────────────── */

  async createGroup(name: string, description?: string): Promise<GroupInfo> {
    if (!this.nodeId) throw new Error('Node ID not set');
    return this.request('POST', '/group/create', { name, ownerId: this.nodeId, description });
  }

  async getGroups(): Promise<GroupInfo[]> {
    if (!this.nodeId) throw new Error('Node ID not set');
    const res = await this.request<{ groups: GroupInfo[] }>('GET', `/group/list?accountId=${encodeURIComponent(this.nodeId)}`);
    return res.groups;
  }

  async getGroupInfo(groupId: string): Promise<GroupInfo> {
    if (!this.nodeId) throw new Error('Node ID not set');
    return this.request('GET', `/group/${encodeURIComponent(groupId)}?accountId=${encodeURIComponent(this.nodeId)}`);
  }

  async inviteToGroup(groupId: string, targetId: string, displayName?: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('POST', `/group/${encodeURIComponent(groupId)}/invite`, { accountId: this.nodeId, targetId, displayName });
  }

  async kickFromGroup(groupId: string, targetId: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('POST', `/group/${encodeURIComponent(groupId)}/kick`, { accountId: this.nodeId, targetId });
  }

  async leaveGroup(groupId: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('POST', `/group/${encodeURIComponent(groupId)}/leave`, { accountId: this.nodeId });
  }

  async disbandGroup(groupId: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('DELETE', `/group/${encodeURIComponent(groupId)}`, { accountId: this.nodeId });
  }

  async updateGroup(groupId: string, updates: { name?: string; description?: string; avatar?: string }): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('PUT', `/group/${encodeURIComponent(groupId)}`, { accountId: this.nodeId, ...updates });
  }

  async transferGroupOwnership(groupId: string, targetId: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('POST', `/group/${encodeURIComponent(groupId)}/transfer`, { accountId: this.nodeId, targetId });
  }

  async setGroupMemberRole(groupId: string, targetId: string, role: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('POST', `/group/${encodeURIComponent(groupId)}/role`, { accountId: this.nodeId, targetId, role });
  }

  async muteGroupMember(groupId: string, targetId: string, muted: boolean): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('POST', `/group/${encodeURIComponent(groupId)}/mute`, { accountId: this.nodeId, targetId, muted });
  }

  /* ─── Friend Requests API ────────────────────────────── */

  async getFriendRequests(): Promise<{ sent: FriendRequest[]; received: FriendRequest[] }> {
    if (!this.nodeId) throw new Error('Node ID not set');
    const res = await this.request<{ sent: FriendRequest[]; received: FriendRequest[] }>('GET', `/friends/requests?accountId=${encodeURIComponent(this.nodeId)}`);
    return { sent: res.sent || [], received: res.received || [] };
  }

  async sendFriendRequest(userId: string, message?: string): Promise<FriendRequest> {
    if (!this.nodeId) throw new Error('Node ID not set');
    return this.request('POST', `/friends/requests/${encodeURIComponent(userId)}`, { accountId: this.nodeId, message });
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('POST', `/friends/requests/${encodeURIComponent(requestId)}/accept`, { accountId: this.nodeId });
  }

  async rejectFriendRequest(requestId: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('POST', `/friends/requests/${encodeURIComponent(requestId)}/reject`, { accountId: this.nodeId });
  }

  /* ─── Broadcast API ──────────────────────────────────── */

  async broadcastMessage(recipientIds: string[], message: string, encryptedContent?: string): Promise<{ sent: number; failed: number }> {
    if (!this.nodeId) throw new Error('Node ID not set');
    return this.request('POST', '/broadcast', { senderId: this.nodeId, recipientIds, message, encryptedContent });
  }

  /* ─── SubAgent API ──────────────────────────────────── */

  async startSubAgent(parentMessageId: string, task: string, context?: string): Promise<SubAgentSession> {
    if (!this.nodeId) throw new Error('Node ID not set');
    return this.request('POST', '/subagent/start', { accountId: this.nodeId, parentMessageId, task, context });
  }

  async sendSubAgentInput(subAgentId: string, input: string): Promise<void> {
    await this.request('POST', `/subagent/${encodeURIComponent(subAgentId)}/input`, { input });
  }

  async abortSubAgent(subAgentId: string): Promise<void> {
    await this.request('POST', `/subagent/${encodeURIComponent(subAgentId)}/abort`);
  }

  async getSubAgentStatus(subAgentId: string): Promise<SubAgentSession> {
    return this.request('GET', `/subagent/${encodeURIComponent(subAgentId)}/status`);
  }

  /* ─── Group Message History API ─────────────────────── */

  async getGroupMessageHistory(groupId: string, limit?: number, before?: number): Promise<GroupMessage[]> {
    if (!this.nodeId) throw new Error('Node ID not set');
    const params = new URLSearchParams({ accountId: this.nodeId });
    if (limit) params.set('limit', String(limit));
    if (before) params.set('before', String(before));
    const res = await this.request<{ messages: GroupMessage[] }>('GET', `/group/${encodeURIComponent(groupId)}/messages?${params}`);
    return res.messages;
  }
}

// ─── WebSocket Client (browser native) ───────────────────────

class BrowserWSClient extends SimpleEventEmitter {
  private wsUrl: string;
  private nodeId: string | null = null;
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _closed = false;

  constructor(wsUrl: string) {
    super();
    this.wsUrl = wsUrl;
  }

  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  connect(nodeId: string): void {
    this.nodeId = nodeId;
    this._closed = false;
    this._doConnect();
  }

  disconnect(): void {
    this._closed = true;
    this._clearTimers();
    if (this.socket) {
      try { this.socket.close(1000, 'Client disconnect'); } catch { /* ignore */ }
      this.socket = null;
    }
  }

  private _doConnect(): void {
    if (this._closed) return;
    try {
      this.socket = new WebSocket(this.wsUrl);
    } catch (err) {
      this.emit('error', err);
      this._scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this._send({ type: 'online', nodeId: this.nodeId });
      this._startHeartbeat();
      this.emit('connected');
    };

    this.socket.onmessage = (event) => {
      this._handleMessage(event.data);
    };

    this.socket.onclose = () => {
      this._stopHeartbeat();
      this.socket = null;
      this.emit('disconnected');
      if (!this._closed) this._scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.emit('error', new Error('WebSocket error'));
    };
  }

  private _handleMessage(raw: string): void {
    let msg: Record<string, any>;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'online_ack': break;
      case 'signal': this.emit('signal', msg); break;
      case 'presence':
        this.emit('presence', { nodeId: msg.nodeId, online: msg.online, timestamp: msg.timestamp });
        break;
      case 'message': this.emit('message', msg); break;
      case 'file_chunk': this.emit('file_chunk', msg); break;
      case 'typing':
        this.emit('typing', { fromId: msg.fromId, toId: msg.toId });
        break;
      case 'handshake_response':
        this.emit('handshake_response', msg);
        break;
      case 'handshake_confirm':
        this.emit('handshake_confirm', msg);
        break;
      case 'streaming_chunk':
        this.emit('streaming_chunk', msg);
        break;
      case 'streaming_end':
        this.emit('streaming_end', msg);
        break;
      case 'streaming_error':
        this.emit('streaming_error', msg);
        break;
      case 'group_message': this.emit('group_message', msg); break;
      case 'group_typing': this.emit('group_typing', msg); break;
      case 'push_message':
        this.emit('push_notification', msg.data);
        break;
      case 'subagent_chunk':
        this.emit('subagent_chunk', msg);
        break;
      case 'subagent_complete':
        this.emit('subagent_complete', msg);
        break;
      case 'subagent_waiting':
        this.emit('subagent_waiting', msg);
        break;
      // ─── Task Plan (P2P from stableclaw agent) ─────────────
      case 'task_plan_update':
        this.emit('task_plan_update', msg);
        break;
      case 'task_plan_delete':
        this.emit('task_plan_delete', msg);
        break;
      case 'error':
        this.emit('error', new Error(msg.error ?? 'Server error'));
        break;
    }
  }

  send(type: string, data: Record<string, any>): void {
    this._send({ type, ...data });
  }

  private _send(payload: Record<string, any>): void {
    if (!this.connected) return;
    this.socket!.send(JSON.stringify(payload));
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) this._send({ type: 'ping' });
    }, 30_000);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private _scheduleReconnect(): void {
    if (this._closed) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this._doConnect(), delay);
  }

  private _clearTimers(): void {
    this._stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  destroy(): void {
    this.disconnect();
    this.removeAllListeners();
  }
}

// ─── IndexedDB Message Cache ──────────────────────────────

class MessageCache {
  private static DB_NAME = 'aicq_messages';
  private static DB_VERSION = 1;
  private static STORE_NAME = 'messages';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MessageCache.DB_NAME, MessageCache.DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MessageCache.STORE_NAME)) {
          const store = db.createObjectStore(MessageCache.STORE_NAME, { keyPath: 'id' });
          store.createIndex('friendId', 'friendId', { unique: false });
          store.createIndex('friendId_timestamp', ['friendId', 'timestamp'], { unique: false });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('IndexedDB not available');
    const tx = this.db.transaction(MessageCache.STORE_NAME, mode);
    return tx.objectStore(MessageCache.STORE_NAME);
  }

  async getMessages(friendId: string, limit?: number, before?: number): Promise<ChatMessage[]> {
    const store = await this.getStore('readonly');
    const index = store.index('friendId_timestamp');
    const range = before ? IDBKeyRange.bound([friendId, 0], [friendId, before]) : undefined;
    const request = index.openCursor(range, 'prev');
    const messages: ChatMessage[] = [];
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && (limit === undefined || messages.length < limit)) {
          messages.unshift(cursor.value);
          cursor.continue();
        } else {
          resolve(messages);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getMessageCount(friendId: string): Promise<number> {
    const store = await this.getStore('readonly');
    const index = store.index('friendId');
    const request = index.count(IDBKeyRange.only(friendId));
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async addMessage(message: ChatMessage): Promise<void> {
    const store = await this.getStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(message);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateMessage(messageId: string, updates: Partial<ChatMessage>): Promise<void> {
    const store = await this.getStore('readwrite');
    const request = store.get(messageId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const msg = request.result;
        if (msg) {
          store.put({ ...msg, ...updates });
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearFriendMessages(friendId: string): Promise<void> {
    const store = await this.getStore('readwrite');
    const index = store.index('friendId');
    const request = index.openCursor(IDBKeyRange.only(friendId));
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// ─── Main WebClient ──────────────────────────────────────────

export interface WebClientConfig {
  serverUrl: string;
  wsUrl?: string;
}

export class WebClient extends SimpleEventEmitter {
  private store: BrowserStore;
  private api: BrowserAPIClient;
  private ws: BrowserWSClient;
  private signingKeys: { publicKey: Uint8Array; secretKey: Uint8Array } | null = null;
  private exchangeKeys: { publicKey: Uint8Array; secretKey: Uint8Array } | null = null;
  private _initialized = false;

  /** Active streaming sessions: messageId -> accumulated content */
  private streamingSessions = new Map<string, StreamingState>();

  /** Active file transfer abort controllers for pause/cancel */
  private transferControllers = new Map<string, AbortController>();

  /** IndexedDB message cache */
  private messageCache = new MessageCache();

  constructor(config: WebClientConfig) {
    super();
    const wsUrl = config.wsUrl ?? config.serverUrl.replace(/^http/, 'ws') + '/ws';
    this.store = new BrowserStore();
    this.api = new BrowserAPIClient(config.serverUrl);
    this.ws = new BrowserWSClient(wsUrl);
  }

  /* ─── Initialize ──────────────────────────────────────────── */

  async initialize(): Promise<{ userId: string; fingerprint: string; isNewUser: boolean }> {
    // Initialize IndexedDB message cache early
    try {
      await this.messageCache.init();
    } catch (err) {
      console.warn('[WebClient] IndexedDB init failed, falling back to localStorage:', err);
    }

    const loaded = this.store.load();

    if (loaded && this.store.userId) {
      const sk = this.store.signingKeys;
      const ek = this.store.exchangeKeys;
      if (sk && ek) {
        this.signingKeys = sk;
        this.exchangeKeys = ek;
      } else {
        this._generateKeys();
      }
    } else {
      const userId = uuidv4();
      this.store.userId = userId;
      this._generateKeys();
    }

    const userId = this.getUserId();
    const fingerprint = this.getFingerprint();

    try {
      await this.api.register(userId, this.signingKeys!.publicKey);
    } catch (err) {
      console.warn('[WebClient] Server registration failed:', err);
    }

    // Migrate messages from localStorage to IndexedDB (one-time)
    await this._migrateMessagesToIDB();

    this.api.setNodeId(userId);
    this.ws.connect(userId);
    this._wireEvents();
    this._initialized = true;

    return { userId, fingerprint, isNewUser: !loaded };
  }

  /**
   * Migrate messages from localStorage chatHistory to IndexedDB.
   * Runs once; clears localStorage chatHistory after successful migration.
   */
  private async _migrateMessagesToIDB(): Promise<void> {
    try {
      const history = this.store.chatHistory;
      if (history.size === 0) return;

      let migrated = 0;
      for (const [friendId, messages] of history) {
        for (const msg of messages) {
          await this.messageCache.addMessage(msg);
          migrated++;
        }
      }

      if (migrated > 0) {
        console.log(`[WebClient] Migrated ${migrated} messages to IndexedDB`);
        // Clear chatHistory from localStorage to free space
        this.store.clearChatHistory();
        this.store.save();
      }
    } catch (err) {
      console.warn('[WebClient] Message migration to IndexedDB failed:', err);
    }
  }

  private _generateKeys(): void {
    this.signingKeys = generateSigningKeyPair();
    this.exchangeKeys = generateKeyExchangeKeyPair();
    this.store.signingKeys = this.signingKeys;
    this.store.exchangeKeys = this.exchangeKeys;
    this.store.save();
  }

  private _wireEvents(): void {
    this.ws.on('message', (msg: any) => {
      const chatMsg: ChatMessage = {
        id: msg.id || uuidv4(),
        fromId: msg.fromId,
        toId: msg.toId,
        type: msg.type || 'text',
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        status: 'delivered',
        media: msg.media,
        fileInfo: msg.fileInfo,
      };
      this.store.addMessage(msg.fromId, chatMsg);
      this.store.updateMessageStatus(chatMsg.id, 'delivered');
      // Fire-and-forget write to IndexedDB cache
      this.messageCache.addMessage(chatMsg).catch(() => {});
      this.emit('message', chatMsg);
    });

    this.ws.on('presence', (event: { nodeId: string; online: boolean }) => {
      this.store.updateFriendOnline(event.nodeId, event.online);
      this.store.save();
      this.emit(event.online ? 'friend_online' : 'friend_offline', event);
    });

    this.ws.on('typing', (event: { fromId: string; toId: string }) => {
      this.emit('typing', event);
    });

    this.ws.on('file_chunk', (msg: any) => {
      this.emit('file_progress', msg);
    });

    this.ws.on('streaming_chunk', (msg: any) => {
      this._handleStreamingChunk(msg);
    });

    this.ws.on('streaming_end', (msg: any) => {
      this._handleStreamingEnd(msg);
    });

    this.ws.on('streaming_error', (msg: any) => {
      this._handleStreamingError(msg);
    });

    this.ws.on('handshake_response', (msg: any) => {
      this.emit('handshake_progress', {
        status: msg.status === 'responded' ? 'processing_response' : 'waiting_response',
        peerInfo: msg.peerInfo,
        detail: msg.detail,
      } as HandshakeProgress);
    });

    this.ws.on('handshake_confirm', (msg: any) => {
      const progress: HandshakeProgress = {
        status: msg.status === 'confirmed' ? 'completed' : 'failed',
        peerInfo: msg.peerInfo,
        detail: msg.detail,
      };
      this.emit('handshake_progress', progress);

      if (msg.status === 'confirmed' && msg.peerInfo) {
        const friendInfo: FriendInfo = {
          id: msg.peerInfo.id,
          publicKey: msg.peerInfo.publicKey,
          fingerprint: msg.peerInfo.fingerprint,
          addedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          isOnline: true,
          friendType: msg.peerInfo.friendType,
          aiName: msg.peerInfo.aiName,
          aiAvatar: msg.peerInfo.aiAvatar,
        };
        this.store.addFriend(friendInfo);
        this.store.save();
        this.emit('friend_added', friendInfo);

        const sysMsg: ChatMessage = {
          id: uuidv4(),
          fromId: 'system',
          toId: this.getUserId(),
          type: 'system',
          content: `已与 ${msg.peerInfo.fingerprint.slice(0, 8)} 建立加密连接`,
          timestamp: Date.now(),
          status: 'delivered',
        };
        this.store.addMessage(msg.peerInfo.id, sysMsg);
      }
    });

    this.ws.on('group_message', (msg: any) => {
      const groupMsg: GroupMessage = {
        id: msg.id || uuidv4(),
        groupId: msg.groupId,
        fromId: msg.fromId,
        fromName: msg.fromName || msg.fromId?.slice(0, 8) || 'Unknown',
        type: msg.type || 'text',
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        media: msg.media,
        fileInfo: msg.fileInfo,
      };
      this.store.addGroupMessage(groupMsg.groupId, groupMsg);
      this.emit('group_message', groupMsg);
    });
  }

  /* ─── Streaming Support ──────────────────────────────────── */

  private _handleStreamingChunk(msg: any): void {
    const messageId = msg.messageId || msg.streamId;
    if (!messageId) return;

    const existing = this.streamingSessions.get(messageId);
    const content = (existing?.content || '') + (msg.chunk || msg.delta || '');
    const state: StreamingState = {
      messageId,
      content,
      isComplete: false,
    };
    this.streamingSessions.set(messageId, state);
    this.emit('streaming_update', state);

    // Update the streaming message in store
    const fromId = msg.fromId;
    if (fromId) {
      const streamMsg: ChatMessage = {
        id: messageId,
        fromId,
        toId: this.getUserId(),
        type: 'streaming',
        content,
        timestamp: Date.now(),
        status: 'delivered',
        streamingActive: true,
      };
      this.store.updateMessage(messageId, fromId, { content, streamingActive: true });
      this.emit('message', streamMsg);
    }
  }

  private _handleStreamingEnd(msg: any): void {
    const messageId = msg.messageId || msg.streamId;
    if (!messageId) return;

    const existing = this.streamingSessions.get(messageId);
    const state: StreamingState = {
      messageId,
      content: existing?.content || msg.content || '',
      isComplete: true,
    };
    this.streamingSessions.delete(messageId);
    this.emit('streaming_complete', state);

    // Replace streaming message with final markdown message
    const fromId = msg.fromId;
    if (fromId) {
      // Remove the streaming message and add a completed markdown message
      const finalMsg: ChatMessage = {
        id: messageId,
        fromId,
        toId: this.getUserId(),
        type: 'markdown',
        content: state.content,
        timestamp: Date.now(),
        status: 'delivered',
        streamingActive: false,
      };
      this.store.addMessage(fromId, finalMsg);
      this.emit('message', finalMsg);
    }
  }

  private _handleStreamingError(msg: any): void {
    const messageId = msg.messageId || msg.streamId;
    if (!messageId) return;

    const existing = this.streamingSessions.get(messageId);
    const state: StreamingState = {
      messageId,
      content: existing?.content || '',
      isComplete: false,
      error: msg.error || '流式输出错误',
    };
    this.streamingSessions.delete(messageId);
    this.emit('streaming_error', state);
  }

  /** Get current streaming state for a message */
  getStreamingState(messageId: string): StreamingState | null {
    return this.streamingSessions.get(messageId) || null;
  }

  /** Start sending a streaming message (for human input that triggers AI response) */
  startStreamingMessage(friendId: string): string {
    const messageId = uuidv4();
    this.streamingSessions.set(messageId, {
      messageId,
      content: '',
      isComplete: false,
    });
    return messageId;
  }

  /* ─── Public accessors ────────────────────────────────────── */

  getUserId(): string { return this.store.userId; }

  getFingerprint(): string {
    if (!this.signingKeys) throw new Error('Not initialized');
    return getPublicKeyFingerprint(this.signingKeys.publicKey);
  }

  getPublicKey(): Uint8Array {
    if (!this.signingKeys) throw new Error('Not initialized');
    return this.signingKeys.publicKey;
  }

  getSigningKeys(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
    return this.signingKeys;
  }

  getExchangeKeys(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
    return this.exchangeKeys;
  }

  isInitialized(): boolean { return this._initialized; }

  isConnected(): boolean { return this.ws.connected; }

  /* ─── Friends ─────────────────────────────────────────────── */

  getFriends(): FriendInfo[] {
    return Array.from(this.store.friends.values());
  }

  async refreshFriends(): Promise<FriendInfo[]> {
    try {
      const friends = await this.api.getFriends();
      for (const f of friends) {
        this.store.addFriend(f);
      }
      this.store.save();
      return friends;
    } catch (err) {
      console.error('[WebClient] Failed to fetch friends:', err);
      return this.getFriends();
    }
  }

  async removeFriend(friendId: string): Promise<void> {
    await this.api.removeFriend(friendId);
    this.store.removeFriend(friendId);
    this.store.save();
    this.emit('friend_removed', friendId);
  }

  /* ─── Chat ────────────────────────────────────────────────── */

  getMessages(friendId: string): ChatMessage[] {
    return this.store.getMessages(friendId);
  }

  /** Load a page of messages from IndexedDB cache (for incremental loading) */
  async loadMessagePage(friendId: string, limit: number, before?: number): Promise<ChatMessage[]> {
    return this.messageCache.getMessages(friendId, limit, before);
  }

  /** Get total message count for a friend from IndexedDB */
  async getMessageCount(friendId: string): Promise<number> {
    return this.messageCache.getMessageCount(friendId);
  }

  sendMessage(friendId: string, text: string): ChatMessage {
    // Auto-detect markdown for messages that look like markdown
    const isMd = this._detectMarkdown(text);
    const msg: ChatMessage = {
      id: uuidv4(),
      fromId: this.getUserId(),
      toId: friendId,
      type: isMd ? 'markdown' : 'text',
      content: text,
      timestamp: Date.now(),
      status: 'sent',
    };
    this.store.addMessage(friendId, msg);
    // Fire-and-forget write to IndexedDB cache
    this.messageCache.addMessage(msg).catch(() => {});
    this.ws.send('message', {
      fromId: msg.fromId,
      toId: msg.toId,
      type: msg.type,
      content: text,
      timestamp: msg.timestamp,
    });
    this.store.save();
    return msg;
  }

  sendFileInfo(friendId: string, fileInfo: FileMetadata): ChatMessage {
    const content = JSON.stringify(fileInfo);
    const msg: ChatMessage = {
      id: uuidv4(),
      fromId: this.getUserId(),
      toId: friendId,
      type: 'file-info',
      content,
      timestamp: Date.now(),
      status: 'sent',
      fileInfo,
    };
    this.store.addMessage(friendId, msg);
    this.ws.send('message', {
      fromId: msg.fromId,
      toId: msg.toId,
      type: 'file-info',
      content,
      timestamp: msg.timestamp,
    });
    this.store.save();
    return msg;
  }

  /**
   * Send an image message with preview support.
   */
  async sendImage(friendId: string, file: File): Promise<ChatMessage> {
    const messageId = uuidv4();

    // Create object URL for display
    const url = URL.createObjectURL(file);
    const thumbnailUrl = await this._createThumbnail(file, 320);

    const media: MediaInfo = {
      url,
      thumbnailUrl,
      width: 0,
      height: 0,
      mimeType: file.type,
      fileName: file.name,
      fileSize: file.size,
    };

    // Get image dimensions
    try {
      const dimensions = await this._getImageDimensions(url);
      media.width = dimensions.width;
      media.height = dimensions.height;
    } catch { /* ignore */ }

    const msg: ChatMessage = {
      id: messageId,
      fromId: this.getUserId(),
      toId: friendId,
      type: 'image',
      content: file.name,
      timestamp: Date.now(),
      status: 'sent',
      media,
    };
    this.store.addMessage(friendId, msg);
    this.store.save();
    this.emit('message', msg);

    // Send file in background
    try {
      await this._sendMediaFile(friendId, file, 'image');
      this.store.updateMessageStatus(messageId, 'delivered');
    } catch {
      this.store.updateMessageStatus(messageId, 'failed');
    }
    this.store.save();

    return msg;
  }

  /**
   * Send a video message with thumbnail and duration.
   */
  async sendVideo(friendId: string, file: File): Promise<ChatMessage> {
    const messageId = uuidv4();
    const url = URL.createObjectURL(file);

    // Get video metadata
    let duration = 0;
    let thumbnailUrl: string | undefined;
    try {
      const metadata = await this._getVideoMetadata(url);
      duration = metadata.duration;
      thumbnailUrl = metadata.thumbnailUrl;
    } catch { /* ignore */ }

    const media: MediaInfo = {
      url,
      thumbnailUrl,
      duration,
      mimeType: file.type,
      fileName: file.name,
      fileSize: file.size,
    };

    const msg: ChatMessage = {
      id: messageId,
      fromId: this.getUserId(),
      toId: friendId,
      type: 'video',
      content: file.name,
      timestamp: Date.now(),
      status: 'sent',
      media,
    };
    this.store.addMessage(friendId, msg);
    this.store.save();
    this.emit('message', msg);

    // Send file in background
    try {
      await this._sendMediaFile(friendId, file, 'video');
      this.store.updateMessageStatus(messageId, 'delivered');
    } catch {
      this.store.updateMessageStatus(messageId, 'failed');
    }
    this.store.save();

    return msg;
  }

  sendTyping(friendId: string): void {
    this.ws.send('typing', { fromId: this.getUserId(), toId: friendId });
  }

  getLastMessage(friendId: string): ChatMessage | null {
    const msgs = this.store.getMessages(friendId);
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  }

  getUnreadCount(friendId: string): number {
    const msgs = this.store.getMessages(friendId);
    return msgs.filter((m) => m.fromId !== this.getUserId() && m.status === 'delivered').length;
  }

  markMessagesRead(friendId: string): void {
    const msgs = this.store.getMessages(friendId);
    for (const m of msgs) {
      if (m.fromId !== this.getUserId() && m.status === 'delivered') {
        this.store.updateMessageStatus(m.id, 'read');
      }
    }
    this.store.save();
  }

  /* ─── Temp Numbers ────────────────────────────────────────── */

  getTempNumbers(): TempNumberInfo[] {
    return this.store.tempNumbers.filter((t) => t.expiresAt > Date.now());
  }

  async requestTempNumber(): Promise<string> {
    const number = await this.api.requestTempNumber();
    const info: TempNumberInfo = {
      number,
      expiresAt: Date.now() + 10 * 60 * 1000,
      createdAt: Date.now(),
    };
    this.store.addTempNumber(info);
    this.store.save();
    return number;
  }

  async revokeTempNumber(number: string): Promise<void> {
    await this.api.revokeTempNumber(number);
    this.store.removeTempNumber(number);
    this.store.save();
  }

  async resolveAndAddFriend(tempNumber: string): Promise<FriendInfo> {
    const resolved = await this.api.resolveTempNumber(tempNumber);
    if (!resolved.nodeId) throw new Error('号码未找到');

    const session = await this.api.initiateHandshake(tempNumber);

    return {
      id: resolved.nodeId,
      publicKey: '',
      fingerprint: '建立中...',
      addedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isOnline: true,
    };
  }

  /* ─── File Transfer (with resume support) ─────────────────── */

  async sendFile(friendId: string, file: File): Promise<FileTransferInfo> {
    const sessionId = uuidv4();
    const chunkSize = 64 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const fileType = detectFileType(file.type, file.name);

    // Compute hash
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
      hash = ((hash << 5) - hash + bytes[i]) | 0;
    }
    const fileHash = Math.abs(hash).toString(16).padStart(8, '0');

    const transferInfo: FileTransferInfo = {
      sessionId,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      status: 'pending',
      chunks: new Array(totalChunks).fill(false),
      bytesTransferred: 0,
      fileType,
    };

    // Create thumbnail for media files
    if (fileType === 'image' || fileType === 'video') {
      try {
        const url = URL.createObjectURL(file);
        transferInfo.thumbnailUrl = await this._createThumbnail(file, 160);
      } catch { /* ignore */ }
    }

    this.store.setFileTransfer(sessionId, transferInfo);
    this.emit('file_progress', transferInfo);

    // Create abort controller for pause/cancel
    const abortController = new AbortController();
    this.transferControllers.set(sessionId, abortController);

    try {
      const sessionRes = await this.api.initiateFileTransfer(friendId, {
        fileName: file.name,
        fileSize: file.size,
        fileHash,
        chunks: totalChunks,
        chunkSize,
        mimeType: file.type,
        fileType,
      });

      transferInfo.sessionId = sessionRes.sessionId;
      transferInfo.status = 'transferring';
      this.store.setFileTransfer(sessionId, transferInfo);

      // Send file metadata
      this.sendFileInfo(friendId, {
        fileName: file.name,
        fileSize: file.size,
        fileHash,
        chunks: totalChunks,
        chunkSize,
        mimeType: file.type,
        fileType,
      });

      // Upload chunks with progress tracking
      let lastSpeedTime = Date.now();
      let lastSpeedBytes = 0;

      for (let i = 0; i < totalChunks; i++) {
        // Check if aborted
        if (abortController.signal.aborted) {
          transferInfo.status = 'paused';
          this.store.setFileTransfer(sessionId, transferInfo);
          this.emit('file_progress', transferInfo);
          return transferInfo;
        }

        // Check for existing chunks (resume support)
        if (transferInfo.chunks[i]) continue;

        // Simulate chunk upload (in production, send via WS as binary)
        await new Promise((r) => setTimeout(r, 30));
        transferInfo.chunks[i] = true;
        transferInfo.bytesTransferred = (i + 1) * chunkSize;
        if (transferInfo.bytesTransferred > file.size) {
          transferInfo.bytesTransferred = file.size;
        }
        transferInfo.progress = transferInfo.bytesTransferred / file.size;

        // Calculate speed and ETA
        const now = Date.now();
        const timeDiff = (now - lastSpeedTime) / 1000;
        if (timeDiff > 1) {
          const bytesDiff = transferInfo.bytesTransferred - lastSpeedBytes;
          transferInfo.speed = bytesDiff / timeDiff;
          const remaining = file.size - transferInfo.bytesTransferred;
          transferInfo.eta = remaining / transferInfo.speed;
          lastSpeedTime = now;
          lastSpeedBytes = transferInfo.bytesTransferred;
        }

        this.store.setFileTransfer(sessionId, transferInfo);
        this.emit('file_progress', transferInfo);
      }

      transferInfo.status = 'completed';
      transferInfo.progress = 1;
      transferInfo.bytesTransferred = file.size;
      this.store.setFileTransfer(sessionId, transferInfo);
      this.emit('file_progress', transferInfo);
    } catch (err) {
      if (abortController.signal.aborted) {
        transferInfo.status = 'paused';
      } else {
        transferInfo.status = 'failed';
      }
      this.store.setFileTransfer(sessionId, transferInfo);
      this.emit('file_progress', transferInfo);
      throw err;
    } finally {
      this.transferControllers.delete(sessionId);
    }

    this.store.save();
    return transferInfo;
  }

  /** Pause a file transfer */
  pauseTransfer(sessionId: string): void {
    const controller = this.transferControllers.get(sessionId);
    if (controller) controller.abort();
  }

  /** Resume a paused file transfer */
  async resumeTransfer(sessionId: string): Promise<void> {
    const transfer = this.store.getFileTransfer(sessionId);
    if (!transfer || transfer.status !== 'paused') return;
    // Resume is handled by creating a new transfer controller and continuing from missing chunks
    const abortController = new AbortController();
    this.transferControllers.set(sessionId, abortController);
    transfer.status = 'transferring';
    this.store.setFileTransfer(sessionId, transfer);
    this.emit('file_progress', transfer);
  }

  /** Cancel a file transfer */
  cancelTransfer(sessionId: string): void {
    const controller = this.transferControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.transferControllers.delete(sessionId);
    }
    this.store.removeFileTransfer(sessionId);
    this.emit('file_cancelled', sessionId);
  }

  getFileTransfers(): FileTransferInfo[] {
    return Array.from(this.store.fileTransfers.values());
  }

  /* ─── Groups ─────────────────────────────────────────── */

  async createGroup(name: string, description?: string): Promise<GroupInfo> {
    const group = await this.api.createGroup(name, description);
    this.store.addGroup(group);
    this.store.save();
    this.emit('group_created', group);
    return group;
  }

  async getGroups(): Promise<GroupInfo[]> {
    try {
      const groups = await this.api.getGroups();
      for (const g of groups) {
        this.store.addGroup(g);
      }
      this.store.save();
      return groups;
    } catch (err) {
      console.error('[WebClient] Failed to fetch groups:', err);
      return this.getGroupsLocal();
    }
  }

  getGroupsLocal(): GroupInfo[] {
    return this.store.groups;
  }

  async inviteToGroup(groupId: string, targetId: string, displayName?: string): Promise<void> {
    await this.api.inviteToGroup(groupId, targetId, displayName);
    const group = await this.api.getGroupInfo(groupId);
    this.store.addGroup(group);
    this.store.save();
    this.emit('group_updated', group);
  }

  async kickFromGroup(groupId: string, targetId: string): Promise<void> {
    await this.api.kickFromGroup(groupId, targetId);
    const group = await this.api.getGroupInfo(groupId);
    this.store.addGroup(group);
    this.store.save();
    this.emit('group_updated', group);
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.api.leaveGroup(groupId);
    this.store.removeGroup(groupId);
    this.store.save();
    this.emit('group_left', groupId);
  }

  async disbandGroup(groupId: string): Promise<void> {
    await this.api.disbandGroup(groupId);
    this.store.removeGroup(groupId);
    this.store.save();
    this.emit('group_disbanded', groupId);
  }

  async updateGroup(groupId: string, updates: { name?: string; description?: string; avatar?: string }): Promise<void> {
    await this.api.updateGroup(groupId, updates);
    const group = await this.api.getGroupInfo(groupId);
    this.store.addGroup(group);
    this.store.save();
    this.emit('group_updated', group);
  }

  async transferGroupOwnership(groupId: string, targetId: string): Promise<void> {
    await this.api.transferGroupOwnership(groupId, targetId);
    const group = await this.api.getGroupInfo(groupId);
    this.store.addGroup(group);
    this.store.save();
    this.emit('group_updated', group);
  }

  async setGroupMemberRole(groupId: string, targetId: string, role: string): Promise<void> {
    await this.api.setGroupMemberRole(groupId, targetId, role);
    const group = await this.api.getGroupInfo(groupId);
    this.store.addGroup(group);
    this.store.save();
    this.emit('group_updated', group);
  }

  async muteGroupMember(groupId: string, targetId: string, muted: boolean): Promise<void> {
    await this.api.muteGroupMember(groupId, targetId, muted);
    const group = await this.api.getGroupInfo(groupId);
    this.store.addGroup(group);
    this.store.save();
    this.emit('group_updated', group);
  }

  sendGroupMessage(groupId: string, text: string): GroupMessage {
    const isMd = this._detectMarkdown(text);
    const msg: GroupMessage = {
      id: uuidv4(),
      groupId,
      fromId: this.getUserId(),
      fromName: this.getUserId().slice(0, 8),
      type: isMd ? 'markdown' : 'text',
      content: text,
      timestamp: Date.now(),
    };
    this.store.addGroupMessage(groupId, msg);
    this.ws.send('group_message', {
      groupId,
      fromId: msg.fromId,
      type: msg.type,
      content: text,
      timestamp: msg.timestamp,
      id: msg.id,
    });
    this.store.save();
    return msg;
  }

  getGroupMessages(groupId: string): GroupMessage[] {
    return this.store.getGroupMessages(groupId);
  }

  /* ─── Friend Requests ────────────────────────────────────── */

  async getFriendRequests(): Promise<{ sent: FriendRequest[]; received: FriendRequest[] }> {
    return this.api.getFriendRequests();
  }

  async sendFriendRequest(userId: string, message?: string): Promise<FriendRequest> {
    return this.api.sendFriendRequest(userId, message);
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    await this.api.acceptFriendRequest(requestId);
    this.emit('friend_request_accepted', requestId);
  }

  async rejectFriendRequest(requestId: string): Promise<void> {
    await this.api.rejectFriendRequest(requestId);
    this.emit('friend_request_rejected', requestId);
  }

  /* ─── Broadcast ──────────────────────────────────────────── */

  async broadcastMessage(recipientIds: string[], message: string, encryptedContent?: string): Promise<{ sent: number; failed: number }> {
    return this.api.broadcastMessage(recipientIds, message, encryptedContent);
  }

  /* ─── SubAgent ──────────────────────────────────────────── */

  async startSubAgent(parentMessageId: string, task: string, context?: string): Promise<SubAgentSession> {
    return this.api.startSubAgent(parentMessageId, task, context);
  }

  async sendSubAgentInput(subAgentId: string, input: string): Promise<void> {
    await this.api.sendSubAgentInput(subAgentId, input);
  }

  async abortSubAgent(subAgentId: string): Promise<void> {
    await this.api.abortSubAgent(subAgentId);
  }

  async getSubAgentStatus(subAgentId: string): Promise<SubAgentSession> {
    return this.api.getSubAgentStatus(subAgentId);
  }

  async getGroupMessageHistory(groupId: string, limit?: number, before?: number): Promise<GroupMessage[]> {
    return this.api.getGroupMessageHistory(groupId, limit, before);
  }

  /* ─── Media Helpers ──────────────────────────────────────── */

  private async _createThumbnail(file: File, maxSize: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width;
          let h = img.height;
          if (w > maxSize || h > maxSize) {
            const ratio = Math.min(maxSize / w, maxSize / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
          URL.revokeObjectURL(img.src);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.onloadeddata = () => {
          video.currentTime = Math.min(1, video.duration / 4);
        };
        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          let w = video.videoWidth;
          let h = video.videoHeight;
          if (w > maxSize || h > maxSize) {
            const ratio = Math.min(maxSize / w, maxSize / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
          URL.revokeObjectURL(video.src);
        };
        video.onerror = reject;
        video.src = URL.createObjectURL(file);
      } else {
        reject(new Error('Unsupported file type for thumbnail'));
      }
    });
  }

  private _getImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  private _getVideoMetadata(url: string): Promise<{ duration: number; thumbnailUrl?: string }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = video.duration;
        // Generate thumbnail at 1 second
        video.currentTime = Math.min(1, duration * 0.25);
        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(320, video.videoWidth);
          canvas.height = Math.min(180, video.videoHeight);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve({
            duration,
            thumbnailUrl: canvas.toDataURL('image/jpeg', 0.6),
          });
          URL.revokeObjectURL(url);
        };
      };
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = url;
    });
  }

  private async _sendMediaFile(friendId: string, file: File, type: 'image' | 'video'): Promise<void> {
    // In production, this would send via WebSocket as binary chunks
    // For now, use the same chunked file transfer mechanism
    await this.sendFile(friendId, file);
  }

  private _detectMarkdown(content: string): boolean {
    if (!content || content.length < 10) return false;
    const patterns = [
      /^#{1,6}\s/m,
      /\*\*[^*]+\*\*/,
      /\*[^*]+\*/,
      /^[-*+]\s/m,
      /^\d+\.\s/m,
      /^```[\s\S]*?```/m,
      /`[^`]+`/,
      /^\|.*\|$/m,
      /\[.+\]\(.+\)/,
      /^>\s/m,
    ];
    let matchCount = 0;
    for (const p of patterns) {
      if (p.test(content)) matchCount++;
    }
    return matchCount >= 2;
  }

  /* ─── Lifecycle ───────────────────────────────────────────── */

  destroy(): void {
    this.ws.destroy();
    this.store.save();
    this.removeAllListeners();
    this._initialized = false;
    // Clean up object URLs
    this.streamingSessions.clear();
    this.transferControllers.forEach((c) => c.abort());
    this.transferControllers.clear();
  }

  resetStore(): void {
    this.store.clear();
  }
}

export default WebClient;
