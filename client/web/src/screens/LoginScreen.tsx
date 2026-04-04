import React, { useState, useEffect, useCallback } from 'react';
import { useAICQ } from '../context/AICQContext';
import { APP_VERSION } from '../utils/version';

type LoginTab = 'login' | 'register';
type LoginType = 'email' | 'phone';

/**
 * Generate an Ed25519 key pair using Web Crypto API.
 * Returns the public key as a base64 string for registration.
 */
async function generateEd25519KeyPair(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    true,
    ['sign', 'verify']
  );
  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));

  // Store the full key pair in localStorage for later use
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)));
  localStorage.setItem('aicq_keypair', JSON.stringify({
    publicKey: publicKeyBase64,
    privateKey: privateKeyBase64,
    createdAt: Date.now(),
  }));

  return publicKeyBase64;
}

/**
 * LoginScreen - 支持邮箱/手机号注册登录
 * 
 * 功能:
 *   - 邮箱注册/登录 (密码验证)
 *   - 手机号注册/登录 (验证码验证)
 *   - AI Agent 公钥签名自动登录
 *   - 服务器地址配置
 */
const LoginScreen: React.FC = () => {
  const { connect, state } = useAICQ();
  const [serverUrl, setServerUrl] = useState('https://aicq.online');

  // Tab state
  const [tab, setTab] = useState<LoginTab>('login');
  const [loginType, setLoginType] = useState<LoginType>('email');

  // Registration fields
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPwd, setRegConfirmPwd] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regCodeSent, setRegCodeSent] = useState(false);
  const [regCountdown, setRegCountdown] = useState(0);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginCodeSent, setLoginCodeSent] = useState(false);
  const [loginCountdown, setLoginCountdown] = useState(0);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Countdown timer
  useEffect(() => {
    if (regCountdown > 0) {
      const timer = setTimeout(() => setRegCountdown(0), 1000);
      return () => clearTimeout(timer);
    }
  }, [regCountdown]);

  useEffect(() => {
    if (loginCountdown > 0) {
      const timer = setTimeout(() => setLoginCountdown(0), 1000);
      return () => clearTimeout(timer);
    }
  }, [loginCountdown]);

  const startCountdown = useCallback((setter: (v: number | ((prev: number) => number)) => void) => {
    setter(60);
    const timer = setInterval(() => {
      setter((prev: number) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Check for existing user
  const [existingUser, setExistingUser] = useState<{ userId: string; fingerprint: string } | null>(null);
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

  // ─── Send verification code ───────────────────────────────────────
  const handleSendCode = useCallback(async (
    target: string,
    type: LoginType,
    purpose: 'register' | 'login',
    setSent: (v: boolean) => void,
    setCountdown: (v: number | ((prev: number) => number)) => void,
  ) => {
    if (!target.trim()) {
      setError(type === 'email' ? '请输入邮箱地址' : '请输入手机号');
      return;
    }

    // Validate format
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setError('邮箱格式不正确');
      return;
    }
    if (type === 'phone' && !/^\d{4,15}$/.test(target)) {
      setError('手机号格式不正确');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${serverUrl}/api/v1/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, type, purpose }),
      });
      const data = await resp.json();
      if (data.success) {
        setSent(true);
        startCountdown(setCountdown);
        setError(null);
      } else {
        setError(data.error || '发送验证码失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  // ─── Register ─────────────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    const target = loginType === 'email' ? regEmail : regPhone;
    setError(null);
    setSuccessMsg(null);

    if (!target) {
      setError(loginType === 'email' ? '请输入邮箱' : '请输入手机号');
      return;
    }
    if (!regCode) {
      setError('请输入验证码');
      return;
    }
    if (regPassword.length < 6) {
      setError('密码至少6位');
      return;
    }
    if (regPassword !== regConfirmPwd) {
      setError('两次密码不一致');
      return;
    }

    setLoading(true);
    try {
      // Generate real Ed25519 key pair for E2EE
      const publicKey = await generateEd25519KeyPair();

      const resp = await fetch(`${serverUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          type: loginType,
          code: regCode,
          password: regPassword,
          displayName: regDisplayName || undefined,
          publicKey,
        }),
      });
      const data = await resp.json();

      if (data.success && data.session) {
        // Store session token
        localStorage.setItem('aicq_token', data.session.token);
        localStorage.setItem('aicq_refresh', data.session.refreshToken);
        localStorage.setItem('aicq_account', JSON.stringify(data.account));

        // Connect to WebSocket with token
        await connect(serverUrl);

        setSuccessMsg('注册成功！');
      } else {
        setError(data.error || '注册失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, [loginType, regEmail, regPhone, regCode, regPassword, regConfirmPwd, regDisplayName, serverUrl, connect]);

  // ─── Login ──────────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    const target = loginType === 'email' ? loginEmail : loginPhone;
    setError(null);
    setSuccessMsg(null);

    if (!target) {
      setError(loginType === 'email' ? '请输入邮箱' : '请输入手机号');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${serverUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          type: loginType,
          password: loginPassword || undefined,
          code: loginCode || undefined,
        }),
      });
      const data = await resp.json();

      if (data.success && data.session) {
        localStorage.setItem('aicq_token', data.session.token);
        localStorage.setItem('aicq_refresh', data.session.refreshToken);
        localStorage.setItem('aicq_account', JSON.stringify(data.account));

        await connect(serverUrl);

        setSuccessMsg('登录成功！');
      } else {
        setError(data.error || '登录失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, [loginType, loginEmail, loginPhone, loginPassword, loginCode, serverUrl, connect]);

  // ─── Quick login (existing user) ────────────────────────────────────
  const handleQuickLogin = useCallback(async () => {
    setError(null);
    setSuccessMsg(null);

    if (!serverUrl) {
      setError('请输入服务器地址');
      return;
    }

    setLoading(true);
    try {
      await connect(serverUrl);
      setSuccessMsg('连接成功！');
    } catch (err: any) {
      setError(err.message || '连接失败');
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connect]);

  // ─── Reset ──────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (confirm('确定要清除所有本地数据吗？这将删除你的身份密钥和所有聊天记录。')) {
      localStorage.removeItem('aicq_store');
      localStorage.removeItem('aicq_token');
      localStorage.removeItem('aicq_refresh');
      localStorage.removeItem('aicq_account');
      setExistingUser(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, []);

  // ─── Toggle tab/type ─────────────────────────────────────────────
  const switchTab = (newTab: LoginTab) => {
    setTab(newTab);
    setError(null);
    setSuccessMsg(null);
    if (newTab === 'register') {
      setLoginType('email');
    }
  };

  // ─── Active target ─────────────────────────────────────────────────
  const activeTarget = tab === 'login'
    ? (loginType === 'email' ? loginEmail : loginPhone)
    : (loginType === 'email' ? regEmail : regPhone);

  return (
    <div className="login-screen">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <h1>AICQ</h1>
          <p>端到端加密聊天</p>
        </div>

        {/* Existing user quick login */}
        {existingUser && !successMsg && (
          <div className="login-quick-login">
            <div className="login-existing-info">
              <span className="login-label">已有身份</span>
              <span className="login-user-id" title={existingUser.userId}>
                {existingUser.fingerprint || existingUser.userId.slice(0, 8)}
              </span>
            </div>
            <button className="btn btn-primary btn-full" onClick={handleQuickLogin} disabled={loading}>
              {loading ? '连接中...' : '一键连接'}
            </button>
          </div>
        )}

        {existingUser && <div className="login-divider"><span>或创建新身份</span></div>}

        {/* Tab switcher */}
        {!successMsg && (
          <div className="login-tabs">
            <button
              className={`login-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => switchTab('login')}
            >
              登录
            </button>
            <button
              className={`login-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => switchTab('register')}
            >
              注册
            </button>
          </div>
        )}

        {/* Success message */}
        {successMsg && (
          <div className="login-success">
            <span className="login-success-icon">✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error message */}
        {(error || state.error) && !successMsg && (
          <div className="login-error">
            {error || state.error}
          </div>
        )}

        {/* Form area - only show when no success */}
        {!successMsg && (
          <div className="login-form">

            {/* Login/Register type switcher */}
            <div className="login-type-switch">
              <button
                className={`login-type-btn ${loginType === 'email' ? 'active' : ''}`}
                onClick={() => { setLoginType('email'); setError(null); }}
              >
                📧 邮箱
              </button>
              <button
                className={`login-type-btn ${loginType === 'phone' ? 'active' : ''}`}
                onClick={() => { setLoginType('phone'); setError(null); }}
              >
                📱 手机号
              </button>
            </div>

            {/* Email input */}
            {loginType === 'email' && (
              <div className="form-group">
                <label className="form-label">
                  {tab === 'login' ? '邮箱' : '邮箱地址'}
                </label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your@email.com"
                  value={tab === 'login' ? loginEmail : regEmail}
                  onChange={(e) => {
                    if (tab === 'login') setLoginEmail(e.target.value);
                    else setRegEmail(e.target.value);
                  }}
                  autoComplete="email"
                />
              </div>
            )}

            {/* Phone input */}
            {loginType === 'phone' && (
              <div className="form-group">
                <label className="form-label">
                  {tab === 'login' ? '手机号' : '手机号'}
                </label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="手机号码"
                  value={tab === 'login' ? loginPhone : regPhone}
                  onChange={(e) => {
                    if (tab === 'login') setLoginPhone(e.target.value);
                    else setRegPhone(e.target.value);
                  }}
                  autoComplete="tel"
                />
              </div>
            )}

            {/* Verification code (for phone) */}
            {loginType === 'phone' && (
              <div className="form-group">
                <label className="form-label">
                  {tab === 'login' ? '验证码' : '手机验证码'}
                </label>
                <div className="form-row">
                  <input
                    type="text"
                    className="form-input code-input"
                    placeholder="6位验证码"
                    maxLength={6}
                    value={tab === 'login' ? loginCode : regCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      if (tab === 'login') setLoginCode(val);
                      else setRegCode(val);
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  <button
                    className="btn btn-secondary btn-code"
                    onClick={() => {
                      const t = tab === 'login' ? loginPhone : regPhone;
                      const setter = tab === 'login' ? setLoginCodeSent : setRegCodeSent;
                      const cdSetter = tab === 'login' ? setLoginCountdown : setRegCountdown;
                      handleSendCode(t, 'phone', tab, setter, cdSetter);
                    }}
                    disabled={loading || (tab === 'login' ? loginCountdown : regCountdown) > 0 || !(tab === 'login' ? loginPhone : regPhone)}
                  >
                    {((tab === 'login' ? loginCountdown : regCountdown) > 0
                      ? `${(tab === 'login' ? loginCountdown : regCountdown)}s`
                      : '发送验证码')}
                  </button>
                </div>
              </div>
            )}

            {/* Password (for email login/register) */}
            {loginType === 'email' && (
              <div className="form-group">
                <label className="form-label">
                  {tab === 'login' ? '密码' : '设置密码'}
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="至少6位密码"
                  value={tab === 'login' ? loginPassword : regPassword}
                  onChange={(e) => {
                    if (tab === 'login') setLoginPassword(e.target.value);
                    else setRegPassword(e.target.value);
                  }}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            )}

            {/* Confirm password (register only) */}
            {tab === 'register' && loginType === 'email' && (
              <div className="form-group">
                <label className="form-label">确认密码</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="再次输入密码"
                  value={regConfirmPwd}
                  onChange={(e) => setRegConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* Display name (register only) */}
            {tab === 'register' && (
              <div className="form-group">
                <label className="form-label">昵称 (可选)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="设置昵称"
                  value={regDisplayName}
                  onChange={(e) => setRegDisplayName(e.target.value)}
                  maxLength={32}
                />
              </div>
            )}

            {/* Register button */}
            {tab === 'register' && (
              <button
                className="btn btn-primary btn-full"
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? '注册中...' : '注册账号'}
              </button>
            )}

            {/* Login button */}
            {tab === 'login' && (
              <button
                className="btn btn-primary btn-full"
                onClick={handleLogin}
                disabled={loading || (!loginType && !loginPassword && !loginCode)}
              >
                {loading ? '登录中...' : '登录'}
              </button>
            )}
          </div>
        )}

        {/* Server URL config (collapsible) */}
        {!successMsg && (
          <div className="login-server-config">
            <button
              className="login-server-toggle"
              onClick={() => {
                const el = document.getElementById('server-config-detail');
                if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
              }}
            >
              ⚙️ 服务器设置
            </button>
            <div id="server-config-detail" style={{ display: 'none' }}>
              <div className="form-group">
                <label className="form-label">服务器地址</label>
                <input
                  type="text"
                  className="form-input"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://aicq.online"
                />
              </div>
            </div>
          </div>
        )}

        {/* Reset identity */}
        {existingUser && !successMsg && (
          <button className="login-reset" onClick={handleReset}>
            重置身份
          </button>
        )}

        {/* Footer */}
        <div className="login-footer">
          <p>🔒 所有消息均使用端到端加密</p>
          <p className="login-version">{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
