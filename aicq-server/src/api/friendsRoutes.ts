import { Router, Request, Response } from 'express';
import { generalLimiter } from '../middleware/rateLimit';
import { authenticateJWT } from '../middleware/auth';
import * as friendshipService from '../services/friendshipService';
import * as friendRequestService from '../services/friendRequestService';
import type { FriendPermission } from '../models/types';

const router = Router();

// ─── 好友列表 ─────────────────────────────────────────────────

/**
 * GET /api/v1/friends
 * 获取好友列表（包含每个好友的权限信息）
 */
router.get('/', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const nodeId = req.query.nodeId as string;
    if (!nodeId) {
      res.status(400).json({ error: 'Missing query parameter: nodeId' });
      return;
    }

    const friends = friendshipService.getFriends(nodeId);
    const count = friendshipService.getFriendCount(nodeId);

    // 附带权限信息
    const friendsWithPerms = friends.map((friendId) => ({
      id: friendId,
      permissions: friendshipService.getFriendPermissions(nodeId, friendId),
    }));

    res.json({ friends: friendsWithPerms, count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 删除好友 ─────────────────────────────────────────────────

/**
 * DELETE /api/v1/friends/:friendId
 * 删除好友
 */
router.delete('/:friendId', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const nodeId = req.body.nodeId;
    if (!nodeId) {
      res.status(400).json({ error: 'Missing required field: nodeId' });
      return;
    }

    const removed = friendshipService.removeFriend(nodeId, req.params.friendId);
    if (!removed) {
      res.status(404).json({ error: 'Friendship not found' });
      return;
    }
    res.json({ removed: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 获取/更新好友权限 ─────────────────────────────────────────

/**
 * GET /api/v1/friends/:friendId/permissions
 * 获取对某个好友的授权权限
 */
router.get('/:friendId/permissions', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) {
      res.status(400).json({ error: '缺少查询参数: accountId' });
      return;
    }

    const permissions = friendshipService.getFriendPermissions(accountId, req.params.friendId);
    res.json({ friendId: req.params.friendId, permissions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/v1/friends/:friendId/permissions
 * 更新对某个好友的授权权限
 * Body: { accountId, permissions: ('chat' | 'exec')[] }
 */
router.put('/:friendId/permissions', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { accountId, permissions } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '缺少必填字段: accountId' });
      return;
    }
    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: 'permissions 必须是数组' });
      return;
    }

    // 验证权限值
    const validPerms: FriendPermission[] = ['chat', 'exec'];
    const invalidPerms = permissions.filter((p: string) => !validPerms.includes(p as FriendPermission));
    if (invalidPerms.length > 0) {
      res.status(400).json({ error: '无效的权限类型: ' + invalidPerms.join(', ') });
      return;
    }

    const success = friendshipService.setFriendPermissions(
      accountId,
      req.params.friendId,
      permissions as FriendPermission[],
    );

    if (!success) {
      res.status(400).json({ error: '更新权限失败，可能不是好友关系' });
      return;
    }

    const updatedPerms = friendshipService.getFriendPermissions(accountId, req.params.friendId);
    res.json({ success: true, friendId: req.params.friendId, permissions: updatedPerms });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 获取好友请求 ─────────────────────────────────────────────

/**
 * GET /api/v1/friends/requests
 * 获取当前账号的所有好友请求（发送的和接收的）
 */
router.get('/requests', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) {
      res.status(400).json({ error: '缺少查询参数: accountId' });
      return;
    }

    const { sent, received } = friendRequestService.getFriendRequests(accountId);
    res.json({
      sent,
      received,
      sentCount: sent.length,
      receivedCount: received.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 发送好友请求 ─────────────────────────────────────────────

/**
 * POST /api/v1/friends/requests/:userId
 * 向指定用户发送好友请求
 */
router.post('/requests/:userId', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { fromId, message } = req.body;
    const toId = req.params.userId;

    if (!fromId) {
      res.status(400).json({ error: '缺少必填字段: fromId' });
      return;
    }

    const request = friendRequestService.sendFriendRequest(fromId, toId, message);
    res.status(201).json(request);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 接受好友请求（带权限）───────────────────────────────────────

/**
 * POST /api/v1/friends/requests/:requestId/accept
 * 接受好友请求，并指定授权权限
 * Body: { accountId, permissions?: ('chat' | 'exec')[] }
 */
router.post('/requests/:requestId/accept', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { accountId, permissions } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '缺少必填字段: accountId' });
      return;
    }

    // 验证权限参数（可选）
    let perms: FriendPermission[] | undefined;
    if (permissions && Array.isArray(permissions)) {
      const validPerms: FriendPermission[] = ['chat', 'exec'];
      perms = permissions.filter((p: string) => validPerms.includes(p as FriendPermission)) as FriendPermission[];
    }

    const request = friendRequestService.acceptFriendRequest(req.params.requestId, accountId, perms);
    res.json({ success: true, request });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 拒绝好友请求 ─────────────────────────────────────────────

/**
 * POST /api/v1/friends/requests/:requestId/reject
 * 拒绝好友请求
 */
router.post('/requests/:requestId/reject', authenticateJWT, generalLimiter, (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '缺少必填字段: accountId' });
      return;
    }

    const request = friendRequestService.rejectFriendRequest(req.params.requestId, accountId);
    res.json({ success: true, request });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
