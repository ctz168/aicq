import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/memoryStore';
import type { SubAgentSession } from '../models/types';

/**
 * 启动一个 Sub-Agent 会话
 * - 创建会话，状态为 'running'
 * - 支持模拟流式输出
 */
export function startSubAgent(
  parentMessageId: string,
  task: string,
  context?: string,
  ownerId?: string,
): SubAgentSession {
  if (!parentMessageId || !task) {
    throw new Error('缺少必填字段: parentMessageId, task');
  }

  const now = Date.now();
  const session: SubAgentSession = {
    id: uuidv4(),
    parentMessageId,
    task,
    context: context?.trim() || undefined,
    status: 'running',
    output: '',
    createdAt: now,
    updatedAt: now,
  };

  store.subAgents.set(session.id, session);
  store.persistSubAgent(session);
  console.log(`[subagent] 启动子代理 ${session.id}, 任务: ${task.slice(0, 50)}`);
  return session;
}

/**
 * 向 Sub-Agent 发送人工输入
 * - 如果状态是 waiting_human，恢复为 running
 * - 将输入附加到上下文
 */
export function sendInput(
  subAgentId: string,
  input: string,
  _ownerId?: string,
): SubAgentSession {
  if (!subAgentId || !input) {
    throw new Error('缺少必填字段: subAgentId, input');
  }

  const session = store.subAgents.get(subAgentId);
  if (!session) {
    throw new Error('子代理会话不存在');
  }

  if (session.status === 'completed') {
    throw new Error('该子代理已完成，无法继续输入');
  }

  if (session.status === 'error') {
    throw new Error('该子代理出错，无法继续输入');
  }

  // 更新上下文
  session.context = (session.context ? session.context + '\n' : '') + `[Human]: ${input}`;
  session.status = 'running';
  session.updatedAt = Date.now();
  store.subAgents.set(subAgentId, session);
  store.persistSubAgent(session);

  console.log(`[subagent] 收到人工输入 ${subAgentId}`);
  return session;
}

/**
 * 中止 Sub-Agent 会话
 * - 设置状态为 'completed'
 */
export function abortSubAgent(
  subAgentId: string,
  _ownerId?: string,
): SubAgentSession {
  if (!subAgentId) {
    throw new Error('缺少必填字段: subAgentId');
  }

  const session = store.subAgents.get(subAgentId);
  if (!session) {
    throw new Error('子代理会话不存在');
  }

  if (session.status === 'completed' || session.status === 'error') {
    throw new Error('该子代理已结束');
  }

  session.status = 'completed';
  session.updatedAt = Date.now();
  store.subAgents.set(subAgentId, session);
  store.persistSubAgent(session);

  console.log(`[subagent] 中止子代理 ${subAgentId}`);
  return session;
}

/**
 * 获取 Sub-Agent 状态
 */
export function getSubAgentStatus(subAgentId: string): SubAgentSession {
  const session = store.subAgents.get(subAgentId);
  if (!session) {
    throw new Error('子代理会话不存在');
  }
  return session;
}

/**
 * 获取某个消息关联的所有 Sub-Agent 会话
 */
export function getSubAgentsForMessage(parentMessageId: string): SubAgentSession[] {
  const sessions: SubAgentSession[] = [];
  for (const session of store.subAgents.values()) {
    if (session.parentMessageId === parentMessageId) {
      sessions.push(session);
    }
  }
  // 按创建时间倒序
  sessions.sort((a, b) => b.createdAt - a.createdAt);
  return sessions;
}
