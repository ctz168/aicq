import { v4 as uuidv4 } from 'uuid';
import { store, getOrCreateNode } from '../db/memoryStore';
import { config } from '../config';
import { relaySignal, isOnline } from './p2pDiscoveryService';
import type { Group, GroupMember, GroupRole, GroupMessagePayload, Account } from '../models/types';

// ─── 辅助函数 ─────────────────────────────────────────────────

/** 统计某个账号所在的群组数量 */
function getGroupCountForAccount(accountId: string): number {
  let count = 0;
  for (const group of store.groups.values()) {
    if (group.members.has(accountId)) {
      count++;
    }
  }
  return count;
}

/** 获取账号的显示名称（优先从 account 中取，其次从 node） */
function getDisplayName(accountId: string): string {
  const account = store.accounts.get(accountId);
  if (account?.displayName) return account.displayName;
  if (account?.agentName) return account.agentName;
  const node = store.nodes.get(accountId);
  if (node) return accountId.slice(0, 8);
  return accountId.slice(0, 8);
}

/**
 * Ensure an account exists for the given ID.
 * If only a node exists (via node registration), auto-provision a lightweight account.
 * This bridges the gap between node-only registration and account-required services.
 */
function ensureAccount(nodeId: string): Account {
  let account = store.accounts.get(nodeId);
  if (account) return account;

  // Check if a node exists — if so, auto-create a lightweight account
  const node = store.nodes.get(nodeId);
  if (!node) {
    throw new Error('账号不存在');
  }

  // Auto-provision a minimal account from the node registration
  account = {
    id: nodeId,
    type: 'ai',
    agentName: nodeId.slice(0, 12),
    publicKey: node.publicKey,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    status: 'active',
    friends: Array.from(node.friends),
    maxFriends: config.maxFriends,
    friendPermissions: {},
    visitPermissions: [],
  };
  store.accounts.set(nodeId, account);
  console.log(`[account] Auto-provisioned account for node: ${nodeId}`);
  return account;
}

/** 获取账号的群角色（返回 null 表示不是群成员） */
function _getMemberRole(group: Group, accountId: string): GroupRole | null {
  const member = group.members.get(accountId);
  return member ? member.role : null;
}

