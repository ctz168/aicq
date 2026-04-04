import { Router, Request, Response } from 'express';
import { getOrCreateNode, store } from '../db/memoryStore';
import * as tempNumberService from '../services/tempNumberService';
import * as handshakeService from '../services/handshakeService';
import * as fileTransferService from '../services/fileTransferService';
import { relaySignal } from '../services/p2pDiscoveryService';
import {
  generalLimiter,
  tempNumberLimiter,
  handshakeLimiter,
} from '../middleware/rateLimit';

const router = Router();

// ─── Node Registration ─────────────────────────────────────────────

/**
 * POST /api/v1/node/register
 * Register a node with its public key.
 */
router.post('/node/register', generalLimiter, (req: Request, res: Response) => {
  try {
    const { id, publicKey, socketId } = req.body;

    if (!id || !publicKey) {
      res.status(400).json({ error: 'Missing required fields: id, publicKey' });
      return;
    }

    const node = getOrCreateNode(id, publicKey);
    node.lastSeen = Date.now();
    if (socketId) {
      node.socketId = socketId;
    }

    res.json({
      id: node.id,
      friendCount: node.friendCount,
      registered: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Temp Number ───────────────────────────────────────────────────

/**
 * POST /api/v1/temp-number/request
 * Request a 6-digit temporary number for friend discovery.
 */
router.post('/temp-number/request', tempNumberLimiter, (req: Request, res: Response) => {
  try {
    const { nodeId } = req.body;
    if (!nodeId) {
      res.status(400).json({ error: 'Missing required field: nodeId' });
      return;
    }

    const record = tempNumberService.requestTempNumber(nodeId);
    res.json({
      number: record.number,
      expiresAt: record.expiresAt,
      ttlMs: record.expiresAt - Date.now(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/v1/temp-number/:number
 * Resolve a temp number to its owner node.
 */
router.get('/temp-number/:number', generalLimiter, (req: Request, res: Response) => {
  try {
    const record = tempNumberService.resolveTempNumber(req.params.number);
    if (!record) {
      res.status(404).json({ error: 'Temp number not found or expired' });
      return;
    }
    res.json({
      nodeId: record.nodeId,
      expiresAt: record.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/temp-number/:number
 * Revoke a temp number.
 */
router.delete('/temp-number/:number', generalLimiter, (req: Request, res: Response) => {
  try {
    const nodeId = req.body.nodeId || req.query.nodeId;
    if (!nodeId) {
      res.status(400).json({ error: 'Missing required field: nodeId' });
      return;
    }

    const revoked = tempNumberService.revokeTempNumber(nodeId as string, req.params.number);
    if (!revoked) {
      res.status(404).json({ error: 'Temp number not found or not owned by this node' });
      return;
    }
    res.json({ revoked: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Handshake ─────────────────────────────────────────────────────

/**
 * POST /api/v1/handshake/initiate
 * Start a handshake with a target temp number.
 */
router.post('/handshake/initiate', handshakeLimiter, (req: Request, res: Response) => {
  try {
    const { requesterId, targetTempNumber } = req.body;
    if (!requesterId || !targetTempNumber) {
      res.status(400).json({ error: 'Missing required fields: requesterId, targetTempNumber' });
      return;
    }

    const session = handshakeService.initiateHandshake(requesterId, targetTempNumber);
    res.json({
      sessionId: session.id,
      targetNodeId: session.targetNodeId,
      status: session.status,
      expiresAt: session.expiresAt,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/v1/handshake/respond
 * Submit encrypted response data.
 */
router.post('/handshake/respond', handshakeLimiter, (req: Request, res: Response) => {
  try {
    const { sessionId, responseData } = req.body;
    if (!sessionId || !responseData) {
      res.status(400).json({ error: 'Missing required fields: sessionId, responseData' });
      return;
    }

    const responseBuffer = Buffer.from(responseData, 'base64');
    const session = handshakeService.submitResponse(sessionId, responseBuffer);
    res.json({
      sessionId: session.id,
      status: session.status,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/v1/handshake/confirm
 * Confirm the handshake.
 */
router.post('/handshake/confirm', handshakeLimiter, (req: Request, res: Response) => {
  try {
    const { sessionId, confirmData } = req.body;
    if (!sessionId || !confirmData) {
      res.status(400).json({ error: 'Missing required fields: sessionId, confirmData' });
      return;
    }

    const confirmBuffer = Buffer.from(confirmData, 'base64');
    const session = handshakeService.submitConfirm(sessionId, confirmBuffer);
    res.json({
      sessionId: session.id,
      status: session.status,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Broadcast / Forward Message ─────────────────────────────────

/**
 * POST /api/v1/broadcast
 * 批量转发消息给多个接收者
 */
router.post('/broadcast', generalLimiter, (req: Request, res: Response) => {
  try {
    const { senderId, recipientIds, message, encryptedContent } = req.body;

    if (!senderId || !recipientIds || !message) {
      res.status(400).json({ error: '缺少必填字段: senderId, recipientIds, message' });
      return;
    }

    if (!Array.isArray(recipientIds)) {
      res.status(400).json({ error: 'recipientIds 必须是数组' });
      return;
    }

    if (recipientIds.length > 50) {
      res.status(400).json({ error: '接收者数量不能超过50个' });
      return;
    }

    if (recipientIds.length === 0) {
      res.status(400).json({ error: '接收者列表不能为空' });
      return;
    }

    // 验证发送者存在
    const senderNode = store.nodes.get(senderId);
    if (!senderNode) {
      res.status(404).json({ error: '发送者不存在' });
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const recipientId of recipientIds) {
      // 验证发送者和接收者是好友
      if (!senderNode.friends.has(recipientId)) {
        failed++;
        continue;
      }

      const relayed = relaySignal(senderId, recipientId, {
        type: 'broadcast_message',
        data: {
          message,
          encryptedContent,
          timestamp: Date.now(),
        },
      });

      if (relayed) {
        sent++;
      } else {
        failed++;
      }
    }

    res.json({ sent, failed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── File Transfer ─────────────────────────────────────────────────

/**
 * POST /api/v1/file/initiate
 * Initiate a file transfer session.
 */
router.post('/file/initiate', generalLimiter, (req: Request, res: Response) => {
  try {
    const { senderId, receiverId, fileInfo } = req.body;
    if (!senderId || !receiverId || !fileInfo) {
      res.status(400).json({ error: 'Missing required fields: senderId, receiverId, fileInfo' });
      return;
    }

    const session = fileTransferService.initiateTransfer(senderId, receiverId, fileInfo);
    res.json({
      sessionId: session.id,
      status: session.completedAt ? 'completed' : session.cancelledAt ? 'cancelled' : 'active',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/v1/file/:sessionId
 * Get file transfer session info.
 */
router.get('/file/:sessionId', generalLimiter, (req: Request, res: Response) => {
  try {
    const session = fileTransferService.getTransferSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Transfer session not found' });
      return;
    }
    res.json({
      id: session.id,
      senderId: session.senderId,
      receiverId: session.receiverId,
      fileName: session.fileName,
      fileSize: session.fileSize,
      fileHash: session.fileHash,
      totalChunks: session.totalChunks,
      chunkSize: session.chunkSize,
      chunksReceived: session.chunksReceived,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      cancelledAt: session.cancelledAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/file/:sessionId/chunk
 * Report chunk progress.
 */
router.post('/file/:sessionId/chunk', generalLimiter, (req: Request, res: Response) => {
  try {
    const { chunkIndex } = req.body;
    if (chunkIndex === undefined || chunkIndex === null) {
      res.status(400).json({ error: 'Missing required field: chunkIndex' });
      return;
    }

    fileTransferService.reportChunkProgress(req.params.sessionId, chunkIndex);
    res.json({ chunkIndex, received: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/v1/file/:sessionId/missing
 * Get missing chunks for resume after disconnection.
 */
router.get('/file/:sessionId/missing', generalLimiter, (req: Request, res: Response) => {
  try {
    const missing = fileTransferService.getMissingChunks(req.params.sessionId);
    res.json({ missingChunks: missing, count: missing.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
