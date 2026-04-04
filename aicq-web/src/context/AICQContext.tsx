import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect, useMemo } from 'react';
import { WebClient } from '../services/webClient';
import type {
  FriendInfo,
  ChatMessage,
  TempNumberInfo,
  FileTransferInfo,
  HandshakeProgress,
  ScreenName,
  UnreadCounts,
  TypingState,
  StreamingState,
  GroupInfo,
  GroupMessage,
  FriendRequest,
  PushNotification,
  SubAgentSession,
  TaskPlan,
  TaskItem,
  AgentExecutionState,
} from '../types';

// ─── State ───────────────────────────────────────────────────

interface AICQState {
  screen: ScreenName;
  activeFriendId: string | null;
  userId: string;
  fingerprint: string;
  isConnected: boolean;
  isInitialized: boolean;
  friends: FriendInfo[];
  tempNumbers: TempNumberInfo[];
  fileTransfers: FileTransferInfo[];
  unreadCounts: UnreadCounts;
  typingState: TypingState;
  error: string | null;
  isLoading: boolean;
  /** Active streaming messages per friend */
  streamingMessages: Record<string, StreamingState>;
  groups: GroupInfo[];
  activeGroupId: string | null;
  groupUnreadCounts: UnreadCounts;
  friendRequests: FriendRequest[];
  notifications: PushNotification[];
  subAgents: SubAgentSession[];
  taskPlans: TaskPlan[];
  /** Agent execution state per friend (whether the agent is processing) */
  agentExecution: Record<string, AgentExecutionState>;
  /** Queued messages waiting for agent to finish processing */
  messageQueue: ChatMessage[];
  /** Incremented on each message add to force re-renders for ref-based consumers */
  messageVersion: number;
}

const initialState: AICQState = {
  screen: 'login',
  activeFriendId: null,
  userId: '',
  fingerprint: '',
  isConnected: false,
  isInitialized: false,
  friends: [],
  tempNumbers: [],
  fileTransfers: [],
  unreadCounts: {},
  typingState: {},
  error: null,
  isLoading: false,
  streamingMessages: {},
  groups: [],
  activeGroupId: null,
  groupUnreadCounts: {},
  friendRequests: [],
  notifications: [],
  subAgents: [],
  taskPlans: [],
  agentExecution: {},
  messageQueue: [],
  messageVersion: 0,
};

type Action =
  | { type: 'SET_SCREEN'; payload: ScreenName }
  | { type: 'SET_ACTIVE_FRIEND'; payload: string | null }
  | { type: 'SET_USER'; payload: { userId: string; fingerprint: string } }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_FRIENDS'; payload: FriendInfo[] }
  | { type: 'UPDATE_FRIEND'; payload: FriendInfo }
  | { type: 'REMOVE_FRIEND'; payload: string }
  | { type: 'ADD_FRIEND'; payload: FriendInfo }
  | { type: 'SET_TEMP_NUMBERS'; payload: TempNumberInfo[] }
  | { type: 'ADD_TEMP_NUMBER'; payload: TempNumberInfo }
  | { type: 'REMOVE_TEMP_NUMBER'; payload: string }
  | { type: 'SET_FILE_TRANSFERS'; payload: FileTransferInfo[] }
  | { type: 'UPDATE_FILE_TRANSFER'; payload: FileTransferInfo }
  | { type: 'SET_UNREAD'; payload: UnreadCounts }
  | { type: 'SET_TYPING'; payload: TypingState }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'ADD_MESSAGE'; payload: { friendId: string; message: ChatMessage } }
  | { type: 'UPDATE_MESSAGE'; payload: { friendId: string; messageId: string; updates: Partial<ChatMessage> } }
  | { type: 'SET_STREAMING'; payload: Record<string, StreamingState> }
  | { type: 'UPDATE_STREAMING'; payload: { friendId: string; state: StreamingState } }
  | { type: 'CLEAR_STREAMING'; payload: string }
  | { type: 'SET_GROUPS'; payload: GroupInfo[] }
  | { type: 'ADD_GROUP'; payload: GroupInfo }
  | { type: 'UPDATE_GROUP'; payload: GroupInfo }
  | { type: 'REMOVE_GROUP'; payload: string }
  | { type: 'SET_ACTIVE_GROUP'; payload: string | null }
  | { type: 'ADD_GROUP_MESSAGE'; payload: { groupId: string; message: GroupMessage } }
  | { type: 'SET_FRIEND_REQUESTS'; payload: { sent: FriendRequest[]; received: FriendRequest[] } }
  | { type: 'ADD_FRIEND_REQUEST'; payload: FriendRequest }
  | { type: 'UPDATE_FRIEND_REQUEST'; payload: FriendRequest }
  | { type: 'SET_NOTIFICATIONS'; payload: PushNotification[] }
  | { type: 'ADD_NOTIFICATION'; payload: PushNotification }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'SET_SUB_AGENTS'; payload: SubAgentSession[] }
  | { type: 'ADD_SUB_AGENT'; payload: SubAgentSession }
  | { type: 'UPDATE_SUB_AGENT'; payload: SubAgentSession }
  | { type: 'REMOVE_SUB_AGENT'; payload: string }
  | { type: 'SET_TASK_PLANS'; payload: TaskPlan[] }
  | { type: 'ADD_TASK_PLAN'; payload: TaskPlan }
  | { type: 'UPDATE_TASK_PLAN'; payload: TaskPlan }
  | { type: 'REMOVE_TASK_PLAN'; payload: string }
  | { type: 'UPDATE_TASK_ITEM'; payload: { planId: string; taskId: string; updates: Partial<TaskItem> } }
  | { type: 'ADD_TASK_ITEM'; payload: { planId: string; task: TaskItem } }
  | { type: 'DELETE_TASK_ITEM'; payload: { planId: string; taskId: string } }
  | { type: 'SET_AGENT_EXECUTION'; payload: { friendId: string; state: AgentExecutionState } }
  | { type: 'CLEAR_AGENT_EXECUTION'; payload: string }
  | { type: 'ADD_TO_QUEUE'; payload: ChatMessage }
  | { type: 'FLUSH_QUEUE'; payload: ChatMessage[] }
  | { type: 'CLEAR_QUEUE' }
  | { type: 'BUMP_MESSAGE_VERSION' };

