import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/memoryStore';
import * as friendshipService from './friendshipService';
import type { FriendRequest, FriendPermission } from '../models/types';

/**
 * 发送好友请求
 * - 检查双方账号存在
 * - 不能给自己发
 * - 不能已经是好友
 * - 不能已有 pending 请求（双向检查）
 */
export function sendFriendRequest(
  fromId: string,
  toId: string,
  message?: string,
): FriendRequest {
  if (!fromId || !toId) {
    throw new Error('缺少必填字段: fromId, toId');
  }

  if (fromId === toId) {
    throw new Error('不能给自己发送好友请求');
  }

  // 验证双方账号存在
  const fromNode = store.nodes.get(fromId);
  const toNode = store.nodes.get(toId);
  if (!fromNode) {
    throw new Error('发送者账号不存在');
  }
  if (!toNode) {
    throw new Error('目标账号不存在');
  }

  // 检查是否已经是好友
  if (friendshipService.areFriends(fromId, toId)) {
    throw new Error('你们已经是好友了');
  }

  // 检查是否已有 pending 请求
  for (const req of store.friendRequests.values()) {
    if (req.status !== 'pending') continue;
    // 双向检查：A->B 或 B->A
    if (
      (req.fromId === fromId && req.toId === toId) ||
      (req.fromId === toId && req.toId === fromId)
    ) {
      if (req.fromId === fromId) {
        throw new Error('你已经发送过好友请求，请等待对方回应');
      } else {
        throw new Error('对方已向你发送了好友请求，请先处理该请求');
      }
    }
  }

  const now = Date.now();
  const request: FriendRequest = {
    id: uuidv4(),
    fromId,
    toId,
    status: 'pending',
    message: message?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  store.friendRequests.set(request.id, request);
  console.log(`[friend-request] ${fromId} 向 ${toId} 发送好友请求 (${request.id})`);
  return request;
}

/**
 * 获取某个账号的所有好友请求（包括发送的和接收的）
 */
export function getFriendRequests(accountId: string): {
  sent: FriendRequest[];
  received: FriendRequest[];
} {
  const sent: FriendRequest[] = [];
  const received: FriendRequest[] = [];

  for (const req of store.friendRequests.values()) {
    if (req.fromId === accountId) {
      sent.push(req);
    } else if (req.toId === accountId) {
      received.push(req);
    }
  }

  // 按时间倒序排列
  sent.sort((a, b) => b.createdAt - a.createdAt);
  received.sort((a, b) => b.createdAt - a.createdAt);

  return { sent, received };
}

/**
 * 接受好友请求
 * - 只能接收者是 toId
 * - 请求必须是 pending 状态
 * - 建立双向好友关系
 * - 根据接受者指定的权限进行授权
 */
export function acceptFriendRequest(
  requestId: string,
  accountId: string,
  permissions?: FriendPermission[],
): FriendRequest {
  const request = store.friendRequests.get(requestId);
  if (!request) {
    throw new Error('好友请求不存在');
  }

  if (request.toId !== accountId) {
    throw new Error('你无权操作此好友请求');
  }

  if (request.status !== 'pending') {
    throw new Error('该请求已被处理');
  }

  // 建立好友关系
  const added = friendshipService.addFriend(request.fromId, request.toId);
  if (!added) {
    request.status = 'rejected';
    request.updatedAt = Date.now();
    store.friendRequests.set(requestId, request);
    throw new Error('添加好友失败，可能是好友数量已达上限');
  }

  // 设置权限：接受者(toId)授予发送者(fromId)的权限
  const defaultPerms: FriendPermission[] = ['chat'];
  const grantedPerms: FriendPermission[] = permissions && permissions.length > 0 ? permissions : defaultPerms;
  // 确保 chat 权限始终存在
  const finalPerms: FriendPermission[] = grantedPerms.includes('chat')
    ? grantedPerms
    : (['chat', ...grantedPerms] as FriendPermission[]);

  request.grantedPermissions = finalPerms;
  request.status = 'accepted';
  request.updatedAt = Date.now();
  store.friendRequests.set(requestId, request);

  // 在 Account 层面也记录权限
  friendshipService.setFriendPermissions(accountId, request.fromId, finalPerms);

  // 初始化对方对己方的默认权限（chat only）
  friendshipService.initDefaultPermissions(request.fromId, accountId);

  console.log(`[friend-request] ${accountId} 接受了 ${request.fromId} 的好友请求 (${requestId})，权限: ${finalPerms.join(', ')}`);
  return request;
}

/**
 * 拒绝好友请求
 * - 只能接收者是 toId
 * - 请求必须是 pending 状态
 */
export function rejectFriendRequest(
  requestId: string,
  accountId: string,
): FriendRequest {
  const request = store.friendRequests.get(requestId);
  if (!request) {
    throw new Error('好友请求不存在');
  }

  if (request.toId !== accountId) {
    throw new Error('你无权操作此好友请求');
  }

  if (request.status !== 'pending') {
    throw new Error('该请求已被处理');
  }

  request.status = 'rejected';
  request.updatedAt = Date.now();
  store.friendRequests.set(requestId, request);

  console.log(`[friend-request] ${accountId} 拒绝了 ${request.fromId} 的好友请求 (${requestId})`);
  return request;
}
