import React, { useState, useEffect } from 'react';
import { useAICQ } from '../context/AICQContext';
import StatusBadge from '../components/StatusBadge';
import type { FriendInfo } from '../types';

const MAX_FRIENDS = 200;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function formatRequestTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
  return formatDate(d.toISOString());
}

type FriendTab = 'list' | 'requests';

const FriendsScreen: React.FC = () => {
  const {
    state,
    removeFriend,
    resolveAndAddFriend,
    getFriendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
  } = useAICQ();
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addTempNumber, setAddTempNumber] = useState('');
  const [addError, setAddError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FriendTab>('list');

  // Friend request dialog
  const [showSendRequestDialog, setShowSendRequestDialog] = useState(false);
  const [requestUserId, setRequestUserId] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const friendCount = state.friends.length;
  const filteredFriends = state.friends.filter(
    (f) => !search || f.id.includes(search) || f.fingerprint.includes(search)
  );

  const pendingRequests = state.friendRequests.filter(r => r.status === 'pending');
  const incomingRequests = state.friendRequests.filter(r => r.toId === state.userId && r.status === 'pending');
  const sentRequests = state.friendRequests.filter(r => r.fromId === state.userId);

  useEffect(() => {
    if (activeTab === 'requests') {
      getFriendRequests().catch(() => {});
    }
  }, [activeTab, getFriendRequests]);

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

  const handleSendRequest = async () => {
    if (!requestUserId.trim()) {
      setRequestError('请输入用户ID');
      return;
    }
    setRequestError('');
    setIsSendingRequest(true);
    try {
      await sendFriendRequest(requestUserId.trim(), requestMessage.trim() || undefined);
      setShowSendRequestDialog(false);
      setRequestUserId('');
      setRequestMessage('');
    } catch (err: any) {
      setRequestError(err.message || '发送请求失败');
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    setActionLoadingId(requestId);
    try {
      await acceptFriendRequest(requestId);
    } catch (err: any) {
      console.error('Accept failed:', err);
    }
    setActionLoadingId(null);
  };

  const handleReject = async (requestId: string) => {
    setActionLoadingId(requestId);
    try {
      await rejectFriendRequest(requestId);
    } catch (err: any) {
      console.error('Reject failed:', err);
    }
    setActionLoadingId(null);
  };

  return (
    <div className="friends-screen">
      <div className="screen-header">
        <h2>好友</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => setShowSendRequestDialog(true)} style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}>
            📩 发送请求
          </button>
          <button className="btn-primary" onClick={() => setShowAddDialog(true)} style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}>
            ➕ 添加好友
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="friend-tabs">
        <button
          className={`friend-tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          好友列表 ({friendCount})
        </button>
        <button
          className={`friend-tab ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          好友请求
          {pendingRequests.length > 0 && (
            <span className="friend-tab-badge">{pendingRequests.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'list' && (
        <>
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
        </>
      )}

      {activeTab === 'requests' && (
        <div className="friend-requests-container">
          {/* Incoming requests */}
          <div className="friend-requests-section">
            <div className="friend-requests-section-title">收到的请求 ({incomingRequests.length})</div>
            {incomingRequests.length === 0 ? (
              <div className="empty-state small">
                <p>暂无收到的请求</p>
              </div>
            ) : (
              incomingRequests.map((req) => (
                <div key={req.id} className="friend-request-card">
                  <div className="friend-request-card-info">
                    <div className="friend-request-card-header">
                      <span className="friend-request-card-id">ID: {req.fromId.slice(0, 12)}...</span>
                      <span className="friend-request-card-time">{formatRequestTime(req.createdAt)}</span>
                    </div>
                    {req.message && (
                      <div className="friend-request-card-message">{req.message}</div>
                    )}
                  </div>
                  <div className="friend-request-actions">
                    <button
                      className="btn-sm btn-primary-sm"
                      onClick={() => handleAccept(req.id)}
                      disabled={actionLoadingId === req.id}
                    >
                      {actionLoadingId === req.id ? '...' : '✓ 接受'}
                    </button>
                    <button
                      className="btn-sm btn-danger"
                      onClick={() => handleReject(req.id)}
                      disabled={actionLoadingId === req.id}
                    >
                      {actionLoadingId === req.id ? '...' : '✕ 拒绝'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Sent requests */}
          <div className="friend-requests-section">
            <div className="friend-requests-section-title">发出的请求 ({sentRequests.length})</div>
            {sentRequests.length === 0 ? (
              <div className="empty-state small">
                <p>暂无发出的请求</p>
              </div>
            ) : (
              sentRequests.map((req) => (
                <div key={req.id} className="friend-request-card">
                  <div className="friend-request-card-info">
                    <div className="friend-request-card-header">
                      <span className="friend-request-card-id">ID: {req.toId.slice(0, 12)}...</span>
                      <span className="friend-request-card-time">{formatRequestTime(req.createdAt)}</span>
                    </div>
                    {req.message && (
                      <div className="friend-request-card-message">{req.message}</div>
                    )}
                  </div>
                  <span className={`friend-request-status ${req.status}`}>
                    {req.status === 'pending' ? '⏳ 等待中' : req.status === 'accepted' ? '✓ 已接受' : '✕ 已拒绝'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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

      {/* Send Friend Request Dialog */}
      {showSendRequestDialog && (
        <div className="dialog-overlay" onClick={() => setShowSendRequestDialog(false)}>
          <div className="dialog-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>发送好友请求</h3>
              <button className="dialog-close" onClick={() => setShowSendRequestDialog(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <label className="form-label">用户ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入对方的用户ID"
                value={requestUserId}
                onChange={(e) => setRequestUserId(e.target.value)}
              />
              <label className="form-label" style={{ marginTop: 8 }}>附言（可选）</label>
              <input
                type="text"
                className="form-input"
                placeholder="例如：我是xxx，想加你为好友"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                maxLength={100}
              />
              {requestError && <div className="form-error">{requestError}</div>}
              <button className="btn-primary" onClick={handleSendRequest} disabled={isSendingRequest}>
                {isSendingRequest ? '发送中...' : '发送请求'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FriendsScreen;
