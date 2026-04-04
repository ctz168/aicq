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
  /** Permissions granted by the current user to this friend */
  permissions?: FriendPermission[];
}

/** Friend permission levels */
export type FriendPermission = 'chat' | 'exec';

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

/** Group member information. */
export interface GroupMemberInfo {
  accountId: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
  isMuted: boolean;
  isOnline?: boolean;
}

/** Group information. */
export interface GroupInfo {
  id: string;
  name: string;
  ownerId: string;
  members: GroupMemberInfo[];
  memberCount: number;
  createdAt: number;
  updatedAt: number;
  description?: string;
  avatar?: string;
}

/** Group chat message. */
export interface GroupMessage {
  id: string;
  groupId: string;
  fromId: string;
  fromName: string;
  type: 'text' | 'markdown' | 'image' | 'video' | 'file-info' | 'system';
  content: string;
  timestamp: number;
  media?: MediaInfo;
  fileInfo?: FileMetadata;
}

/** Screen names for navigation. */
export type ScreenName =
  | 'login'
  | 'chatList'
  | 'chat'
  | 'groupList'
  | 'groupChat'
  | 'friends'
  | 'tempNumber'
  | 'settings';

/** Tab names for bottom navigation. */
export type TabName = 'chatList' | 'groupList' | 'friends' | 'tempNumber' | 'settings';

/** Friend request information. */
export interface FriendRequest {
  id: string;
  fromId: string;
  toId: string;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  /** Permissions granted when accepting the request */
  grantedPermissions?: FriendPermission[];
  createdAt: number;
  updatedAt: number;
}

/** Push notification for new messages. */
export interface PushNotification {
  id: string;
  chatId: string;
  senderName: string;
  messagePreview: string;
  timestamp: number;
  isGroup: boolean;
  isRead: boolean;
}

/** Sub-agent parallel dialog session. */
export interface SubAgentSession {
  id: string;
  parentMessageId: string;
  task: string;
  context?: string;
  status: 'running' | 'completed' | 'waiting_human' | 'error';
  output: string;
  createdAt: number;
  updatedAt: number;
  /** Current execution phase from stableclaw */
  phase?: string;
  /** Label/tag for the sub-agent (e.g. "research", "code-review") */
  label?: string;
  /** Parent agent's session key */
  parentSessionKey?: string;
  /** Sub-agent's own session key */
  sessionKey?: string;
}

/** Agent execution state tracked per AI friend. */
export interface AgentExecutionState {
  /** Whether the agent is currently processing */
  isExecuting: boolean;
  /** Current phase (started, streaming, tool_executing, thinking, completed, error, cancelled) */
  phase: string;
  /** Session key of the current run */
  sessionKey?: string;
  /** Run ID of the current execution */
  runId?: string;
  /** Gateway URL for abort requests */
  gatewayUrl?: string;
  /** Timestamp when execution started */
  startedAt?: number;
}

/** Task item for task planning progress tracking. */
export interface TaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** Task plan with a list of task items, associated with a chat session. */
export interface TaskPlan {
  id: string;
  friendId: string;
  title: string;
  tasks: TaskItem[];
  createdAt: number;
  updatedAt: number;
}

/** Unread counts per friend / group. */
export type UnreadCounts = Record<string, number>;

/** Typing state per friend. */
export type TypingState = Record<string, boolean>;
