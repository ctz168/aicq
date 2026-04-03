import React from 'react';
import type { ChatMessage } from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  userId: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isOwn, userId }) => {
  // System messages
  if (message.type === 'system') {
    return (
      <div className="message-system">
        <span className="message-system-text">{message.content}</span>
      </div>
    );
  }

  // File info messages
  if (message.type === 'file-info') {
    let fileInfo: { fileName: string; fileSize: number } | null = null;
    try {
      fileInfo = JSON.parse(message.content);
    } catch { /* ignore */ }

    if (!fileInfo) return null;

    return (
      <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
        <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
          <div className="message-file">
            <span className="message-file-icon">📄</span>
            <div className="message-file-info">
              <span className="message-file-name">{fileInfo.fileName}</span>
              <span className="message-file-size">{formatFileSize(fileInfo.fileSize)}</span>
            </div>
            <button className="message-file-download" title="下载">
              ⬇️
            </button>
          </div>
          <span className="message-time">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  // Text messages
  return (
    <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
      <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
        <p className="message-text">{message.content}</p>
        <span className="message-time">
          {formatTime(message.timestamp)}
          {isOwn && (
            <span className="message-status">
              {message.status === 'sent' && ' ✈️'}
              {message.status === 'delivered' && ' ✅'}
              {message.status === 'read' && ' 👁️'}
              {message.status === 'failed' && ' ❌'}
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

/** Date separator component */
export const DateSeparator: React.FC<{ date: Date }> = ({ date }) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let label: string;
  if (date.toDateString() === today.toDateString()) {
    label = '今天';
  } else if (date.toDateString() === yesterday.toDateString()) {
    label = '昨天';
  } else {
    label = `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return (
    <div className="message-system">
      <span className="message-system-text">{label}</span>
    </div>
  );
};

export default MessageBubble;
