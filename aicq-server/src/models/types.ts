export enum HandshakeStatus {
  Initiated = 'initiated',
  Responded = 'responded',
  Confirmed = 'confirmed',
  Failed = 'failed',
}

export interface NodeRecord {
  id: string;
  publicKey: string;
  lastSeen: number;
  socketId: string | null;
  friendCount: number;
  friends: Set<string>;
  gatewayUrl?: string;
}

export interface TempNumberRecord {
  number: string;
  nodeId: string;
  expiresAt: number;
  createdAt: number;
}

export interface HandshakeSession {
  id: string;
  requesterId: string;
  targetNodeId: string;
  status: HandshakeStatus;
  responseData: Buffer | null;
  confirmData: Buffer | null;
  createdAt: number;
  expiresAt: number;
}

export interface FileTransferRecord {
  id: string;
  senderId: string;
  receiverId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  totalChunks: number;
  chunkSize: number;
  chunksReceived: boolean[];
  createdAt: number;
  completedAt: number | null;
  cancelledAt: number | null;
}

export interface PendingRequest {
  fromNodeId: string;
  tempNumber: string;
  sessionId: string;
  createdAt: number;
}

// ─── Account System ─────────────────────────────────────────────
export type AccountType = 'human' | 'ai';

/** Friend permission levels */
export type FriendPermission = 'chat' | 'exec';

/**
 * Friend permissions map: key = friend accountId,
 * value = array of permissions granted to that friend.
 *
 * - 'chat': friend can send/receive messages (default, always granted)
 * - 'exec': friend can execute tools/actions that affect this account
 */
export type FriendPermissionsMap = Record<string, FriendPermission[]>;

export interface Account {
  id: string;
  type: AccountType;

  // Human account fields
  email?: string;
  phone?: string;
  passwordHash?: string;   // bcrypt hash
  displayName?: string;

  // AI agent fields
  agentName?: string;
  fingerprint?: string;    // public key fingerprint

  // Common
  publicKey: string;        // Ed25519 public key for E2EE (base64)
  createdAt: number;
  lastLoginAt: number;
  status: 'active' | 'disabled' | 'suspended';

  // Friends and permissions
  friends: string[];        // friend account IDs
  maxFriends: number;

  // Per-friend permissions: what each friend is allowed to do
  friendPermissions: FriendPermissionsMap;

  // AI-specific: mutual visit permissions
  visitPermissions: string[]; // account IDs this agent allows to visit
}

export interface VerificationCode {
  id: string;
  target: string;           // email or phone number
  code: string;
  type: 'email' | 'phone';
  purpose: 'register' | 'login' | 'reset_password';
  attempts: number;
  maxAttempts: number;
  expiresAt: number;
  createdAt: number;
  verifiedAt: number | null;
}

export interface Session {
  id: string;
  accountId: string;
  token: string;
  refreshToken: string;
  deviceInfo?: string;
  createdAt: number;
  expiresAt: number;
}

/** DTOs for API requests/responses */

export interface SendCodeRequest {
  target: string;     // email or phone
  type: 'email' | 'phone';
  purpose: 'register' | 'login' | 'reset_password';
}

export interface RegisterRequest {
  target: string;     // email or phone
  type: 'email' | 'phone';
  code: string;
  password: string;
  displayName?: string;
  publicKey: string;  // Ed25519 public key (base64)
}

export interface LoginRequest {
  target: string;
  type: 'email' | 'phone';
  password?: string;   // for email login
  code?: string;        // for phone login
}

export interface LoginAgentRequest {
  publicKey: string;    // Ed25519 public key (base64)
  agentName?: string;
  signature: string;    // signature of server challenge
  challenge: string;    // challenge from server
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RegisterNodeRequest {
  id: string;
  publicKey: string;
  socketId?: string;
}

export interface RequestTempNumberRequest {
  nodeId: string;
}

export interface InitiateHandshakeRequest {
  requesterId: string;
  targetTempNumber: string;
}

export interface SubmitHandshakeResponseRequest {
  sessionId: string;
  responseData: string; // base64-encoded
}

export interface ConfirmHandshakeRequest {
  sessionId: string;
  confirmData: string; // base64-encoded
}

export interface InitiateFileTransferRequest {
  senderId: string;
  receiverId: string;
  fileInfo: {
    fileName: string;
    fileSize: number;
    fileHash: string;
    chunks: number;
    chunkSize: number;
  };
}

export interface ReportChunkProgressRequest {
  chunkIndex: number;
}

// ─── Group System ─────────────────────────────────────────────

export interface GroupMessage {
  id: string;
  groupId: string;
  fromId: string;
  senderName: string;
  type: string;
  content: string;
  media?: any;
  fileInfo?: any;
  timestamp: number;
}

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  accountId: string;
  displayName: string;
  role: GroupRole;
  joinedAt: number;
  isMuted: boolean;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  members: Map<string, GroupMember>;  // accountId -> GroupMember
  createdAt: number;
  updatedAt: number;
  maxMembers: number;
  description?: string;
  avatar?: string;
}

export interface CreateGroupRequest {
  name: string;
  ownerId: string;
  description?: string;
}

export interface InviteToGroupRequest {
  accountId: string;  // inviter's accountId
  targetId: string;   // person to invite (must be a friend or in the system)
  displayName?: string;
}

export interface KickFromGroupRequest {
  accountId: string;  // who is doing the kicking (must be owner/admin)
  targetId: string;   // who to kick
}

export interface LeaveGroupRequest {
  accountId: string;
}

export interface UpdateGroupRequest {
  accountId: string;
  name?: string;
  description?: string;
  avatar?: string;
}

export interface GroupMessagePayload {
  groupId: string;
  fromId: string;
  type: 'text' | 'markdown' | 'image' | 'video' | 'file-info' | 'system';
  content: string;
  media?: any;
  fileInfo?: any;
}

// ─── Friend Request System ─────────────────────────────────────
export interface FriendRequest {
  id: string;
  fromId: string;
  toId: string;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  /** Permissions granted by the acceptor to the requester */
  grantedPermissions?: FriendPermission[];
  createdAt: number;
  updatedAt: number;
}

// ─── Push Notifications ────────────────────────────────────────
export interface PushNotification {
  id: string;
  accountId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  messagePreview: string;
  isGroup: boolean;
  read: boolean;
  createdAt: number;
}

// ─── Sub-Agent System ──────────────────────────────────────────
export interface SubAgentSession {
  id: string;
  parentMessageId: string;
  task: string;
  context?: string;
  status: 'running' | 'completed' | 'waiting_human' | 'error';
  output: string;
  createdAt: number;
  updatedAt: number;
}
