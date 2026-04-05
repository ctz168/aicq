/**
 * Core TypeScript interfaces for the AICQ plugin.
 */

import type { KeyPair } from "@aicq/crypto";

/** Plugin configuration loaded from openclaw.plugin.json configSchema + env vars. */
export interface PluginConfig {
  serverUrl: string;
  agentId: string;
  maxFriends: number;
  autoAcceptFriends: boolean;
}

/** A stored friend record. */
export interface FriendRecord {
  id: string;
  publicKey: Uint8Array;
  publicKeyFingerprint: string;
  addedAt: Date;
  lastMessageAt: Date;
  sessionKey?: Uint8Array;
  /** Permissions granted by this friend to the agent */
  permissions?: ('chat' | 'exec')[];
  /** Human-readable name for the friend */
  friendType?: 'human' | 'ai';
  aiName?: string;
  aiAvatar?: string;
}

/** An established session with a peer. */
export interface SessionState {
  peerId: string;
  sessionKey: Uint8Array;
  ephemeralSecretKey: Uint8Array;
  createdAt: Date;
  messageCount: number;
}

/** Outgoing encrypted message envelope. */
export interface MessageEnvelope {
  targetId: string;
  encryptedData: string; // base64-encoded wire-format message
  timestamp: number;
}

/** File transfer request metadata. */
export interface FileTransferRequest {
  senderId: string;
  receiverId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  totalChunks: number;
  chunkSize: number;
}

/** In-flight handshake state (pending response or confirmation). */
export interface HandshakeState {
  sessionId: string;
  peerId: string;
  request: {
    identityPublicKey: Uint8Array;
    ephemeralPublicKey: Uint8Array;
  };
  ephemeralKeys: KeyPair;
  createdAt: Date;
  resolved?: boolean;
}

/** File chunk buffer for reassembly. */
export interface FileChunkBuffer {
  sessionId: string;
  senderId: string;
  fileName: string;
  totalChunks: number;
  receivedChunks: Map<number, Uint8Array>;
  fileHash: string;
  savePath?: string;
}

/** P2P connection abstraction. */
export interface P2PConnection {
  peerId: string;
  connected: boolean;
  createdAt: Date;
  send(data: Buffer): boolean;
  close(): void;
}

/** File transfer session tracking. */
export interface FileTransferSession {
  sessionId: string;
  senderId: string;
  receiverId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  totalChunks: number;
  chunkSize: number;
  sentChunks: Set<number>;
  receivedChunks: Set<number>;
  status: "pending" | "transferring" | "paused" | "completed" | "cancelled";
  createdAt: Date;
}

/** Friend info returned from server. */
export interface FriendInfo {
  /** Friend node ID — server may return this as `id` or `nodeId`. */
  id?: string;
  /** Legacy field name — some server endpoints still use `nodeId`. */
  nodeId?: string;
  publicKey: string; // base64
  addedAt: string;
}

/** Pending friend request info. */
export interface PendingFriendRequest {
  requesterId: string;
  tempNumber: string;
  timestamp: Date;
}

/** Temp number record. */
export interface TempNumberRecord {
  number: string;
  expiresAt: Date;
}

/** Queued offline message for later delivery. */
export interface OfflineMessage {
  id: string;
  targetId: string;
  encryptedData: string; // base64-encoded wire-format message
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

/** Network connectivity state. */
export type ConnectionState = 'online' | 'offline' | 'reconnecting';

/** Callback for connection state changes. */
export type ConnectionStateCallback = (state: ConnectionState, previousState: ConnectionState) => void;

/** OpenClaw plugin API surface (simplified). */
export interface OpenClawAPI {
  registerChannel(name: string, handler: ChannelHandler): void;
  registerTool(name: string, handler: ToolHandler): void;
  registerHook(event: string, handler: HookHandler): void;
  registerService(name: string, service: unknown): void;
  emit(event: string, data: unknown): void;
  getLogger(name: string): Logger;
  getDataDir(): string;
}

/** Channel message handler. */
export interface ChannelHandler {
  onMessage(data: Buffer, fromId: string, metadata?: Record<string, unknown>): void;
}

/** Tool execution handler. */
export interface ToolHandler {
  handle(params: Record<string, unknown>): Promise<unknown>;
}

/** Hook handler. */
export interface HookHandler {
  execute(data: unknown, metadata?: Record<string, unknown>): Promise<unknown>;
}

/** Simple logger interface. */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
