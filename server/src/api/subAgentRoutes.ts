import { Router, Request, Response } from 'express';
import { generalLimiter } from '../middleware/rateLimit';
import { authenticateJWT } from '../middleware/auth';
import * as subAgentService from '../services/subAgentService';

const router = Router();

// ─── 启动子代理 ─────────────────────────────────────────────────

/**
 * POST /api/v1/subagent/start
 * 启动一个子代理会话
 */
router.post('/subagent/start', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { parentMessageId, task, context } = req.body;

    if (!parentMessageId || !task) {
      res.status(400).json({ error: '缺少必填字段: parentMessageId, task' });
      return;
    }

    const session = subAgentService.startSubAgent(parentMessageId, task, context);
    res.status(201).json({
      id: session.id,
      parentMessageId: session.parentMessageId,
      task: session.task,
      status: session.status,
      output: session.output,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 向子代理发送输入 ─────────────────────────────────────────

/**
 * POST /api/v1/subagent/:id/input
 * 向子代理发送人工输入
 */
router.post('/subagent/:id/input', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { input } = req.body;

    if (!input) {
      res.status(400).json({ error: '缺少必填字段: input' });
      return;
    }

    const session = subAgentService.sendInput(req.params.id, input);
    res.json({
      id: session.id,
      status: session.status,
      output: session.output,
      updatedAt: session.updatedAt,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 中止子代理 ────────────────────────────────────────────────

/**
 * POST /api/v1/subagent/:id/abort
 * 中止子代理会话
 */
router.post('/subagent/:id/abort', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const session = subAgentService.abortSubAgent(req.params.id);
    res.json({
      id: session.id,
      status: session.status,
      output: session.output,
      updatedAt: session.updatedAt,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 获取子代理状态 ────────────────────────────────────────────

/**
 * GET /api/v1/subagent/:id/status
 * 获取子代理会话状态
 */
router.get('/subagent/:id/status', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const session = subAgentService.getSubAgentStatus(req.params.id);
    res.json({
      id: session.id,
      parentMessageId: session.parentMessageId,
      task: session.task,
      context: session.context,
      status: session.status,
      output: session.output,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// ─── 获取消息关联的所有子代理 ─────────────────────────────────

/**
 * GET /api/v1/subagent/by-message/:parentMessageId
 * 获取某个消息关联的所有子代理会话
 */
router.get('/subagent/by-message/:parentMessageId', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const sessions = subAgentService.getSubAgentsForMessage(req.params.parentMessageId);
    res.json({
      sessions,
      count: sessions.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
