/**
 * AICQ Management UI — Professional SPA with sidebar navigation.
 *
 * Features: Dashboard, Agent Management (from config), Friend Management,
 * Model Configuration, System Settings.
 */

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f1117; --bg2: #1a1d27; --bg3: #242836; --bg4: #2e3347;
  --bg5: #353a50; --text: #e4e6ef; --text2: #9499b3; --text3: #5c6080;
  --accent: #6366f1; --accent2: #818cf8; --accent-bg: rgba(99,102,241,.12);
  --ok: #34d399; --ok-bg: rgba(52,211,153,.12); --warn: #fbbf24; --warn-bg: rgba(251,191,36,.12);
  --danger: #ef4444; --danger-bg: rgba(239,68,68,.12); --info: #60a5fa; --info-bg: rgba(96,165,250,.12);
  --border: #2e3347; --radius: 8px; --radius-lg: 12px; --shadow: 0 2px 12px rgba(0,0,0,.3);
  --sidebar-w: 240px; --header-h: 56px;
  --transition: .2s cubic-bezier(.4,0,.2,1);
}
html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.6; overflow: hidden; }
a { color: var(--info); text-decoration: none; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bg5); }

/* Layout */
.app { display: flex; height: 100vh; width: 100vw; overflow: hidden; }

/* Sidebar */
.sidebar {
  width: var(--sidebar-w); min-width: var(--sidebar-w); height: 100vh;
  background: var(--bg2); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; transition: width var(--transition), min-width var(--transition);
  z-index: 20; overflow: hidden;
}
.sidebar.collapsed { width: 60px; min-width: 60px; }
.sidebar.collapsed .nav-label, .sidebar.collapsed .sidebar-header-text, .sidebar.collapsed .sidebar-footer-text { display: none; }
.sidebar.collapsed .sidebar-header { justify-content: center; padding: 0 8px; }
.sidebar.collapsed .nav-item { justify-content: center; padding: 10px 0; }
.sidebar.collapsed .nav-item .nav-icon { margin-right: 0; }

.sidebar-header {
  display: flex; align-items: center; gap: 12px; padding: 16px 20px;
  border-bottom: 1px solid var(--border); min-height: var(--header-h);
}
.sidebar-logo {
  width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), #a855f7);
  display: grid; place-items: center; font-size: 13px; font-weight: 800; color: #fff; flex-shrink: 0;
}
.sidebar-header-text h1 { font-size: 14px; font-weight: 700; line-height: 1.2; }
.sidebar-header-text span { font-size: 11px; color: var(--text3); }

.sidebar-nav { flex: 1; overflow-y: auto; padding: 8px; }
.nav-group { margin-bottom: 4px; }
.nav-group-title { font-size: 10px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: .8px; padding: 12px 12px 6px; white-space: nowrap; }
.nav-item {
  display: flex; align-items: center; padding: 9px 12px; border-radius: var(--radius);
  cursor: pointer; transition: all var(--transition); color: var(--text2); white-space: nowrap;
  position: relative; user-select: none;
}
.nav-item:hover { background: var(--bg3); color: var(--text); }
.nav-item.active { background: var(--accent-bg); color: var(--accent2); }
.nav-item.active::before {
  content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 3px; height: 20px; background: var(--accent); border-radius: 0 2px 2px 0;
}
.nav-icon { width: 20px; text-align: center; margin-right: 10px; font-size: 15px; flex-shrink: 0; }
.nav-label { font-size: 13px; font-weight: 500; }
.nav-badge {
  margin-left: auto; background: var(--accent); color: #fff; font-size: 10px; font-weight: 600;
  padding: 1px 7px; border-radius: 10px; min-width: 18px; text-align: center;
}

.sidebar-footer {
  padding: 12px 16px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 8px;
  cursor: pointer; transition: background var(--transition); white-space: nowrap;
}
.sidebar-footer:hover { background: var(--bg3); }
.sidebar-footer-text { font-size: 11px; color: var(--text3); }

/* Main area */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.main-header {
  height: var(--header-h); min-height: var(--header-h);
  display: flex; align-items: center; gap: 16px; padding: 0 24px;
  background: var(--bg2); border-bottom: 1px solid var(--border);
}
.toggle-btn {
  width: 32px; height: 32px; border-radius: 6px; background: var(--bg3);
  display: grid; place-items: center; cursor: pointer; color: var(--text2); border: none;
  font-size: 16px; transition: all var(--transition);
}
.toggle-btn:hover { background: var(--bg4); color: var(--text); }
.main-header h2 { font-size: 16px; font-weight: 600; flex: 1; }
.header-status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text2); }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot-ok { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
.dot-err { background: var(--danger); box-shadow: 0 0 6px var(--danger); }
.dot-warn { background: var(--warn); box-shadow: 0 0 6px var(--warn); }
.header-actions { display: flex; gap: 8px; }

.main-content { flex: 1; overflow-y: auto; padding: 24px; }
.page { display: none; }
.page.active { display: block; animation: fadeIn .2s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

/* Components */
.btn {
  font: inherit; cursor: pointer; border: none; border-radius: var(--radius);
  padding: 7px 16px; font-size: 13px; font-weight: 500; transition: all var(--transition);
  display: inline-flex; align-items: center; gap: 6px;
}
.btn:disabled { opacity: .45; cursor: default; }
.btn-default { background: var(--bg3); color: var(--text); }
.btn-default:hover:not(:disabled) { background: var(--bg4); }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent2); }
.btn-danger { background: var(--danger-bg); color: #fca5a5; border: 1px solid rgba(239,68,68,.2); }
.btn-danger:hover:not(:disabled) { background: rgba(239,68,68,.2); }
.btn-ok { background: var(--ok-bg); color: #6ee7b7; border: 1px solid rgba(52,211,153,.2); }
.btn-ok:hover:not(:disabled) { background: rgba(52,211,153,.2); }
.btn-warn { background: var(--warn-bg); color: #fde68a; border: 1px solid rgba(251,191,36,.2); }
.btn-warn:hover:not(:disabled) { background: rgba(251,191,36,.2); }
.btn-ghost { background: transparent; color: var(--text2); }
.btn-ghost:hover:not(:disabled) { background: var(--bg3); color: var(--text); }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-icon { width: 32px; height: 32px; padding: 0; justify-content: center; border-radius: 6px; }

input, select, textarea {
  font: inherit; background: var(--bg); color: var(--text); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 8px 12px; width: 100%; outline: none; transition: border-color var(--transition);
}
input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-bg); }
input::placeholder, textarea::placeholder { color: var(--text3); }
select { cursor: pointer; }
textarea { resize: vertical; min-height: 80px; }

.card {
  background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 20px; margin-bottom: 16px;
}
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.card-title { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.card-desc { font-size: 12px; color: var(--text3); margin-top: 2px; }

.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
.search-box { position: relative; min-width: 220px; }
.search-box input { padding-left: 34px; }
.search-box::before { content: '🔍'; position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 13px; pointer-events: none; }
.filter-group { display: flex; gap: 4px; }
.filter-btn { padding: 4px 12px; font-size: 12px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text2); cursor: pointer; transition: all var(--transition); }
.filter-btn.active, .filter-btn:hover { background: var(--accent-bg); color: var(--accent2); border-color: var(--accent); }

table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th {
  text-align: left; padding: 10px 14px; color: var(--text3); font-weight: 600; font-size: 11px;
  text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid var(--border); white-space: nowrap;
  position: sticky; top: 0; background: var(--bg2); z-index: 1;
}
tbody td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
tbody tr { transition: background var(--transition); }
tbody tr:hover { background: var(--bg3); }
.mono { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 12px; color: var(--text2); word-break: break-all; }

.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.badge-ok { background: var(--ok-bg); color: var(--ok); }
.badge-warn { background: var(--warn-bg); color: var(--warn); }
.badge-danger { background: var(--danger-bg); color: var(--danger); }
.badge-info { background: var(--info-bg); color: var(--info); }
.badge-ghost { background: var(--bg3); color: var(--text2); }
.badge-accent { background: var(--accent-bg); color: var(--accent2); }

.tag { display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); padding: 2px 8px; border-radius: 4px; font-size: 11px; color: var(--text2); }

