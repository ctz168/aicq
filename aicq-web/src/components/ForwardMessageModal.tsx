import React, { useState, useMemo } from 'react';
import Dialog from './Dialog';
import { useAICQ } from '../hooks/useAICQ';
import type { ChatMessage } from '../types';

interface ForwardMessageModalProps {
  message: ChatMessage;
  onClose: () => void;
}

const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({ message, onClose }) => {
  const { state, sendMessage, sendGroupMessage } = useAICQ();
  const [search, setSearch] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return state.friends;
    const q = search.toLowerCase();
    return state.friends.filter(
      (f) =>
        f.id.toLowerCase().includes(q) ||
        (f.aiName && f.aiName.toLowerCase().includes(q))
    );
  }, [state.friends, search]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return state.groups;
    const q = search.toLowerCase();
    return state.groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [state.groups, search]);

  const totalSelected = selectedFriends.size + selectedGroups.size;

  const handleToggleFriend = (friendId: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  };

  const handleToggleGroup = (groupId: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleForward = async () => {
    if (totalSelected === 0) return;
    setIsSending(true);

    const forwardText = message.content;
    let sent = 0;

    try {
      for (const friendId of selectedFriends) {
        try {
          sendMessage(friendId, `[转发] ${forwardText}`);
          sent++;
        } catch {
          // skip failed
        }
      }

      for (const groupId of selectedGroups) {
        try {
          sendGroupMessage(groupId, `[转发] ${forwardText}`);
          sent++;
        } catch {
          // skip failed
        }
      }
    } finally {
      setIsSending(false);
      setSentCount(sent);
    }
  };

  // Success state
  if (sentCount !== null) {
    return (
      <Dialog isOpen={true} onClose={onClose} title="转发消息">
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
          <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
            转发完成
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            成功发送给 {sentCount} 个会话
          </p>
          <button
            onClick={onClose}
            style={{
              marginTop: '16px',
              padding: '8px 24px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'white',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>
      </Dialog>
    );
  }

  const getFriendDisplayName = (friend: (typeof state.friends)[0]) => {
    if (friend.friendType === 'ai' && friend.aiName) return friend.aiName;
    return friend.id.slice(0, 12) + (friend.id.length > 12 ? '…' : '');
  };

  return (
    <Dialog isOpen={true} onClose={onClose} title="转发消息">
      {/* Message preview */}
      <div className="forward-preview">
        <div className="forward-preview-label">转发内容</div>
        <div className="forward-preview-content">
          {message.type === 'image'
            ? '🖼️ [图片消息]'
            : message.type === 'video'
              ? '🎬 [视频消息]'
              : message.type === 'file-info'
                ? '📄 [文件消息]'
                : message.content}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="搜索好友或群组..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          outline: 'none',
          marginBottom: '8px',
        }}
      />

      {/* Selectable list */}
      <div className="forward-list">
        {filteredFriends.length > 0 && (
          <>
            <div className="forward-section-title">
              好友 ({filteredFriends.length})
            </div>
            {filteredFriends.map((friend) => (
              <label key={friend.id} className="forward-item">
                <input
                  type="checkbox"
                  checked={selectedFriends.has(friend.id)}
                  onChange={() => handleToggleFriend(friend.id)}
                />
                <div>
                  <div style={{ color: 'var(--text-primary)' }}>
                    {friend.friendType === 'ai' ? '🤖 ' : '👤 '}
                    {getFriendDisplayName(friend)}
                  </div>
                  <div className="item-meta">{friend.id.slice(0, 8)}…</div>
                </div>
              </label>
            ))}
          </>
        )}

        {filteredGroups.length > 0 && (
          <>
            <div className="forward-section-title">
              群组 ({filteredGroups.length})
            </div>
            {filteredGroups.map((group) => (
              <label key={group.id} className="forward-item">
                <input
                  type="checkbox"
                  checked={selectedGroups.has(group.id)}
                  onChange={() => handleToggleGroup(group.id)}
                />
                <div>
                  <div style={{ color: 'var(--text-primary)' }}>
                    👥 {group.name}
                  </div>
                  <div className="item-meta">{group.memberCount} 位成员</div>
                </div>
              </label>
            ))}
          </>
        )}

        {filteredFriends.length === 0 && filteredGroups.length === 0 && (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            未找到匹配的结果
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          已选择 {totalSelected} 个
        </span>
        <button
          onClick={handleForward}
          disabled={totalSelected === 0 || isSending}
          style={{
            padding: '8px 20px',
            background: totalSelected > 0 && !isSending ? 'var(--accent)' : 'var(--bg-hover)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: totalSelected > 0 && !isSending ? 'white' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: totalSelected > 0 && !isSending ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {isSending ? '转发中...' : '转发'}
        </button>
      </div>
    </Dialog>
  );
};

export default ForwardMessageModal;
