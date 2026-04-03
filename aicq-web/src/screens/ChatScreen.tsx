import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAICQ } from '../context/AICQContext';
import MessageBubble, { DateSeparator } from '../components/MessageBubble';
import StatusBadge from '../components/StatusBadge';
import FileTransferProgress from '../components/FileTransferProgress';
import type { ChatMessage } from '../types';

const ChatScreen: React.FC = () => {
  const {
    state,
    navigate,
    sendMessage,
    sendTyping,
    getMessages,
    sendFile,
    markMessagesRead,
  } = useAICQ();

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const friendId = state.activeFriendId;
  const friend = state.friends.find((f) => f.id === friendId);
  const messages = getMessages(friendId || '');
  const isTyping = state.typingState[friendId || ''];

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isTyping]);

  // Mark messages as read when opening chat
  useEffect(() => {
    if (friendId) {
      markMessagesRead(friendId);
    }
  }, [friendId, markMessagesRead]);

  const handleSend = useCallback(() => {
    if (!friendId || !inputText.trim()) return;
    sendMessage(friendId, inputText.trim());
    setInputText('');
    inputRef.current?.focus();
  }, [friendId, inputText, sendMessage]);

  const handleTyping = useCallback(() => {
    if (!friendId) return;
    sendTyping(friendId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, [friendId, sendTyping]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !friendId) return;
    for (const file of Array.from(files)) {
      try {
        await sendFile(friendId, file);
      } catch (err) {
        console.error('File send failed:', err);
      }
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!friendId || !friend) {
    return (
      <div className="chat-screen">
        <div className="empty-state">
          <span className="empty-icon">💬</span>
          <h3>选择一个聊天</h3>
          <p>从左侧列表选择好友开始聊天</p>
        </div>
      </div>
    );
  }

  // Group messages by date
  const messagesWithDates: React.ReactNode[] = [];
  let lastDate = '';

  for (const msg of messages) {
    const msgDate = new Date(msg.timestamp).toDateString();
    if (msgDate !== lastDate) {
      messagesWithDates.push(<DateSeparator key={`date-${msg.id}`} date={new Date(msg.timestamp)} />);
      lastDate = msgDate;
    }
    messagesWithDates.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isOwn={msg.fromId === state.userId}
        userId={state.userId}
      />
    );
  }

  // Active file transfers for this friend
  const activeTransfers = state.fileTransfers.filter(
    (t) => t.status === 'transferring' || t.status === 'paused'
  );

  return (
    <div className="chat-screen">
      {/* Header */}
      <div className="chat-header">
        <button className="btn-back" onClick={() => navigate('chatList', null)}>
          ←
        </button>
        <div className="chat-header-info">
          <span className="chat-header-name">{friend.fingerprint.slice(0, 8)}</span>
          <StatusBadge isOnline={friend.isOnline} size="small" />
        </div>
        <span className="chat-header-encrypt">🔒 加密</span>
      </div>

      {/* Messages area */}
      <div className="chat-messages">
        {messagesWithDates}
        {isTyping && (
          <div className="message-row other">
            <div className="message-bubble other typing-indicator">
              <span className="typing-dots">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* File transfer progress */}
      {activeTransfers.length > 0 && (
        <div className="chat-transfers">
          {activeTransfers.map((t) => (
            <FileTransferProgress key={t.sessionId} transfer={t} />
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="chat-input-area">
        <button
          className="btn-attach"
          onClick={() => fileInputRef.current?.click()}
          title="发送文件"
        >
          📎
        </button>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="输入消息..."
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn-send"
          onClick={handleSend}
          disabled={!inputText.trim()}
          title="发送"
        >
          发送
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
};

export default ChatScreen;