/* Stats */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
.stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 20px; transition: border-color var(--transition); }
.stat-card:hover { border-color: var(--accent); }
.stat-icon { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; font-size: 16px; margin-bottom: 10px; }
.stat-label { font-size: 11px; color: var(--text3); text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
.stat-value { font-size: 24px; font-weight: 700; margin-top: 2px; line-height: 1.2; }
.stat-sub { font-size: 11px; color: var(--text3); margin-top: 4px; }

/* Provider grid */
.provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.provider-card {
  background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 18px; transition: all var(--transition); cursor: pointer;
}
.provider-card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: var(--shadow); }
.provider-card .prov-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.provider-card .prov-name { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.provider-card .prov-desc { font-size: 12px; color: var(--text3); margin-bottom: 10px; }
.provider-card .prov-model { font-size: 11px; color: var(--text2); background: var(--bg3); padding: 3px 8px; border-radius: 4px; display: inline-block; }
.provider-card .prov-actions { margin-top: 12px; display: flex; gap: 6px; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex;
  align-items: center; justify-content: center; z-index: 100;
  animation: fadeIn .15s ease-out;
}
.modal-overlay.hidden { display: none; }
.modal {
  background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 28px; width: 90%; max-width: 520px; box-shadow: 0 8px 32px rgba(0,0,0,.5);
  max-height: 85vh; overflow-y: auto; animation: modalIn .2s ease-out;
}
@keyframes modalIn { from { transform: scale(.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.modal-header h3 { font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.modal-close { width: 28px; height: 28px; border-radius: 6px; background: var(--bg3); display: grid; place-items: center; cursor: pointer; border: none; color: var(--text2); font-size: 16px; }
.modal-close:hover { background: var(--bg4); color: var(--text); }

.form-group { margin-bottom: 16px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .3px; }
.form-group .hint { font-size: 11px; color: var(--text3); margin-top: 4px; }
.form-group .input-prefix { position: relative; }
.form-group .input-prefix input { padding-left: 36px; }
.form-group .input-prefix .prefix { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 12px; pointer-events: none; }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }

.perm-checks { display: flex; gap: 16px; }
.perm-checks label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text); text-transform: none; letter-spacing: normal; font-weight: 400; }
.perm-checks input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--accent); }

/* Empty state */
.empty { text-align: center; padding: 60px 24px; color: var(--text3); }
.empty .icon { font-size: 48px; margin-bottom: 16px; opacity: .35; }
.empty p { font-size: 14px; margin-bottom: 4px; }
.empty .sub { font-size: 12px; color: var(--text3); margin-top: 8px; }

