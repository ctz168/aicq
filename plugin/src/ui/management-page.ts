/**
 * AICQ Management UI — Self-contained SPA HTML page.
 *
 * Served via registerHttpRoute at /plugins/aicq-chat/.
 * Communicates with REST endpoints at /plugins/aicq-chat/api/*.
 */

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f1117; --bg2: #1a1d27; --bg3: #242836; --bg4: #2e3347;
  --text: #e4e6ef; --text2: #9499b3; --text3: #5c6080;
  --accent: #e04040; --accent2: #ff5a5a; --ok: #34d399; --warn: #fbbf24;
  --danger: #ef4444; --info: #60a5fa; --border: #2e3347; --radius: 8px;
  --shadow: 0 2px 12px rgba(0,0,0,.3);
}
html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; }
a { color: var(--info); text-decoration: none; }
button { font: inherit; cursor: pointer; border: none; border-radius: var(--radius); padding: 6px 14px; font-size: 13px; transition: background .15s, opacity .15s; }
button:disabled { opacity: .45; cursor: default; }
.btn { background: var(--bg3); color: var(--text); }
.btn:hover:not(:disabled) { background: var(--bg4); }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent2); }
.btn-danger { background: #7f1d1d; color: #fca5a5; }
.btn-danger:hover:not(:disabled) { background: #991b1b; }
.btn-ok { background: #065f46; color: #6ee7b7; }
.btn-ok:hover:not(:disabled) { background: #064e3b; }
.btn-sm { padding: 3px 10px; font-size: 12px; }
.btn-ghost { background: transparent; color: var(--text2); }
.btn-ghost:hover:not(:disabled) { background: var(--bg3); color: var(--text); }

input, select, textarea {
  font: inherit; background: var(--bg); color: var(--text); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 7px 12px; width: 100%; outline: none;
  transition: border-color .15s;
}
input:focus, select:focus, textarea:focus { border-color: var(--accent); }
input::placeholder { color: var(--text3); }
select { cursor: pointer; appearance: auto; }

.topbar {
  display: flex; align-items: center; gap: 16px; padding: 12px 24px;
  background: var(--bg2); border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 10;
}
.topbar h1 { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.topbar h1 .logo { width: 24px; height: 24px; border-radius: 6px; background: var(--accent); display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff; }
.topbar .status { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text2); }
.topbar .dot { width: 8px; height: 8px; border-radius: 50%; }
.dot-ok { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
.dot-err { background: var(--danger); box-shadow: 0 0 6px var(--danger); }

.tabs {
  display: flex; gap: 0; background: var(--bg2); border-bottom: 1px solid var(--border);
  padding: 0 24px;
}
.tab-btn {
  padding: 10px 20px; font-size: 13px; font-weight: 500; color: var(--text2);
  border-radius: 0; border-bottom: 2px solid transparent;
  background: transparent; transition: all .15s;
}
.tab-btn:hover { color: var(--text); background: var(--bg); }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

.content { padding: 24px; max-width: 1200px; }
.content.hidden { display: none; }

.card {
  background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px; margin-bottom: 16px;
}
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.card-title { font-size: 15px; font-weight: 600; }

.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }

table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th { text-align: left; padding: 8px 12px; color: var(--text2); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
tbody tr:hover { background: var(--bg3); }
.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; color: var(--text2); word-break: break-all; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
.badge-ok { background: #065f46; color: #6ee7b7; }
.badge-warn { background: #78350f; color: #fde68a; }
.badge-info { background: #1e3a5f; color: #93c5fd; }
.badge-danger { background: #7f1d1d; color: #fca5a5; }
.badge-ghost { background: var(--bg3); color: var(--text2); }

.empty { text-align: center; padding: 48px 20px; color: var(--text3); }
.empty .icon { font-size: 40px; margin-bottom: 12px; opacity: .4; }
.empty p { font-size: 14px; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex;
  align-items: center; justify-content: center; z-index: 100;
}
.modal-overlay.hidden { display: none; }
.modal {
  background: var(--bg2); border: 1px solid var(--border); border-radius: 12px;
  padding: 24px; width: 90%; max-width: 480px; box-shadow: var(--shadow);
}
.modal h3 { font-size: 16px; margin-bottom: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 12px; font-weight: 500; color: var(--text2); margin-bottom: 4px; }
.form-group .hint { font-size: 11px; color: var(--text3); margin-top: 3px; }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }

.perm-checks { display: flex; gap: 12px; }
.perm-checks label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; }
.perm-checks input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--accent); }

.stats-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card { background: var(--bg3); border-radius: var(--radius); padding: 14px 18px; }
.stat-card .label { font-size: 11px; color: var(--text3); text-transform: uppercase; letter-spacing: .5px; }
.stat-card .value { font-size: 22px; font-weight: 700; margin-top: 2px; }

.provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.provider-card {
  background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px; cursor: pointer; transition: border-color .15s;
}
.provider-card:hover { border-color: var(--accent); }
.provider-card .name { font-weight: 600; margin-bottom: 4px; }
.provider-card .desc { font-size: 12px; color: var(--text3); }
.provider-card .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; }

.section-desc { font-size: 13px; color: var(--text2); margin-bottom: 16px; }

.tag { display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); padding: 2px 8px; border-radius: 4px; font-size: 11px; color: var(--text2); }

.loading { display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--text3); }
.spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin-right: 10px; }
@keyframes spin { to { transform: rotate(360deg); } }

.toast {
  position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; border-radius: var(--radius);
  color: #fff; font-size: 13px; z-index: 200; animation: slideIn .2s ease-out;
  box-shadow: var(--shadow);
}
.toast.hidden { display: none; }
.toast-ok { background: #065f46; }
.toast-err { background: #991b1b; }
.toast-info { background: #1e3a5f; }
@keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.actions-cell { display: flex; gap: 4px; }
.truncate { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 768px) {
  .content { padding: 12px; }
  .topbar, .tabs { padding-left: 12px; padding-right: 12px; }
  table { font-size: 12px; }
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .provider-grid { grid-template-columns: 1fr; }
}
`;

const JS = `
const API = '/plugins/aicq-chat/api';

let currentTab = 'agents';
let agentsData = null, friendsData = null, requestsData = null, sessionsData = null, identityData = null, modelsConfig = null, statusData = null;

// ── Utility ──
async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts });
  return res.json();
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast toast-' + type;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 3000);
}

function showModal(id) { $(id).classList.remove('hidden'); }
function hideModal(id) { $(id).classList.add('hidden'); }

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function timeAgo(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied!', 'ok')).catch(() => toast('Copy failed', 'err'));
}

// ── Tab switching ──
function switchTab(tab) {
  currentTab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.content').forEach(c => c.classList.toggle('hidden', c.id !== 'tab-' + tab));
  if (tab === 'agents') loadAgents();
  else if (tab === 'aicq') loadAICQ();
  else if (tab === 'models') loadModels();
}

// ── Status ──
async function loadStatus() {
  try {
    statusData = await api('/status');
    const dot = $('#status-dot');
    const txt = $('#status-text');
    if (statusData.connected) {
      dot.className = 'dot dot-ok';
      txt.textContent = 'Connected';
    } else {
      dot.className = 'dot dot-err';
      txt.textContent = 'Disconnected';
    }
  } catch (e) {
    $('#status-dot').className = 'dot dot-err';
    $('#status-text').textContent = 'Error';
  }
}

// ── TAB 1: Agent Management ──
async function loadAgents() {
  setLoading('agents', true);
  try {
    const data = await api('/agents');
    agentsData = data;
    renderAgents(data);
  } catch (e) {
    toast('Failed to load agents: ' + e.message, 'err');
  }
  setLoading('agents', false);
}

function renderAgents(data) {
  const el = $('#agents-content');
  const agents = data.agents || [];
  const statsHtml = \`
    <div class="stats-row">
      <div class="stat-card"><div class="label">Total Agents</div><div class="value">\${agents.length}</div></div>
      <div class="stat-card"><div class="label">Current Agent</div><div class="value" style="font-size:16px">\${escHtml(data.currentAgentId || '-')}</div></div>
      <div class="stat-card"><div class="label">Fingerprint</div><div class="value mono" style="font-size:11px">\${escHtml(data.fingerprint || '-')}</div></div>
      <div class="stat-card"><div class="label">Server</div><div class="value" style="font-size:13px">\${data.connected ? '🟢' : '🔴'} Online</div></div>
    </div>\`;

  if (agents.length === 0) {
    el.innerHTML = statsHtml + '<div class="empty"><div class="icon">🤖</div><p>No agents configured</p></div>';
    return;
  }

  let rows = '';
  agents.forEach(a => {
    const isCurrent = a.id === data.currentAgentId;
    rows += \`<tr>
      <td><span class="mono">\${escHtml(a.id)}</span> \${isCurrent ? '<span class="badge badge-ok">current</span>' : ''}</td>
      <td>\${escHtml(a.name || a.aiName || '-')}</td>
      <td><span class="tag">\${escHtml(a.friendType || '-')}</span></td>
      <td>\${a.sessionCount != null ? '<span class="badge badge-info">' + a.sessionCount + ' sessions</span>' : '-'}</td>
      <td class="mono truncate">\${escHtml(a.publicKeyFingerprint || '-')}</td>
      <td>\${timeAgo(a.lastMessageAt)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-ghost" onclick="copyText('\${escHtml(a.id)}')" title="Copy ID">📋</button>
          \${!isCurrent ? '<button class="btn btn-sm btn-danger" onclick="deleteAgent(\\'' + escHtml(a.id) + '\\')">Delete</button>' : ''}
        </div>
      </td>
    </tr>\`;
  });

  el.innerHTML = statsHtml + \`
    <div class="card">
      <div class="card-header">
        <div class="card-title">Agent List</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="loadAgents()">🔄 Refresh</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Sessions</th><th>Fingerprint</th><th>Last Activity</th><th>Actions</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      </div>
    </div>\`;
}

async function deleteAgent(id) {
  if (!confirm('Delete agent ' + id + '? This cannot be undone.')) return;
  try {
    const r = await api('/agents/' + encodeURIComponent(id), { method: 'DELETE' });
    if (r.success) { toast('Agent deleted', 'ok'); loadAgents(); }
    else { toast(r.message || 'Delete failed', 'err'); }
  } catch (e) { toast('Error: ' + e.message, 'err'); }
}

// ── TAB 2: AICQ Management ──
let aicqSubTab = 'friends';

async function loadAICQ() {
  setLoading('aicq', true);
  try {
    const [friends, requests, sessions, identity] = await Promise.all([
      api('/friends'),
      api('/friends/requests'),
      api('/sessions'),
      api('/identity')
    ]);
    friendsData = friends;
    requestsData = requests;
    sessionsData = sessions;
    identityData = identity;
    renderAICQSubTabs();
    switchAICQSubTab(aicqSubTab);
  } catch (e) {
    toast('Failed to load AICQ data: ' + e.message, 'err');
  }
  setLoading('aicq', false);
}

function renderAICQSubTabs() {
  const friendCount = (friendsData?.friends || []).length;
  const reqCount = (requestsData?.requests || []).length;
  const sessCount = (sessionsData?.sessions || []).length;
  $('#aicq-subtabs').innerHTML = \`
    <button class="tab-btn \${aicqSubTab==='friends'?'active':''}" onclick="switchAICQSubTab('friends')">Friends (\${friendCount})</button>
    <button class="tab-btn \${aicqSubTab==='requests'?'active':''}" onclick="switchAICQSubTab('requests')">Requests (\${reqCount})</button>
    <button class="tab-btn \${aicqSubTab==='sessions'?'active':''}" onclick="switchAICQSubTab('sessions')">Sessions (\${sessCount})</button>
  \`;
}

function switchAICQSubTab(tab) {
  aicqSubTab = tab;
  renderAICQSubTabs();
  $$('#aicq-content > div').forEach(d => d.classList.add('hidden'));
  if (tab === 'friends') renderFriends();
  else if (tab === 'requests') renderRequests();
  else if (tab === 'sessions') renderSessions();
}

function renderFriends() {
  const el = $('#aicq-friends');
  el.classList.remove('hidden');
  const friends = friendsData?.friends || [];

  if (friends.length === 0) {
    el.innerHTML = '<div class="empty"><div class="icon">👥</div><p>No friends yet</p><p style="font-size:12px;margin-top:8px">Add a friend using their temp number or ID</p></div>';
    return;
  }

  let rows = '';
  friends.forEach(f => {
    const perms = (f.permissions || []).map(p => '<span class="badge badge-' + (p === 'exec' ? 'warn' : 'ok') + '">' + p + '</span>').join(' ');
    rows += \`<tr>
      <td class="mono">\${escHtml(f.id)}</td>
      <td>\${escHtml(f.aiName || '-')}</td>
      <td><span class="badge badge-\${f.friendType === 'ai' ? 'info' : 'ghost'}">\${escHtml(f.friendType || '?')}</span></td>
      <td>\${perms || '<span class="badge badge-ghost">none</span>'}</td>
      <td class="mono" style="font-size:11px">\${escHtml(f.publicKeyFingerprint || '-')}</td>
      <td>\${timeAgo(f.lastMessageAt)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-ghost" onclick="editPermissions('\${escHtml(f.id)}', \${JSON.stringify(f.permissions || [])})">⚙️</button>
          <button class="btn btn-sm btn-danger" onclick="removeFriend('\${escHtml(f.id)}')">🗑️</button>
          <button class="btn btn-sm btn-ghost" onclick="copyText('\${escHtml(f.id)}')" title="Copy ID">📋</button>
        </div>
      </td>
    </tr>\`;
  });

  el.innerHTML = \`
    <div class="card">
      <div class="card-header">
        <div class="card-title">Friends (\${friends.length})</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-primary" onclick="showAddFriend()">➕ Add Friend</button>
          <button class="btn btn-sm" onclick="loadAICQ()">🔄 Refresh</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Node ID</th><th>Name</th><th>Type</th><th>Permissions</th><th>Fingerprint</th><th>Last Message</th><th>Actions</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      </div>
    </div>\`;
}

function renderRequests() {
  const el = $('#aicq-requests');
  el.classList.remove('hidden');
  const reqs = requestsData?.requests || [];

  if (reqs.length === 0) {
    el.innerHTML = '<div class="empty"><div class="icon">📨</div><p>No pending friend requests</p></div>';
    return;
  }

  let rows = '';
  reqs.forEach(r => {
    const statusBadge = r.status === 'pending' ? '<span class="badge badge-warn">pending</span>' :
                        r.status === 'accepted' ? '<span class="badge badge-ok">accepted</span>' :
                        '<span class="badge badge-ghost">' + escHtml(r.status) + '</span>';
    rows += \`<tr>
      <td class="mono">\${escHtml(r.id)}</td>
      <td class="mono">\${escHtml(r.fromId || r.requesterId || '-')}</td>
      <td>\${statusBadge}</td>
      <td>\${timeAgo(r.createdAt)}</td>
      <td>\${escHtml(r.message || '-')}</td>
      <td>
        <div class="actions-cell">
          \${r.status === 'pending' ? \`
            <button class="btn btn-sm btn-ok" onclick="acceptRequest('\${escHtml(r.id)}')">✓ Accept</button>
            <button class="btn btn-sm btn-danger" onclick="rejectRequest('\${escHtml(r.id)}')">✗ Reject</button>
          \` : '-'}
        </div>
      </td>
    </tr>\`;
  });

  el.innerHTML = \`
    <div class="card">
      <div class="card-header">
        <div class="card-title">Friend Requests (\${reqs.length})</div>
        <button class="btn btn-sm" onclick="loadAICQ()">🔄 Refresh</button>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Request ID</th><th>From</th><th>Status</th><th>Time</th><th>Message</th><th>Actions</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      </div>
    </div>\`;
}

function renderSessions() {
  const el = $('#aicq-sessions');
  el.classList.remove('hidden');
  const sessions = sessionsData?.sessions || [];

  if (sessions.length === 0) {
    el.innerHTML = '<div class="empty"><div class="icon">🔗</div><p>No active encrypted sessions</p></div>';
    return;
  }

  let rows = '';
  sessions.forEach(s => {
    rows += \`<tr>
      <td class="mono">\${escHtml(s.peerId)}</td>
      <td>\${timeAgo(s.createdAt)}</td>
      <td><span class="badge badge-info">\${s.messageCount} msgs</span></td>
    </tr>\`;
  });

  el.innerHTML = \`
    <div class="card">
      <div class="card-header">
        <div class="card-title">Encrypted Sessions (\${sessions.length})</div>
        <button class="btn btn-sm" onclick="loadAICQ()">🔄 Refresh</button>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Peer ID</th><th>Established</th><th>Messages</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      </div>
    </div>\`;
}

async function showAddFriend() {
  showModal('modal-add-friend');
  $('#add-friend-target').value = '';
  $('#add-friend-target').focus();
}

async function addFriend() {
  const target = $('#add-friend-target').value.trim();
  if (!target) { toast('Enter a temp number or friend ID', 'err'); return; }
  hideModal('modal-add-friend');
  toast('Sending friend request...', 'info');
  try {
    const r = await api('/friends', { method: 'POST', body: JSON.stringify({ target }) });
    if (r.success) { toast(r.message || 'Friend request sent!', 'ok'); loadAICQ(); }
    else { toast(r.message || 'Failed to add friend', 'err'); }
  } catch (e) { toast('Error: ' + e.message, 'err'); }
}

async function removeFriend(id) {
  if (!confirm('Remove friend ' + id + '? This will delete the encrypted session.')) return;
  try {
    const r = await api('/friends/' + encodeURIComponent(id), { method: 'DELETE' });
    if (r.success) { toast('Friend removed', 'ok'); loadAICQ(); }
    else { toast(r.message || 'Failed to remove', 'err'); }
  } catch (e) { toast('Error: ' + e.message, 'err'); }
}

let editingFriendId = null;
function editPermissions(id, perms) {
  editingFriendId = id;
  const chatChecked = perms.includes('chat') ? 'checked' : '';
  const execChecked = perms.includes('exec') ? 'checked' : '';
  $('#perm-chat').checked = chatChecked;
  $('#perm-exec').checked = execChecked;
  showModal('modal-permissions');
}

async function savePermissions() {
  const perms = [];
  if ($('#perm-chat').checked) perms.push('chat');
  if ($('#perm-exec').checked) perms.push('exec');
  try {
    const r = await api('/friends/' + encodeURIComponent(editingFriendId) + '/permissions', {
      method: 'PUT', body: JSON.stringify({ permissions: perms })
    });
    if (r.success) { toast('Permissions updated', 'ok'); hideModal('modal-permissions'); loadAICQ(); }
    else { toast(r.message || 'Failed to update', 'err'); }
  } catch (e) { toast('Error: ' + e.message, 'err'); }
}

async function acceptRequest(id) {
  try {
    const r = await api('/friends/requests/' + encodeURIComponent(id) + '/accept', { method: 'POST', body: JSON.stringify({ permissions: ['chat'] }) });
    if (r.success) { toast('Request accepted', 'ok'); loadAICQ(); }
    else { toast(r.message || 'Failed', 'err'); }
  } catch (e) { toast('Error: ' + e.message, 'err'); }
}

async function rejectRequest(id) {
  try {
    const r = await api('/friends/requests/' + encodeURIComponent(id) + '/reject', { method: 'POST', body: JSON.stringify({}) });
    if (r.success) { toast('Request rejected', 'ok'); loadAICQ(); }
    else { toast(r.message || 'Failed', 'err'); }
  } catch (e) { toast('Error: ' + e.message, 'err'); }
}

// ── TAB 3: Model Management ──
async function loadModels() {
  setLoading('models', true);
  try {
    modelsConfig = await api('/models');
    renderModels(modelsConfig);
  } catch (e) {
    toast('Failed to load models: ' + e.message, 'err');
  }
  setLoading('models', false);
}

function renderModels(data) {
  const el = $('#models-content');
  const providers = data.providers || [];
  const configured = providers.filter(p => p.configured);

  let provCards = '';
  providers.forEach(p => {
    const statusColor = p.configured ? 'var(--ok)' : 'var(--text3)';
    const statusText = p.configured ? 'Configured' : 'Not configured';
    provCards += \`
      <div class="provider-card" onclick="showModelConfig('\${escHtml(p.id)}')">
        <div class="name"><span class="status-dot" style="background:\${statusColor}"></span>\${escHtml(p.name)}</div>
        <div class="desc">\${escHtml(p.description || '')}</div>
        <div style="margin-top:8px;font-size:11px;color:var(--text3)">\${statusText}</div>
      </div>\`;
  });

  let currentModelsHtml = '';
  if (data.currentModels && data.currentModels.length > 0) {
    let rows = '';
    data.currentModels.forEach(m => {
      rows += \`<tr>
        <td>\${escHtml(m.provider || '-')}</td>
        <td class="mono">\${escHtml(m.modelId || '-')}</td>
        <td>\${m.hasApiKey ? '<span class="badge badge-ok">●</span>' : '<span class="badge badge-danger">✗</span>'}</td>
        <td class="mono">\${escHtml(m.baseUrl || '-')}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="showModelConfig('\${escHtml(m.providerId || m.provider || '')}')">Edit</button></td>
      </tr>\`;
    });
    currentModelsHtml = \`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Configured Models</div>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Provider</th><th>Model ID</th><th>API Key</th><th>Base URL</th><th>Actions</th></tr></thead>
            <tbody>\${rows}</tbody>
          </table>
        </div>
      </div>\`;
  }

  el.innerHTML = \`
    <p class="section-desc">Quickly configure LLM providers. Click a provider card to set up your API key and model.</p>
    <div class="provider-grid">\${provCards}</div>
    \${currentModelsHtml}
  \`;
}

let editingProviderId = null;
function showModelConfig(providerId) {
  editingProviderId = providerId;
  const provider = (modelsConfig?.providers || []).find(p => p.id === providerId);
  if (!provider) { toast('Provider not found', 'err'); return; }

  $('#model-provider-name').textContent = provider.name;
  $('#model-api-key').value = provider.apiKey || '';
  $('#model-api-key').placeholder = provider.apiKeyHint || 'Enter your API key';
  $('#model-model-id').value = provider.modelId || '';
  $('#model-model-id').placeholder = provider.modelHint || 'e.g. gpt-4o';
  $('#model-base-url').value = provider.baseUrl || '';
  $('#model-base-url').placeholder = provider.baseUrlHint || 'Default: provider endpoint';

  showModal('modal-model-config');
}

async function saveModelConfig() {
  const apiKey = $('#model-api-key').value.trim();
  const modelId = $('#model-model-id').value.trim();
  const baseUrl = $('#model-base-url').value.trim();

  if (!apiKey && !modelId) {
    toast('Please enter at least an API key or model ID', 'err');
    return;
  }

  hideModal('modal-model-config');
  toast('Saving model config...', 'info');

  try {
    const r = await api('/models/' + encodeURIComponent(editingProviderId), {
      method: 'PUT',
      body: JSON.stringify({ apiKey, modelId, baseUrl })
    });
    if (r.success) { toast('Model config saved!', 'ok'); loadModels(); }
    else { toast(r.message || 'Failed to save', 'err'); }
  } catch (e) { toast('Error: ' + e.message, 'err'); }
}

// ── Loading helpers ──
function setLoading(tab, loading) {
  const el = $('#tab-' + tab);
  if (!el) return;
  const existing = el.querySelector('.loading-bar');
  if (loading && !existing) {
    const bar = document.createElement('div');
    bar.className = 'loading-bar';
    bar.innerHTML = '<div class="spinner"></div> Loading...';
    bar.style.cssText = 'padding:12px;text-align:center;color:var(--text3);font-size:13px;display:flex;align-items:center;justify-content:center;gap:8px';
    el.prepend(bar);
  } else if (!loading && existing) {
    existing.remove();
  }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  $$('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  loadStatus();
  switchTab('agents');
  // Auto-refresh status every 30s
  setInterval(loadStatus, 30000);
});
`;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AICQ Management</title>
<style>${CSS}</style>
</head>
<body>
<div class="topbar">
  <h1><span class="logo">AQ</span> AICQ Management</h1>
  <div class="status">
    <span id="status-dot" class="dot dot-err"></span>
    <span id="status-text">Connecting...</span>
  </div>
</div>

<div class="tabs">
  <button class="tab-btn active" data-tab="agents" onclick="switchTab('agents')">🤖 Agent Management</button>
  <button class="tab-btn" data-tab="aicq" onclick="switchTab('aicq')">💬 AICQ Management</button>
  <button class="tab-btn" data-tab="models" onclick="switchTab('models')">🧠 Model Management</button>
</div>

<!-- TAB 1: Agent Management -->
<div class="content" id="tab-agents">
  <p class="section-desc">View and manage AICQ agent identities. Each agent has its own Ed25519 key pair and encrypted session state.</p>
  <div id="agents-content">
    <div class="loading"><div class="spinner"></div> Loading agents...</div>
  </div>
</div>

<!-- TAB 2: AICQ Management -->
<div class="content hidden" id="tab-aicq">
  <p class="section-desc">Manage encrypted friend connections, pending requests, and active sessions on the AICQ network.</p>
  <div class="tabs" id="aicq-subtabs" style="padding:0;margin-bottom:16px;border:none"></div>
  <div id="aicq-content">
    <div id="aicq-friends" class="hidden"></div>
    <div id="aicq-requests" class="hidden"></div>
    <div id="aicq-sessions" class="hidden"></div>
  </div>
</div>

<!-- TAB 3: Model Management -->
<div class="content hidden" id="tab-models">
  <p class="section-desc">Quickly configure LLM providers for your agents. Select a provider and enter your API key to get started.</p>
  <div id="models-content">
    <div class="loading"><div class="spinner"></div> Loading model config...</div>
  </div>
</div>

<!-- Modal: Add Friend -->
<div class="modal-overlay hidden" id="modal-add-friend" onclick="if(event.target===this)hideModal('modal-add-friend')">
  <div class="modal">
    <h3>➕ Add Friend</h3>
    <div class="form-group">
      <label>Temp Number or Friend ID</label>
      <input id="add-friend-target" type="text" placeholder="Enter 6-digit temp number or node ID" onkeydown="if(event.key==='Enter')addFriend()">
      <div class="hint">Enter the 6-digit temporary number shared by your friend, or their node ID directly.</div>
    </div>
    <div class="form-actions">
      <button class="btn" onclick="hideModal('modal-add-friend')">Cancel</button>
      <button class="btn btn-primary" onclick="addFriend()">Send Request</button>
    </div>
  </div>
</div>

<!-- Modal: Edit Permissions -->
<div class="modal-overlay hidden" id="modal-permissions" onclick="if(event.target===this)hideModal('modal-permissions')">
  <div class="modal">
    <h3>⚙️ Edit Permissions</h3>
    <div class="form-group">
      <label>Permissions for this friend</label>
      <div class="perm-checks" style="margin-top:8px">
        <label><input type="checkbox" id="perm-chat" checked> Chat <span style="color:var(--text3);font-size:11px">(send/receive messages)</span></label>
        <label><input type="checkbox" id="perm-exec"> Exec <span style="color:var(--text3);font-size:11px">(execute tools)</span></label>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn" onclick="hideModal('modal-permissions')">Cancel</button>
      <button class="btn btn-primary" onclick="savePermissions()">Save</button>
    </div>
  </div>
</div>

<!-- Modal: Model Config -->
<div class="modal-overlay hidden" id="modal-model-config" onclick="if(event.target===this)hideModal('modal-model-config')">
  <div class="modal" style="max-width:520px">
    <h3>🧠 <span id="model-provider-name">Configure Provider</span></h3>
    <div class="form-group">
      <label>API Key</label>
      <input id="model-api-key" type="password" placeholder="sk-...">
      <div class="hint">Your provider API key. It will be stored securely in the OpenClaw config.</div>
    </div>
    <div class="form-group">
      <label>Model ID</label>
      <input id="model-model-id" type="text" placeholder="gpt-4o">
      <div class="hint">The model identifier to use. Leave default for the provider's recommended model.</div>
    </div>
    <div class="form-group">
      <label>Base URL <span style="color:var(--text3);font-size:11px">(optional)</span></label>
      <input id="model-base-url" type="text" placeholder="https://api.openai.com/v1">
      <div class="hint">Custom API endpoint. Only change this if using a compatible proxy or self-hosted model.</div>
    </div>
    <div class="form-actions">
      <button class="btn" onclick="hideModal('modal-model-config')">Cancel</button>
      <button class="btn btn-primary" onclick="saveModelConfig()">Save Configuration</button>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast hidden" id="toast"></div>

<script>${JS}</script>
</body>
</html>`;

export function getManagementHTML(): string {
  return HTML;
}
