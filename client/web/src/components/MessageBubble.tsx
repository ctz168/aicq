import React from 'react';
import type { ChatMessage } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import ImagePreview from './ImagePreview';
import VideoPlayer from './VideoPlayer';
import { detectMarkdown } from '../utils/markdown';

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
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getFileIcon(fileType?: string): string {
  if (!fileType) return '📄';
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎬';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType.includes('pdf')) return '📕';
  if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('7z')) return '📦';
  if (fileType.includes('word') || fileType.includes('doc')) return '📝';
  if (fileType.includes('excel') || fileType.includes('sheet') || fileType.includes('xls')) return '📊';
  if (fileType.includes('presentation') || fileType.includes('ppt')) return '📽️';
  return '📄';
}

const MessageBubble = React.memo(function MessageBubble({ message, isOwn, userId }: MessageBubbleProps) {
  // System messages
  if (message.type === 'system') {
    return (
      <div className="message-system">
        <span className="message-system-text">{message.content}</span>
      </div>
    );
  }

  // Streaming messages - handled by StreamingMessage component, not here
  if (message.type === 'streaming') {
    return null;
  }

  // Image messages
  if (message.type === 'image' && message.media) {
    return (
      <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
        <div className={`message-bubble ${isOwn ? 'own' : 'other'} message-image`}>
          <ImagePreview
            src={message.media.url}
            alt={message.media.fileName}
            thumbnailSrc={message.media.thumbnailUrl}
          />
          {message.media.fileName && (
            <div className="message-media-meta">
              <span className="message-media-name">{message.media.fileName}</span>
              <span className="message-media-size">
                {message.media.width && message.media.height && (
                  <span>{message.media.width}×{message.media.height} · </span>
                )}
                {formatFileSize(message.media.fileSize)}
              </span>
            </div>
          )}
          <span className="message-time">
            {formatTime(message.timestamp)}
            {isOwn && renderStatus(message.status)}
          </span>
        </div>
      </div>
    );
  }

  // Video messages
  if (message.type === 'video' && message.media) {
    return (
      <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
        <div className={`message-bubble ${isOwn ? 'own' : 'other'} message-video`}>
          <VideoPlayer
            src={message.media.url}
            poster={message.media.thumbnailUrl}
            duration={message.media.duration}
            fileName={message.media.fileName}
          />
          <div className="message-media-meta">
            <span className="message-media-name">{message.media.fileName}</span>
            <span className="message-media-size">
              {message.media.duration && <span>{formatDuration(message.media.duration)} · </span>}
              {formatFileSize(message.media.fileSize)}
            </span>
          </div>
          <span className="message-time">
            {formatTime(message.timestamp)}
            {isOwn && renderStatus(message.status)}
          </span>
        </div>
      </div>
    );
  }

  // File info messages
  if (message.type === 'file-info') {
    const fileInfo = message.fileInfo;
    if (!fileInfo) {
      try {
        const parsed = JSON.parse(message.content);
        if (parsed.fileName) {
          return renderFileCard(message, parsed, isOwn);
        }
      } catch { /* ignore */ }
      return null;
    }
    return renderFileCard(message, fileInfo, isOwn);
  }

  // Text messages (with auto-detect markdown for AI messages)
  const isMarkdown = message.type === 'markdown' || detectMarkdown(message.content);

  return (
    <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
      <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
        {isMarkdown ? (
          <MarkdownRenderer content={message.content} isOwn={isOwn} />
        ) : (
          <p className="message-text">{message.content}</p>
        )}
        <span className="message-time">
          {formatTime(message.timestamp)}
          {isOwn && renderStatus(message.status)}
        </span>
      </div>
    </div>
  );
});

function renderFileCard(message: ChatMessage, fileInfo: any, isOwn: boolean) {
  const icon = getFileIcon(fileInfo.mimeType);
  return (
    <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
      <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
        <div className="message-file">
          <span className="message-file-icon">{icon}</span>
          <div className="message-file-info">
            <span className="message-file-name">{fileInfo.fileName}</span>
            <span className="message-file-size">{formatFileSize(fileInfo.fileSize)}</span>
            {fileInfo.fileType === 'image' && fileInfo.thumbnailUrl && (
              <img
                src={fileInfo.thumbnailUrl}
                alt={fileInfo.fileName}
                className="message-file-thumbnail"
                loading="lazy"
              />
            )}
          </div>
          <button className="message-file-download" title="下载">
            ⬇️
          </button>
        </div>
        <span className="message-time">
          {formatTime(message.timestamp)}
          {isOwn && renderStatus(message.status)}
        </span>
      </div>
    </div>
  );
}

function renderStatus(status: ChatMessage['status']): React.ReactNode {
  return (
    <span className="message-status">
      {status === 'sending' && ' ⏳'}
      {status === 'sent' && ' ✈️'}
      {status === 'delivered' && ' ✅'}
      {status === 'read' && ' 👁️'}
      {status === 'failed' && ' ❌'}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Date separator component */
export const DateSeparator = React.memo(function DateSeparator({ date }: { date: Date }) {
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
});

export default MessageBubble;
