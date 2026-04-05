import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAICQ } from '../context/AICQContext';
import StatusBadge from '../components/StatusBadge';
import type { ChatMessage } from '../types';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function getLastMessagePreview(msg: ChatMessage | null): string {
  if (!msg) return '暂无消息';
  if (msg.type === 'system') return msg.content;
  if (msg.type === 'file-info') {
    try {
      const info = JSON.parse(msg.content);
      return `📎 ${info.fileName}`;
    } catch { return '📎 文件'; }
  }
  return msg.content.length > 30 ? msg.content.slice(0, 30) + '...' : msg.content;
}

const ChatListScreen: React.FC = () => {
  const { state, navigate, getLastMessage, getUnreadCount, clearError, resolveAndAddFriend } = useAICQ();
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addTempNumber, setAddTempNumber] = useState('');
  const [addError, setAddError] = useState('');

  // Friend list with last message (memoized to avoid re-sorting on every render)
  const friendList = useMemo(() => {
    return state.friends
      .filter((f) => !search || f.id.includes(search) || f.fingerprint.includes(search))
      .sort((a, b) => {
        // Online friends first
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        // Then by last seen
        return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      });
  }, [state.friends, search]);

  const handleOpenChat = (friendId: string) => {
    navigate('chat', friendId);
  };

  const handleAddFriend = async () => {
    if (!addTempNumber.trim()) {
      setAddError('请输入临时号码');
      return;
    }
    setAddError('');
    try {
      await resolveAndAddFriend(addTempNumber.trim());
      setShowAddDialog(false);
      setAddTempNumber('');
    } catch (err: any) {
      setAddError(err.message || '添加好友失败');
    }
  };

  if (state.friends.length === 0) {
    return (
      <div className="chat-list-screen">
        <div className="screen-header">
          <h2>聊天</h2>
          <button className="btn-icon" onClick={() => setShowAddDialog(true)} title="添加好友">
            ➕
          </button>
        </div>
        <div className="empty-state">
          <span className="empty-icon">💬</span>
          <h3>暂无聊天</h3>
          <p>点击右上角添加好友开始聊天</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-list-screen">
      <div className="screen-header">
        <h2>聊天</h2>
        <button className="btn-icon" onClick={() => setShowAddDialog(true)} title="添加好友">
          ➕
        </button>
      </div>

      <div className="chat-list-search">
        <input
          type="text"
          className="search-input"
          placeholder="搜索好友..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chat-list">
        {friendList.map((friend) => {
          const lastMsg = getLastMessage(friend.id);
          const unread = getUnreadCount(friend.id);
          return (
            <div
              key={friend.id}
              className="chat-list-item"
              onClick={() => handleOpenChat(friend.id)}
            >
              <div className="chat-list-avatar">
                <div className={`avatar ${friend.isOnline ? 'online' : ''}`}>
                  {friend.fingerprint.slice(0, 2).toUpperCase()}
                </div>
                <StatusBadge isOnline={friend.isOnline} size="small" />
              </div>
              <div className="chat-list-info">
                <div className="chat-list-top">
                  <span className="chat-list-name">
                    {friend.fingerprint.slice(0, 8)}
                  </span>
                  <span className="chat-list-time">
                    {lastMsg ? formatTime(lastMsg.timestamp) : ''}
                  </span>
                </div>
                <div className="chat-list-bottom">
                  <span className="chat-list-preview">
                    {getLastMessagePreview(lastMsg)}
                  </span>
                  {unread > 0 && <span className="chat-list-badge">{unread}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating action button (mobile) */}
      <button
        className="fab"
        onClick={() => setShowAddDialog(true)}
        title="添加好友"
      >
        ➕
      </button>

      {/* Add Friend Dialog */}
      {showAddDialog && (
        <div className="dialog-overlay" onClick={() => setShowAddDialog(false)}>
          <div className="dialog-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>添加好友</h3>
              <button className="dialog-close" onClick={() => setShowAddDialog(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <label className="form-label">输入临时号码</label>
              <input
                type="text"
                className="form-input"
                placeholder="6位临时号码"
                value={addTempNumber}
                onChange={(e) => setAddTempNumber(e.target.value)}
                maxLength={6}
              />
              <button className="btn-scan" disabled>
                📷 扫描二维码
              </button>
              {addError && <div className="form-error">{addError}</div>}
              <button className="btn-primary" onClick={handleAddFriend}>
                发送请求
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatListScreen;
