import React, { useState, useEffect, useCallback } from 'react';
import { useAICQ } from '../context/AICQContext';
import type { GroupMessage } from '../types';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function getLastGroupMessagePreview(msg: GroupMessage | null): string {
  if (!msg) return '暂无消息';
  if (msg.type === 'system') return msg.content;
  if (msg.type === 'file-info') {
    try {
      const info = JSON.parse(msg.content);
      return `📎 ${info.fileName}`;
    } catch { return '📎 文件'; }
  }
  const sender = msg.fromName ? `${msg.fromName}: ` : '';
  const text = msg.content.length > 20 ? msg.content.slice(0, 20) + '...' : msg.content;
  return sender + text;
}

const GroupListScreen: React.FC = () => {
  const { state, navigate, refreshGroups, createGroup, getGroupMessages } = useAICQ();
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    refreshGroups();
  }, [refreshGroups]);

  const filteredGroups = state.groups
    .filter((g) => !search || g.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setCreateError('请输入群组名称');
      return;
    }
    setCreateError('');
    setIsCreating(true);
    try {
      const group = await createGroup(groupName.trim(), groupDesc.trim() || undefined);
      setShowCreateDialog(false);
      setGroupName('');
      setGroupDesc('');
      navigate('groupChat', group.id);
    } catch (err: any) {
      setCreateError(err.message || '创建群组失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenGroup = (groupId: string) => {
    navigate('groupChat', groupId);
  };

  const getGroupLastMessage = (groupId: string): GroupMessage | null => {
    const msgs = getGroupMessages(groupId);
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  };

  const getGroupUnread = (groupId: string): number => {
    return state.groupUnreadCounts[groupId] || 0;
  };

  if (state.groups.length === 0 && !search) {
    return (
      <div className="chat-list-screen">
        <div className="screen-header">
          <h2>群组</h2>
          <button className="btn-icon" onClick={() => setShowCreateDialog(true)} title="创建群组">
            ➕
          </button>
        </div>
        <div className="empty-state">
          <span className="empty-icon">🗣️</span>
          <h3>暂无群组</h3>
          <p>点击右上角创建群组</p>
        </div>
        <button
          className="fab"
          onClick={() => setShowCreateDialog(true)}
          title="创建群组"
        >
          ➕
        </button>
        {showCreateDialog && (
          <div className="dialog-overlay" onClick={() => setShowCreateDialog(false)}>
            <div className="dialog-popup" onClick={(e) => e.stopPropagation()}>
              <div className="dialog-header">
                <h3>创建群组</h3>
                <button className="dialog-close" onClick={() => setShowCreateDialog(false)}>✕</button>
              </div>
              <div className="dialog-body">
                <label className="form-label">群组名称</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="输入群组名称"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  maxLength={30}
                  autoFocus
                />
                <label className="form-label" style={{ marginTop: 8 }}>群组描述（可选）</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="输入群组描述"
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  maxLength={100}
                />
                {createError && <div className="form-error">{createError}</div>}
                <button className="btn-primary" onClick={handleCreateGroup} disabled={isCreating}>
                  {isCreating ? '创建中...' : '创建群组'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="chat-list-screen">
      <div className="screen-header">
        <h2>群组</h2>
        <button className="btn-icon" onClick={() => setShowCreateDialog(true)} title="创建群组">
          ➕
        </button>
      </div>

      <div className="chat-list-search">
        <input
          type="text"
          className="search-input"
          placeholder="搜索群组..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chat-list">
        {filteredGroups.map((group) => {
          const lastMsg = getGroupLastMessage(group.id);
          const unread = getGroupUnread(group.id);
          return (
            <div
              key={group.id}
              className="chat-list-item"
              onClick={() => handleOpenGroup(group.id)}
            >
              <div className="chat-list-avatar">
                <div className="avatar" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                  {group.name.slice(0, 1).toUpperCase()}
                </div>
              </div>
              <div className="chat-list-info">
                <div className="chat-list-top">
                  <span className="chat-list-name">{group.name}</span>
                  <span className="chat-list-time">
                    {lastMsg ? formatTime(lastMsg.timestamp) : ''}
                  </span>
                </div>
                <div className="chat-list-bottom">
                  <span className="chat-list-preview">
                    {getLastGroupMessagePreview(lastMsg)}
                  </span>
                  <span className="chat-list-preview" style={{ flexShrink: 0 }}>
                    {group.memberCount}人
                  </span>
                  {unread > 0 && <span className="chat-list-badge">{unread}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {filteredGroups.length === 0 && search && (
          <div className="empty-state" style={{ padding: 40 }}>
            <span className="empty-icon">🔍</span>
            <p>未找到匹配的群组</p>
          </div>
        )}
      </div>

      <button
        className="fab"
        onClick={() => setShowCreateDialog(true)}
        title="创建群组"
      >
        ➕
      </button>

      {showCreateDialog && (
        <div className="dialog-overlay" onClick={() => setShowCreateDialog(false)}>
          <div className="dialog-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>创建群组</h3>
              <button className="dialog-close" onClick={() => setShowCreateDialog(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <label className="form-label">群组名称</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入群组名称"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={30}
                autoFocus
              />
              <label className="form-label" style={{ marginTop: 8 }}>群组描述（可选）</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入群组描述"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                maxLength={100}
              />
              {createError && <div className="form-error">{createError}</div>}
              <button className="btn-primary" onClick={handleCreateGroup} disabled={isCreating}>
                {isCreating ? '创建中...' : '创建群组'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupListScreen;
