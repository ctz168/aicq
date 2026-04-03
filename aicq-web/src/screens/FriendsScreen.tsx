import React, { useState, useEffect } from 'react';
import { useAICQ } from '../context/AICQContext';
import StatusBadge from '../components/StatusBadge';
import type { FriendInfo } from '../types';

const MAX_FRIENDS = 200;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

const FriendsScreen: React.FC = () => {
  const { state, removeFriend, resolveAndAddFriend } = useAICQ();
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addTempNumber, setAddTempNumber] = useState('');
  const [addError, setAddError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const friendCount = state.friends.length;
  const filteredFriends = state.friends.filter(
    (f) => !search || f.id.includes(search) || f.fingerprint.includes(search)
  );

  const handleRemove = async (friendId: string) => {
    if (!confirm('确定要删除此好友吗？')) return;
    setRemovingId(friendId);
    try {
      await removeFriend(friendId);
    } catch (err: any) {
      alert('删除失败: ' + (err.message || '未知错误'));
    }
    setRemovingId(null);
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

  return (
    <div className="friends-screen">
      <div className="screen-header">
        <h2>好友</h2>
        <button className="btn-primary" onClick={() => setShowAddDialog(true)}>
          ➕ 添加好友
        </button>
      </div>

      <div className="friends-stats">
        <span className="friends-count">
          {friendCount}/{MAX_FRIENDS} 好友
        </span>
        {friendCount >= MAX_FRIENDS - 10 && (
          <span className="friends-warning">
            ⚠️ 即将达到好友上限
          </span>
        )}
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

      <div className="friends-list">
        {filteredFriends.length === 0 ? (
          <div className="empty-state small">
            <p>{search ? '没有找到匹配的好友' : '暂无好友，点击上方按钮添加'}</p>
          </div>
        ) : (
          filteredFriends.map((friend) => (
            <div key={friend.id} className="friend-card">
              <div className="friend-card-left">
                <div className="friend-avatar">
                  <div className={`avatar ${friend.isOnline ? 'online' : ''}`}>
                    {friend.fingerprint.slice(0, 2).toUpperCase()}
                  </div>
                  <StatusBadge isOnline={friend.isOnline} size="small" />
                </div>
                <div className="friend-info">
                  <span className="friend-fingerprint">{friend.fingerprint.slice(0, 16)}...</span>
                  <span className="friend-id">ID: {friend.id.slice(0, 8)}...</span>
                  <span className="friend-date">添加于: {formatDate(friend.addedAt)}</span>
                </div>
              </div>
              <div className="friend-card-right">
                <button
                  className="btn-sm btn-danger"
                  onClick={() => handleRemove(friend.id)}
                  disabled={removingId === friend.id}
                >
                  {removingId === friend.id ? '...' : '删除'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Friend Dialog */}
      {showAddDialog && (
        <div className="dialog-overlay" onClick={() => setShowAddDialog(false)}>
          <div className="dialog-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>添加好友</h3>
              <button className="dialog-close" onClick={() => setShowAddDialog(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <label className="form-label">输入好友的6位临时号码</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入6位号码"
                value={addTempNumber}
                onChange={(e) => setAddTempNumber(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
              />
              <button className="btn-scan" disabled>
                📷 扫描二维码（即将推出）
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

export default FriendsScreen;
