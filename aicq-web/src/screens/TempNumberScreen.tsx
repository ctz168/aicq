import React, { useState, useEffect, useCallback } from 'react';
import { useAICQ } from '../context/AICQContext';
import QRCodeDisplay from '../components/QRCodeDisplay';
import type { TempNumberInfo } from '../types';

function formatCountdown(ms: number): string {
  if (ms <= 0) return '已过期';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const TempNumberScreen: React.FC = () => {
  const { state, requestTempNumber, revokeTempNumber } = useAICQ();
  const [activeNumber, setActiveNumber] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  // Update countdown every second
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Get the most recent temp number
  const activeNumbers = state.tempNumbers.filter((t) => t.expiresAt > Date.now());

  useEffect(() => {
    if (activeNumbers.length > 0) {
      const latest = activeNumbers[activeNumbers.length - 1];
      setActiveNumber(latest.number);
      setCountdown(latest.expiresAt - Date.now());
    }
  }, [state.tempNumbers]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const number = await requestTempNumber();
      setActiveNumber(number);
      // Find the temp number info to get expiry
      const info = state.tempNumbers.find((t) => t.number === number);
      if (info) {
        setCountdown(info.expiresAt - Date.now());
      } else {
        setCountdown(10 * 60 * 1000); // Default 10 min
      }
    } catch (err: any) {
      alert('生成失败: ' + (err.message || '未知错误'));
    }
    setIsGenerating(false);
  };

  const handleCopyNumber = () => {
    if (activeNumber) {
      navigator.clipboard.writeText(activeNumber).then(() => {
        alert('已复制到剪贴板');
      }).catch(() => {
        // Fallback
        const input = document.createElement('input');
        input.value = activeNumber;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        alert('已复制到剪贴板');
      });
    }
  };

  const handleRevoke = async (number: string) => {
    if (!confirm(`确定要撤销号码 ${number} 吗？`)) return;
    try {
      await revokeTempNumber(number);
      if (activeNumber === number) {
        setActiveNumber(null);
        setCountdown(0);
      }
    } catch (err: any) {
      alert('撤销失败: ' + (err.message || '未知错误'));
    }
  };

  return (
    <div className="temp-number-screen">
      <div className="screen-header">
        <h2>临时号码</h2>
      </div>

      <div className="temp-number-card">
        <p className="temp-number-desc">
          生成临时号码分享给朋友，让朋友可以找到并添加你。号码10分钟后自动过期。
        </p>

        <button
          className="btn-generate"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? '生成中...' : '🔄 生成新号码'}
        </button>

        {activeNumber && countdown > 0 && (
          <div className="temp-number-display">
            <div className="temp-number-value">{activeNumber}</div>
            <div className="temp-number-actions">
              <button className="btn-sm" onClick={handleCopyNumber}>📋 复制</button>
              <button className="btn-sm btn-danger" onClick={() => handleRevoke(activeNumber)}>撤销</button>
            </div>
            <div className="temp-number-timer">
              ⏱️ 剩余时间: {formatCountdown(countdown)}
              <div className="timer-bar">
                <div
                  className="timer-progress"
                  style={{ width: `${Math.max(0, (countdown / (10 * 60 * 1000)) * 100)}%` }}
                />
              </div>
            </div>

            {/* QR Code */}
            <div className="temp-number-qr">
              <p className="qr-label">扫码添加</p>
              <QRCodeDisplay
                data={`aicq:add:${activeNumber}`}
                size={200}
              />
            </div>
          </div>
        )}
      </div>

      {/* Active numbers list */}
      {activeNumbers.length > 1 && (
        <div className="temp-numbers-list">
          <h3>其他活跃号码</h3>
          {activeNumbers.slice(0, -1).map((info) => (
            <div key={info.number} className="temp-number-item">
              <span className="temp-number-item-value">{info.number}</span>
              <span className="temp-number-item-timer">
                {formatCountdown(info.expiresAt - Date.now())}
              </span>
              <button
                className="btn-sm btn-danger"
                onClick={() => handleRevoke(info.number)}
              >
                撤销
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TempNumberScreen;
