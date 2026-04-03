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

export interface FileTransferSession {
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

/** DTOs for API requests/responses */

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