function reducer(state: AICQState, action: Action): AICQState {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.payload };
    case 'SET_ACTIVE_FRIEND':
      return { ...state, activeFriendId: action.payload };
    case 'SET_USER':
      return { ...state, userId: action.payload.userId, fingerprint: action.payload.fingerprint };
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
    case 'SET_FRIENDS':
      return { ...state, friends: action.payload };
    case 'UPDATE_FRIEND':
      return {
        ...state,
        friends: state.friends.map((f) => (f.id === action.payload.id ? action.payload : f)),
      };
    case 'REMOVE_FRIEND':
      return { ...state, friends: state.friends.filter((f) => f.id !== action.payload) };
    case 'ADD_FRIEND':
      return { ...state, friends: [...state.friends, action.payload] };
    case 'SET_TEMP_NUMBERS':
      return { ...state, tempNumbers: action.payload };
    case 'ADD_TEMP_NUMBER':
      return { ...state, tempNumbers: [...state.tempNumbers, action.payload] };
    case 'REMOVE_TEMP_NUMBER':
      return { ...state, tempNumbers: state.tempNumbers.filter((t) => t.number !== action.payload) };
    case 'SET_FILE_TRANSFERS':
      return { ...state, fileTransfers: action.payload };
    case 'UPDATE_FILE_TRANSFER':
      return {
        ...state,
        fileTransfers: state.fileTransfers.map((t) =>
          t.sessionId === action.payload.sessionId ? action.payload : t,
        ),
      };
    case 'SET_UNREAD':
      return { ...state, unreadCounts: action.payload };
    case 'SET_TYPING':
      return { ...state, typingState: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'ADD_MESSAGE': {
      const { friendId, message } = action.payload;
      const isOwn = message.fromId === state.userId;
      const newCounts = { ...state.unreadCounts };
      if (!isOwn && message.type !== 'system') {
        newCounts[friendId] = (newCounts[friendId] || 0) + 1;
      }
      return { ...state, unreadCounts: newCounts };
    }
    case 'UPDATE_MESSAGE':
      // Handled at ref level, no state change needed
      return state;
    case 'SET_STREAMING':
      return { ...state, streamingMessages: action.payload };
    case 'UPDATE_STREAMING':
      return {
        ...state,
        streamingMessages: {
          ...state.streamingMessages,
          [action.payload.friendId]: action.payload.state,
        },
      };
    case 'CLEAR_STREAMING': {
      const newStream = { ...state.streamingMessages };
      delete newStream[action.payload];
      return { ...state, streamingMessages: newStream };
    }
    case 'SET_GROUPS':
      return { ...state, groups: action.payload };
    case 'ADD_GROUP':
      return { ...state, groups: [...state.groups, action.payload] };
    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.payload.id ? action.payload : g)),
      };
    case 'REMOVE_GROUP':
      return { ...state, groups: state.groups.filter((g) => g.id !== action.payload) };
    case 'SET_ACTIVE_GROUP':
      return { ...state, activeGroupId: action.payload };
    case 'ADD_GROUP_MESSAGE': {
      const { groupId, message } = action.payload;
      const isOwn = message.fromId === state.userId;
      const newGroupCounts = { ...state.groupUnreadCounts };
      if (!isOwn && message.type !== 'system') {
        newGroupCounts[groupId] = (newGroupCounts[groupId] || 0) + 1;
      }
      return { ...state, groupUnreadCounts: newGroupCounts };
    }
    case 'SET_FRIEND_REQUESTS':
      return { ...state, friendRequests: [...action.payload.sent, ...action.payload.received].sort((a, b) => b.createdAt - a.createdAt) };
    case 'ADD_FRIEND_REQUEST':
      return { ...state, friendRequests: [action.payload, ...state.friendRequests] };
    case 'UPDATE_FRIEND_REQUEST':
      return {
        ...state,
        friendRequests: state.friendRequests.map(r =>
          r.id === action.payload.id ? action.payload : r
        ),
      };
    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: action.payload };
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [action.payload, ...state.notifications].slice(0, 50) };
    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map(n =>
          n.id === action.payload ? { ...n, isRead: true } : n
        ),
      };
    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: state.notifications.map(n => ({ ...n, isRead: true })) };
    case 'SET_SUB_AGENTS':
      return { ...state, subAgents: action.payload };
    case 'ADD_SUB_AGENT':
      return { ...state, subAgents: [action.payload, ...state.subAgents] };
    case 'UPDATE_SUB_AGENT':
      return {
        ...state,
        subAgents: state.subAgents.map(s =>
          s.id === action.payload.id ? action.payload : s
        ),
      };
    case 'REMOVE_SUB_AGENT':
      return { ...state, subAgents: state.subAgents.filter(s => s.id !== action.payload) };
    case 'SET_TASK_PLANS':
      return { ...state, taskPlans: action.payload };
    case 'ADD_TASK_PLAN':
      return { ...state, taskPlans: [action.payload, ...state.taskPlans] };
    case 'UPDATE_TASK_PLAN':
      return {
        ...state,
        taskPlans: state.taskPlans.map(p => p.id === action.payload.id ? action.payload : p),
      };
    case 'REMOVE_TASK_PLAN':
      return { ...state, taskPlans: state.taskPlans.filter(p => p.id !== action.payload) };
    case 'UPDATE_TASK_ITEM': {
      const { planId, taskId, updates } = action.payload;
      return {
        ...state,
        taskPlans: state.taskPlans.map(plan => {
          if (plan.id !== planId) return plan;
          return {
            ...plan,
            tasks: plan.tasks.map(task =>
              task.id === taskId ? { ...task, ...updates, updatedAt: Date.now() } : task
            ),
            updatedAt: Date.now(),
          };
        }),
      };
    }
    case 'ADD_TASK_ITEM': {
      const { planId, task } = action.payload;
      return {
        ...state,
        taskPlans: state.taskPlans.map(plan => {
          if (plan.id !== planId) return plan;
          return {
            ...plan,
            tasks: [...plan.tasks, task],
            updatedAt: Date.now(),
          };
        }),
      };
    }
    case 'DELETE_TASK_ITEM': {
      const { planId, taskId } = action.payload;
      return {
        ...state,
        taskPlans: state.taskPlans.map(plan => {
          if (plan.id !== planId) return plan;
          return {
            ...plan,
            tasks: plan.tasks.filter(t => t.id !== taskId),
            updatedAt: Date.now(),
          };
        }),
      };
    }
    case 'SET_AGENT_EXECUTION': {
      const { friendId, state: execState } = action.payload;
      return {
        ...state,
        agentExecution: {
          ...state.agentExecution,
          [friendId]: execState,
        },
      };
    }
    case 'CLEAR_AGENT_EXECUTION': {
      const newExec = { ...state.agentExecution };
      delete newExec[action.payload];
      return { ...state, agentExecution: newExec };
    }
    case 'ADD_TO_QUEUE':
      return { ...state, messageQueue: [...state.messageQueue, action.payload] };
    case 'FLUSH_QUEUE':
      return { ...state, messageQueue: [] };
    case 'CLEAR_QUEUE':
      return { ...state, messageQueue: [] };
    case 'BUMP_MESSAGE_VERSION':
      return { ...state, messageVersion: state.messageVersion + 1 };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────

