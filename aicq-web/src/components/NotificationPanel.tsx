import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAICQ } from '../hooks/useAICQ';

interface NotificationPanelProps {
  onClose: () => void;
}

function formatNotificationTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const { state, clearNotifications, markNotificationRead, navigate } = useAICQ();
  const { notifications } = state;
  const [isOpen, setIsOpen] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        // Permission denied or unavailable
      });
    }
  }, []);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onClose();
      }
    };

    // Use a short delay to prevent immediate close from the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Show browser desktop notification when a new unread notification arrives
  const prevUnreadCountRef = useRef(unreadCount);
  useEffect(() => {
    if (
      unreadCount > prevUnreadCountRef.current &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      notifications.length > 0
    ) {
      const latestNotification = notifications[0];
      if (!latestNotification.isRead) {
        try {
          new Notification(
            `${latestNotification.senderName}${latestNotification.isGroup ? ' (群组)' : ''}`,
            {
              body: latestNotification.messagePreview,
              icon: '/favicon.ico',
            }
          );
        } catch {
          // Browser notification failed
        }
      }
    }
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount, notifications]);

  const handleNotificationClick = useCallback(
    (notification: (typeof notifications)[0]) => {
      markNotificationRead(notification.id);
      if (notification.isGroup) {
        navigate('groupChat', notification.chatId);
      } else {
        navigate('chat', notification.chatId);
      }
      setIsOpen(false);
      onClose();
    },
    [markNotificationRead, navigate, onClose]
  );

  const handleMarkAllRead = useCallback(() => {
    clearNotifications();
  }, [clearNotifications]);

  if (!isOpen) return null;

  return (
    <div className="notification-wrapper" ref={wrapperRef}>
      {/* Dropdown panel */}
      <div className="notification-panel">
        {/* Header */}
        <div className="notification-panel-header">
          <h3>通知</h3>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead}>全部已读</button>
          )}
        </div>

        {/* Notification list */}
        <div className="notification-list">
          {notifications.length === 0 ? (
            <div className="notification-empty">暂无通知</div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-item${!notification.isRead ? ' unread' : ''}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="notification-item-icon">
                  {notification.isGroup ? '👥' : '💬'}
                </div>
                <div className="notification-item-content">
                  <div className="notification-item-name">
                    {notification.senderName}
                    {notification.isGroup && (
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                        (群组)
                      </span>
                    )}
                  </div>
                  <div className="notification-item-text">
                    {notification.messagePreview || ''}
                  </div>
                  <div className="notification-item-time">
                    {formatNotificationTime(notification.timestamp)}
                  </div>
                </div>
                {!notification.isRead && (
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/** Standalone bell button with integrated notification dropdown */
export const NotificationBell: React.FC = () => {
  const { state, clearNotifications, markNotificationRead, navigate } = useAICQ();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const unreadCount = state.notifications.filter((n) => !n.isRead).length;

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsPanelOpen(false);
      }
    };

    if (isPanelOpen) {
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isPanelOpen]);

  // Desktop notification for new unread
  const prevUnreadCountRef = useRef(unreadCount);
  useEffect(() => {
    if (
      unreadCount > prevUnreadCountRef.current &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      state.notifications.length > 0
    ) {
      const latest = state.notifications[0];
      if (!latest.isRead) {
        try {
          new Notification(
            `${latest.senderName}${latest.isGroup ? ' (群组)' : ''}`,
            { body: latest.messagePreview, icon: '/favicon.ico' }
          );
        } catch {}
      }
    }
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount, state.notifications]);

  const handleNotificationClick = (notification: (typeof state.notifications)[0]) => {
    markNotificationRead(notification.id);
    if (notification.isGroup) {
      navigate('groupChat', notification.chatId);
    } else {
      navigate('chat', notification.chatId);
    }
    setIsPanelOpen(false);
  };

  return (
    <div className="notification-wrapper" ref={wrapperRef}>
      {/* Bell trigger */}
      <button
        className="notification-bell"
        onClick={() => setIsPanelOpen((prev) => !prev)}
        aria-label="通知"
      >
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge-dot">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isPanelOpen && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <h3>通知</h3>
            {unreadCount > 0 && (
              <button onClick={() => clearNotifications()}>全部已读</button>
            )}
          </div>

          <div className="notification-list">
            {state.notifications.length === 0 ? (
              <div className="notification-empty">暂无通知</div>
            ) : (
              state.notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item${!notification.isRead ? ' unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-item-icon">
                    {notification.isGroup ? '👥' : '💬'}
                  </div>
                  <div className="notification-item-content">
                    <div className="notification-item-name">
                      {notification.senderName}
                      {notification.isGroup && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                          (群组)
                        </span>
                      )}
                    </div>
                    <div className="notification-item-text">
                      {notification.messagePreview || ''}
                    </div>
                    <div className="notification-item-time">
                      {formatNotificationTime(notification.timestamp)}
                    </div>
                  </div>
                  {!notification.isRead && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        flexShrink: 0,
                        marginTop: 6,
                      }}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;
