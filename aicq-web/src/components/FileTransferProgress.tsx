import React, { useState, useEffect, useRef } from 'react';
import type { FileTransferInfo } from '../types';

interface FileTransferProgressProps {
  transfer: FileTransferInfo;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return bytesPerSec + ' B/s';
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
  return `${Math.floor(seconds / 3600)}小时${Math.round((seconds % 3600) / 60)}分`;
}

const FileTransferProgress: React.FC<FileTransferProgressProps> = ({
  transfer,
  onPause,
  onResume,
  onCancel,
  onRetry,
}) => {
  const [animProgress, setAnimProgress] = useState(transfer.progress * 100);
  const prevProgressRef = useRef(transfer.progress);
  const prevBytesRef = useRef(transfer.bytesTransferred);
  const prevTimeRef = useRef(Date.now());

  // Smooth progress animation
  useEffect(() => {
    const target = transfer.progress * 100;
    const step = () => {
      setAnimProgress((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.5) return target;
        return prev + diff * 0.15;
      });
    };
    const interval = setInterval(step, 50);
    return () => clearInterval(interval);
  }, [transfer.progress]);

  const percent = Math.round(animProgress);

  // Calculate speed
  useEffect(() => {
    const now = Date.now();
    const timeDiff = (now - prevTimeRef.current) / 1000;
    const bytesDiff = transfer.bytesTransferred - prevBytesRef.current;
    if (timeDiff > 0 && bytesDiff > 0) {
      prevProgressRef.current = transfer.progress;
      prevBytesRef.current = transfer.bytesTransferred;
      prevTimeRef.current = now;
    }
  }, [transfer.bytesTransferred, transfer.progress]);

  const getFileIcon = () => {
    switch (transfer.fileType) {
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      default: return '📄';
    }
  };

  return (
    <div className={`file-transfer file-transfer-${transfer.status}`}>
      <div className="file-transfer-header">
        <span className="file-transfer-icon">
          {transfer.status === 'completed' ? '✅' :
           transfer.status === 'failed' ? '❌' :
           transfer.status === 'paused' ? '⏸️' : getFileIcon()}
        </span>
        <div className="file-transfer-meta">
          <span className="file-transfer-name">{transfer.fileName}</span>
          <span className="file-transfer-detail">
            {transfer.status === 'completed' ? (
              formatFileSize(transfer.fileSize)
            ) : transfer.status === 'failed' ? (
              '传输失败'
            ) : transfer.status === 'paused' ? (
              `已暂停 · ${percent}% · ${formatFileSize(transfer.bytesTransferred)} / ${formatFileSize(transfer.fileSize)}`
            ) : transfer.status === 'pending' ? (
              `等待中... · ${formatFileSize(transfer.fileSize)}`
            ) : (
              `${percent}% · ${formatFileSize(transfer.bytesTransferred)} / ${formatFileSize(transfer.fileSize)}` +
              (transfer.speed ? ` · ${formatSpeed(transfer.speed)}` : '') +
              (transfer.eta ? ` · 剩余 ${formatETA(transfer.eta)}` : '')
            )}
          </span>
        </div>
      </div>

      {/* Thumbnail for media files */}
      {transfer.thumbnailUrl && (
        <div className="file-transfer-thumbnail">
          <img src={transfer.thumbnailUrl} alt={transfer.fileName} />
        </div>
      )}

      {/* Progress bar */}
      {transfer.status !== 'completed' && transfer.status !== 'failed' && transfer.status !== 'pending' && (
        <div className="file-transfer-bar">
          <div className="file-transfer-progress-fill" style={{ width: `${percent}%` }}>
            <div className="file-transfer-progress-glow" />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="file-transfer-actions">
        {transfer.status === 'transferring' && onPause && (
          <button className="btn-sm btn-secondary" onClick={onPause}>⏸ 暂停</button>
        )}
        {transfer.status === 'paused' && onResume && (
          <button className="btn-sm btn-primary" onClick={onResume}>▶ 继续</button>
        )}
        {(transfer.status === 'transferring' || transfer.status === 'paused') && onCancel && (
          <button className="btn-sm btn-danger" onClick={onCancel}>✕ 取消</button>
        )}
        {transfer.status === 'failed' && onRetry && (
          <button className="btn-sm btn-primary" onClick={onRetry}>🔄 重试</button>
        )}
        {transfer.status === 'completed' && (
          <span className="file-transfer-done">传输完成</span>
        )}
      </div>
    </div>
  );
};

export default FileTransferProgress;