interface AICQContextValue {
  state: AICQState;
  client: WebClient | null;
  connect: (serverUrl: string) => Promise<void>;
  navigate: (screen: ScreenName, friendId?: string | null) => void;
  sendMessage: (friendId: string, text: string) => ChatMessage;
  sendFileInfo: (friendId: string, fileInfo: import('../types').FileMetadata) => ChatMessage;
  sendImage: (friendId: string, file: File) => Promise<ChatMessage>;
  sendVideo: (friendId: string, file: File) => Promise<ChatMessage>;
  sendTyping: (friendId: string) => void;
  getMessages: (friendId: string) => ChatMessage[];
  requestTempNumber: () => Promise<string>;
  revokeTempNumber: (number: string) => Promise<void>;
  resolveAndAddFriend: (tempNumber: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  sendFile: (friendId: string, file: File) => Promise<FileTransferInfo>;
  pauseTransfer: (sessionId: string) => void;
  resumeTransfer: (sessionId: string) => Promise<void>;
  cancelTransfer: (sessionId: string) => void;
  refreshFriends: () => Promise<void>;
  markMessagesRead: (friendId: string) => void;
  getLastMessage: (friendId: string) => ChatMessage | null;
  getUnreadCount: (friendId: string) => number;
  getStreamingState: (friendId: string) => StreamingState | null;
  clearError: () => void;
  createGroup: (name: string, description?: string) => Promise<GroupInfo>;
  refreshGroups: () => Promise<void>;
  inviteToGroup: (groupId: string, targetId: string, displayName?: string) => Promise<void>;
  kickFromGroup: (groupId: string, targetId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  disbandGroup: (groupId: string) => Promise<void>;
  updateGroup: (groupId: string, updates: { name?: string; description?: string }) => Promise<void>;
  transferGroupOwnership: (groupId: string, targetId: string) => Promise<void>;
  muteGroupMember: (groupId: string, targetId: string, muted: boolean) => Promise<void>;
  setGroupMemberRole: (groupId: string, targetId: string, role: 'owner' | 'admin' | 'member') => Promise<void>;
  sendGroupMessage: (groupId: string, text: string) => GroupMessage;
  getGroupMessages: (groupId: string) => GroupMessage[];
  friendRequests: FriendRequest[];
  getFriendRequests: () => Promise<void>;
  sendFriendRequest: (userId: string, message?: string) => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  broadcastMessage: (recipientIds: string[], message: string) => Promise<{ sent: number; failed: number }>;
  forwardMessage: (friendId: string, text: string) => ChatMessage;
  notifications: PushNotification[];
  addNotification: (notification: PushNotification) => void;
  clearNotifications: () => void;
  markNotificationRead: (notificationId: string) => void;
  subAgents: SubAgentSession[];
  startSubAgent: (parentMessageId: string, task: string, context?: string) => Promise<SubAgentSession>;
  sendSubAgentInput: (subAgentId: string, input: string) => Promise<void>;
  abortSubAgent: (subAgentId: string) => Promise<void>;
  taskPlans: TaskPlan[];
  getTaskPlans: (friendId: string) => TaskPlan[];
  createTaskPlan: (friendId: string, title: string, tasks: Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>[]) => TaskPlan;
  updateTaskItem: (planId: string, taskId: string, updates: Partial<TaskItem>) => void;
  addTaskItem: (planId: string, title: string) => void;
  deleteTaskItem: (planId: string, taskId: string) => void;
  syncTaskPlan: (planId: string, friendId: string) => void;
  clearTaskPlan: (planId: string) => void;
  abortAgent: (friendId: string) => Promise<void>;
  getAgentExecutionState: (friendId: string) => AgentExecutionState | null;
  isAgentExecuting: (friendId: string) => boolean;
  messageQueue: ChatMessage[];
  loadMoreMessages: (friendId: string, before?: number) => Promise<{ messages: ChatMessage[], hasMore: boolean }>;
  getMessageCount: (friendId: string) => Promise<number>;
}

const AICQContext = createContext<AICQContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────

export function AICQProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const clientRef = useRef<WebClient | null>(null);
  const messagesRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const unreadCountsRef = useRef<UnreadCounts>({});
  const streamingRef = useRef<Record<string, StreamingState>>({});
  const taskPlansRef = useRef<TaskPlan[]>([]);
  const subAgentsRef = useRef<SubAgentSession[]>([]);
  const agentExecutionRef = useRef<Record<string, AgentExecutionState>>({});
  const messageQueueRef = useRef<ChatMessage[]>([]);
  const typingStateRef = useRef<TypingState>({});
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const activeFriendIdRef = useRef<string | null>(null);

  const connect = useCallback(async (serverUrl: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const client = new WebClient({ serverUrl });
      clientRef.current = client;

      client.on('connected', () => {
        dispatch({ type: 'SET_CONNECTED', payload: true });
      });

      client.on('disconnected', () => {
        dispatch({ type: 'SET_CONNECTED', payload: false });
      });

      client.on('message', (msg: ChatMessage) => {
        const friendId = msg.fromId === client.getUserId() ? msg.toId : msg.fromId;
        const msgs = messagesRef.current.get(friendId) || [];
        // For streaming messages, update in place instead of adding duplicates
        if (msg.type === 'streaming' && msgs.length > 0) {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg.id === msg.id) {
            // Update the existing streaming message
            msgs[msgs.length - 1] = msg;
          } else {
            msgs.push(msg);
          }
        } else {
          msgs.push(msg);
        }
        messagesRef.current.set(friendId, msgs);
        dispatch({ type: 'ADD_MESSAGE', payload: { friendId, message: msg } });
        dispatch({ type: 'BUMP_MESSAGE_VERSION' });
      });

      client.on('friend_online', (event: { nodeId: string; online: boolean }) => {
        dispatch({
          type: 'UPDATE_FRIEND',
          payload: { id: event.nodeId, isOnline: true } as any,
        });
      });

      client.on('friend_offline', (event: { nodeId: string; online: boolean }) => {
        dispatch({
          type: 'UPDATE_FRIEND',
          payload: { id: event.nodeId, isOnline: false } as any,
        });
      });

      client.on('typing', (event: { fromId: string }) => {
        const fromId = event.fromId;
        const current = { ...typingStateRef.current, [fromId]: true };
        typingStateRef.current = current;
        dispatch({ type: 'SET_TYPING', payload: current });

        // Clear existing timer for this friend to avoid overlapping timers
        const existingTimer = typingTimersRef.current.get(fromId);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
          const cleared = { ...typingStateRef.current, [fromId]: false };
          typingStateRef.current = cleared;
          dispatch({ type: 'SET_TYPING', payload: cleared });
          typingTimersRef.current.delete(fromId);
        }, 3000);
        typingTimersRef.current.set(fromId, timer);
      });

