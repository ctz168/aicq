import React from 'react';

interface StatusBadgeProps {
  isOnline: boolean;
  isEncrypted?: boolean;
  size?: 'small' | 'normal';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ isOnline, isEncrypted = true, size = 'normal' }) => {
  return (
    <span className={`status-badge ${isOnline ? 'online' : 'offline'} ${size}`}>
      <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
      {size === 'normal' && (
        <span className="status-text">
          {isEncrypted ? '🔒 加密' : isOnline ? '在线' : '离线'}
        </span>
      )}
    </span>
  );
};

export default StatusBadge;
