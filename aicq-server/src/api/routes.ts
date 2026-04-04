import { Router, Request, Response } from 'express';
import { getOrCreateNode, store } from '../db/memoryStore';
import * as tempNumberService from '../services/tempNumberService';
import * as handshakeService from '../services/handshakeService';
import * as fileTransferService from '../services/fileTransferService';
import { relaySignal, sendDirectMessage, getOnlineNodeIds } from '../services/p2pDiscoveryService';
import {
  generalLimiter,
  tempNumberLimiter,
  handshakeLimiter,
} from '../middleware/rateLimit';
import { authenticateJWT } from '../middleware/auth';
import { config } from '../config';

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
router.post('/temp-number/request', authenticateJWT, tempNumberLimiter, (req: Request, res: Response) => {
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
    const targetNode = store.nodes.get(record.nodeId);
    res.json({
      nodeId: record.nodeId,
      publicKey: targetNode?.publicKey || '',
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
router.delete('/temp-number/:number', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
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
router.post('/handshake/initiate', authenticateJWT, handshakeLimiter, (req: Request, res: Response) => {
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
router.post('/handshake/respond', authenticateJWT, handshakeLimiter, (req: Request, res: Response) => {
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
router.post('/handshake/confirm', authenticateJWT, handshakeLimiter, (req: Request, res: Response) => {
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
router.post('/broadcast', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
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
router.post('/file/initiate', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
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
router.get('/file/:sessionId', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
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
router.get('/file/:sessionId/missing', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const missing = fileTransferService.getMissingChunks(req.params.sessionId);
    res.json({ missingChunks: missing, count: missing.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Task Plan Push ──────────────────────────────────────────────

/**
 * POST /api/v1/task-plan/push
 * Push task plan updates (task_plan_update / task_plan_delete) to connected clients.
 * Used by StableClaw's aicq-chat plugin to forward task_plan tool results to the web UI.
 *
 * Body: {
 *   senderId: string,          // The AI agent's node ID on the aicq server
 *   messageType: 'task_plan_update' | 'task_plan_delete',
 *   payload: object,           // { planId, title, steps, friendId?, ... }
 *   recipientIds?: string[],   // Optional: specific recipient node IDs
 * }
 */
router.post('/task-plan/push', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { senderId, messageType, payload, recipientIds } = req.body;

    if (!senderId || !messageType || !payload) {
      res.status(400).json({ error: '缺少必填字段: senderId, messageType, payload' });
      return;
    }

    if (!['task_plan_update', 'task_plan_delete'].includes(messageType)) {
      res.status(400).json({ error: '无效的 messageType，支持: task_plan_update, task_plan_delete' });
      return;
    }

    // Determine target recipients
    let targets: string[] = [];

    if (Array.isArray(recipientIds) && recipientIds.length > 0) {
      // Use explicitly specified recipients
      targets = recipientIds;
    } else {
      // Fall back to all online friends of the sender
      const senderNode = store.nodes.get(senderId);
      if (senderNode && senderNode.friends.size > 0) {
        targets = Array.from(senderNode.friends);
      } else {
        // No friends registered — skip delivery (prevent data leakage)
        targets = [];
      }
    }

    let sent = 0;
    let failed = 0;

    const message = {
      type: messageType,
      fromId: senderId,
      data: payload,
      timestamp: Date.now(),
    };

    for (const targetId of targets) {
      const delivered = sendDirectMessage(targetId, message);
      if (delivered) {
        sent++;
      } else {
        failed++;
      }
    }

    res.json({ sent, failed, messageType });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sub-Agent Progress Push ─────────────────────────────────────

/**
 * POST /api/v1/subagent-progress/push
 * Push sub-agent progress events (subagent_chunk / subagent_complete) to connected clients.
 * Used by StableClaw's aicq-chat plugin to forward sub-agent lifecycle events to the web UI.
 *
 * Body: {
 *   senderId: string,          // The AI agent's node ID on the aicq server
 *   runId: string,             // Sub-agent run identifier
 *   phase: string,             // Progress phase (spawned/started/tool_call/tool_result/thinking/text/error/completed/killed/timeout)
 *   message: string,           // Human-readable progress message
 *   payload: object,           // Full event payload forwarded to WebSocket clients
 *   recipientIds?: string[],   // Optional: specific recipient node IDs
 * }
 */
router.post('/subagent-progress/push', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { senderId, runId, phase, message, payload, recipientIds } = req.body;

    if (!senderId || !runId || !phase) {
      res.status(400).json({ error: '缺少必填字段: senderId, runId, phase' });
      return;
    }

    const terminalPhases = ['completed', 'killed', 'timeout'];
    const messageType = terminalPhases.includes(phase)
      ? 'subagent_complete'
      : 'subagent_chunk';

    // Determine target recipients
    let targets: string[] = [];

    if (Array.isArray(recipientIds) && recipientIds.length > 0) {
      targets = recipientIds;
    } else {
      const senderNode = store.nodes.get(senderId);
      if (senderNode && senderNode.friends.size > 0) {
        targets = Array.from(senderNode.friends);
      } else {
        // No friends registered — skip delivery (prevent data leakage)
        targets = [];
      }
    }

    let sent = 0;
    let failed = 0;

    const wsMessage = {
      type: messageType,
      fromId: senderId,
      data: {
        runId,
        phase,
        message,
        ...payload,
      },
      timestamp: Date.now(),
    };

    for (const targetId of targets) {
      const delivered = sendDirectMessage(targetId, wsMessage);
      if (delivered) {
        sent++;
      } else {
        failed++;
      }
    }

    res.json({ sent, failed, messageType, runId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent Execution Push ────────────────────────────────────

/**
 * POST /api/v1/agent-execution/push
 * Push agent execution state events (start/end) to connected clients.
 * Used by StableClaw's aicq-chat plugin to signal when the agent is actively processing.
 * The frontend uses this to queue user messages and show a stop button.
 *
 * Body: {
 *   senderId: string,
 *   messageType: 'agent_execution_start' | 'agent_execution_end',
 *   payload: { friendId, phase, sessionKey, runId, gatewayUrl, timestamp },
 *   recipientIds?: string[]
 * }
 */
router.post('/agent-execution/push', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { senderId, messageType, payload, recipientIds } = req.body;

    if (!senderId || !messageType || !payload) {
      res.status(400).json({ error: '缺少必填字段: senderId, messageType, payload' });
      return;
    }

    if (!['agent_execution_start', 'agent_execution_end'].includes(messageType)) {
      res.status(400).json({ error: '无效的 messageType，支持: agent_execution_start, agent_execution_end' });
      return;
    }

    // Store gateway URL from the plugin push for abort proxying
    if (payload.gatewayUrl) {
      const senderNode = store.nodes.get(senderId);
      if (senderNode) {
        senderNode.gatewayUrl = payload.gatewayUrl;
      }
    }

    // Determine target recipients
    let targets: string[] = [];

    if (Array.isArray(recipientIds) && recipientIds.length > 0) {
      targets = recipientIds;
    } else {
      const senderNode = store.nodes.get(senderId);
      if (senderNode && senderNode.friends.size > 0) {
        targets = Array.from(senderNode.friends);
      } else {
        // No friends registered — skip delivery (prevent data leakage)
        targets = [];
      }
    }

    let sent = 0;
    let failed = 0;

    const message = {
      type: messageType,
      fromId: senderId,
      data: payload,
      timestamp: Date.now(),
    };

    for (const targetId of targets) {
      const delivered = sendDirectMessage(targetId, message);
      if (delivered) {
        sent++;
      } else {
        failed++;
      }
    }

    res.json({ sent, failed, messageType });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent Execution Abort ──────────────────────────────────

/**
 * Validate gateway URL to prevent SSRF
 */
function isValidGatewayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Block private/internal IPs
    const hostname = parsed.hostname;
    // Block localhost/loopback unless explicitly allowed via ALLOW_LOCALHOST env var
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' ||
        hostname === '0.0.0.0' || hostname === '[::1]') {
      return config.allowLocalhost;
    }
    // Block private IP ranges
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)) return false;
    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname.endsWith('.internal')) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/v1/agent-execution/abort
 * Proxy abort request from the aicq frontend to the StableClaw gateway.
 * Terminates the current agent execution run.
 *
 * Body: {
 *   requesterId: string,       // The user's node ID (for auth)
 *   agentId: string,           // The AI agent's node ID
 *   sessionKey?: string,       // Optional: specific session to abort
 *   runId?: string             // Optional: specific run to abort
 * }
 */
router.post('/agent-execution/abort', authenticateJWT, generalLimiter, async (req: Request, res: Response) => {
  try {
    const { requesterId, agentId, sessionKey, runId } = req.body;

    if (!requesterId || !agentId) {
      res.status(400).json({ error: '缺少必填字段: requesterId, agentId' });
      return;
    }

    // Verify requester and agent are friends
    const agentNode = store.nodes.get(agentId);
    if (!agentNode) {
      res.status(404).json({ error: 'Agent 不在线' });
      return;
    }

    const requesterNode = store.nodes.get(requesterId);
    if (!requesterNode) {
      res.status(404).json({ error: '请求者不存在' });
      return;
    }

    if (!agentNode.friends.has(requesterId) && !requesterNode.friends.has(agentId)) {
      res.status(403).json({ error: '无权中止此 Agent' });
      return;
    }

    // Get gateway URL from stored agent metadata
    const gatewayUrl = agentNode.gatewayUrl || '';

    // Validate gateway URL to prevent SSRF
    if (!isValidGatewayUrl(gatewayUrl)) {
      res.status(400).json({ error: '无效的 Gateway URL' });
      return;
    }

    try {
      // Try the gateway's session kill endpoint
      if (sessionKey) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const killResp = await fetch(`${gatewayUrl}/sessions/${encodeURIComponent(sessionKey)}/kill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-openclaw-requester-session-key': sessionKey },
          body: JSON.stringify({ reason: 'user_abort' }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (killResp.ok) {
          const killResult = await killResp.json();

          // Notify the frontend that execution was aborted
          const abortMessage = {
            type: 'agent_execution_end',
            fromId: agentId,
            data: {
              friendId: agentId,
              phase: 'cancelled',
              reason: 'user_abort',
              sessionKey,
              runId,
              timestamp: Date.now(),
            },
            timestamp: Date.now(),
          };

          // Send abort notification to requester
          sendDirectMessage(requesterId, abortMessage);

          res.json({ aborted: (killResult as any).killed ?? true, gatewayUrl });
          return;
        }
      }

      // Fallback: try gateway chat.abort RPC
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 5000);

      const abortResp = await fetch(`${gatewayUrl}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `abort-${Date.now()}`,
          method: 'chat.abort',
          params: { sessionKey, runId },
        }),
        signal: controller2.signal,
      });
      clearTimeout(timeout2);

      if (abortResp.ok || abortResp.status === 200) {
        // Notify frontend
        const abortMessage = {
          type: 'agent_execution_end',
          fromId: agentId,
          data: {
            friendId: agentId,
            phase: 'cancelled',
            reason: 'user_abort',
            sessionKey,
            runId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };
        sendDirectMessage(requesterId, abortMessage);

        res.json({ aborted: true, gatewayUrl });
      } else {
        res.status(502).json({ error: '无法连接到 Agent Gateway', gatewayUrl });
      }
    } catch (fetchErr: any) {
      res.status(502).json({ error: 'Agent Gateway 连接失败: ' + (fetchErr.message || String(fetchErr)) });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
