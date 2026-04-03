import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect, useState } from 'react';
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
  | { type: 'ADD_MESSAGE'; payload: { friendId: string; message: ChatMessage } };

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
    case 'ADD_MESSAGE':
      // Recalculate unread for incoming messages
      {
        const { friendId, message } = action.payload;
        const isOwn = message.fromId === state.userId;
        const newCounts = { ...state.unreadCounts };
        if (!isOwn && message.type !== 'system') {
          newCounts[friendId] = (newCounts[friendId] || 0) + 1;
        }
        return { ...state, unreadCounts: newCounts };
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
  sendFileInfo: (friendId: string, fileInfo: { fileName: string; fileSize: number }) => ChatMessage;
  sendTyping: (friendId: string) => void;
  getMessages: (friendId: string) => ChatMessage[];
  requestTempNumber: () => Promise<string>;
  revokeTempNumber: (number: string) => Promise<void>;
  resolveAndAddFriend: (tempNumber: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  sendFile: (friendId: string, file: File) => Promise<FileTransferInfo>;
  refreshFriends: () => Promise<void>;
  markMessagesRead: (friendId: string) => void;
  getLastMessage: (friendId: string) => ChatMessage | null;
  getUnreadCount: (friendId: string) => number;
  clearError: () => void;
}

const AICQContext = createContext<AICQContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────

export function AICQProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const clientRef = useRef<WebClient | null>(null);

  // Store messages in a ref for getMessages
  const messagesRef = useRef<Map<string, ChatMessage[]>>(new Map());

  const connect = useCallback(async (serverUrl: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const client = new WebClient({ serverUrl });
      clientRef.current = client;

      // Wire up events before initializing
      client.on('connected', () => {
        dispatch({ type: 'SET_CONNECTED', payload: true });
      });

      client.on('disconnected', () => {
        dispatch({ type: 'SET_CONNECTED', payload: false });
      });

      client.on('message', (msg: ChatMessage) => {
        // Store locally
        const friendId = msg.fromId === client.getUserId() ? msg.toId : msg.fromId;
        const msgs = messagesRef.current.get(friendId) || [];
        msgs.push(msg);
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
        // Clear after 3 seconds
        setTimeout(() => {
          dispatch({
            type: 'SET_TYPING',
            payload: { [event.fromId]: false },
          });
        }, 3000);
      });

      client.on('friend_added', (friend: FriendInfo) => {
        dispatch({ type: 'ADD_FRIEND', payload: friend });
        // Load messages for this friend
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

      client.on('handshake_progress', (progress: HandshakeProgress) => {
        if (progress.status === 'completed') {
          // Refresh friends after handshake completes
          client.refreshFriends().then((friends) => {
            dispatch({ type: 'SET_FRIENDS', payload: friends });
            // Load messages for all friends
            for (const f of friends) {
              messagesRef.current.set(f.id, client.getMessages(f.id));
            }
          });
        }
      });

      // Initialize
      const result = await client.initialize();

      dispatch({
        type: 'SET_USER',
        payload: { userId: result.userId, fingerprint: result.fingerprint },
      });
      dispatch({ type: 'SET_INITIALIZED', payload: true });

      // Load existing friends and messages
      const friends = await client.refreshFriends();
      dispatch({ type: 'SET_FRIENDS', payload: friends });

      for (const f of friends) {
        messagesRef.current.set(f.id, client.getMessages(f.id));
        const count = client.getUnreadCount(f.id);
        if (count > 0) {
          dispatch({
            type: 'SET_UNREAD',
            payload: { ...state.unreadCounts, [f.id]: count },
          });
        }
      }

      // Load temp numbers
      const tempNumbers = client.getTempNumbers();
      dispatch({ type: 'SET_TEMP_NUMBERS', payload: tempNumbers });

      // Load file transfers
      const transfers = client.getFileTransfers();
      dispatch({ type: 'SET_FILE_TRANSFERS', payload: transfers });

      // Navigate to chat list
      dispatch({ type: 'SET_SCREEN', payload: 'chatList' });
    } catch (err: any) {
      console.error('[AICQ] Connection failed:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message || '连接失败' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.typingState, state.unreadCounts]);

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

  const sendFileInfo = useCallback((friendId: string, fileInfo: { fileName: string; fileSize: number }): ChatMessage => {
    const client = clientRef.current;
    if (!client) throw new Error('Client not initialized');
    const msg = client.sendFileInfo(friendId, fileInfo);
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
    dispatch({
      type: 'SET_UNREAD',
      payload: { ...state.unreadCounts, [friendId]: 0 },
    });
  }, [state.unreadCounts]);

  const getLastMessage = useCallback((friendId: string): ChatMessage | null => {
    const client = clientRef.current;
    if (!client) return null;
    return client.getLastMessage(friendId);
  }, []);

  const getUnreadCount = useCallback((friendId: string): number => {
    return state.unreadCounts[friendId] || 0;
  }, [state.unreadCounts]);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  // Cleanup on unmount
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
    sendTyping,
    getMessages,
    requestTempNumber,
    revokeTempNumber,
    resolveAndAddFriend,
    removeFriend,
    sendFile,
    refreshFriends,
    markMessagesRead,
    getLastMessage,
    getUnreadCount,
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
