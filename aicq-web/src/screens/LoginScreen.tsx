import React, { useState, useEffect } from 'react';
import { useAICQ } from '../context/AICQContext';
import QRCodeDisplay from '../components/QRCodeDisplay';

const LoginScreen: React.FC = () => {
  const { connect, state } = useAICQ();
  const [serverUrl, setServerUrl] = useState('https://aicq.online');
  const [error, setError] = useState<string | null>(null);
  const [existingUser, setExistingUser] = useState<{ userId: string; fingerprint: string } | null>(null);

  // Check for existing user in localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('aicq_store');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.userId) {
          setExistingUser({
            userId: data.userId,
            fingerprint: data.fingerprint || '加载中...',
          });
        }
      }
    } catch { /* ignore */ }
  }, []);

  const handleConnect = async () => {
    setError(null);
    try {
      await connect(serverUrl);
    } catch (err: any) {
      setError(err.message || '连接失败');
    }
  };

  const handleReset = () => {
    if (confirm('确定要清除所有本地数据吗？这将删除你的身份密钥和所有聊天记录。')) {
      localStorage.removeItem('aicq_store');
      setExistingUser(null);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <h1>AICQ</h1>
          <p>端到端加密聊天</p>
        </div>

        {existingUser && (
          <div className="login-existing">
            <div className="login-existing-info">
              <span className="login-label">已有身份</span>
              <span className="login-user-id" title={existingUser.userId}>
                ID: {existingUser.userId.slice(0, 8)}...
              </span>
            </div>
          </div>
        )}

        <div className="login-form">
          <label className="login-label">服务器地址</label>
          <input
            type="text"
            className="login-input"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://aicq.online"
          />

          <button
            className="login-btn"
            onClick={handleConnect}
            disabled={state.isLoading}
          >
            {state.isLoading ? (
              <span className="login-spinner">连接中...</span>
            ) : (
              '连接'
            )}
          </button>

          {(error || state.error) && (
            <div className="login-error">
              {error || state.error}
            </div>
          )}
        </div>

        {existingUser && (
          <button className="login-reset" onClick={handleReset}>
            重置身份
          </button>
        )}

        <div className="login-footer">
          <p>🔒 所有消息均使用端到端加密</p>
          <p className="login-version">v1.0.0</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
