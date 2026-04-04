import React, { useEffect, useRef } from 'react';
import type { TabName } from '../types';
import type { UnreadCounts } from '../types';
import { NotificationBell } from './NotificationPanel';

interface SidebarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  unreadCounts: UnreadCounts;
  hasActiveChat: boolean;
}

const tabs: { key: TabName; label: string; icon: string }[] = [
  { key: 'chatList', label: '聊天', icon: '💬' },
  { key: 'groupList', label: '群组', icon: '🗣️' },
  { key: 'friends', label: '好友', icon: '👥' },
  { key: 'tempNumber', label: '临时号码', icon: '🔢' },
  { key: 'settings', label: '设置', icon: '⚙️' },
];

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, unreadCounts, hasActiveChat }) => {
  // Sum total unread across all friends
  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);

  return (
    <>
      {/* Desktop left sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">AICQ</h1>
          <span className="app-subtitle">加密聊天</span>
          <div style={{ marginLeft: 'auto' }}>
            <NotificationBell />
          </div>
        </div>
        <ul className="sidebar-nav">
          {tabs.map((tab) => {
            const badge =
              tab.key === 'chatList' && totalUnread > 0 ? (
                <span className="sidebar-badge">{totalUnread}</span>
              ) : null;
            return (
              <li
                key={tab.key}
                className={`sidebar-item ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => onTabChange(tab.key)}
              >
                <span className="sidebar-icon">{tab.icon}</span>
                <span className="sidebar-label">{tab.label}</span>
                {badge}
              </li>
            );
          })}
        </ul>
        <div className="sidebar-footer">
          <span className="connection-indicator online">🔒 端到端加密</span>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="bottom-bar">
        {tabs.map((tab) => {
          const badge =
            tab.key === 'chatList' && totalUnread > 0 ? (
              <span className="bottom-bar-badge">{totalUnread}</span>
            ) : null;
          return (
            <button
              key={tab.key}
              className={`bottom-bar-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => onTabChange(tab.key)}
            >
              <span className="bottom-bar-icon">{tab.icon}</span>
              <span className="bottom-bar-label">{tab.label}</span>
              {badge}
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default Sidebar;