/** 检查角色是否 >= owner/admin 级别 */
function isAdminOrHigher(role: GroupRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

// ─── 群组核心操作 ─────────────────────────────────────────────

/**
 * 创建群组
 * - 检查账号是否存在
 * - 检查账号的群组数量是否超限
 */
export function createGroup(
  name: string,
  ownerId: string,
  description?: string,
): Group {
  // 验证 owner 账号存在（auto-provision from node if needed）
  const account = ensureAccount(ownerId);
  if (account.status !== 'active') {
    throw new Error('账号已被禁用');
  }

  // 验证群名
  if (!name || name.trim().length === 0) {
    throw new Error('群名不能为空');
  }
  if (name.length > 64) {
    throw new Error('群名最长64个字符');
  }

  // 检查群组数量限制
  if (getGroupCountForAccount(ownerId) >= config.maxGroupsPerAccount) {
    throw new Error(`每个账号最多加入 ${config.maxGroupsPerAccount} 个群组`);
  }

  const now = Date.now();
  const groupId = uuidv4();

  const ownerMember: GroupMember = {
    accountId: ownerId,
    displayName: getDisplayName(ownerId),
    role: 'owner',
    joinedAt: now,
    isMuted: false,
  };

  const group: Group = {
    id: groupId,
    name: name.trim(),
    ownerId,
    members: new Map([[ownerId, ownerMember]]),
    createdAt: now,
    updatedAt: now,
    maxMembers: config.maxGroupMembers,
    description: description?.trim() || undefined,
  };

  store.groups.set(groupId, group);
  console.log(`[group] 群组已创建: ${name} (${groupId}), 创建者: ${ownerId}`);
  return group;
}

/**
 * 获取群组信息
 */
export function getGroup(groupId: string): Group | null {
  return store.groups.get(groupId) || null;
}

/**
 * 获取账号所在的所有群组
 */
export function getGroupsForAccount(accountId: string): Group[] {
  const groups: Group[] = [];
  for (const group of store.groups.values()) {
    if (group.members.has(accountId)) {
      groups.push(group);
    }
  }
  return groups;
}

/**
 * 邀请成员加入群组
 * - 邀请者必须是 owner 或 admin
 * - 目标账号必须存在
 * - 群组不能满员
 * - 目标不能已经是成员
 * - 目标的群组数量不能超限
 */
export function inviteMember(
  groupId: string,
  inviterId: string,
  targetId: string,
  displayName?: string,
): GroupMember {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  // 检查邀请者权限
  const inviterRole = _getMemberRole(group, inviterId);
  if (!isAdminOrHigher(inviterRole)) {
    throw new Error('只有群主或管理员才能邀请成员');
  }

  // 目标账号不能是邀请者自己
  if (targetId === inviterId) {
    throw new Error('不能邀请自己');
  }

  // 验证目标账号存在（auto-provision from node if needed）
  const targetAccount = ensureAccount(targetId);
  if (targetAccount.status !== 'active') {
    throw new Error('目标账号已被禁用');
  }

  // 检查目标是否已经是成员
  if (group.members.has(targetId)) {
    throw new Error('该账号已经是群成员');
  }

  // 检查群组是否满员
  if (group.members.size >= group.maxMembers) {
    throw new Error(`群组已满（最多 ${group.maxMembers} 人）`);
  }

  // 检查目标账号的群组数量
  if (getGroupCountForAccount(targetId) >= config.maxGroupsPerAccount) {
    throw new Error(`目标账号已加入 ${config.maxGroupsPerAccount} 个群组，无法再加入`);
  }

  const member: GroupMember = {
    accountId: targetId,
    displayName: displayName || getDisplayName(targetId),
    role: 'member',
    joinedAt: Date.now(),
    isMuted: false,
  };

  group.members.set(targetId, member);
  group.updatedAt = Date.now();

  console.log(`[group] ${inviterId} 邀请 ${targetId} 加入群组 ${groupId}`);
  return member;
}

/**
 * 踢出成员
 * - 操作者必须是 owner 或 admin
 * - 不能踢 owner
 * - admin 不能踢其他 admin（只有 owner 可以）
 * - 被踢者必须是成员
 */
export function kickMember(
  groupId: string,
  kickerId: string,
  targetId: string,
): boolean {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  const kickerRole = _getMemberRole(group, kickerId);
  if (!isAdminOrHigher(kickerRole)) {
    throw new Error('只有群主或管理员才能踢出成员');
  }

  const targetMember = group.members.get(targetId);
  if (!targetMember) {
    throw new Error('目标不是群成员');
  }

  if (targetMember.role === 'owner') {
    throw new Error('不能踢出群主');
  }

  // admin 不能踢其他 admin
  if (kickerRole === 'admin' && targetMember.role === 'admin') {
    throw new Error('管理员不能踢出其他管理员');
  }

  group.members.delete(targetId);
  group.updatedAt = Date.now();

  // 通知被踢者
  if (isOnline(targetId)) {
    relaySignal('system', targetId, {
      type: 'group_kicked',
      groupId,
      kickerId,
      timestamp: Date.now(),
    });
  }

  console.log(`[group] ${kickerId} 将 ${targetId} 踢出群组 ${groupId}`);
  return true;
}

/**
 * 退出群组
 * - 如果是普通成员，直接移除
 * - 如果是 admin，直接移除
 * - 如果是 owner，群组解散
 */
export function leaveGroup(
  groupId: string,
  accountId: string,
): { left: boolean; disbanded: boolean } {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  const member = group.members.get(accountId);
  if (!member) {
    throw new Error('你不是群成员');
  }

  // 如果是群主，解散群组
  if (member.role === 'owner') {
    // 通知所有在线成员群组已解散
    for (const [mid] of group.members) {
      if (mid !== accountId && isOnline(mid)) {
        relaySignal('system', mid, {
          type: 'group_disbanded',
          groupId,
          timestamp: Date.now(),
        });
      }
    }
    store.groups.delete(groupId);
    console.log(`[group] 群主 ${accountId} 解散了群组 ${groupId}`);
    return { left: true, disbanded: true };
  }

  // 普通成员或 admin 退出
  group.members.delete(accountId);
  group.updatedAt = Date.now();

  console.log(`[group] ${accountId} 退出了群组 ${groupId}`);
  return { left: true, disbanded: false };
}

/**
 * 解散群组
 * - 只有群主可以解散
 */
export function disbandGroup(
  groupId: string,
  ownerId: string,
): boolean {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  if (group.ownerId !== ownerId) {
    throw new Error('只有群主才能解散群组');
  }

  // 通知所有在线成员
  for (const [memberId] of group.members) {
    if (isOnline(memberId)) {
      relaySignal('system', memberId, {
        type: 'group_disbanded',
        groupId,
        timestamp: Date.now(),
      });
    }
  }

  store.groups.delete(groupId);
  console.log(`[group] 群主 ${ownerId} 解散了群组 ${groupId}`);
  return true;
}

/**
 * 更新群组信息（名称、描述、头像）
 * - 只有 owner 或 admin 可以修改
 */
export function updateGroup(
  groupId: string,
  accountId: string,
  updates: { name?: string; description?: string; avatar?: string },
): Group {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  const role = _getMemberRole(group, accountId);
  if (!isAdminOrHigher(role)) {
    throw new Error('只有群主或管理员才能修改群组信息');
  }

  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length === 0) {
      throw new Error('群名不能为空');
    }
    if (updates.name.length > 64) {
      throw new Error('群名最长64个字符');
    }
    group.name = updates.name.trim();
  }

  if (updates.description !== undefined) {
    group.description = updates.description?.trim() || undefined;
  }

  if (updates.avatar !== undefined) {
    group.avatar = updates.avatar || undefined;
  }

  group.updatedAt = Date.now();
  return group;
}