/* Loading */
.loading-mask { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text3); }
.spinner { width: 24px; height: 24px; border: 2.5px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin-bottom: 12px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Toast */
.toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 200; display: flex; flex-direction: column; gap: 8px; }
.toast {
  padding: 12px 20px; border-radius: var(--radius); color: #fff; font-size: 13px;
  animation: slideIn .2s ease-out; box-shadow: var(--shadow); display: flex; align-items: center; gap: 8px;
  max-width: 400px;
}
.toast.hidden { display: none; }
.toast-ok { background: #065f46; border: 1px solid var(--ok); }
.toast-err { background: #7f1d1d; border: 1px solid var(--danger); }
.toast-info { background: #1e3a5f; border: 1px solid var(--info); }
.toast-warn { background: #78350f; border: 1px solid var(--warn); }
@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* Actions cell */
.actions-cell { display: flex; gap: 4px; }
.truncate { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Detail panel */
.detail-row { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.detail-row:last-child { border-bottom: none; }
.detail-key { width: 140px; flex-shrink: 0; font-size: 12px; color: var(--text3); font-weight: 500; padding-top: 2px; }
.detail-val { flex: 1; font-size: 13px; word-break: break-all; }

/* Section desc */
.section-desc { font-size: 13px; color: var(--text2); margin-bottom: 20px; line-height: 1.6; }

/* Responsive */
@media (max-width: 768px) {
  .sidebar { position: fixed; left: -260px; z-index: 50; height: 100vh; transition: left var(--transition); }
  .sidebar.mobile-open { left: 0; }
  .main-content { padding: 16px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .provider-grid { grid-template-columns: 1fr; }
  .form-row { grid-template-columns: 1fr; }
}
`;

const JS = `
// ── Globals ──
const API = '/api';
let currentPage = 'dashboard';
let refreshTimer = null;

// ── jQuery-style helpers ──
const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
const html = (el, content) => { if (typeof el === 'string') el = $(el); if (el) el.innerHTML = content; return el; };
const show = (el) => { if (typeof el === 'string') el = $(el); if (el) el.classList.remove('hidden'); return el; };
const hide = (el) => { if (typeof el === 'string') el = $(el); if (el) el.classList.add('hidden'); return el; };
const toggle = (el) => { if (typeof el === 'string') el = $(el); if (el) el.classList.toggle('hidden'); return el; };

// ── Toast ──
function toast(msg, type = 'info') {
  const container = $('#toast-container') || createToastContainer();
  const t = document.createElement('div');
  const icons = { ok: '✅', err: '❌', info: 'ℹ️', warn: '⚠️' };
  t.className = 'toast toast-' + type;
  t.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' + escHtml(msg) + '</span>';
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = '.2s'; setTimeout(() => t.remove(), 200); }, 3500);
}
function createToastContainer() {
  const c = document.createElement('div');
  c.id = 'toast-container';
  c.className = 'toast-container';
  document.body.appendChild(c);
  return c;
}

// ── API ──
async function api(path, opts = {}) {
  try {
    const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts });
    const data = await res.json();
    if (!res.ok && !data.error) data.error = 'HTTP ' + res.status;
    return data;
  } catch (e) { return { error: e.message }; }
}

// ── Utilities ──
function escHtml(s) { if (s == null) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; if (h < 24) return h + 'h ago'; if (d < 30) return d + 'd ago';
  return new Date(iso).toLocaleDateString();
}
function maskKey(s) { if (!s || s.length < 12) return s || ''; return s.substring(0, 6) + '••••••' + s.slice(-4); }
function copyText(text) { navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 'ok')).catch(() => toast('Copy failed', 'err')); }

// ── Modal ──
function showModal(id) { show(id); }
function hideModal(id) { hide(id); }

// ── Sidebar navigation ──
function navigate(page) {
  currentPage = page;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  $('#main-title').textContent = ($('.nav-item.active .nav-label') || {}).textContent || page;
  loadPage(page);
  // Close mobile sidebar
  $('.sidebar')?.classList.remove('mobile-open');
}

function toggleSidebar() {
  const sb = $('.sidebar');
  if (window.innerWidth <= 768) { sb.classList.toggle('mobile-open'); }
  else { sb.classList.toggle('collapsed'); }
}

function loadPage(page) {
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'agents': loadAgents(); break;
    case 'friends': loadFriends(); break;
    case 'models': loadModels(); break;
    case 'settings': loadSettings(); break;
  }
}

