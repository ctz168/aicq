/**
 * Core type definitions for the AICQ human client.
 */

/** Configuration options for the AICQClient. */
export interface ClientConfig {
  /** Base URL of the Aicq server (e.g. 'https://aicq.online'). */
  serverUrl: string;
  /** WebSocket URL (derived from serverUrl if not provided). */
  wsUrl?: string;
  /** Maximum number of friends allowed. */
  maxFriends: number;
  /** Local directory for persistent data storage. */
  dataDir: string;
}

/** Friend permission levels */
export type FriendPermission = 'chat' | 'exec';

/** Information about a friend connection. */
export interface FriendInfo {
  /** Unique node ID of the friend. */
  id: string;
  /** Ed25519 public key (base64-encoded for JSON serialization). */
  publicKey: string;
  /** Human-readable public-key fingerprint (32 hex chars). */
  fingerprint: string;
  /** ISO timestamp when the friend was added. */
  addedAt: string;
  /** ISO timestamp of last seen activity. */
  lastSeen: string;
  /** Whether the friend is currently online. */
  isOnline: boolean;
  /** Permissions granted by this user to the friend */
  permissions?: FriendPermission[];
  /** Type of friend: human or AI agent */
  friendType?: 'human' | 'ai';
  /** AI agent name (for AI friends) */
  aiName?: string;
  /** AI agent avatar URL */
  aiAvatar?: string;
}

/** Chat message stored in history. */
export interface ChatMessage {
  /** Unique message ID. */
  id: string;
  /** Sender node ID. */
  fromId: string;
  /** Receiver node ID. */
  toId: string;
  /** Message type. */
  type: 'text' | 'file-info' | 'system';
  /** Message content (plaintext for 'text', JSON string for 'file-info'). */
  content: string;
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  /** Delivery status. */
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

/** Information about a temporary discovery number. */
export interface TempNumberInfo {
  /** The 6-digit temporary number. */
  number: string;
  /** Expiration timestamp (Unix ms). */
  expiresAt: number;
  /** Creation timestamp (Unix ms). */
  createdAt: number;
}

/** Active file transfer information. */
export interface FileTransferInfo {
  /** Server-side session ID. */
  sessionId: string;
  /** Original file name. */
  fileName: string;
  /** File size in bytes. */
  fileSize: number;
  /** Transfer progress 0..1. */
  progress: number;
  /** Current transfer status. */
  status: 'pending' | 'transferring' | 'paused' | 'completed' | 'failed';
  /** Chunk tracking array — true means the chunk has been sent/received. */
  chunks: boolean[];
}

/** Handshake progress notification. */
export interface HandshakeProgress {
  /** Current step of the handshake. */
  status:
    | 'initiating'
    | 'waiting_response'
    | 'processing_response'
    | 'confirming'
    | 'completed'
    | 'failed'
    | 'incoming_request'
    | 'rejected';
  /** Peer info (available once known). */
  peerInfo?: {
    id: string;
    publicKey: string;
    fingerprint: string;
  };
  /** Human-readable detail. */
  detail?: string;
}

/** File metadata sent alongside a file transfer. */
export interface FileMetadata {
  fileName: string;
  fileSize: number;
  fileHash: string;
  chunks: number;
  chunkSize: number;
}

/** Progress callback for file transfers. */
export type ProgressCallback = (progress: {
  sent: number;
  total: number;
  speed: string;
}) => void;

/** Callback for connection state changes. */
export type ConnectionCallback = (connected: boolean) => void;

/** Callback for incoming data from a peer. */
export type DataCallback = (data: Buffer) => void;
