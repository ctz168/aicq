import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAICQ } from '../context/AICQContext';
import type { GroupInfo, GroupMessage, GroupMemberInfo } from '../types';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return '今天';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const GroupChatScreen: React.FC = () => {
  const {
    state,
    navigate,
    sendGroupMessage,
    getGroupMessages,
    leaveGroup,
    disbandGroup,
    kickFromGroup,
    inviteToGroup,
    updateGroup,
    refreshGroups,
    transferGroupOwnership,
    muteGroupMember,
  } = useAICQ();

  const [inputText, setInputText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inviteId, setInviteId] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [showInviteFromFriends, setShowInviteFromFriends] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [muteTargetId, setMuteTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoScrollRef = useRef(true);

  const groupId = state.activeGroupId;
  const group = state.groups.find((g) => g.id === groupId);
  const messages = getGroupMessages(groupId || '');
  const userId = state.userId;

  const isOwner = group?.ownerId === userId;
  const isAdmin = group?.members.some((m) => m.accountId === userId && m.role === 'admin') || false;
  const canManage = isOwner || isAdmin;

  // Check if current user is muted
  const isSelfMuted = group?.members.some((m) => m.accountId === userId && m.isMuted) || false;

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback((force = false) => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (force || isNearBottom || autoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    autoScrollRef.current = isNearBottom;
  }, []);

  const handleSend = useCallback(async () => {
    if (!groupId || !inputText.trim()) return;
    setIsSending(true);
    try {
      sendGroupMessage(groupId, inputText.trim());
      setInputText('');
      autoScrollRef.current = true;
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      inputRef.current?.focus();
    } finally {
      setIsSending(false);
    }
  }, [groupId, inputText, sendGroupMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const handleInvite = async () => {
    if (!groupId || !inviteId.trim()) {
      setInviteError('请输入用户ID');
      return;
    }
    setInviteError('');
    try {
      await inviteToGroup(groupId, inviteId.trim(), inviteName.trim() || undefined);
      setShowInviteDialog(false);
      setShowInviteFromFriends(false);
      setInviteId('');
      setInviteName('');
      await refreshGroups();
    } catch (err: any) {
      setInviteError(err.message || '邀请失败');
    }
  };

  const handleKick = async (targetId: string) => {
    if (!groupId) return;
    try {
      await kickFromGroup(groupId, targetId);
      await refreshGroups();
    } catch (err: any) {
      console.error('Kick failed:', err);
    }
  };

  const handleLeave = async () => {
    if (!groupId) return;
    try {
      await leaveGroup(groupId);
      navigate('groupList', null);
    } catch (err: any) {
      console.error('Leave failed:', err);
    }
    setConfirmAction(null);
  };

  const handleDisband = async () => {
    if (!groupId) return;
    try {
      await disbandGroup(groupId);
      navigate('groupList', null);
    } catch (err: any) {
      console.error('Disband failed:', err);
    }
    setConfirmAction(null);
  };

  const handleTransfer = async () => {
    if (!groupId || !transferTargetId.trim()) return;
    if (!confirm(`确定要将群主转让给 ${transferTargetId} 吗？此操作不可撤销。`)) return;
    try {
      await transferGroupOwnership(groupId, transferTargetId.trim());
      setTransferTargetId('');
      setConfirmAction(null);
    } catch (err) {
      console.error('Transfer failed:', err);
      alert('转让失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleMute = async (targetId: string) => {
    if (!groupId) return;
    const member = group?.members.find(m => m.accountId === targetId);
    if (!member) return;
    try {
      const isCurrentlyMuted = member.isMuted;
      await muteGroupMember(groupId, targetId, !isCurrentlyMuted);
      setMuteTargetId(null);
      await refreshGroups();
    } catch (err) {
      console.error('Mute failed:', err);
      alert('操作失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const getRoleLabel = (role: GroupMemberInfo['role']): string => {
    switch (role) {
      case 'owner': return '群主';
      case 'admin': return '管理员';
      default: return '成员';
    }
  };

  const getRoleClass = (role: GroupMemberInfo['role']): string => {
    switch (role) {
      case 'owner': return 'owner';
      case 'admin': return 'admin';
      default: return 'member';
    }
  };

  // Build message list with date separators
  const messageElements = useMemo(() => {
    const elements: React.ReactNode[] = [];
    let lastDate = '';

    for (const msg of messages) {
      const msgDate = new Date(msg.timestamp).toDateString();
      if (msgDate !== lastDate) {
        elements.push(
          <div key={`date-${msg.id}`} className="group-message-system">
            {formatDate(msg.timestamp)}
          </div>
        );
        lastDate = msgDate;
      }

      if (msg.type === 'system') {
        elements.push(
          <div key={msg.id} className="group-message-system">
            {msg.content}
          </div>
        );
        continue;
      }

      const isOwn = msg.fromId === userId;
      elements.push(
        <div key={msg.id} className={`group-message ${isOwn ? 'own' : ''}`}>
          {!isOwn && (
            <div className="group-message-avatar">
              {msg.fromName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="group-message-content">
            {!isOwn && (
              <div className="group-message-sender">{msg.fromName}</div>
            )}
            <div className="group-message-bubble">
              <div className="message-text">{msg.content}</div>
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
          {isOwn && (
            <div className="group-message-avatar" style={{ background: 'linear-gradient(135deg, #1f6feb, #764ba2)' }}>
              我
            </div>
          )}
        </div>
      );
    }

    return elements;
  }, [messages, userId]);

  if (!groupId || !group) {
    return (
      <div className="chat-screen">
        <div className="empty-state">
          <span className="empty-icon">🗣️</span>
          <h3>选择一个群组</h3>
          <p>从群组列表选择一个群组开始聊天</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-screen">
      {/* Header */}
      <div className="chat-header">
        <button className="btn-back" onClick={() => navigate('groupList', null)}>
          ←
        </button>
        <div className="chat-header-info">
          <div className="chat-header-avatar" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {group.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="chat-header-details">
            <span className="chat-header-name">{group.name}</span>
            <div className="chat-header-status">
              <span>{group.memberCount} 位成员</span>
            </div>
          </div>
        </div>
        <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="群组设置" style={{ border: 'none' }}>
          ⚙️
        </button>
      </div>

      {/* Messages area */}
      <div
        className="chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {messageElements}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        {isSelfMuted && (
          <div style={{ fontSize: 12, color: 'var(--orange)', textAlign: 'center', marginBottom: 4 }}>
            🚫 你已被管理员禁言
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input-textarea"
            placeholder="输入消息... (Shift+Enter 换行)"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isSelfMuted}
          />
          <button
            className={`btn-send ${inputText.trim() ? 'active' : 'disabled'}`}
            onClick={handleSend}
            disabled={!inputText.trim() || isSending || isSelfMuted}
            title="发送"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <>
          <div className="group-settings-overlay" onClick={() => setShowSettings(false)} />
          <div className="group-settings-panel">
            <div className="group-settings-header">
              <h3>群组设置</h3>
              <button className="dialog-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="group-settings-body">
              {/* Group Info */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{group.name}</div>
                {group.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {group.description}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  群组ID: {group.id.slice(0, 12)}...
                </div>
              </div>

              {/* Announcement */}
              {showAnnouncement && (
                <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>📢 群公告</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{announcement}</div>
                </div>
              )}

              {/* Invite button */}
              <button
                className="btn-primary"
                style={{ marginBottom: 16, fontSize: 13 }}
                onClick={() => { setShowInviteFromFriends(true); setShowInviteDialog(false); }}
              >
                ➕ 邀请成员
              </button>

              {/* Members */}
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>成员 ({group.memberCount})</div>
              {group.members.map((member) => {
                const isSelf = member.accountId === userId;
                return (
                  <div key={member.accountId} className="group-member-item">
                    <div className="group-message-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                      {member.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {member.displayName}
                        {isSelf && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(我)</span>}
                        {member.isMuted && <span style={{ fontSize: 10, color: 'var(--orange)' }}>🚫</span>}
                      </div>
                      <span className={`group-member-role ${getRoleClass(member.role)}`}>
                        {getRoleLabel(member.role)}
                      </span>
                    </div>
                    {canManage && !isSelf && (
                      <div className="group-member-actions">
                        {isOwner && (
                          <>
                            <button
                              className="group-action-btn"
                              onClick={() => setMuteTargetId(member.accountId)}
                              title={member.isMuted ? '解除禁言' : '禁言'}
                            >
                              {member.isMuted ? '🔇' : '🔇'}
                            </button>
                            <button
                              className="group-action-btn"
                              onClick={() => setTransferTargetId(member.accountId)}
                              title="转让群主"
                            >
                              👑
                            </button>
                          </>
                        )}
                        <button
                          className="group-action-btn danger"
                          onClick={() => handleKick(member.accountId)}
                          title="踢出"
                        >
                          踢出
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer actions */}
            <div className="group-settings-footer">
              {isOwner && (
                <button
                  className="btn-sm btn-danger"
                  onClick={() => setConfirmAction('disband')}
                  style={{ width: '100%' }}
                >
                  解散群组
                </button>
              )}
              <button
                className="btn-sm"
                onClick={() => setConfirmAction('leave')}
                style={{ width: '100%' }}
              >
                退出群组
              </button>
            </div>
          </div>
        </>
      )}

      {/* Invite Dialog */}
      {showInviteDialog && (
        <div className="dialog-overlay" onClick={() => setShowInviteDialog(false)}>
          <div className="dialog-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>邀请成员</h3>
              <button className="dialog-close" onClick={() => setShowInviteDialog(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <label className="form-label">用户ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入用户ID"
                value={inviteId}
                onChange={(e) => setInviteId(e.target.value)}
              />
              <label className="form-label" style={{ marginTop: 8 }}>显示名称（可选）</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入显示名称"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
              {inviteError && <div className="form-error">{inviteError}</div>}
              <button className="btn-primary" onClick={handleInvite}>
                发送邀请
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite from Friends Dialog */}
      {showInviteFromFriends && (
        <div className="dialog-overlay" onClick={() => setShowInviteFromFriends(false)}>
          <div className="dialog-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="dialog-header">
              <h3>邀请好友</h3>
              <button className="dialog-close" onClick={() => setShowInviteFromFriends(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {state.friends.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                    暂无好友可邀请
                  </div>
                ) : (
                  state.friends.map(f => (
                    <div key={f.id} className="group-member-item" style={{ cursor: 'pointer' }} onClick={() => { setInviteId(f.id); setShowInviteFromFriends(false); setShowInviteDialog(true); }}>
                      <div className="group-message-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                        {f.fingerprint.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {f.aiName || f.fingerprint.slice(0, 12)}...
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {f.isOnline ? '🟢 在线' : '⚫ 离线'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>或手动输入用户ID</div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="输入用户ID"
                  value={inviteId}
                  onChange={(e) => setInviteId(e.target.value)}
                />
                <label className="form-label" style={{ marginTop: 8 }}>显示名称（可选）</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="输入显示名称"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
                {inviteError && <div className="form-error">{inviteError}</div>}
                <button className="btn-primary" onClick={handleInvite} disabled={!inviteId.trim()}>
                  发送邀请
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmAction && (
        <div className="dialog-overlay" onClick={() => setConfirmAction(null)}>
          <div className="dialog-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>确认操作</h3>
              <button className="dialog-close" onClick={() => setConfirmAction(null)}>✕</button>
            </div>
            <div className="dialog-body">
              <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
                {confirmAction === 'disband'
                  ? '确定要解散此群组吗？此操作不可撤销，所有成员将被移出。'
                  : '确定要退出此群组吗？'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-sm"
                  onClick={() => setConfirmAction(null)}
                  style={{ flex: 1 }}
                >
                  取消
                </button>
                <button
                  className="btn-sm btn-danger"
                  onClick={confirmAction === 'disband' ? handleDisband : handleLeave}
                  style={{ flex: 1 }}
                >
                  {confirmAction === 'disband' ? '解散' : '退出'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupChatScreen;
