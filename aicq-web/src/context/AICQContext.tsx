import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
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
  | { type: 'CLEAR_STREAMING'; payload: string };

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
}

const AICQContext = createContext<AICQContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────

export function AICQProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const clientRef = useRef<WebClient | null>(null);
  const messagesRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const unreadCountsRef = useRef<UnreadCounts>({});
  const streamingRef = useRef<Record<string, StreamingState>>({});

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
        dispatch({
          type: 'SET_TYPING',
          payload: { ...state.typingState, [event.fromId]: true },
        });
        setTimeout(() => {
          dispatch({
            type: 'SET_TYPING',
            payload: { [event.fromId]: false },
          });
        }, 3000);
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
          payload: { friendId: state.activeFriendId || '', state: streaming },
        });
      });

      client.on('streaming_complete', (streaming: StreamingState) => {
        if (state.activeFriendId) {
          dispatch({ type: 'CLEAR_STREAMING', payload: state.activeFriendId });
        }
        // Add the final message
        const msgs = messagesRef.current.get(state.activeFriendId || '') || [];
        const finalMsg: ChatMessage = {
          id: streaming.messageId,
          fromId: state.activeFriendId || '',
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
        messagesRef.current.set(state.activeFriendId || '', msgs);
      });

      client.on('streaming_error', (streaming: StreamingState) => {
        dispatch({
          type: 'UPDATE_STREAMING',
          payload: {
            friendId: state.activeFriendId || '',
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

      const result = await client.initialize();

      dispatch({
        type: 'SET_USER',
        payload: { userId: result.userId, fingerprint: result.fingerprint },
      });
      dispatch({ type: 'SET_INITIALIZED', payload: true });

      const friends = await client.refreshFriends();
      dispatch({ type: 'SET_FRIENDS', payload: friends });

      for (const f of friends) {
        messagesRef.current.set(f.id, client.getMessages(f.id));
        const count = client.getUnreadCount(f.id);
        if (count > 0) {
          unreadCountsRef.current[f.id] = count;
        }
      }

      dispatch({ type: 'SET_UNREAD', payload: { ...unreadCountsRef.current } });

      const tempNumbers = client.getTempNumbers();
      dispatch({ type: 'SET_TEMP_NUMBERS', payload: tempNumbers });

      const transfers = client.getFileTransfers();
      dispatch({ type: 'SET_FILE_TRANSFERS', payload: transfers });

      dispatch({ type: 'SET_SCREEN', payload: 'chatList' });
    } catch (err: any) {
      console.error('[AICQ] Connection failed:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message || '连接失败' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.typingState, state.activeFriendId]);

  const navigate = useCallback((screen: ScreenName, friendId: string | null = null) => {
    dispatch({ type: 'SET_SCREEN', payload: screen });
    if (friendId !== undefined) {
      dispatch({ type: 'SET_ACTIVE_FRIEND', payload: friendId });
    }
  }, []);

  const sendMessage = useCallback((friendId: string, text: string): ChatMessage => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const msg = client.sendMessage(friendId, text);
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

  useEffect(() => {
    return () => {
      clientRef.current?.destroy();
    };
  }, []);

  const value: AICQContextValue = {
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
  };

  return <AICQContext.Provider value={value}>{children}</AICQContext.Provider>;
}

export function useAICQ(): AICQContextValue {
  const ctx = useContext(AICQContext);
  if (!ctx) throw new Error('useAICQ must be used within AICQProvider');
  return ctx;
}

export default AICQContext;