/**
 * 发送群消息，广播给所有在线群成员
 * - 发送者必须是群成员
 * - 发送者不能被禁言
 * 返回实际收到消息的成员数量
 */
export function sendMessage(
  groupId: string,
  fromId: string,
  payload: Omit<GroupMessagePayload, 'groupId' | 'fromId'>,
): number {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  const sender = group.members.get(fromId);
  if (!sender) {
    throw new Error('你不是群成员');
  }

  if (sender.isMuted) {
    throw new Error('你已被禁言，无法发送消息');
  }

  const fullPayload: GroupMessagePayload = {
    groupId,
    fromId,
    type: payload.type,
    content: payload.content,
    media: payload.media,
    fileInfo: payload.fileInfo,
  };

  // 构造要广播的消息
  const message = JSON.stringify({
    type: 'group_message',
    data: {
      ...fullPayload,
      timestamp: Date.now(),
    },
  });

  let delivered = 0;
  for (const [memberId, _member] of group.members) {
    if (memberId === fromId) continue; // 不发给自己
    if (isOnline(memberId)) {
      const ok = relaySignal(fromId, memberId, {
        type: 'group_message',
        data: {
          ...fullPayload,
          timestamp: Date.now(),
        },
      });
      if (ok) delivered++;
    }
  }

  return delivered;
}

/**
 * 获取群成员数量
 */
export function getMemberCount(groupId: string): number {
  const group = store.groups.get(groupId);
  if (!group) return 0;
  return group.members.size;
}

/**
 * 检查是否是群成员
 */
export function isMember(groupId: string, accountId: string): boolean {
  const group = store.groups.get(groupId);
  if (!group) return false;
  return group.members.has(accountId);
}

/**
 * 获取成员角色
 */
export function getMemberRole(groupId: string, accountId: string): GroupRole | null {
  const group = store.groups.get(groupId);
  if (!group) return null;
  return _getMemberRole(group, accountId);
}

/**
 * 转让群主
 * - 只有当前群主可以转让
 * - 目标必须是群成员
 * - 不能转让给自己
 */
