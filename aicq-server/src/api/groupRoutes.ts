import { Router, Request, Response } from 'express';
import { generalLimiter } from '../middleware/rateLimit';
import * as groupService from '../services/groupService';
import { store } from '../db/memoryStore';

const router = Router();

// ─── 创建群组 ─────────────────────────────────────────────────

/**
 * POST /api/v1/group/create
 * 创建新群组
 */
router.post('/group/create', generalLimiter, (req: Request, res: Response) => {
  try {
    const { name, ownerId, description } = req.body;

    if (!name || !ownerId) {
      res.status(400).json({ error: '缺少必填字段: name, ownerId' });
      return;
    }

    const group = groupService.createGroup(name, ownerId, description);
    res.status(201).json(groupService.serializeGroup(group));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 获取群组列表 ──────────────────────────────────────────────

/**
 * GET /api/v1/group/list?accountId=xxx
 * 获取账号所在的所有群组
 */
router.get('/group/list', generalLimiter, (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) {
      res.status(400).json({ error: '缺少查询参数: accountId' });
      return;
    }

    const groups = groupService.getGroupsForAccount(accountId);
    res.json({
      groups: groups.map(groupService.serializeGroup),
      count: groups.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 获取群组详情 ──────────────────────────────────────────────

/**
 * GET /api/v1/group/:groupId?accountId=xxx
 * 获取群组信息（需是成员）
 */
router.get('/group/:groupId', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const accountId = req.query.accountId as string;

    if (!accountId) {
      res.status(400).json({ error: '缺少查询参数: accountId' });
      return;
    }

    const group = groupService.getGroup(groupId);
    if (!group) {
      res.status(404).json({ error: '群组不存在' });
      return;
    }

    // 检查是否是成员
    if (!groupService.isMember(groupId, accountId)) {
      res.status(403).json({ error: '你不是该群成员' });
      return;
    }

    res.json(groupService.serializeGroup(group));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 邀请成员 ──────────────────────────────────────────────────

/**
 * POST /api/v1/group/:groupId/invite
 * 邀请成员加入群组
 */
router.post('/group/:groupId/invite', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { accountId, targetId, displayName } = req.body;

    if (!accountId || !targetId) {
      res.status(400).json({ error: '缺少必填字段: accountId, targetId' });
      return;
    }

    const member = groupService.inviteMember(groupId, accountId, targetId, displayName);
    res.json({ success: true, member });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 踢出成员 ──────────────────────────────────────────────────

/**
 * POST /api/v1/group/:groupId/kick
 * 踢出群成员
 */
router.post('/group/:groupId/kick', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { accountId, targetId } = req.body;

    if (!accountId || !targetId) {
      res.status(400).json({ error: '缺少必填字段: accountId, targetId' });
      return;
    }

    groupService.kickMember(groupId, accountId, targetId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 退出群组 ──────────────────────────────────────────────────

/**
 * POST /api/v1/group/:groupId/leave
 * 成员退出群组
 */
router.post('/group/:groupId/leave', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { accountId } = req.body;

    if (!accountId) {
      res.status(400).json({ error: '缺少必填字段: accountId' });
      return;
    }

    const result = groupService.leaveGroup(groupId, accountId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 解散群组 ──────────────────────────────────────────────────

/**
 * DELETE /api/v1/group/:groupId
 * 解散群组（仅群主）
 */
router.delete('/group/:groupId', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { accountId } = req.body;

    if (!accountId) {
      res.status(400).json({ error: '缺少必填字段: accountId' });
      return;
    }

    groupService.disbandGroup(groupId, accountId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 更新群组信息 ──────────────────────────────────────────────

/**
 * PUT /api/v1/group/:groupId
 * 更新群组名称/描述/头像
 */
router.put('/group/:groupId', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { accountId, name, description, avatar } = req.body;

    if (!accountId) {
      res.status(400).json({ error: '缺少必填字段: accountId' });
      return;
    }

    const updated = groupService.updateGroup(groupId, accountId, { name, description, avatar });
    res.json({ success: true, group: groupService.serializeGroup(updated) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 转让群主 ──────────────────────────────────────────────────

/**
 * POST /api/v1/group/:groupId/transfer
 * 转让群主身份
 */
router.post('/group/:groupId/transfer', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { accountId, targetId } = req.body;

    if (!accountId || !targetId) {
      res.status(400).json({ error: '缺少必填字段: accountId, targetId' });
      return;
    }

    const group = groupService.transferOwnership(groupId, accountId, targetId);
    res.json({ success: true, group: groupService.serializeGroup(group) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 设置成员角色 ──────────────────────────────────────────────

/**
 * POST /api/v1/group/:groupId/role
 * 设置群成员角色（仅群主）
 */
router.post('/group/:groupId/role', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { accountId, targetId, role } = req.body;

    if (!accountId || !targetId || !role) {
      res.status(400).json({ error: '缺少必填字段: accountId, targetId, role' });
      return;
    }

    if (!['admin', 'member'].includes(role)) {
      res.status(400).json({ error: 'role 只能是 admin 或 member' });
      return;
    }

    const member = groupService.setMemberRole(groupId, accountId, targetId, role);
    res.json({ success: true, member });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 禁言/解禁成员 ─────────────────────────────────────────────

/**
 * POST /api/v1/group/:groupId/mute
 * 禁言或解禁群成员
 */
router.post('/group/:groupId/mute', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { accountId, targetId, muted } = req.body;

    if (!accountId || !targetId || muted === undefined || muted === null) {
      res.status(400).json({ error: '缺少必填字段: accountId, targetId, muted' });
      return;
    }

    const member = groupService.muteMember(groupId, accountId, targetId, Boolean(muted));
    res.json({ success: true, member });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 群消息历史 ──────────────────────────────────────────────

/**
 * GET /api/v1/group/:groupId/messages
 * 获取群组消息历史（支持分页）
 */
router.get('/group/:groupId/messages', generalLimiter, (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const accountId = req.query.accountId as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const before = parseInt(req.query.before as string) || Date.now();

    if (!accountId) {
      res.status(400).json({ error: '缺少查询参数: accountId' });
      return;
    }

    const group = groupService.getGroup(groupId);
    if (!group) {
      res.status(404).json({ error: '群组不存在' });
      return;
    }

    // 检查是否是成员
    if (!groupService.isMember(groupId, accountId)) {
      res.status(403).json({ error: '你不是该群成员' });
      return;
    }

    const messages = store.groupMessages.get(groupId) || [];

    // 过滤：获取 before 之前的消息，倒序排列
    const filtered = messages
      .filter((m) => m.timestamp < before)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    res.json({
      messages: filtered,
      count: filtered.length,
      hasMore: messages.filter((m) => m.timestamp < filtered[filtered.length - 1]?.timestamp).length > 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
