/**
 * Core type definitions for the AICQ Web UI.
 */

/** Information about a friend connection. */
export interface FriendInfo {
  id: string;
  publicKey: string;
  fingerprint: string;
  addedAt: string;
  lastSeen: string;
  isOnline: boolean;
}

/** Chat message stored in history. */
export interface ChatMessage {
  id: string;
  fromId: string;
  toId: string;
  type: 'text' | 'file-info' | 'system';
  content: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

/** Information about a temporary discovery number. */
export interface TempNumberInfo {
  number: string;
  expiresAt: number;
  createdAt: number;
}

/** Active file transfer information. */
export interface FileTransferInfo {
  sessionId: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'transferring' | 'paused' | 'completed' | 'failed';
  chunks: boolean[];
}

/** Handshake progress notification. */
export interface HandshakeProgress {
  status:
    | 'initiating'
    | 'waiting_response'
    | 'processing_response'
    | 'confirming'
    | 'completed'
    | 'failed'
    | 'incoming_request'
    | 'rejected';
  peerInfo?: {
    id: string;
    publicKey: string;
    fingerprint: string;
  };
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

/** Screen names for navigation. */
export type ScreenName =
  | 'login'
  | 'chatList'
  | 'chat'
  | 'friends'
  | 'tempNumber'
  | 'settings';

/** Tab names for bottom navigation. */
export type TabName = 'chatList' | 'friends' | 'tempNumber' | 'settings';

/** Unread counts per friend. */
export type UnreadCounts = Record<string, number>;

/** Typing state per friend. */
export type TypingState = Record<string, boolean>;
