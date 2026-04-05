import React, { useState } from 'react';
import { useAICQ } from '../context/AICQContext';
import Dialog from '../components/Dialog';
import QRCodeDisplay from '../components/QRCodeDisplay';
import { APP_VERSION } from '../utils/version';

const SettingsScreen: React.FC = () => {
  const { state, navigate, client } = useAICQ();
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportQR, setExportQR] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importQRText, setImportQRText] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importError, setImportError] = useState('');

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(state.userId).then(() => {
      alert('用户ID已复制');
    }).catch(() => {
      const input = document.createElement('input');
      input.value = state.userId;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('用户ID已复制');
    });
  };

  const handleCopyFingerprint = () => {
    navigator.clipboard.writeText(state.fingerprint).then(() => {
      alert('指纹已复制');
    }).catch(() => {
      const input = document.createElement('input');
      input.value = state.fingerprint;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('指纹已复制');
    });
  };

  const handleExport = async () => {
    if (!exportPassword) {
      setExportError('请输入密码');
      return;
    }
    if (exportPassword.length < 8) {
      setExportError('密码至少8位');
      return;
    }
    setExportError('');

    // Get stored key pair
    const keypairStr = localStorage.getItem('aicq_keypair');
    if (!keypairStr) {
      setExportError('未找到本地密钥，请重新注册');
      return;
    }

    try {
      const keypair = JSON.parse(keypairStr);
      if (!keypair.privateKey || !keypair.publicKey) {
        setExportError('密钥数据不完整');
        return;
      }

      // Create the payload to encrypt
      const payloadObj = {
        userId: state.userId,
        publicKey: keypair.publicKey,
        privateKey: keypair.privateKey,
        exportedAt: Date.now(),
      };
      const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));

      // Derive encryption key from password using PBKDF2
      const encoder = new TextEncoder();
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(exportPassword),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        payloadBytes
      );

      // Build QR payload: aicq$privkey$v1$salt_b64$iv_b64$encrypted_b64$expiry
      // NOTE: Using $ as delimiter because base64 can contain ':' but never '$'
      const saltB64 = btoa(String.fromCharCode(...salt));
      const ivB64 = btoa(String.fromCharCode(...iv));
      const encB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      const expiresAt = Date.now() + 60_000; // 60 seconds

      const payload = `aicq$privkey$v1$${saltB64}$${ivB64}$${encB64}$${expiresAt.toString(36)}`;
      setExportQR(payload);
    } catch (err) {
      setExportError('导出失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleImport = async () => {
    if (!importQRText.trim()) {
      setImportError('请输入QR码数据');
      return;
    }
    if (!importPassword) {
      setImportError('请输入解密密码');
      return;
    }
    setImportError('');

    try {
      const qrPayload = importQRText.trim();

      if (!qrPayload.startsWith('aicq$privkey$v1$')) {
        setImportError('无效的QR码格式');
        return;
      }

      // Use $ as delimiter (base64 never contains $)
      const prefix = 'aicq$privkey$v1$';
      const rest = qrPayload.slice(prefix.length);
      const parts = rest.split('$');
      if (parts.length < 4) {
        setImportError('QR码数据不完整');
        return;
      }

      // Parse: aicq$privkey$v1$salt$iv$encrypted$expiry
      const salt = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
      const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
      const encrypted = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
      const expiresAt = parseInt(parts[3], 36);

      if (Date.now() > expiresAt) {
        setImportError('QR码已过期（60秒有效期）');
        return;
      }

      // Derive decryption key from password
      const encoder = new TextEncoder();
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(importPassword),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encrypted
      );

      const payloadObj = JSON.parse(new TextDecoder().decode(decrypted));

      if (!payloadObj.privateKey || !payloadObj.publicKey) {
        setImportError('密钥数据不完整');
        return;
      }

      // Save imported keys to localStorage
      localStorage.setItem('aicq_keypair', JSON.stringify({
        publicKey: payloadObj.publicKey,
        privateKey: payloadObj.privateKey,
        importedAt: Date.now(),
      }));

      setImportError('');
      setShowImportDialog(false);
      setImportQRText('');
      setImportPassword('');
      alert('✅ 密钥导入成功！页面将刷新。');
      window.location.reload();
    } catch (err) {
      setImportError('导入失败: 密码错误或数据已损坏');
    }
  };

  const handleReset = () => {
    if (confirm('⚠️ 确定要重置所有数据吗？这将删除你的身份和所有聊天记录！此操作不可撤销。')) {
      localStorage.removeItem('aicq_store');
      window.location.reload();
    }
  };

  return (
    <div className="settings-screen">
      <div className="screen-header">
        <h2>设置</h2>
      </div>

      {/* Identity Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">身份信息</h3>
        <div className="settings-item">
          <span className="settings-label">用户 ID</span>
          <div className="settings-value-row">
            <span className="settings-value mono" title={state.userId}>
              {state.userId.slice(0, 12)}...
            </span>
            <button className="btn-sm" onClick={handleCopyUserId}>复制</button>
          </div>
        </div>
        <div className="settings-item">
          <span className="settings-label">公钥指纹</span>
          <div className="settings-value-row">
            <span className="settings-value mono">{state.fingerprint}</span>
            <button className="btn-sm" onClick={handleCopyFingerprint}>复制</button>
          </div>
        </div>
      </div>

      {/* Key Management */}
      <div className="settings-section">
        <h3 className="settings-section-title">密钥管理</h3>
        <div className="settings-item">
          <button
            className="btn-secondary full-width"
            onClick={() => setShowExportDialog(true)}
          >
            🔑 导出私钥
          </button>
          <p className="settings-hint">通过密码保护的二维码导出私钥</p>
        </div>
        <div className="settings-item">
          <button
            className="btn-secondary full-width"
            onClick={() => setShowImportDialog(true)}
          >
            📥 导入私钥
          </button>
          <p className="settings-hint">通过扫描二维码导入已有的私钥</p>
        </div>
      </div>

      {/* Connection */}
      <div className="settings-section">
        <h3 className="settings-section-title">连接状态</h3>
        <div className="settings-item">
          <span className="settings-label">服务器连接</span>
          <span className={`connection-status ${state.isConnected ? 'connected' : 'disconnected'}`}>
            {state.isConnected ? '🟢 已连接' : '🔴 未连接'}
          </span>
        </div>
        <div className="settings-item">
          <span className="settings-label">端到端加密</span>
          <span className="connection-status connected">🟢 已启用</span>
        </div>
        <div className="settings-item">
          <span className="settings-label">好友数量</span>
          <span className="settings-value">{state.friends.length}</span>
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <h3 className="settings-section-title">关于</h3>
        <div className="settings-item">
          <span className="settings-label">版本</span>
          <span className="settings-value">{APP_VERSION}</span>
        </div>
        <div className="settings-item">
          <span className="settings-label">协议</span>
          <span className="settings-value">MIT License</span>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="settings-section danger">
        <h3 className="settings-section-title">危险区域</h3>
        <div className="settings-item">
          <button className="btn-danger full-width" onClick={handleReset}>
            🗑️ 重置所有数据
          </button>
          <p className="settings-hint">清除所有本地数据，包括身份和聊天记录</p>
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog isOpen={showExportDialog} onClose={() => { setShowExportDialog(false); setExportQR(null); setExportPassword(''); setExportError(''); }} title="导出私钥">
        <div className="export-dialog">
          <p className="form-hint">输入密码以加密你的私钥。此密码将用于解密导入。</p>
          <input
            type="password"
            className="form-input"
            placeholder="输入密码"
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
          />
          {!exportQR ? (
            <button className="btn-primary" onClick={handleExport}>生成二维码</button>
          ) : null}
          {exportError && <div className="form-error">{exportError}</div>}
          {exportQR && (
            <div className="export-qr">
              <QRCodeDisplay data={exportQR} size={250} />
              <p className="export-warning">⚠️ 此二维码包含你的私钥，请确保安全保管</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Import Dialog */}
      <Dialog isOpen={showImportDialog} onClose={() => { setShowImportDialog(false); setImportQRText(''); setImportPassword(''); setImportError(''); }} title="导入私钥">
        <div className="import-dialog">
          <p className="form-hint">粘贴从二维码扫描得到的私钥数据</p>
          <textarea
            className="form-textarea"
            placeholder="aicq:privkey:v1:..."
            value={importQRText}
            onChange={(e) => setImportQRText(e.target.value)}
          />
          <input
            type="password"
            className="form-input"
            placeholder="输入解密密码"
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
          />
          {importError && <div className="form-error">{importError}</div>}
          <button className="btn-primary" onClick={handleImport}>导入</button>
        </div>
      </Dialog>
    </div>
  );
};

export default SettingsScreen;
