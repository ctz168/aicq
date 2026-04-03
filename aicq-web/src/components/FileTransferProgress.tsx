import React from 'react';
import type { FileTransferInfo } from '../types';

interface FileTransferProgressProps {
  transfer: FileTransferInfo;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const FileTransferProgress: React.FC<FileTransferProgressProps> = ({
  transfer,
  onPause,
  onResume,
  onCancel,
}) => {
  const percent = Math.round(transfer.progress * 100);

  return (
    <div className={`file-transfer ${transfer.status}`}>
      <div className="file-transfer-header">
        <span className="file-transfer-icon">
          {transfer.status === 'completed' ? '✅' : transfer.status === 'failed' ? '❌' : '📤'}
        </span>
        <div className="file-transfer-meta">
          <span className="file-transfer-name">{transfer.fileName}</span>
          <span className="file-transfer-detail">
            {transfer.status === 'completed'
              ? formatFileSize(transfer.fileSize)
              : transfer.status === 'failed'
                ? '传输失败'
                : transfer.status === 'paused'
                  ? `已暂停 - ${percent}%`
                  : `${percent}% - ${formatFileSize(transfer.fileSize * transfer.progress)} / ${formatFileSize(transfer.fileSize)}`}
          </span>
        </div>
      </div>
      {transfer.status !== 'completed' && transfer.status !== 'failed' && (
        <div className="file-transfer-bar">
          <div className="file-transfer-progress" style={{ width: `${percent}%` }} />
        </div>
      )}
      <div className="file-transfer-actions">
        {transfer.status === 'transferring' && onPause && (
          <button className="btn-sm" onClick={onPause}>暂停</button>
        )}
        {transfer.status === 'paused' && onResume && (
          <button className="btn-sm" onClick={onResume}>继续</button>
        )}
        {(transfer.status === 'transferring' || transfer.status === 'paused') && onCancel && (
          <button className="btn-sm btn-danger" onClick={onCancel}>取消</button>
        )}
        {transfer.status === 'failed' && (
          <span className="file-transfer-error">传输失败，请重试</span>
        )}
      </div>
    </div>
  );
};

export default FileTransferProgress;