export function transferOwnership(
  groupId: string,
  currentOwnerId: string,
  newOwnerId: string,
): Group {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  if (group.ownerId !== currentOwnerId) {
    throw new Error('只有群主才能转让群主身份');
  }

  if (currentOwnerId === newOwnerId) {
    throw new Error('不能转让给自己');
  }

  const targetMember = group.members.get(newOwnerId);
  if (!targetMember) {
    throw new Error('目标不是群成员');
  }

  // 原群主变为 admin
  const oldOwner = group.members.get(currentOwnerId)!;
  oldOwner.role = 'admin';

  // 新群主
  targetMember.role = 'owner';
  group.ownerId = newOwnerId;
  group.updatedAt = Date.now();

  console.log(`[group] ${currentOwnerId} 将群组 ${groupId} 转让给 ${newOwnerId}`);
  return group;
}

/**
 * 设置成员角色
 * - 只有群主可以设置角色
 * - 不能修改自己的角色
 * - 目标必须是成员
 */
export function setMemberRole(
  groupId: string,
  setterId: string,
  targetId: string,
  role: GroupRole,
): GroupMember {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  if (group.ownerId !== setterId) {
    throw new Error('只有群主才能设置成员角色');
  }

  if (setterId === targetId) {
    throw new Error('不能修改自己的角色');
  }

  const targetMember = group.members.get(targetId);
  if (!targetMember) {
    throw new Error('目标不是群成员');
  }

  if (role !== 'admin' && role !== 'member') {
    throw new Error('只能设置为 admin 或 member');
  }

  targetMember.role = role;
  group.updatedAt = Date.now();

  console.log(`[group] ${setterId} 将 ${targetId} 的角色设为 ${role} (群组 ${groupId})`);
  return targetMember;
}

/**
 * 禁言/解禁成员
 * - owner/admin 可以禁言其他成员
 * - 不能禁言自己
 * - admin 不能禁言 owner 或其他 admin
 * - owner 可以禁言任何人
 */
export function muteMember(
  groupId: string,
  muterId: string,
  targetId: string,
  muted: boolean,
): GroupMember {
  const group = store.groups.get(groupId);
  if (!group) {
    throw new Error('群组不存在');
  }

  const muterRole = _getMemberRole(group, muterId);
  if (!isAdminOrHigher(muterRole)) {
    throw new Error('只有群主或管理员才能禁言成员');
  }

  if (muterId === targetId) {
    throw new Error('不能禁言自己');
  }

  const targetMember = group.members.get(targetId);
  if (!targetMember) {
    throw new Error('目标不是群成员');
  }

  // admin 不能禁言 owner 或其他 admin
  if (muterRole === 'admin') {
    if (targetMember.role === 'owner') {
      throw new Error('管理员不能禁言群主');
    }
    if (targetMember.role === 'admin') {
      throw new Error('管理员不能禁言其他管理员');
    }
  }

  targetMember.isMuted = muted;
  group.updatedAt = Date.now();

  // 通知被禁言者
  if (isOnline(targetId)) {
    relaySignal('system', targetId, {
      type: 'group_mute_changed',
      groupId,
      muted,
      by: muterId,
      timestamp: Date.now(),
    });
  }

  console.log(`[group] ${muterId} ${muted ? '禁言' : '解禁'}了 ${targetId} (群组 ${groupId})`);
  return targetMember;
}

/**
 * 广播群组输入指示器（正在输入...）
 */
export function broadcastTyping(
  groupId: string,
  fromId: string,
): void {
  const group = store.groups.get(groupId);
  if (!group) return;

  const sender = group.members.get(fromId);
  if (!sender || sender.isMuted) return;

  for (const [memberId] of group.members) {
    if (memberId === fromId) continue;
    if (isOnline(memberId)) {
      relaySignal(fromId, memberId, {
        type: 'group_typing',
        groupId,
        fromId,
        timestamp: Date.now(),
      });
    }
  }
}

// ─── 序列化辅助 ───────────────────────────────────────────────

/**
 * 将 Group 对象序列化为可 JSON 化的普通对象（Map -> Array）
 */
export function serializeGroup(group: Group): Record<string, any> {
  return {
    id: group.id,
    name: group.name,
    ownerId: group.ownerId,
    members: Array.from(group.members.values()),
    memberCount: group.members.size,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    maxMembers: group.maxMembers,
    description: group.description,
    avatar: group.avatar,
  };
}