      client.on('friend_added', (friend: FriendInfo) => {
        dispatch({ type: 'ADD_FRIEND', payload: friend });
        const msgs = client.getMessages(friend.id);
        messagesRef.current.set(friend.id, msgs);
      });

      client.on('friend_removed', (friendId: string) => {
        dispatch({ type: 'REMOVE_FRIEND', payload: friendId });
        messagesRef.current.delete(friendId);
      });

      client.on('file_progress', (info: FileTransferInfo) => {
        dispatch({ type: 'UPDATE_FILE_TRANSFER', payload: info });
      });

      client.on('streaming_update', (streaming: StreamingState) => {
        // Find which friend this streaming message belongs to
        const friendId = client.getUserId(); // AI messages come to us
        streamingRef.current[streaming.messageId] = streaming;
        dispatch({
          type: 'UPDATE_STREAMING',
          payload: { friendId: activeFriendIdRef.current || '', state: streaming },
        });
      });

      client.on('streaming_complete', (streaming: StreamingState) => {
        const activeId = activeFriendIdRef.current;
        if (activeId) {
          dispatch({ type: 'CLEAR_STREAMING', payload: activeId });
        }
        // Add the final message
        const msgs = messagesRef.current.get(activeId || '') || [];
        const finalMsg: ChatMessage = {
          id: streaming.messageId,
          fromId: activeId || '',
          toId: client.getUserId(),
          type: 'markdown',
          content: streaming.content,
          timestamp: Date.now(),
          status: 'delivered',
        };
        // Remove the streaming placeholder if it exists
        const streamIdx = msgs.findIndex(m => m.type === 'streaming');
        if (streamIdx >= 0) msgs.splice(streamIdx, 1);
        msgs.push(finalMsg);
        messagesRef.current.set(activeId || '', msgs);
      });

      client.on('streaming_error', (streaming: StreamingState) => {
        dispatch({
          type: 'UPDATE_STREAMING',
          payload: {
            friendId: activeFriendIdRef.current || '',
            state: { ...streaming, isComplete: false, error: streaming.error },
          },
        });
      });

      client.on('handshake_progress', (progress: HandshakeProgress) => {
        if (progress.status === 'completed') {
          client.refreshFriends().then((friends) => {
            dispatch({ type: 'SET_FRIENDS', payload: friends });
            for (const f of friends) {
              messagesRef.current.set(f.id, client.getMessages(f.id));
            }
          });
        }
      });

      // ─── Group events ─────────────────────────────────────────
      client.on('group_message', (msg: GroupMessage) => {
        dispatch({ type: 'ADD_GROUP_MESSAGE', payload: { groupId: msg.groupId, message: msg } });
      });

      client.on('group_created', (group: GroupInfo) => {
        dispatch({ type: 'ADD_GROUP', payload: group });
      });

      client.on('group_updated', (group: GroupInfo) => {
        dispatch({ type: 'UPDATE_GROUP', payload: group });
      });

      client.on('group_left', (groupId: string) => {
        dispatch({ type: 'REMOVE_GROUP', payload: groupId });
      });

      client.on('group_disbanded', (groupId: string) => {
        dispatch({ type: 'REMOVE_GROUP', payload: groupId });
      });

      client.on('friend_request_accepted', () => {
        const c = clientRef.current;
        if (c) {
          c.getFriendRequests().then(res => {
            dispatch({ type: 'SET_FRIEND_REQUESTS', payload: res });
          }).catch(() => {});
          c.refreshFriends().then(friends => {
            dispatch({ type: 'SET_FRIENDS', payload: friends });
          }).catch(() => {});
        }
      });