// ════════════════════════════════════════════════════════════
// PAGE: Dashboard
// ════════════════════════════════════════════════════════════
async function loadDashboard() {
  const el = $('#dashboard-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>Loading dashboard...</div>');
  const [status, friends, identity] = await Promise.all([api('/status'), api('/friends'), api('/identity')]);
  if (status.error) { html(el, '<div class="empty"><div class="icon">⚠️</div><p>Failed to connect to AICQ plugin</p></div>'); return; }
  const connCls = status.connected ? 'dot-ok' : 'dot-err';
  const connText = status.connected ? 'Connected' : 'Disconnected';
  const friendList = friends.friends || [];
  const aiFriends = friendList.filter(f => f.friendType === 'ai').length;
  const humanFriends = friendList.filter(f => f.friendType !== 'ai').length;

  html(el, \\\`
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--accent-bg)">📡</div>
        <div class="stat-label">Server Status</div>
        <div class="stat-value" style="font-size:16px;display:flex;align-items:center;gap:8px">
          <span class="dot \${connCls}"></span> \${connText}
        </div>
        <div class="stat-sub">\${escHtml(status.serverUrl)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--ok-bg)">👥</div>
        <div class="stat-label">Total Friends</div>
        <div class="stat-value">\${friendList.length}</div>
        <div class="stat-sub">\${aiFriends} AI · \${humanFriends} Human</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--info-bg)">🔗</div>
        <div class="stat-label">Active Sessions</div>
        <div class="stat-value">\${status.sessionCount || 0}</div>
        <div class="stat-sub">Encrypted sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--warn-bg)">🔑</div>
        <div class="stat-label">Agent ID</div>
        <div class="stat-value mono" style="font-size:13px">\${escHtml(status.agentId)}</div>
        <div class="stat-sub">Fingerprint: \${escHtml(status.fingerprint)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">📋 Recent Friends</div><button class="btn btn-sm btn-ghost" onclick="navigate('friends')">View All →</button></div>
        \${renderMiniFriendList(friendList.slice(0, 5))}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">🤖 Identity Info</div></div>
        <div class="detail-row"><div class="detail-key">Agent ID</div><div class="detail-val mono" style="cursor:pointer" onclick="copyText('\${identity.agentId}')">\${escHtml(identity.agentId)} 📋</div></div>
        <div class="detail-row"><div class="detail-key">Fingerprint</div><div class="detail-val mono">\${escHtml(identity.publicKeyFingerprint)}</div></div>
        <div class="detail-row"><div class="detail-key">Server URL</div><div class="detail-val mono" style="cursor:pointer" onclick="copyText('\${identity.serverUrl}')">\${escHtml(identity.serverUrl)} 📋</div></div>
        <div class="detail-row"><div class="detail-key">Connection</div><div class="detail-val"><span class="badge badge-\${identity.connected ? 'ok' : 'danger'}">\${identity.connected ? 'Online' : 'Offline'}</span></div></div>
      </div>
    </div>
  \\\`);
}

function renderMiniFriendList(friends) {
  if (!friends.length) return '<div class="empty"><p>No friends yet</p></div>';
  let html = '';
  friends.forEach(f => {
    html += '<div class="detail-row"><div class="detail-key"><span class="badge badge-' + (f.friendType === 'ai' ? 'info' : 'ghost') + '">' + escHtml(f.friendType || '?') + '</span></div><div class="detail-val mono truncate" style="font-size:12px">' + escHtml(f.id) + '</div></div>';
  });
  return html;
}

// ════════════════════════════════════════════════════════════
// PAGE: Agent Management (from openclaw.json / stableclaw.json)
// ════════════════════════════════════════════════════════════
async function loadAgents() {
  const el = $('#agents-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>Loading agents...</div>');
  const data = await api('/agents');
  if (data.error) { html(el, '<div class="empty"><div class="icon">⚠️</div><p>' + escHtml(data.error) + '</p></div>'); return; }

  const agents = data.agents || [];
  const configSource = data.configSource || 'unknown';

  let rows = '';
  agents.forEach((a, i) => {
    const modelBadge = a.model ? '<span class="badge badge-accent">' + escHtml(a.model) + '</span>' : '<span class="badge badge-ghost">default</span>';
    const providerBadge = a.provider ? '<span class="tag">' + escHtml(a.provider) + '</span>' : '';
    const statusBadge = a.enabled !== false ? '<span class="badge badge-ok">active</span>' : '<span class="badge badge-warn">disabled</span>';

    rows += \\\`<tr>
      <td>\${statusBadge}</td>
      <td><div style="font-weight:600">\${escHtml(a.name || a.id || 'Agent ' + (i + 1))}</div><div class="mono" style="font-size:11px;color:var(--text3)">\${escHtml(a.id || '—')}</div></td>
      <td>\${modelBadge}</td>
      <td>\${providerBadge}</td>
      <td>\${escHtml(a.systemPrompt ? a.systemPrompt.substring(0, 60) + '...' : '—')}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-ghost" onclick="viewAgent(\${i})" title="View">👁️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAgent(\${i})" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>\\\`;
  });

  if (!agents.length) {
    html(el, \\\`
      <p class="section-desc">Reads agent configurations from <strong>\${escHtml(configSource)}</strong>. Configure your agents in the config file.</p>
      <div class="empty"><div class="icon">🤖</div><p>No agents configured</p><p class="sub">Add agents to your openclaw.json or stableclaw.json config file</p></div>
    \\\`);
    return;
  }

  html(el, \\\`
    <div class="toolbar">
      <div class="search-box"><input type="text" placeholder="Search agents..." id="agent-search" oninput="filterAgentTable()"></div>
      <button class="btn btn-sm btn-default" onclick="loadAgents()">🔄 Refresh</button>
    </div>
    <p class="section-desc">Agent list from <strong style="color:var(--accent2)">\${escHtml(configSource)}</strong>. Total: <strong>\${agents.length}</strong> agents configured.</p>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th style="width:60px">Status</th><th>Agent</th><th>Model</th><th>Provider</th><th>System Prompt</th><th style="width:90px">Actions</th></tr></thead>
          <tbody id="agent-table-body">\${rows}</tbody>
        </table>
      </div>
    </div>
  \\\`);
}

function filterAgentTable() {
  const q = ($('#agent-search')?.value || '').toLowerCase();
  $$('#agent-table-body tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function viewAgent(index) {
  const agents = window._lastAgentsData?.agents || [];
  const a = agents[index];
  if (!a) return;
  let details = '';
  for (const [k, v] of Object.entries(a)) {
    if (v != null && v !== '') {
      const display = typeof v === 'string' && v.length > 200 ? escHtml(v.substring(0, 200)) + '...' : escHtml(String(v));
      details += '<div class="detail-row"><div class="detail-key">' + escHtml(k) + '</div><div class="detail-val mono" style="font-size:12px;cursor:pointer" onclick="copyText(decodeURIComponent(\\'' + encodeURIComponent(String(v)) + '\\'))">' + display + ' 📋</div></div>';
    }
  }
  html('#view-agent-body', details || '<div class="empty"><p>No data</p></div>');
  $('#view-agent-title').textContent = a.name || a.id || 'Agent';
  showModal('modal-view-agent');
}

async function deleteAgent(index) {
  if (!confirm('Are you sure you want to delete this agent?')) return;
  const r = await api('/agents/' + index, { method: 'DELETE' });
  if (r.success) { toast('Agent deleted', 'ok'); loadAgents(); }
  else { toast(r.message || r.error || 'Delete failed', 'err'); }
}

// ════════════════════════════════════════════════════════════
// PAGE: Friends Management
// ════════════════════════════════════════════════════════════
let friendsFilter = 'all';

async function loadFriends() {
  const el = $('#friends-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>Loading friends...</div>');
  const [friends, requests, sessions] = await Promise.all([api('/friends'), api('/friends/requests'), api('/sessions')]);

  // Sub-tabs
  const friendCount = (friends.friends || []).length;
  const reqCount = (requests.requests || []).length;
  const sessCount = (sessions.sessions || []).length;

  html('#friends-tabs', \\\`
    <button class="filter-btn \${friendsSubTab==='friends'?'active':''}" onclick="friendsSubTab='friends';loadFriends()">👥 Friends (<span id="fc">\${friendCount}</span>)</button>
    <button class="filter-btn \${friendsSubTab==='requests'?'active':''}" onclick="friendsSubTab='requests';loadFriends()">📨 Requests (<span id="rc">\${reqCount}</span>)</button>
    <button class="filter-btn \${friendsSubTab==='sessions'?'active':''}" onclick="friendsSubTab='sessions';loadFriends()">🔗 Sessions (<span id="sc">\${sessCount}</span>)</button>
  \\\`);

  window._friendsData = friends;
  window._requestsData = requests;
  window._sessionsData = sessions;

  if (friendsSubTab === 'friends') renderFriendsList(friends.friends || []);
  else if (friendsSubTab === 'requests') renderRequestsList(requests.requests || []);
  else renderSessionsList(sessions.sessions || []);
}
window.friendsSubTab = 'friends';

function renderFriendsList(friends) {
  const el = $('#friends-content');
  let rows = '';
  friends.forEach(f => {
    const perms = (f.permissions || []).map(p => '<span class="badge badge-' + (p === 'exec' ? 'warn' : 'ok') + '">' + escHtml(p) + '</span>').join(' ');
    rows += \\\`<tr data-type="\${f.friendType || ''}" data-search="\${escHtml(f.id + ' ' + (f.aiName || ''))}">
      <td><span class="badge badge-\${f.friendType === 'ai' ? 'info' : 'ghost'}" style="font-size:10px">\${(f.friendType || 'unknown').toUpperCase()}</span></td>
      <td><div style="font-weight:500">\${escHtml(f.aiName || f.id?.substring(0, 12) || '—')}</div><div class="mono" style="font-size:11px;color:var(--text3);cursor:pointer" onclick="copyText('\${escHtml(f.id)}')">\${escHtml(f.id)} 📋</div></td>
      <td>\${perms || '<span class="badge badge-ghost">none</span>'}</td>
      <td class="mono" style="font-size:11px">\${escHtml(f.publicKeyFingerprint || '—')}</td>
      <td style="white-space:nowrap">\${timeAgo(f.lastMessageAt)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-ghost" onclick="editFriendPerms('\${escHtml(f.id)}',\${JSON.stringify(f.permissions || [])})" title="Permissions">⚙️</button>
          <button class="btn btn-sm btn-danger" onclick="removeFriend('\${escHtml(f.id)}')" title="Remove">🗑️</button>
        </div>
      </td>
    </tr>\\\`;
  });

  html(el, \\\`
    <div class="toolbar">
      <div class="search-box"><input type="text" placeholder="Search friends..." id="friend-search" oninput="filterFriendTable()"></div>
      <div class="filter-group">
        <button class="filter-btn \${friendsFilter==='all'?'active':''}" onclick="friendsFilter='all';filterFriendTable()">All</button>
        <button class="filter-btn \${friendsFilter==='ai'?'active':''}" onclick="friendsFilter='ai';filterFriendTable()">AI</button>
        <button class="filter-btn \${friendsFilter==='human'?'active':''}" onclick="friendsFilter='human';filterFriendTable()">Human</button>
      </div>
      <span style="flex:1"></span>
      <button class="btn btn-sm btn-primary" onclick="showAddFriendModal()">➕ Add Friend</button>
      <button class="btn btn-sm btn-default" onclick="loadFriends()">🔄</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto;max-height:calc(100vh - 280px);overflow-y:auto">
        <table>
          <thead><tr><th style="width:60px">Type</th><th>Friend</th><th>Permissions</th><th>Fingerprint</th><th>Last Message</th><th style="width:80px">Actions</th></tr></thead>
          <tbody id="friend-table-body">\${rows}</tbody>
        </table>
      </div>
      \${!friends.length ? '<div class="empty"><div class="icon">👥</div><p>No friends yet</p><p class="sub">Add a friend using their 6-digit temp number or node ID</p></div>' : ''}
    </div>
  \\\`);
}

function filterFriendTable() {
  const q = ($('#friend-search')?.value || '').toLowerCase();
  $$('#friend-table-body tr').forEach(tr => {
    const matchSearch = tr.dataset.search?.toLowerCase().includes(q);
    const matchFilter = friendsFilter === 'all' || tr.dataset.type === friendsFilter;
    tr.style.display = matchSearch && matchFilter ? '' : 'none';
  });
}

function renderRequestsList(requests) {
  const el = $('#friends-content');
  let rows = '';
  requests.forEach(r => {
    const stCls = r.status === 'pending' ? 'warn' : r.status === 'accepted' ? 'ok' : 'ghost';
    rows += \\\`<tr>
      <td class="mono" style="font-size:11px">\${escHtml(r.id)}</td>
      <td class="mono" style="font-size:12px">\${escHtml(r.fromId || r.requesterId || '—')}</td>
      <td><span class="badge badge-\${stCls}">\${escHtml(r.status)}</span></td>
      <td>\${timeAgo(r.createdAt)}</td>
      <td>
        \${r.status === 'pending' ? '<div class="actions-cell"><button class="btn btn-sm btn-ok" onclick="acceptFriendReq(\\'' + escHtml(r.id) + '\\')">✓ Accept</button><button class="btn btn-sm btn-danger" onclick="rejectFriendReq(\\'' + escHtml(r.id) + '\\')">✗ Reject</button></div>' : '—'}
      </td>
    </tr>\\\`;
  });
  html(el, \\\`
    <div class="toolbar"><button class="btn btn-sm btn-default" onclick="loadFriends()">🔄 Refresh</button></div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Request ID</th><th>From</th><th>Status</th><th>Time</th><th style="width:160px">Actions</th></tr></thead>
        <tbody>\${rows}</tbody>
      </table></div>
      \${!requests.length ? '<div class="empty"><div class="icon">📨</div><p>No pending requests</p></div>' : ''}
    </div>
  \\\`);
}

function renderSessionsList(sessions) {
  const el = $('#friends-content');
  let rows = '';
  sessions.forEach(s => {
    rows += \\\`<tr>
      <td class="mono" style="font-size:12px;cursor:pointer" onclick="copyText('\${escHtml(s.peerId)}')">\${escHtml(s.peerId)} 📋</td>
      <td>\${timeAgo(s.createdAt)}</td>
      <td><span class="badge badge-info">\${s.messageCount} messages</span></td>
    </tr>\\\`;
  });
  html(el, \\\`
    <div class="toolbar"><button class="btn btn-sm btn-default" onclick="loadFriends()">🔄 Refresh</button></div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Peer ID</th><th>Established</th><th>Messages</th></tr></thead>
        <tbody>\${rows}</tbody>
      </table></div>
      \${!sessions.length ? '<div class="empty"><div class="icon">🔗</div><p>No active sessions</p></div>' : ''}
    </div>
  \\\`);
}

function showAddFriendModal() { $('#add-friend-target').value = ''; showModal('modal-add-friend'); setTimeout(() => $('#add-friend-target')?.focus(), 100); }
async function addFriend() {
  const target = $('#add-friend-target').value.trim();
  if (!target) { toast('Enter a temp number or node ID', 'warn'); return; }
  hideModal('modal-add-friend');
  toast('Sending friend request...', 'info');
  const r = await api('/friends', { method: 'POST', body: JSON.stringify({ target }) });
  if (r.success) { toast(r.message || 'Friend request sent!', 'ok'); loadFriends(); }
  else { toast(r.message || r.error || 'Failed to add friend', 'err'); }
}
async function removeFriend(id) {
  if (!confirm('Remove friend ' + id + '?')) return;
  const r = await api('/friends/' + encodeURIComponent(id), { method: 'DELETE' });
  if (r.success) { toast('Friend removed', 'ok'); loadFriends(); }
  else { toast(r.message || r.error || 'Failed', 'err'); }
}

let _editFriendId = null;
function editFriendPerms(id, perms) {
  _editFriendId = id;
  $('#perm-chat').checked = (perms || []).includes('chat');
  $('#perm-exec').checked = (perms || []).includes('exec');
  showModal('modal-permissions');
}
async function saveFriendPerms() {
  const perms = [];
  if ($('#perm-chat').checked) perms.push('chat');
  if ($('#perm-exec').checked) perms.push('exec');
  const r = await api('/friends/' + encodeURIComponent(_editFriendId) + '/permissions', { method: 'PUT', body: JSON.stringify({ permissions: perms }) });
  if (r.success) { toast('Permissions updated', 'ok'); hideModal('modal-permissions'); loadFriends(); }
  else { toast(r.message || r.error || 'Failed', 'err'); }
}
async function acceptFriendReq(id) {
  const r = await api('/friends/requests/' + encodeURIComponent(id) + '/accept', { method: 'POST', body: JSON.stringify({ permissions: ['chat'] }) });
  if (r.success) { toast('Request accepted', 'ok'); loadFriends(); } else { toast(r.message || r.error || 'Failed', 'err'); }
}
async function rejectFriendReq(id) {
  const r = await api('/friends/requests/' + encodeURIComponent(id) + '/reject', { method: 'POST', body: JSON.stringify({}) });
  if (r.success) { toast('Request rejected', 'ok'); loadFriends(); } else { toast(r.message || r.error || 'Failed', 'err'); }
}

// ════════════════════════════════════════════════════════════
// PAGE: Model Management
// ════════════════════════════════════════════════════════════
let _modelProviders = null;

async function loadModels() {
  const el = $('#models-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>Loading model configuration...</div>');
  const data = await api('/models');
  if (data.error) { html(el, '<div class="empty"><div class="icon">⚠️</div><p>' + escHtml(data.error) + '</p></div>'); return; }
  _modelProviders = data;
  renderModels(data);
}

function renderModels(data) {
  const el = $('#models-content');
  const providers = data.providers || [];
  const configured = providers.filter(p => p.configured).length;

  let cards = '';
  providers.forEach(p => {
    const icon = p.id === 'openai' ? '🟢' : p.id === 'anthropic' ? '🟠' : p.id === 'google' ? '🔵' : p.id === 'ollama' ? '🟣' : p.id === 'deepseek' ? '🔷' : p.id === 'groq' ? '⚡' : p.id === 'openrouter' ? '🌐' : '⚪';
    const statusBadge = p.configured
      ? '<span class="badge badge-ok">● Configured</span>'
      : '<span class="badge badge-ghost">Not set</span>';
    const currentModel = p.modelId ? '<span class="prov-model">' + escHtml(p.modelId) + '</span>' : '';

    cards += \\\`
      <div class="provider-card" onclick="showModelConfigModal('\${escHtml(p.id)}')">
        <div class="prov-head">
          <div class="prov-name">\${icon} \${escHtml(p.name)}</div>
          \${statusBadge}
        </div>
        <div class="prov-desc">\${escHtml(p.description)}</div>
        \${currentModel}
        <div class="prov-actions">
          <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();showModelConfigModal('\${escHtml(p.id)}')">Configure</button>
        </div>
      </div>\\\`;
  });

  let activeModelsSection = '';
  if (data.currentModels && data.currentModels.length) {
    let rows = '';
    data.currentModels.forEach(m => {
      rows += \\\`<tr>
        <td style="font-weight:500">\${escHtml(m.provider)}</td>
        <td class="mono">\${escHtml(m.modelId)}</td>
        <td><span class="badge badge-ok">● Key set</span></td>
        <td class="mono" style="font-size:11px">\${escHtml(m.baseUrl || 'default')}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="showModelConfigModal('\${escHtml(m.providerId)}')">Edit</button></td>
      </tr>\\\`;
    });
    activeModelsSection = \\\`
      <div class="card" style="margin-top:20px">
        <div class="card-header"><div class="card-title">📊 Active Model Configurations</div></div>
        <div style="overflow-x:auto"><table>
          <thead><tr><th>Provider</th><th>Model</th><th>API Key</th><th>Base URL</th><th>Actions</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table></div>
      </div>\\\`;
  }

  html(el, \\\`
    <div class="stats-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--accent-bg)">🧠</div>
        <div class="stat-label">Configured</div>
        <div class="stat-value">\${configured} / \${providers.length}</div>
        <div class="stat-sub">Providers with API keys</div>
      </div>
    </div>
    <p class="section-desc">Configure LLM providers for your agents. Click a provider card to set or update the API key, model, and base URL. Changes are saved directly to your config file.</p>
    <div class="provider-grid">\${cards}</div>
    \${activeModelsSection}
  \\\`);
}

let _editProviderId = null;
function showModelConfigModal(id) {
  const p = (_modelProviders?.providers || []).find(x => x.id === id);
  if (!p) { toast('Provider not found', 'err'); return; }
  _editProviderId = id;
  $('#model-name').textContent = p.name;
  $('#model-icon').textContent = p.id === 'openai' ? '🟢' : p.id === 'anthropic' ? '🟠' : '🟢';
  $('#model-api-key').value = '';
  $('#model-api-key').placeholder = p.apiKeyHint || 'Enter API key';
  $('#model-model-id').value = p.modelId || '';
  $('#model-model-id').placeholder = p.modelHint || 'Model ID';
  $('#model-base-url').value = p.baseUrl || '';
  $('#model-base-url').placeholder = p.baseUrlHint || 'Default URL';
  $('#model-current-key').textContent = p.apiKeyHasValue ? 'Current: ' + p.apiKey : 'No API key configured';
  showModal('modal-model-config');
}
async function saveModelConfig() {
  const apiKey = $('#model-api-key').value.trim();
  const modelId = $('#model-model-id').value.trim();
  const baseUrl = $('#model-base-url').value.trim();
  if (!apiKey && !modelId) { toast('Enter at least an API key or model ID', 'warn'); return; }
  hideModal('modal-model-config');
  toast('Saving configuration...', 'info');
  const r = await api('/models/' + encodeURIComponent(_editProviderId), { method: 'PUT', body: JSON.stringify({ apiKey, modelId, baseUrl }) });
  if (r.success) { toast(r.message || 'Configuration saved!', 'ok'); loadModels(); }
  else { toast(r.message || r.error || 'Failed to save', 'err'); }
}

// ════════════════════════════════════════════════════════════
// PAGE: Settings (editable with save)
// ════════════════════════════════════════════════════════════
let _settingsSaving = false;

async function loadSettings() {
  const el = $('#settings-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>Loading settings...</div>');

  const settings = await api('/settings');
  if (settings.error) {
    html(el, '<div class="empty"><div class="icon">⚠️</div><p>' + escHtml(settings.error) + '</p></div>');
    return;
  }

  window._currentSettings = settings;

  html(el, \\\`
    <p class="section-desc">Configure the AICQ plugin local settings. Changes are saved to <strong>\${escHtml(settings.configSource || 'openclaw.json')}</strong> under the <code>plugins.aicq-chat</code> section.</p>

    <div class="card">
      <div class="card-header">
        <div class="card-title">🔌 Connection</div>
        <span class="badge badge-\${settings.connected ? 'ok' : 'danger'}">\${settings.connected ? '● Connected' : '○ Disconnected'}</span>
      </div>
      <div class="form-group">
        <label>Server URL</label>
        <div class="input-prefix">
          <span class="prefix">🌐</span>
          <input type="url" id="set-server-url" value="\${escHtml(settings.serverUrl || '')}" placeholder="https://aicq.online:61018">
        </div>
        <div class="hint">The HTTPS URL of the AICQ relay server. WebSocket path /ws is auto-appended.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">👥 Friend Limits</div></div>
      <div class="form-row">
        <div class="form-group">
          <label>Max Friends</label>
          <input type="number" id="set-max-friends" value="\${settings.maxFriends || 200}" min="1" max="10000" placeholder="200">
          <div class="hint">Maximum number of encrypted friend connections (1–10000).</div>
        </div>
        <div class="form-group">
          <label>Auto-Accept Friends</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <label style="text-transform:none;letter-spacing:normal;font-weight:400;font-size:13px;color:var(--text);display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="set-auto-accept" \${settings.autoAcceptFriends ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent)">
              Automatically accept all incoming friend requests
            </label>
          </div>
          <div class="hint">When enabled, friend requests are accepted without manual review.</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">🤖 Agent Identity</div></div>
      <div class="detail-row"><div class="detail-key">Agent ID</div><div class="detail-val mono" style="cursor:pointer" onclick="copyText('\${escHtml(settings.agentId)}')">\${escHtml(settings.agentId)} 📋</div></div>
      <div class="detail-row"><div class="detail-key">Public Key Fingerprint</div><div class="detail-val mono">\${escHtml(settings.publicKeyFingerprint || '—')}</div></div>
      <div class="detail-row"><div class="detail-key">Friends</div><div class="detail-val">\${settings.friendCount || 0}</div></div>
      <div class="detail-row"><div class="detail-key">Active Sessions</div><div class="detail-val">\${settings.sessionCount || 0}</div></div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">📁 Config File</div></div>
      <div class="detail-row"><div class="detail-key">Source</div><div class="detail-val mono" style="cursor:pointer" onclick="copyText('\${escHtml(settings.configPath || '')}')">\${escHtml(settings.configPath || 'Not found')} 📋</div></div>
      <div class="detail-row"><div class="detail-key">Plugin Version</div><div class="detail-val">1.0.4</div></div>
    </div>

    <div class="form-actions" style="justify-content:flex-start;margin-top:8px;padding-top:0;border-top:none">
      <button class="btn btn-primary" id="btn-save-settings" onclick="saveSettings()">
        💾 Save Settings
      </button>
      <button class="btn btn-default" onclick="loadSettings()">
        🔄 Discard & Refresh
      </button>
      <span id="settings-save-status" style="margin-left:8px;font-size:12px;color:var(--text3)"></span>
    </div>
  \\\`);
}

async function saveSettings() {
  if (_settingsSaving) return;
  _settingsSaving = true;

  const btn = $('#btn-save-settings');
  const statusEl = $('#settings-save-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  if (statusEl) statusEl.textContent = '';

  const serverUrl = $('#set-server-url')?.value?.trim();
  const maxFriends = parseInt($('#set-max-friends')?.value, 10);
  const autoAcceptFriends = $('#set-auto-accept')?.checked ?? false;

  // Basic validation
  if (!serverUrl) {
    toast('Server URL is required', 'warn');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save Settings'; }
    _settingsSaving = false;
    return;
  }
  if (isNaN(maxFriends) || maxFriends < 1 || maxFriends > 10000) {
    toast('Max Friends must be between 1 and 10000', 'warn');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save Settings'; }
    _settingsSaving = false;
    return;
  }

  const r = await api('/settings', {
    method: 'PUT',
    body: JSON.stringify({ serverUrl, maxFriends, autoAcceptFriends }),
  });

  _settingsSaving = false;
  if (btn) { btn.disabled = false; btn.textContent = '💾 Save Settings'; }

  if (r.success) {
    toast('Settings saved successfully!', 'ok');
    if (statusEl) { statusEl.textContent = '✓ Saved'; statusEl.style.color = 'var(--ok)'; }
    // Reload to reflect new values
    setTimeout(() => loadSettings(), 1000);
  } else {
    toast(r.message || r.error || 'Failed to save settings', 'err');
    if (statusEl) { statusEl.textContent = '✗ Failed'; statusEl.style.color = 'var(--danger)'; }
  }
}

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  $$('.nav-item').forEach(n => n.addEventListener('click', () => navigate(n.dataset.page)));
  $('.toggle-btn')?.addEventListener('click', toggleSidebar);

  // Load dashboard
  navigate('dashboard');

  // Auto-refresh status every 30s
  refreshTimer = setInterval(() => {
    if (currentPage === 'dashboard') loadDashboard();
    // Update status dot
    api('/status').then(s => {
      if (!s.error) {
        const dot = $('#header-dot');
        if (dot) { dot.className = 'dot ' + (s.connected ? 'dot-ok' : 'dot-err'); }
        const txt = $('#header-status');
        if (txt) txt.textContent = s.connected ? 'Connected' : 'Disconnected';
      }
    });
  }, 30000);
});
`;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AICQ Management Console</title>
<style>${CSS}</style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">AQ</div>
      <div class="sidebar-header-text"><h1>AICQ</h1><span>Management Console</span></div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-group">
        <div class="nav-group-title">Overview</div>
        <div class="nav-item active" data-page="dashboard"><span class="nav-icon">📊</span><span class="nav-label">Dashboard</span></div>
      </div>
      <div class="nav-group">
        <div class="nav-group-title">Management</div>
        <div class="nav-item" data-page="agents"><span class="nav-icon">🤖</span><span class="nav-label">Agents</span></div>
        <div class="nav-item" data-page="friends"><span class="nav-icon">👥</span><span class="nav-label">Friends</span><span class="nav-badge" id="friend-badge">0</span></div>
        <div class="nav-item" data-page="models"><span class="nav-icon">🧠</span><span class="nav-label">Models</span></div>
      </div>
      <div class="nav-group">
        <div class="nav-group-title">System</div>
        <div class="nav-item" data-page="settings"><span class="nav-icon">⚙️</span><span class="nav-label">Settings</span></div>
      </div>
    </nav>
    <div class="sidebar-footer" onclick="toggleSidebar()">
      <span>◀</span><span class="sidebar-footer-text">Collapse sidebar</span>
    </div>
  </aside>

  <!-- Main -->
  <main class="main">
    <header class="main-header">
      <button class="toggle-btn" onclick="toggleSidebar()">☰</button>
      <h2 id="main-title">Dashboard</h2>
      <div class="header-status">
        <span class="dot dot-err" id="header-dot"></span>
        <span id="header-status">Connecting...</span>
      </div>
      <div class="header-actions">
        <button class="btn btn-sm btn-default" onclick="loadPage(currentPage)">🔄 Refresh</button>
      </div>
    </header>
    <div class="main-content">

      <!-- Dashboard -->
      <div class="page active" id="page-dashboard"><div id="dashboard-content"><div class="loading-mask"><div class="spinner"></div>Loading...</div></div></div>

      <!-- Agents -->
      <div class="page" id="page-agents"><div id="agents-content"></div></div>

      <!-- Friends -->
      <div class="page" id="page-friends">
        <div id="friends-tabs" style="display:flex;gap:6px;margin-bottom:16px"></div>
        <div id="friends-content"></div>
      </div>

      <!-- Models -->
      <div class="page" id="page-models"><div id="models-content"></div></div>

      <!-- Settings -->
      <div class="page" id="page-settings"><div id="settings-content"></div></div>

    </div>
  </main>
</div>

<!-- Modal: Add Friend -->
<div class="modal-overlay hidden" id="modal-add-friend" onclick="if(event.target===this)hideModal('modal-add-friend')">
  <div class="modal">
    <div class="modal-header"><h3>➕ Add Friend</h3><button class="modal-close" onclick="hideModal('modal-add-friend')">✕</button></div>
    <div class="form-group">
      <label>Temp Number or Node ID</label>
      <input id="add-friend-target" type="text" placeholder="6-digit number or node ID" onkeydown="if(event.key==='Enter')addFriend()">
      <div class="hint">Enter the 6-digit temporary number or the full node ID of your friend.</div>
    </div>
    <div class="form-actions">
      <button class="btn btn-default" onclick="hideModal('modal-add-friend')">Cancel</button>
      <button class="btn btn-primary" onclick="addFriend()">Send Request</button>
    </div>
  </div>
</div>

<!-- Modal: Edit Permissions -->
<div class="modal-overlay hidden" id="modal-permissions" onclick="if(event.target===this)hideModal('modal-permissions')">
  <div class="modal">
    <div class="modal-header"><h3>⚙️ Edit Permissions</h3><button class="modal-close" onclick="hideModal('modal-permissions')">✕</button></div>
    <div class="form-group">
      <label>Friend Permissions</label>
      <div class="perm-checks" style="margin-top:10px">
        <label><input type="checkbox" id="perm-chat" checked> 💬 Chat <span style="color:var(--text3);font-size:11px">(send/receive messages)</span></label>
        <label><input type="checkbox" id="perm-exec"> 🔧 Exec <span style="color:var(--text3);font-size:11px">(execute tools/commands)</span></label>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-default" onclick="hideModal('modal-permissions')">Cancel</button>
      <button class="btn btn-primary" onclick="saveFriendPerms()">Save Permissions</button>
    </div>
  </div>
</div>

<!-- Modal: Model Config -->
<div class="modal-overlay hidden" id="modal-model-config" onclick="if(event.target===this)hideModal('modal-model-config')">
  <div class="modal" style="max-width:560px">
    <div class="modal-header"><h3><span id="model-icon">🟢</span> <span id="model-name">Provider</span></h3><button class="modal-close" onclick="hideModal('modal-model-config')">✕</button></div>
    <div style="margin-bottom:16px;font-size:12px;color:var(--text3)" id="model-current-key"></div>
    <div class="form-group">
      <label>🔑 API Key</label>
      <div class="input-prefix"><span class="prefix">🔑</span><input id="model-api-key" type="password" placeholder="sk-..."></div>
      <div class="hint">Leave blank to keep the existing key. Enter a new key to replace it.</div>
    </div>
    <div class="form-group">
      <label>🤖 Model ID</label>
      <div class="input-prefix"><span class="prefix">🤖</span><input id="model-model-id" type="text" placeholder="gpt-4o"></div>
      <div class="hint">The model to use. E.g. gpt-4o, claude-sonnet-4-20250514, etc.</div>
    </div>
    <div class="form-group">
      <label>🌐 Base URL <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text3)">(optional)</span></label>
      <div class="input-prefix"><span class="prefix">🌐</span><input id="model-base-url" type="text" placeholder="https://..."></div>
      <div class="hint">Custom endpoint URL. Only needed for proxies or self-hosted models.</div>
    </div>
    <div class="form-actions">
      <button class="btn btn-default" onclick="hideModal('modal-model-config')">Cancel</button>
      <button class="btn btn-primary" onclick="saveModelConfig()">💾 Save Configuration</button>
    </div>
  </div>
</div>

<!-- Modal: View Agent -->
<div class="modal-overlay hidden" id="modal-view-agent" onclick="if(event.target===this)hideModal('modal-view-agent')">
  <div class="modal">
    <div class="modal-header"><h3>🤖 <span id="view-agent-title">Agent</span></h3><button class="modal-close" onclick="hideModal('modal-view-agent')">✕</button></div>
    <div id="view-agent-body"></div>
    <div class="form-actions"><button class="btn btn-default" onclick="hideModal('modal-view-agent')">Close</button></div>
  </div>
</div>

<!-- Toast Container -->
<div id="toast-container" class="toast-container"></div>

<script>${JS}</script>
</body>
</html>`;

export function getManagementHTML(): string {
  return HTML;
}
