/**
 * REST API client for the Aicq server.
 *
 * Mirrors every endpoint exposed by the server's `/api/v1/*` routes.
 */

import type { FriendInfo } from '../types.js';

/** Server-side file transfer session (returned by the API). */
export interface FileTransferSession {
  sessionId: string;
  status: string;
}

export class APIClient {
  private baseUrl: string;
  private nodeId: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** Set the authenticated node ID after initialisation. */
  setNodeId(id: string): void {
    this.nodeId = id;
  }

  /* ──────────────── Helpers ──────────────── */

  private url(path: string): string {
    return `${this.baseUrl}/api/v1${path}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(this.url(path), init);
    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errMsg =
        (data?.error as string) ?? `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errMsg);
    }

    return data as T;
  }

  /* ──────────────── Node ──────────────── */

  /** Register (or re-register) this node with its public key. */
  async register(userId: string, publicKey: Uint8Array): Promise<void> {
    const pubBase64 = Buffer.from(publicKey).toString('base64');
    await this.request('POST', '/node/register', {
      id: userId,
      publicKey: pubBase64,
    });
  }

  /* ──────────────── Temp numbers ──────────────── */

  /** Request a 6-digit temporary discovery number. */
  async requestTempNumber(): Promise<string> {
    if (!this.nodeId) throw new Error('Node ID not set');
    const res = await this.request<{ number: string }>(
      'POST',
      '/temp-number/request',
      { nodeId: this.nodeId },
    );
    return res.number;
  }

  /** Resolve a temporary number to its owner node. */
  async resolveTempNumber(
    number: string,
  ): Promise<{ nodeId: string; expiresAt: number }> {
    const res = await this.request<{ nodeId: string; expiresAt: number }>(
      'GET',
      `/temp-number/${encodeURIComponent(number)}`,
    );
    return res;
  }

  /** Revoke a temporary number. */
  async revokeTempNumber(number: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('DELETE', `/temp-number/${encodeURIComponent(number)}`, {
      nodeId: this.nodeId,
    });
  }

  /* ──────────────── Handshake ──────────────── */

  /** Initiate a handshake targeting a temporary number. */
  async initiateHandshake(
    targetTempNumber: string,
  ): Promise<{
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

  /** Submit the encrypted handshake response data. */
  async submitHandshakeResponse(
    sessionId: string,
    data: Buffer,
  ): Promise<void> {
    await this.request('POST', '/handshake/respond', {
      sessionId,
      responseData: data.toString('base64'),
    });
  }

  /** Submit the encrypted handshake confirm data. */
  async submitHandshakeConfirm(
    sessionId: string,
    data: Buffer,
  ): Promise<void> {
    await this.request('POST', '/handshake/confirm', {
      sessionId,
      confirmData: data.toString('base64'),
    });
  }

  /* ──────────────── Friends ──────────────── */

  /** List all friends for the current node. */
  async getFriends(): Promise<FriendInfo[]> {
    if (!this.nodeId) throw new Error('Node ID not set');
    const res = await this.request<{ friends: FriendInfo[] }>(
      'GET',
      `/friends?nodeId=${encodeURIComponent(this.nodeId)}`,
    );
    return res.friends;
  }

  /** Remove a friend. */
  async removeFriend(friendId: string): Promise<void> {
    if (!this.nodeId) throw new Error('Node ID not set');
    await this.request('DELETE', `/friends/${encodeURIComponent(friendId)}`, {
      nodeId: this.nodeId,
    });
  }

  /* ──────────────── File transfer ──────────────── */

  /** Create a new file transfer session on the server. */
  async initiateFileTransfer(
    receiverId: string,
    fileInfo: {
      fileName: string;
      fileSize: number;
      fileHash: string;
      chunks: number;
      chunkSize: number;
    },
  ): Promise<FileTransferSession> {
    if (!this.nodeId) throw new Error('Node ID not set');
    return this.request<FileTransferSession>('POST', '/file/initiate', {
      senderId: this.nodeId,
      receiverId,
      fileInfo,
    });
  }

  /** Query which chunks the receiver is still missing (for resume). */
  async getFileMissingChunks(sessionId: string): Promise<number[]> {
    const res = await this.request<{ missingChunks: number[] }>(
      'GET',
      `/file/${encodeURIComponent(sessionId)}/missing`,
    );
    return res.missingChunks;
  }

  /** Report that a chunk has been received. */
  async reportChunk(sessionId: string, chunkIndex: number): Promise<void> {
    await this.request(
      'POST',
      `/file/${encodeURIComponent(sessionId)}/chunk`,
      { chunkIndex },
    );
  }

  /** Get full file transfer session info. */
  async getFileTransferSession(
    sessionId: string,
  ): Promise<{
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
  }> {
    return this.request('GET', `/file/${encodeURIComponent(sessionId)}`);
  }
}