      client.on('friend_request_rejected', () => {
        const c = clientRef.current;
        if (c) {
          c.getFriendRequests().then(res => {
            dispatch({ type: 'SET_FRIEND_REQUESTS', payload: res });
          }).catch(() => {});
        }
      });

      client.on('push_notification', (data: any) => {
        const notification: PushNotification = {
          id: data.notificationId || String(Date.now()),
          chatId: data.chatId || '',
          senderName: data.senderName || 'Unknown',
          messagePreview: data.messagePreview || '',
          timestamp: data.timestamp || Date.now(),
          isGroup: data.isGroup || false,
          isRead: false,
        };
        dispatch({ type: 'ADD_NOTIFICATION', payload: notification });

        // Browser notification
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`${notification.senderName}${notification.isGroup ? ' (群组)' : ''}`, {
            body: notification.messagePreview,
            icon: '/favicon.ico',
          });
        }
      });

      client.on('subagent_chunk', (msg: any) => {
        const session = msg.data || msg;
        // Use ref to avoid stale closure (connect has [] deps)
        const existingOutput = subAgentsRef.current.find(s => s.id === session.id)?.output || '';
        dispatch({ type: 'UPDATE_SUB_AGENT', payload: {
          id: session.id,
          parentMessageId: session.parentMessageId || '',
          task: session.task || '',
          status: session.status || 'running',
          output: existingOutput + (session.chunk || ''),
          createdAt: session.createdAt || Date.now(),
          updatedAt: Date.now(),
        }});
      });

      client.on('subagent_complete', (msg: any) => {
        const session = msg.data || msg;
        dispatch({ type: 'UPDATE_SUB_AGENT', payload: {
          id: session.id,
          parentMessageId: session.parentMessageId || '',
          task: session.task || '',
          status: 'completed',
          output: session.output || '',
          createdAt: session.createdAt || Date.now(),
          updatedAt: Date.now(),
        }});
      });

      client.on('subagent_waiting', (msg: any) => {
        const session = msg.data || msg;
        dispatch({ type: 'UPDATE_SUB_AGENT', payload: {
          id: session.id,
          parentMessageId: session.parentMessageId || '',
          task: session.task || '',
          status: 'waiting_human',
          output: session.output || '',
          createdAt: session.createdAt || Date.now(),
          updatedAt: Date.now(),
        }});
      });

      // ─── Task Plan P2P Events (from stableclaw agent) ───────
      client.on('task_plan_update', (msg: any) => {
        const data = msg.data || msg;
        const plan: TaskPlan = {
          id: data.planId || data.id,
          friendId: data.friendId || msg.fromId || '',
          title: data.title || '任务计划',
          tasks: (data.steps || []).map((step: any) => ({
            id: step.id || step.stepId,
            title: step.description || step.title || '',
            status: step.status || 'pending',
            order: step.priority || step.order || 0,
            createdAt: step.createdAt || Date.now(),
            updatedAt: step.updatedAt || Date.now(),
          })),
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
        };

        // Use ref to avoid stale closure (connect has [] deps)
        const existingPlan = taskPlansRef.current.find(p => p.id === plan.id);
        if (existingPlan) {
          dispatch({ type: 'UPDATE_TASK_PLAN', payload: plan });
        } else {
          dispatch({ type: 'ADD_TASK_PLAN', payload: plan });
        }
      });

      client.on('task_plan_delete', (msg: any) => {
        const data = msg.data || msg;
        const planId = data.planId || data.id;
        if (planId) {
          dispatch({ type: 'REMOVE_TASK_PLAN', payload: planId });
        }
      });

      // ─── Agent Execution State (from stableclaw agent) ──────
      client.on('agent_execution_start', (msg: any) => {
        const data = msg.data || msg;
        const friendId = data.friendId || msg.fromId || '';
        const execState: AgentExecutionState = {
          isExecuting: true,
          phase: data.phase || 'started',
          sessionKey: data.sessionKey,
          runId: data.runId,
          gatewayUrl: data.gatewayUrl,
          startedAt: data.timestamp || Date.now(),
        };
        dispatch({ type: 'SET_AGENT_EXECUTION', payload: { friendId, state: execState } });
      });

      client.on('agent_execution_end', (msg: any) => {
        const data = msg.data || msg;
        const friendId = data.friendId || msg.fromId || '';

        // Flush any queued messages for this friend
        const queue = messageQueueRef.current;
        if (queue.length > 0) {
          const friendQueue = queue.filter((m) => m.toId === friendId);
          if (friendQueue.length > 0) {
            const c = clientRef.current;
            if (c) {
              for (const qMsg of friendQueue) {
                c.sendMessage(friendId, qMsg.content);
              }
            }
            const msgs = messagesRef.current.get(friendId) || [];
            msgs.push(...friendQueue);
            messagesRef.current.set(friendId, msgs);
          }
          dispatch({ type: 'CLEAR_QUEUE' });
        }

        dispatch({ type: 'CLEAR_AGENT_EXECUTION', payload: friendId });
      });

      const result = await client.initialize();

      dispatch({
        type: 'SET_USER',
        payload: { userId: result.userId, fingerprint: result.fingerprint },
      });
      dispatch({ type: 'SET_INITIALIZED', payload: true });

      const friends = await client.refreshFriends();
      dispatch({ type: 'SET_FRIENDS', payload: friends });

      for (const f of friends) {
        const msgs = await client.getCachedMessages(f.id, 50);
        messagesRef.current.set(f.id, msgs);
        const count = client.getUnreadCount(f.id);
        if (count > 0) {
          unreadCountsRef.current[f.id] = count;
        }
      }

      dispatch({ type: 'SET_UNREAD', payload: { ...unreadCountsRef.current } });

      const tempNumbers = client.getTempNumbers();
      dispatch({ type: 'SET_TEMP_NUMBERS', payload: tempNumbers });

      // Load groups
      try {
        const groups = await client.getGroups();
        dispatch({ type: 'SET_GROUPS', payload: groups });
      } catch (err) {
        console.warn('[AICQ] Failed to load groups:', err);
      }

      // Load friend requests
      try {
        const reqRes = await client.getFriendRequests();
        const sent = (reqRes.sent || []).sort((a, b) => b.createdAt - a.createdAt);
        const received = (reqRes.received || []).sort((a, b) => b.createdAt - a.createdAt);
        dispatch({ type: 'SET_FRIEND_REQUESTS', payload: { sent, received } });
      } catch (err) {
        console.warn('[AICQ] Failed to load friend requests:', err);
      }

      const transfers = client.getFileTransfers();
      dispatch({ type: 'SET_FILE_TRANSFERS', payload: transfers });

      dispatch({ type: 'SET_SCREEN', payload: 'chatList' });
    } catch (err: any) {
      console.error('[AICQ] Connection failed:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message || '连接失败' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const navigate = useCallback((screen: ScreenName, targetId: string | null = null) => {
    dispatch({ type: 'SET_SCREEN', payload: screen });
    if (targetId !== undefined && targetId !== null) {
      if (screen === 'groupChat') {
        dispatch({ type: 'SET_ACTIVE_GROUP', payload: targetId });
      } else {
        dispatch({ type: 'SET_ACTIVE_FRIEND', payload: targetId });
      }
    } else {
      dispatch({ type: 'SET_ACTIVE_GROUP', payload: null });
    }
  }, []);

  const sendMessage = useCallback((friendId: string, text: string): ChatMessage => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const msg = client.sendMessage(friendId, text);
    
    // If agent is executing for this friend, queue the message instead of adding to display
    const execState = agentExecutionRef.current[friendId];
    if (execState?.isExecuting) {
      dispatch({ type: 'ADD_TO_QUEUE', payload: msg });
      return msg;
    }
    
    const msgs = messagesRef.current.get(friendId) || [];
    msgs.push(msg);
    messagesRef.current.set(friendId, msgs);
    return msg;
  }, []);

  const sendFileInfo = useCallback((friendId: string, fileInfo: import('../types').FileMetadata): ChatMessage => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const msg = client.sendFileInfo(friendId, fileInfo);
    const msgs = messagesRef.current.get(friendId) || [];
    msgs.push(msg);
    messagesRef.current.set(friendId, msgs);
    return msg;
  }, []);

  const sendImage = useCallback(async (friendId: string, file: File): Promise<ChatMessage> => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const msg = await client.sendImage(friendId, file);
    const msgs = messagesRef.current.get(friendId) || [];
    msgs.push(msg);
    messagesRef.current.set(friendId, msgs);
    return msg;
  }, []);

  const sendVideo = useCallback(async (friendId: string, file: File): Promise<ChatMessage> => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const msg = await client.sendVideo(friendId, file);
    const msgs = messagesRef.current.get(friendId) || [];
    msgs.push(msg);
    messagesRef.current.set(friendId, msgs);
    return msg;
  }, []);

  const sendTyping = useCallback((friendId: string) => {
    clientRef.current?.sendTyping(friendId);
  }, []);

  const getMessages = useCallback((friendId: string): ChatMessage[] => {
    return messagesRef.current.get(friendId) || [];
  }, []);

  const requestTempNumber = useCallback(async (): Promise<string> => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const number = await client.requestTempNumber();
    const info: TempNumberInfo = {
      number,
      expiresAt: Date.now() + 10 * 60 * 1000,
      createdAt: Date.now(),
    };
    dispatch({ type: 'ADD_TEMP_NUMBER', payload: info });
    return number;
  }, []);

  const revokeTempNumber = useCallback(async (number: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.revokeTempNumber(number);
    dispatch({ type: 'REMOVE_TEMP_NUMBER', payload: number });
  }, []);

  const resolveAndAddFriend = useCallback(async (tempNumber: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.resolveAndAddFriend(tempNumber);
  }, []);

  const removeFriend = useCallback(async (friendId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.removeFriend(friendId);
  }, []);

  const sendFile = useCallback(async (friendId: string, file: File): Promise<FileTransferInfo> => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    return client.sendFile(friendId, file);
  }, []);

  const pauseTransfer = useCallback((sessionId: string) => {
    clientRef.current?.pauseTransfer(sessionId);
  }, []);

  const resumeTransfer = useCallback(async (sessionId: string) => {
    await clientRef.current?.resumeTransfer(sessionId);
  }, []);

  const cancelTransfer = useCallback((sessionId: string) => {
    clientRef.current?.cancelTransfer(sessionId);
  }, []);

  const refreshFriends = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const friends = await client.refreshFriends();
    dispatch({ type: 'SET_FRIENDS', payload: friends });
  }, []);

  const markMessagesRead = useCallback((friendId: string) => {
    const client = clientRef.current;
    if (!client) return;
    client.markMessagesRead(friendId);
    unreadCountsRef.current[friendId] = 0;
    dispatch({ type: 'SET_UNREAD', payload: { ...unreadCountsRef.current } });
  }, []);

  const getLastMessage = useCallback((friendId: string): ChatMessage | null => {
    const client = clientRef.current;
    if (!client) return null;
    return client.getLastMessage(friendId);
  }, []);

  const getUnreadCount = useCallback((friendId: string): number => {
    return unreadCountsRef.current[friendId] || 0;
  }, []);

  const getStreamingState = useCallback((friendId: string): StreamingState | null => {
    return streamingRef.current[friendId] || null;
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  const createGroup = useCallback(async (name: string, description?: string): Promise<GroupInfo> => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const group = await client.createGroup(name, description);
    dispatch({ type: 'ADD_GROUP', payload: group });
    return group;
  }, []);

  const refreshGroups = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const groups = await client.getGroups();
      dispatch({ type: 'SET_GROUPS', payload: groups });
    } catch (err) {
      console.error('[AICQ] Failed to refresh groups:', err);
    }
  }, []);

  const inviteToGroup = useCallback(async (groupId: string, targetId: string, displayName?: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.inviteToGroup(groupId, targetId, displayName);
    const groups = await client.getGroups();
    dispatch({ type: 'SET_GROUPS', payload: groups });
  }, []);

  const kickFromGroup = useCallback(async (groupId: string, targetId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.kickFromGroup(groupId, targetId);
    const groups = await client.getGroups();
    dispatch({ type: 'SET_GROUPS', payload: groups });
  }, []);

  const leaveGroup = useCallback(async (groupId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.leaveGroup(groupId);
    dispatch({ type: 'REMOVE_GROUP', payload: groupId });
  }, []);

  const disbandGroup = useCallback(async (groupId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.disbandGroup(groupId);
    dispatch({ type: 'REMOVE_GROUP', payload: groupId });
  }, []);

  const updateGroupFn = useCallback(async (groupId: string, updates: { name?: string; description?: string }) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.updateGroup(groupId, updates);
    const groups = await client.getGroups();
    dispatch({ type: 'SET_GROUPS', payload: groups });
  }, []);

  const transferGroupOwnership = useCallback(async (groupId: string, targetId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.transferGroupOwnership(groupId, targetId);
    const groups = await client.getGroups();
    dispatch({ type: 'SET_GROUPS', payload: groups });
  }, []);

  const muteGroupMember = useCallback(async (groupId: string, targetId: string, muted: boolean) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.muteGroupMember(groupId, targetId, muted);
    const groups = await client.getGroups();
    dispatch({ type: 'SET_GROUPS', payload: groups });
  }, []);

  const setGroupMemberRoleFn = useCallback(async (groupId: string, targetId: string, role: 'owner' | 'admin' | 'member') => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.setGroupMemberRole(groupId, targetId, role);
    const groups = await client.getGroups();
    dispatch({ type: 'SET_GROUPS', payload: groups });
  }, []);

  const sendGroupMessage = useCallback((groupId: string, text: string): GroupMessage => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const msg = client.sendGroupMessage(groupId, text);
    dispatch({ type: 'ADD_GROUP_MESSAGE', payload: { groupId, message: msg } });
    return msg;
  }, []);

  const getGroupMessages = useCallback((groupId: string): GroupMessage[] => {
    const client = clientRef.current;
    if (!client) return [];
    return client.getGroupMessages(groupId);
  }, []);

  const getFriendRequests = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const res = await client.getFriendRequests();
      dispatch({ type: 'SET_FRIEND_REQUESTS', payload: res });
    } catch (err) {
      console.warn('[AICQ] Failed to fetch friend requests:', err);
    }
  }, []);

  const sendFriendRequestFn = useCallback(async (userId: string, message?: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const request = await client.sendFriendRequest(userId, message);
    dispatch({ type: 'ADD_FRIEND_REQUEST', payload: request });
  }, []);

  const acceptFriendRequestFn = useCallback(async (requestId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.acceptFriendRequest(requestId);
  }, []);

  const rejectFriendRequestFn = useCallback(async (requestId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.rejectFriendRequest(requestId);
  }, []);

  const broadcastMessageFn = useCallback(async (recipientIds: string[], message: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    return client.broadcastMessage(recipientIds, message);
  }, []);

  const forwardMessage = useCallback((friendId: string, text: string): ChatMessage => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const msg = client.sendMessage(friendId, `[转发] ${text}`);
    const msgs = messagesRef.current.get(friendId) || [];
    msgs.push(msg);
    messagesRef.current.set(friendId, msgs);
    return msg;
  }, []);

  const addNotification = useCallback((notification: PushNotification) => {
    dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
  }, []);

  const clearNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_NOTIFICATIONS' });
  }, []);

  const markNotificationRead = useCallback((notificationId: string) => {
    dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notificationId });
  }, []);

  const startSubAgentFn = useCallback(async (parentMessageId: string, task: string, context?: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const session = await client.startSubAgent(parentMessageId, task, context);
    dispatch({ type: 'ADD_SUB_AGENT', payload: session });
    return session;
  }, []);

  const sendSubAgentInputFn = useCallback(async (subAgentId: string, input: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.sendSubAgentInput(subAgentId, input);
  }, []);

  const abortSubAgentFn = useCallback(async (subAgentId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    await client.abortSubAgent(subAgentId);
    dispatch({ type: 'REMOVE_SUB_AGENT', payload: subAgentId });
  }, []);

  const getTaskPlans = useCallback((friendId: string): TaskPlan[] => {
    return state.taskPlans.filter(p => p.friendId === friendId);
  }, [state.taskPlans]);

  const createTaskPlan = useCallback((friendId: string, title: string, tasks: Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>[]): TaskPlan => {
    const now = Date.now();
    const plan: TaskPlan = {
      id: `plan-${now}-${Math.random().toString(36).slice(2, 8)}`,
      friendId,
      title,
      tasks: tasks.map((t, i) => ({
        ...t,
        id: `task-${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: 'ADD_TASK_PLAN', payload: plan });
    return plan;
  }, []);

  const updateTaskItemFn = useCallback((planId: string, taskId: string, updates: Partial<TaskItem>) => {
    dispatch({ type: 'UPDATE_TASK_ITEM', payload: { planId, taskId, updates } });
  }, []);

  const addTaskItemFn = useCallback((planId: string, title: string) => {
    const now = Date.now();
    const plan = taskPlansRef.current.find(p => p.id === planId);
    const maxOrder = plan ? Math.max(...plan.tasks.map(t => t.order), -1) + 1 : 0;
    const task: TaskItem = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      status: 'pending',
      order: maxOrder,
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: 'ADD_TASK_ITEM', payload: { planId, task } });
  }, []);

  const deleteTaskItemFn = useCallback((planId: string, taskId: string) => {
    dispatch({ type: 'DELETE_TASK_ITEM', payload: { planId, taskId } });
  }, []);

  const syncTaskPlanFn = useCallback((planId: string, friendId: string) => {
    const plan = taskPlansRef.current.find(p => p.id === planId);
    if (!plan) return;
    // Build a structured task list message to send to the AI
    const taskLines = plan.tasks
      .sort((a, b) => a.order - b.order)
      .map((t, i) => {
        const statusIcon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : t.status === 'failed' ? '❌' : '⬜';
        return `${i + 1}. ${statusIcon} ${t.title}`;
      })
      .join('\n');
    const syncMessage = `[任务计划同步 - ${plan.title}]\n以下是更新后的任务列表，请按照此列表严格执行：\n\n${taskLines}\n\n请确认收到并按照任务列表执行。`;
    // Use context's sendMessage which handles messagesRef push + agent queue
    sendMessage(friendId, syncMessage);
  }, [sendMessage]);

  const clearTaskPlanFn = useCallback((planId: string) => {
    dispatch({ type: 'REMOVE_TASK_PLAN', payload: planId });
  }, []);

  const abortAgentFn = useCallback(async (friendId: string) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const execState = agentExecutionRef.current[friendId];
      await (client as any).abortAgentExecution(
        friendId,
        execState?.sessionKey,
        execState?.runId,
      );
      dispatch({ type: 'CLEAR_AGENT_EXECUTION', payload: friendId });
    } catch (err) {
      console.error('[AICQ] Abort agent failed:', err);
    }
  }, []);

  const getAgentExecutionState = useCallback((friendId: string): AgentExecutionState | null => {
    return state.agentExecution[friendId] || null;
  }, [state.agentExecution]);

  const isAgentExecuting = useCallback((friendId: string): boolean => {
    return !!state.agentExecution[friendId]?.isExecuting;
  }, [state.agentExecution]);

  const loadMoreMessages = useCallback(async (friendId: string, before?: number): Promise<{ messages: ChatMessage[], hasMore: boolean }> => {
    const client = clientRef.current;
    if (!client) return { messages: [], hasMore: false };

    const currentMsgs = messagesRef.current.get(friendId) || [];
    const oldestTimestamp = before || (currentMsgs.length > 0 ? currentMsgs[0].timestamp : Date.now());

    const olderMsgs = await client.getCachedMessages(friendId, 30, oldestTimestamp);
    if (olderMsgs.length === 0) return { messages: [], hasMore: false };

    // Prepend older messages, avoiding duplicates
    const existingIds = new Set(currentMsgs.map(m => m.id));
    const newMsgs = olderMsgs.filter(m => !existingIds.has(m.id));

    const merged = [...newMsgs, ...currentMsgs];
    messagesRef.current.set(friendId, merged);

    const totalCount = await client.getCachedMessageCount(friendId);
    return { messages: merged, hasMore: merged.length < totalCount };
  }, []);

  const getMessageCount = useCallback(async (friendId: string): Promise<number> => {
    const client = clientRef.current;
    if (!client) return 0;
    return client.getCachedMessageCount(friendId);
  }, []);

  useEffect(() => {
    // Keep refs in sync with reducer state (avoid stale closures in connect handlers)
    taskPlansRef.current = state.taskPlans;
  }, [state.taskPlans]);

  useEffect(() => {
    typingStateRef.current = state.typingState;
  }, [state.typingState]);

  useEffect(() => {
    activeFriendIdRef.current = state.activeFriendId;
  }, [state.activeFriendId]);

  useEffect(() => {
    subAgentsRef.current = state.subAgents;
  }, [state.subAgents]);

  useEffect(() => {
    agentExecutionRef.current = state.agentExecution;
  }, [state.agentExecution]);

  useEffect(() => {
    messageQueueRef.current = state.messageQueue;
  }, [state.messageQueue]);

  useEffect(() => {
    return () => {
      clientRef.current?.destroy();
    };
  }, []);

  const value: AICQContextValue = useMemo(() => ({
    state,
    client: clientRef.current,
    connect,
    navigate,
    sendMessage,
    sendFileInfo,
    sendImage,
    sendVideo,
    sendTyping,
    getMessages,
    requestTempNumber,
    revokeTempNumber,
    resolveAndAddFriend,
    removeFriend,
    sendFile,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    refreshFriends,
    markMessagesRead,
    getLastMessage,
    getUnreadCount,
    getStreamingState,
    clearError,
    createGroup,
    refreshGroups,
    inviteToGroup,
    kickFromGroup,
    leaveGroup,
    disbandGroup,
    updateGroup: updateGroupFn,
    transferGroupOwnership,
    muteGroupMember,
    setGroupMemberRole: setGroupMemberRoleFn,
    sendGroupMessage,
    getGroupMessages,
    friendRequests: state.friendRequests,
    getFriendRequests,
    sendFriendRequest: sendFriendRequestFn,
    acceptFriendRequest: acceptFriendRequestFn,
    rejectFriendRequest: rejectFriendRequestFn,
    broadcastMessage: broadcastMessageFn,
    forwardMessage,
    notifications: state.notifications,
    addNotification,
    clearNotifications,
    markNotificationRead,
    subAgents: state.subAgents,
    startSubAgent: startSubAgentFn,
    sendSubAgentInput: sendSubAgentInputFn,
    abortSubAgent: abortSubAgentFn,
    taskPlans: state.taskPlans,
    getTaskPlans,
    createTaskPlan,
    updateTaskItem: updateTaskItemFn,
    addTaskItem: addTaskItemFn,
    deleteTaskItem: deleteTaskItemFn,
    syncTaskPlan: syncTaskPlanFn,
    clearTaskPlan: clearTaskPlanFn,
    abortAgent: abortAgentFn,
    getAgentExecutionState,
    isAgentExecuting,
    messageQueue: state.messageQueue,
    loadMoreMessages,
    getMessageCount,
  }), [state]);

  return <AICQContext.Provider value={value}>{children}</AICQContext.Provider>;
}

export function useAICQ(): AICQContextValue {
  const ctx = useContext(AICQContext);
  if (!ctx) throw new Error('useAICQ must be used within AICQProvider');
  return ctx;
}

export default AICQContext;
