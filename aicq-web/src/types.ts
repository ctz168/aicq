/**
 * Core type definitions for the AICQ Web UI.
 * Supports: text, markdown, image, video, file transfer, streaming output.
 */

/** Information about a friend connection. */
export interface FriendInfo {
  id: string;
  publicKey: string;
  fingerprint: string;
  addedAt: string;
  lastSeen: string;
  isOnline: boolean;
  friendType?: 'human' | 'ai';
  aiName?: string;
  aiAvatar?: string;
}

/** Chat message stored in history. */
export interface ChatMessage {
  id: string;
  fromId: string;
  toId: string;
  type: 'text' | 'markdown' | 'image' | 'video' | 'file-info' | 'system' | 'streaming';
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  /** Media metadata for image/video types */
  media?: MediaInfo;
  /** File metadata for file-info type */
  fileInfo?: FileMetadata;
  /** For streaming messages: whether the stream is still active */
  streamingActive?: boolean;
}

/** Media metadata (image or video). */
export interface MediaInfo {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number; // seconds, for video
  mimeType: string;
  fileName: string;
  fileSize: number;
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
  /** Bytes transferred so far */
  bytesTransferred: number;
  /** Transfer speed in bytes/s */
  speed?: number;
  /** Estimated remaining time in seconds */
  eta?: number;
  /** File type for display */
  fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
  /** Thumbnail URL for media files */
  thumbnailUrl?: string;
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
  mimeType?: string;
  fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
}

/** Streaming message state. */
export interface StreamingState {
  messageId: string;
  content: string;
  isComplete: boolean;
  error?: string;
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
