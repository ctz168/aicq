/**
 * AICQ Management UI — Professional SPA with sidebar navigation.
 *
 * Features: Dashboard, Agent Management (from config), Friend Management,
 * Model Configuration, System Settings.
 */

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #f5f7fa; --bg2: #ffffff; --bg3: #f0f2f5; --bg4: #e4e7ec;
  --bg5: #d1d5db; --text: #1f2937; --text2: #6b7280; --text3: #9ca3af;
  --accent: #4f46e5; --accent2: #6366f1; --accent-bg: rgba(79,70,229,.08);
  --ok: #10b981; --ok-bg: rgba(16,185,129,.08); --warn: #f59e0b; --warn-bg: rgba(245,158,11,.08);
  --danger: #ef4444; --danger-bg: rgba(239,68,68,.08); --info: #3b82f6; --info-bg: rgba(59,130,246,.08);
  --border: #e5e7eb; --radius: 8px; --radius-lg: 12px; --shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --sidebar-w: 240px; --header-h: 56px;
  --transition: .2s cubic-bezier(.4,0,.2,1);
}
html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.6; overflow: hidden; }
a { color: var(--accent); text-decoration: none; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bg5); }

/* Layout */
.app { display: flex; height: 100vh; width: 100vw; overflow: hidden; }

/* Sidebar */
.sidebar {
  width: var(--sidebar-w); min-width: var(--sidebar-w); height: 100vh;
  background: #ffffff; border-right: 1px solid var(--border);
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
  width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), #7c3aed);
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
  background: #ffffff; border-bottom: 1px solid var(--border);
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
.btn-danger { background: var(--danger-bg); color: #dc2626; border: 1px solid rgba(239,68,68,.15); }
.btn-danger:hover:not(:disabled) { background: rgba(239,68,68,.15); }
.btn-ok { background: var(--ok-bg); color: #059669; border: 1px solid rgba(16,185,129,.15); }
.btn-ok:hover:not(:disabled) { background: rgba(16,185,129,.15); }
.btn-warn { background: var(--warn-bg); color: #d97706; border: 1px solid rgba(245,158,11,.15); }
.btn-warn:hover:not(:disabled) { background: rgba(245,158,11,.15); }
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
  position: fixed; inset: 0; background: rgba(0,0,0,.3); display: flex;
  align-items: center; justify-content: center; z-index: 100;
  animation: fadeIn .15s ease-out;
}
.modal-overlay.hidden { display: none; }
.modal {
  background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 28px; width: 90%; max-width: 520px; box-shadow: 0 10px 25px rgba(0,0,0,.1), 0 6px 10px rgba(0,0,0,.06);
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
  padding: 12px 20px; border-radius: var(--radius); color: var(--text); font-size: 13px;
  animation: slideIn .2s ease-out; box-shadow: 0 4px 12px rgba(0,0,0,.08); display: flex; align-items: center; gap: 8px;
  max-width: 400px;
}
.toast.hidden { display: none; }
.toast-ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
.toast-err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.toast-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a5f; }
.toast-warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
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

/* Toggle switch */
.toggle-label { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px; color: var(--text); user-select: none; text-transform: none !important; letter-spacing: normal !important; font-weight: 400 !important; }
.toggle-label input[type=checkbox] { display: none; }
.toggle-slider {
  width: 40px; height: 22px; background: var(--bg4); border-radius: 11px;
  position: relative; transition: background var(--transition); flex-shrink: 0;
}
.toggle-slider::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
  background: var(--text3); border-radius: 50%; transition: all var(--transition);
}
.toggle-label input:checked + .toggle-slider { background: var(--accent); }
.toggle-label input:checked + .toggle-slider::after { left: 21px; background: #fff; }

/* Offline banner */
.offline-banner {
  background: #fef2f2;
  color: #991b1b;
  border-bottom: 1px solid #fecaca;
  padding: 10px 24px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  animation: fadeIn .2s ease-out;
}
.offline-banner .offline-icon {
  font-size: 16px;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

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
// ── i18n ──
const _lang = 'zh'; // Default Chinese; set to 'en' to switch to English
const _T = {
  // Sidebar
  nav_overview: { zh: '概览', en: 'Overview' },
  nav_management: { zh: '管理', en: 'Management' },
  nav_system: { zh: '系统', en: 'System' },
  nav_dashboard: { zh: '仪表盘', en: 'Dashboard' },
  nav_agents: { zh: '智能体', en: 'Agents' },
  nav_friends: { zh: '好友', en: 'Friends' },
  nav_models: { zh: '模型', en: 'Models' },
  nav_settings: { zh: '设置', en: 'Settings' },
  collapse_sidebar: { zh: '收起侧栏', en: 'Collapse sidebar' },
  management_console: { zh: '管理控制台', en: 'Management Console' },
  // Header
  connecting: { zh: '连接中...', en: 'Connecting...' },
  connected: { zh: '已连接', en: 'Connected' },
  disconnected: { zh: '已断开', en: 'Disconnected' },
  refresh: { zh: '刷新', en: 'Refresh' },
  // Dashboard
  loading_dashboard: { zh: '正在加载仪表盘...', en: 'Loading dashboard...' },
  failed_connect: { zh: '无法连接到 AICQ 插件', en: 'Failed to connect to AICQ plugin' },
  server_status: { zh: '服务器状态', en: 'Server Status' },
  total_friends: { zh: '好友总数', en: 'Total Friends' },
  active_sessions: { zh: '活跃会话', en: 'Active Sessions' },
  encrypted_sessions: { zh: '加密会话', en: 'Encrypted sessions' },
  agent_id: { zh: '智能体 ID', en: 'Agent ID' },
  fingerprint: { zh: '指纹', en: 'Fingerprint' },
  recent_friends: { zh: '最近好友', en: 'Recent Friends' },
  view_all: { zh: '查看全部 →', en: 'View All →' },
  identity_info: { zh: '身份信息', en: 'Identity Info' },
  server_url: { zh: '服务器地址', en: 'Server URL' },
  connection: { zh: '连接', en: 'Connection' },
  online: { zh: '在线', en: 'Online' },
  offline: { zh: '离线', en: 'Offline' },
  plugin_version: { zh: '插件版本', en: 'Plugin Version' },
  mgmt_ui_access: { zh: '管理界面访问', en: 'Management UI Access' },
  current_url: { zh: '当前地址', en: 'Current URL' },
  local_access: { zh: '本地访问', en: 'Local Access' },
  open: { zh: '打开', en: 'Open' },
  gateway_path: { zh: '网关路径', en: 'Gateway Path' },
  no_friends_yet: { zh: '暂无好友', en: 'No friends yet' },
  // Agents
  loading_agents: { zh: '正在加载智能体...', en: 'Loading agents...' },
  active: { zh: '启用', en: 'active' },
  disabled: { zh: '禁用', en: 'disabled' },
  default_model: { zh: '默认', en: 'default' },
  no_agents_configured: { zh: '未配置智能体', en: 'No agents configured' },
  add_agents_hint: { zh: '请在 openclaw.json 或 stableclaw.json 配置文件中添加智能体', en: 'Add agents to your openclaw.json or stableclaw.json config file' },
  search_agents: { zh: '搜索智能体...', en: 'Search agents...' },
  add_agent: { zh: '添加智能体', en: 'Add Agent' },
  agent_list_from: { zh: '智能体列表来自', en: 'Agent list from' },
  total_label: { zh: '总计', en: 'Total' },
  agents_configured: { zh: '个智能体已配置', en: 'agents configured' },
  status: { zh: '状态', en: 'Status' },
  agent: { zh: '智能体', en: 'Agent' },
  model: { zh: '模型', en: 'Model' },
  provider: { zh: '提供商', en: 'Provider' },
  system_prompt: { zh: '系统提示词', en: 'System Prompt' },
  actions: { zh: '操作', en: 'Actions' },
  confirm_delete_agent: { zh: '确定要删除这个智能体吗？', en: 'Are you sure you want to delete this agent?' },
  agent_deleted: { zh: '智能体已删除', en: 'Agent deleted' },
  delete_failed: { zh: '删除失败', en: 'Delete failed' },
  default_model_badge: { zh: '默认', en: 'Default' },
  provider_model: { zh: '来自模型提供商', en: 'From model provider' },
  default_model_label: { zh: '默认模型', en: 'Default Model' },
  set_as_default: { zh: '设为默认', en: 'Set as default' },
  models_under_provider: { zh: '个模型', en: 'models' },
  model_id_label: { zh: '模型ID', en: 'Model ID' },
  model_name_label: { zh: '模型名称', en: 'Model Name' },
  add_new_agent: { zh: '➕ 添加新智能体', en: '➕ Add New Agent' },
  edit_agent: { zh: '✏️ 编辑智能体', en: '✏️ Edit Agent' },
  agent_name_required: { zh: '请输入智能体名称', en: 'Agent name is required' },
  agent_updated: { zh: '智能体已更新', en: 'Agent updated' },
  agent_added: { zh: '智能体已添加', en: 'Agent added' },
  no_data: { zh: '暂无数据', en: 'No data' },
  // Friends
  loading_friends: { zh: '正在加载好友...', en: 'Loading friends...' },
  friends: { zh: '好友', en: 'Friends' },
  requests: { zh: '请求', en: 'Requests' },
  sessions: { zh: '会话', en: 'Sessions' },
  search_friends: { zh: '搜索好友...', en: 'Search friends...' },
  all: { zh: '全部', en: 'All' },
  ai: { zh: 'AI', en: 'AI' },
  human: { zh: '人类', en: 'Human' },
  add_friend: { zh: '添加好友', en: 'Add Friend' },
  type: { zh: '类型', en: 'Type' },
  friend_label: { zh: '好友', en: 'Friend' },
  permissions: { zh: '权限', en: 'Permissions' },
  last_message: { zh: '最后消息', en: 'Last Message' },
  add_friend_hint: { zh: '使用6位临时号码或节点ID添加好友', en: 'Add a friend using their 6-digit temp number or node ID' },
  unavailable_offline: { zh: '离线时不可用', en: 'Unavailable while offline' },
  request_id: { zh: '请求 ID', en: 'Request ID' },
  from: { zh: '来自', en: 'From' },
  time: { zh: '时间', en: 'Time' },
  no_pending_requests: { zh: '暂无待处理请求', en: 'No pending requests' },
  accept: { zh: '接受', en: 'Accept' },
  reject: { zh: '拒绝', en: 'Reject' },
  peer_id: { zh: '对端 ID', en: 'Peer ID' },
  established: { zh: '建立时间', en: 'Established' },
  messages: { zh: '条消息', en: 'messages' },
  no_active_sessions: { zh: '暂无活跃会话', en: 'No active sessions' },
  enter_temp_or_id: { zh: '请输入临时号码或节点ID', en: 'Enter a temp number or node ID' },
  sending_request: { zh: '正在发送好友请求...', en: 'Sending friend request...' },
  friend_request_sent: { zh: '好友请求已发送！', en: 'Friend request sent!' },
  failed_add_friend: { zh: '添加好友失败', en: 'Failed to add friend' },
  remove_friend_confirm: { zh: '确定移除好友 ', en: 'Remove friend ' },
  friend_removed: { zh: '好友已移除', en: 'Friend removed' },
  edit_permissions: { zh: '编辑权限', en: 'Edit Permissions' },
  friend_permissions: { zh: '好友权限', en: 'Friend Permissions' },
  chat_perm: { zh: '💬 聊天', en: '💬 Chat' },
  exec_perm: { zh: '🔧 执行', en: '🔧 Exec' },
  chat_perm_hint: { zh: '（发送/接收消息）', en: '(send/receive messages)' },
  exec_perm_hint: { zh: '（执行工具/命令）', en: '(execute tools/commands)' },
  save_permissions: { zh: '保存权限', en: 'Save Permissions' },
  permissions_updated: { zh: '权限已更新', en: 'Permissions updated' },
  request_accepted: { zh: '请求已接受', en: 'Request accepted' },
  request_rejected: { zh: '请求已拒绝', en: 'Request rejected' },
  // Models
  loading_models: { zh: '正在加载模型配置...', en: 'Loading model configuration...' },
  configured: { zh: '已配置', en: 'Configured' },
  providers_with_keys: { zh: '已配置API密钥的提供商', en: 'Providers with API keys' },
  configure: { zh: '配置', en: 'Configure' },
  not_set: { zh: '未设置', en: 'Not set' },
  key_set: { zh: '● 已设置密钥', en: '● Key set' },
  active_model_configs: { zh: '当前模型配置', en: 'Active Model Configurations' },
  default_model_global: { zh: '全局默认模型', en: 'Global Default Model' },
  model_count: { zh: '模型数量', en: 'Model Count' },
  multi_model: { zh: '多模型', en: 'Multi-model' },
  base_url: { zh: '基础地址', en: 'Base URL' },
  configure_providers_desc: { zh: '为智能体配置LLM提供商。点击提供商卡片设置或更新API密钥、模型和基础地址。更改将直接保存到配置文件。', en: 'Configure LLM providers for your agents. Click a provider card to set or update the API key, model, and base URL. Changes are saved directly to your config file.' },
  current_key: { zh: '当前：', en: 'Current: ' },
  no_api_key: { zh: '未配置API密钥', en: 'No API key configured' },
  provider_not_found: { zh: '未找到提供商', en: 'Provider not found' },
  enter_api_key: { zh: '输入API密钥', en: 'Enter API key' },
  enter_model_id: { zh: '输入模型ID', en: 'Model ID' },
  default_url: { zh: '默认地址', en: 'Default URL' },
  enter_api_key_or_model: { zh: '请至少输入API密钥或模型ID', en: 'Enter at least an API key or model ID' },
  saving_config: { zh: '正在保存配置...', en: 'Saving configuration...' },
  config_saved: { zh: '配置已保存！', en: 'Configuration saved!' },
  failed_save: { zh: '保存失败', en: 'Failed to save' },
  confirm_delete_provider: { zh: '确定删除提供商 "', en: 'Delete configuration for provider "' },
  provider_deleted: { zh: '提供商配置已删除', en: 'Provider configuration deleted' },
  // Settings
  loading_settings: { zh: '正在加载设置...', en: 'Loading settings...' },
  tab_connection: { zh: '🔌 连接', en: '🔌 Connection' },
  tab_friends: { zh: '👥 好友', en: '👥 Friends' },
  tab_security: { zh: '🔒 安全', en: '🔒 Security' },
  tab_advanced: { zh: '⚙️ 高级', en: '⚙️ Advanced' },
  tab_json: { zh: '📝 JSON编辑', en: '📝 JSON Editor' },
  conn_desc: { zh: '配置服务器连接和WebSocket设置。更改需要重启插件才能完全生效。', en: 'Configure server connection and WebSocket settings. Changes require a plugin restart to take full effect.' },
  server_connection: { zh: '🌐 服务器连接', en: '🌐 Server Connection' },
  server_url_label: { zh: '服务器地址', en: 'Server URL' },
  server_url_hint: { zh: 'AICQ中继服务器的HTTPS地址。WebSocket路径 /ws 会自动追加。', en: 'The HTTPS URL of the AICQ relay server. WebSocket path /ws is auto-appended.' },
  conn_timeout: { zh: '连接超时（秒）', en: 'Connection Timeout (seconds)' },
  conn_timeout_hint: { zh: 'HTTP请求超时时间（5-120秒）。默认：30秒。', en: 'HTTP request timeout (5–120s). Default: 30s.' },
  ws_auto_reconnect: { zh: 'WebSocket自动重连', en: 'WS Auto-Reconnect' },
  auto_reconnect_label: { zh: '断开时自动重连', en: 'Auto-reconnect when disconnected' },
  auto_reconnect_hint: { zh: '断开连接后自动重新连接WebSocket。', en: 'Automatically reconnect WebSocket on disconnection.' },
  ws_reconnect_interval: { zh: '重连间隔（秒）', en: 'WS Reconnect Interval (seconds)' },
  ws_reconnect_hint: { zh: '重连尝试之间的间隔（5-600秒）。默认：60秒。', en: 'Interval between reconnection attempts (5–600s). Default: 60s.' },
  test: { zh: '测试', en: 'Test' },
  testing: { zh: '测试中...', en: 'Testing...' },
  enter_server_url: { zh: '请先输入服务器地址', en: 'Enter a server URL first' },
  conn_ok: { zh: '连接成功', en: 'Connected successfully' },
  conn_ok_latency: { zh: '连接成功！延迟：', en: 'Connection OK! Latency: ' },
  conn_failed: { zh: '连接失败', en: 'Connection failed' },
  config_file: { zh: '📁 配置文件', en: '📁 Config File' },
  source: { zh: '来源', en: 'Source' },
  mgmt_ui: { zh: '管理界面', en: 'Management UI' },
  uptime: { zh: '运行时间', en: 'Uptime' },
  not_found: { zh: '未找到', en: 'Not found' },
  friends_tab_desc: { zh: '配置好友管理、权限和临时号码设置。', en: 'Configure friend management, permissions, and temporary number settings.' },
  of_max: { zh: ' / 最大 ', en: ' of ' },
  max_friends: { zh: '最大好友数', en: 'Max Friends' },
  auto_accept: { zh: '自动接受好友', en: 'Auto-Accept Friends' },
  auto_accept_label: { zh: '自动接受请求', en: 'Automatically accept requests' },
  auto_accept_hint: { zh: '启用后，传入的好友请求将自动接受。', en: 'When enabled, incoming friend requests are accepted without review.' },
  default_perms: { zh: '新好友默认权限', en: 'Default Permissions for New Friends' },
  default_perms_hint: { zh: '自动接受新好友请求时应用的默认权限。', en: 'Default permissions applied when auto-accepting new friend requests.' },
  temp_numbers: { zh: '🔢 临时号码', en: '🔢 Temporary Numbers' },
  temp_expiry: { zh: '临时号码有效期（秒）', en: 'Temp Number Expiry (seconds)' },
  temp_expiry_hint: { zh: '临时好友号码的有效时间（60-3600秒）。默认：5分钟。', en: 'How long a temporary friend number remains valid (60–3600s). Default: 5 minutes.' },
  sec_desc: { zh: '配置加密、P2P和身份安全设置。', en: 'Configure encryption, P2P, and identity security settings.' },
  agent_identity: { zh: '🤖 智能体身份', en: '🤖 Agent Identity' },
  public_key_fp: { zh: '公钥指纹', en: 'Public Key Fingerprint' },
  reset_identity: { zh: '🗑️ 重置身份', en: '🗑️ Reset Identity' },
  reset_identity_warn: { zh: '⚠️ 这将永久删除所有好友、会话和密钥', en: '⚠️ This deletes all friends, sessions, and keys permanently' },
  p2p_encryption: { zh: '🔒 P2P与加密', en: '🔒 P2P & Encryption' },
  enable_p2p: { zh: '启用P2P连接', en: 'Enable P2P Connections' },
  allow_p2p: { zh: '允许直接P2P消息', en: 'Allow direct P2P messaging' },
  enable_p2p_hint: { zh: '双方都在线时启用点对点加密连接。', en: 'Enable peer-to-peer encrypted connections when both parties are online.' },
  hs_timeout: { zh: '握手超时（秒）', en: 'Handshake Timeout (seconds)' },
  hs_timeout_hint: { zh: 'Noise-XK握手超时时间（10-300秒）。默认：60秒。', en: 'Noise-XK handshake timeout (10–300s). Default: 60s.' },
  adv_desc: { zh: '文件传输、日志和配置管理的高级设置。', en: 'Advanced settings for file transfer, logging, and configuration management.' },
  file_transfer: { zh: '📎 文件传输', en: '📎 File Transfer' },
  enable_ft: { zh: '启用文件传输', en: 'Enable File Transfer' },
  allow_ft: { zh: '允许文件传输', en: 'Allow file transfers' },
  enable_ft_hint: { zh: '启用好友间的加密文件传输。', en: 'Enable encrypted file transfer between friends.' },
  max_file_size: { zh: '最大文件大小', en: 'Max File Size' },
  max_file_size_hint: { zh: '加密传输的最大文件大小。当前：', en: 'Maximum file size for encrypted transfers. Current: ' },
  logging: { zh: '📋 日志', en: '📋 Logging' },
  log_level: { zh: '日志级别', en: 'Log Level' },
  log_debug: { zh: '🐛 调试 — 详细输出', en: '🐛 Debug — Verbose output for troubleshooting' },
  log_info: { zh: 'ℹ️ 信息 — 一般信息（默认）', en: 'ℹ️ Info — General information (default)' },
  log_warn: { zh: '⚠️ 警告 — 警告和重要事件', en: '⚠️ Warn — Warnings and important events' },
  log_error: { zh: '❌ 错误 — 仅错误', en: '❌ Error — Errors only' },
  log_none: { zh: '🔇 无 — 禁用所有日志', en: '🔇 None — Disable all logging' },
  log_level_hint: { zh: '控制插件日志输出的详细程度。', en: 'Controls the verbosity of plugin log output.' },
  import_export: { zh: '📦 导入/导出设置', en: '📦 Import / Export Settings' },
  export_settings: { zh: '📥 导出设置', en: '📥 Export Settings' },
  import_settings: { zh: '📤 导入设置', en: '📤 Import Settings' },
  import_export_hint: { zh: '将当前AICQ插件设置导出为JSON。导入可从备份恢复设置。', en: 'Export current AICQ plugin settings as JSON. Import to restore settings from a backup.' },
  save: { zh: '💾 保存', en: '💾 Save' },
  saving: { zh: '保存中...', en: 'Saving...' },
  saved: { zh: '✓ 已保存', en: '✓ Saved' },
  settings_saved: { zh: '设置已保存：', en: 'Settings saved: ' },
  all_saved: { zh: '所有设置已保存！', en: 'All settings saved!' },
  delete_everything: { zh: '🗑️ 删除所有数据', en: '🗑️ Delete Everything' },
  confirm_delete: { zh: '🗑️ 确认删除', en: '🗑️ Confirm Delete' },
  resetting: { zh: '重置中...', en: 'Resetting...' },
  reset_success: { zh: '身份重置成功，请重启插件。', en: 'Identity reset successfully. Please restart the plugin.' },
  reset_failed: { zh: '重置失败', en: 'Reset failed' },
  exported_success: { zh: '设置导出成功', en: 'Settings exported successfully' },
  paste_json: { zh: '请先粘贴JSON设置', en: 'Paste JSON settings first' },
  importing: { zh: '导入中...', en: 'Importing...' },
  imported_success: { zh: '设置导入成功！', en: 'Settings imported successfully!' },
  import_failed: { zh: '导入失败', en: 'Import failed' },
  loading_config: { zh: '正在加载配置...', en: 'Loading config...' },
  json_editor_desc: { zh: '直接编辑原始JSON配置。注意语法——无效的JSON将被拒绝。', en: 'Edit the raw JSON configuration directly. Be careful with syntax — invalid JSON will be rejected.' },
  json_editor: { zh: '📝 JSON配置编辑器', en: '📝 Config JSON Editor' },
  raw_json: { zh: '原始JSON配置', en: 'Raw JSON Configuration' },
  raw_json_hint: { zh: '直接编辑配置JSON。使用格式化按钮美化。', en: 'Directly edit the configuration JSON. Use the Format button to prettify.' },
  format: { zh: '📐 格式化', en: '📐 Format' },
  copy: { zh: '📋 复制', en: '📋 Copy' },
  revert: { zh: '↩️ 还原', en: '↩️ Revert' },
  save_config: { zh: '💾 保存配置', en: '💾 Save Config' },
  json_formatted: { zh: 'JSON已格式化', en: 'JSON formatted' },
  valid_json: { zh: '✓ 有效JSON', en: '✓ Valid JSON' },
  invalid_json: { zh: '✗ 无效JSON：', en: '✗ Invalid JSON: ' },
  no_content: { zh: '没有可保存的内容', en: 'No content to save' },
  config_saved: { zh: '配置已保存！', en: 'Config saved successfully!' },
  testing_conn_to: { zh: '正在测试到 ', en: 'Testing connection to ' },
  config_file_label: { zh: '📄 配置文件', en: '📄 Config File' },
  // Modals
  add_friend_title: { zh: '➕ 添加好友', en: '➕ Add Friend' },
  temp_or_node: { zh: '临时号码或节点ID', en: 'Temp Number or Node ID' },
  temp_or_node_ph: { zh: '6位号码或节点ID', en: '6-digit number or node ID' },
  temp_or_node_hint: { zh: '输入好友的6位临时号码或完整节点ID。', en: 'Enter the 6-digit temporary number or the full node ID of your friend.' },
  cancel: { zh: '取消', en: 'Cancel' },
  send_request: { zh: '发送请求', en: 'Send Request' },
  close: { zh: '关闭', en: 'Close' },
  save_agent: { zh: '💾 保存智能体', en: '💾 Save Agent' },
  save_configuration: { zh: '💾 保存配置', en: '💾 Save Configuration' },
  reset_identity_title: { zh: '🗑️ 重置智能体身份', en: '🗑️ Reset Agent Identity' },
  reset_warning_title: { zh: '⚠️ 警告：这是一个破坏性操作！', en: '⚠️ WARNING: This is a destructive operation!' },
  reset_warning_desc: { zh: '这将永久删除：', en: 'This will permanently delete:' },
  reset_keypair: { zh: '• 你的Ed25519密钥对和智能体ID', en: '• Your Ed25519 key pair and agent ID' },
  reset_friends: { zh: '• 所有好友连接和会话', en: '• All friend connections and sessions' },
  reset_requests: { zh: '• 所有待处理的好友请求', en: '• All pending friend requests' },
  reset_temp: { zh: '• 所有临时号码', en: '• All temporary numbers' },
  reset_restart_hint: { zh: '重置后，必须重启插件以生成新身份。', en: 'After reset, you must restart the plugin to generate a new identity.' },
  type_reset: { zh: '输入 RESET 以确认', en: 'Type RESET to confirm' },
  import_title: { zh: '📤 导入设置', en: '📤 Import Settings' },
  paste_json_label: { zh: '粘贴JSON设置', en: 'Paste JSON Settings' },
  paste_json_ph: { zh: '{"serverUrl": "https://...", ...}', en: '{"serverUrl": "https://...", ...}' },
  paste_json_hint: { zh: '粘贴从另一个AICQ实例导出的JSON设置。设置将与现有值合并。', en: 'Paste the JSON settings exported from another AICQ instance. Settings will be merged with existing values.' },
  agent_name: { zh: '智能体名称 *', en: 'Agent Name *' },
  agent_id_label: { zh: '智能体ID', en: 'Agent ID' },
  agent_id_hint: { zh: '唯一标识符。留空自动生成。', en: 'Unique identifier. Leave empty for auto-generation.' },
  model_label: { zh: '模型', en: 'Model' },
  provider_label: { zh: '提供商', en: 'Provider' },
  system_prompt_label: { zh: '系统提示词', en: 'System Prompt' },
  temperature: { zh: '温度', en: 'Temperature' },
  max_tokens: { zh: '最大Token数', en: 'Max Tokens' },
  top_p: { zh: 'Top P', en: 'Top P' },
  tools: { zh: '工具', en: 'Tools' },
  enabled: { zh: '启用', en: 'Enabled' },
  // Utilities
  copied_clipboard: { zh: '已复制到剪贴板', en: 'Copied to clipboard' },
  copy_failed: { zh: '复制失败', en: 'Copy failed' },
  just_now: { zh: '刚刚', en: 'just now' },
  min_ago: { zh: '分钟前', en: ' min ago' },
  h_ago: { zh: '小时前', en: 'h ago' },
  d_ago: { zh: '天前', en: 'd ago' },
  none: { zh: '无', en: 'none' },
  failed: { zh: '失败', en: 'Failed' },
  // Offline
  offline_msg: { zh: '您当前处于离线状态。部分功能可能受限。数据从本地缓存加载。', en: 'You are offline. Some features may be limited. Data is loaded from local cache.' },
};
function t(key) { return (_T[key] && _T[key][_lang]) || key; }
function translateStatic() { document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (k && _T[k]) { el.textContent = _T[k][_lang] || el.textContent; } }); document.querySelectorAll('[data-i18n-ph]').forEach(el => { const k = el.getAttribute('data-i18n-ph'); if (k && _T[k]) { el.placeholder = _T[k][_lang] || el.placeholder; } }); }

// ── Globals ──
const API = '/api';
let currentPage = 'dashboard';
let refreshTimer = null;

// ── Offline detection ──
let isOffline = false;
let offlineBannerEl = null;

function updateOnlineStatus() {
  const wasOffline = isOffline;
  isOffline = !navigator.onLine;
  if (isOffline && !wasOffline) {
    showOfflineBanner();
  } else if (!isOffline && wasOffline) {
    hideOfflineBanner();
    // Reload current page on reconnection
    loadPage(currentPage);
  }
}

function showOfflineBanner() {
  if (offlineBannerEl) return;
  offlineBannerEl = document.createElement('div');
  offlineBannerEl.className = 'offline-banner';
  offlineBannerEl.innerHTML = '<span class="offline-icon">🔌</span><span>' + t('offline_msg') + '</span>';
  const mainContent = document.querySelector('.main');
  if (mainContent) {
    mainContent.insertBefore(offlineBannerEl, mainContent.firstChild);
  }
}

function hideOfflineBanner() {
  if (offlineBannerEl) {
    offlineBannerEl.remove();
    offlineBannerEl = null;
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

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
  if (diff < 0) return t('just_now');
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 1) return t('just_now'); if (m < 60) return m + t('min_ago'); if (h < 24) return h + t('h_ago'); if (d < 30) return d + t('d_ago');
  return new Date(iso).toLocaleDateString();
}
function maskKey(s) { if (!s || s.length < 12) return s || ''; return s.substring(0, 6) + '••••••' + s.slice(-4); }
function copyText(text) { navigator.clipboard.writeText(text).then(() => toast(t('copied_clipboard'), 'ok')).catch(() => toast(t('copy_failed'), 'err')); }

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
  html(el, '<div class="loading-mask"><div class="spinner"></div>' + t('loading_dashboard') + '</div>');
  const results = await Promise.allSettled([api('/status'), api('/friends'), api('/identity'), api('/mgmt-url')]);
  const status = results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason?.message || 'Failed' };
  const friends = results[1].status === 'fulfilled' ? results[1].value : { friends: [], error: true };
  const identity = results[2].status === 'fulfilled' ? results[2].value : { agentId: '—', publicKeyFingerprint: '—', serverUrl: '—', connected: false };
  const mgmtUrl = results[3].status === 'fulfilled' ? results[3].value : { mgmtUrl: window.location.origin };
  if (status.error) { html(el, '<div class="empty"><div class="icon">⚠️</div><p>' + t('failed_connect') + '</p></div>'); return; }
  const connCls = status.connected ? 'dot-ok' : 'dot-err';
  const connText = status.connected ? t('connected') : t('disconnected');
  const friendList = friends.friends || [];
  const aiFriends = friendList.filter(f => f.friendType === 'ai').length;
  const humanFriends = friendList.filter(f => f.friendType !== 'ai').length;
  const mgmtLink = mgmtUrl?.mgmtUrl || window.location.origin;

  html(el, \\\`
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--accent-bg)">📡</div>
        <div class="stat-label">\${t('server_status')}</div>
        <div class="stat-value" style="font-size:16px;display:flex;align-items:center;gap:8px">
          <span class="dot \${connCls}"></span> \${connText}
        </div>
        <div class="stat-sub">\${escHtml(status.serverUrl)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--ok-bg)">👥</div>
        <div class="stat-label">\${t('total_friends')}</div>
        <div class="stat-value">\${friendList.length}</div>
        <div class="stat-sub">\${aiFriends} AI · \${humanFriends} Human</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--info-bg)">🔗</div>
        <div class="stat-label">\${t('active_sessions')}</div>
        <div class="stat-value">\${status.sessionCount || 0}</div>
        <div class="stat-sub">\${t('encrypted_sessions')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--warn-bg)">🔑</div>
        <div class="stat-label">\${t('agent_id')}</div>
        <div class="stat-value mono" style="font-size:13px">\${escHtml(status.agentId)}</div>
        <div class="stat-sub">\${t('fingerprint')}: \${escHtml(status.fingerprint)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">📋 \${t('recent_friends')}</div><button class="btn btn-sm btn-ghost" onclick="navigate('friends')">\${t('view_all')}</button></div>
        \${renderMiniFriendList(friendList.slice(0, 5))}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">🤖 \${t('identity_info')}</div></div>
        <div class="detail-row"><div class="detail-key">\${t('agent_id')}</div><div class="detail-val mono" style="cursor:pointer" onclick="copyText('\${identity.agentId}')">\${escHtml(identity.agentId)} 📋</div></div>
        <div class="detail-row"><div class="detail-key">\${t('fingerprint')}</div><div class="detail-val mono">\${escHtml(identity.publicKeyFingerprint)}</div></div>
        <div class="detail-row"><div class="detail-key">\${t('server_url')}</div><div class="detail-val mono" style="cursor:pointer" onclick="copyText('\${identity.serverUrl}')">\${escHtml(identity.serverUrl)} 📋</div></div>
        <div class="detail-row"><div class="detail-key">\${t('connection')}</div><div class="detail-val"><span class="badge badge-\${identity.connected ? 'ok' : 'danger'}">\${identity.connected ? t('online') : t('offline')}</span></div></div>
        <div class="detail-row"><div class="detail-key">\${t('plugin_version')}</div><div class="detail-val"><span class="badge badge-accent">v1.2.0</span></div></div>
      </div>
    </div>
    <div class="card" style="margin-top:0">
      <div class="card-header"><div class="card-title">🖥️ \${t('mgmt_ui_access')}</div></div>
      <div class="detail-row"><div class="detail-key">\${t('current_url')}</div><div class="detail-val"><a href="\${escHtml(mgmtLink)}" target="_blank" style="color:var(--info);text-decoration:underline">\${escHtml(mgmtLink)}</a></div></div>
      <div class="detail-row"><div class="detail-key">\${t('local_access')}</div><div class="detail-val"><a href="http://127.0.0.1:6109" target="_blank" style="color:var(--info);text-decoration:underline">http://127.0.0.1:6109</a> <button class="btn btn-sm btn-primary" onclick="window.open('http://127.0.0.1:6109','_blank')" style="margin-left:8px">🔗 \${t('open')}</button></div></div>
      <div class="detail-row"><div class="detail-key">\${t('gateway_path')}</div><div class="detail-val mono">/plugins/aicq-chat/</div></div>
    </div>
  \\\`);

  // Also set the mgmt-url-display in settings
  const mgmtUrlEl = document.getElementById('mgmt-url-display');
  if (mgmtUrlEl) mgmtUrlEl.textContent = window.location.href;
}

function renderMiniFriendList(friends) {
  if (!friends.length) return '<div class="empty"><p>' + t('no_friends_yet') + '</p></div>';
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
  html(el, '<div class="loading-mask"><div class="spinner"></div>' + t('loading_agents') + '</div>');
  const data = await api('/agents');
  if (data.error) { html(el, '<div class="empty"><div class="icon">⚠️</div><p>' + escHtml(data.error) + '</p></div>'); return; }

  window._lastAgentsData = data;
  const agents = data.agents || [];
  const configSource = data.configSource || 'unknown';

  let rows = '';
  agents.forEach((a, i) => {
    const isProviderModel = a._source === 'provider-model';
    const modelBadge = a.model ? '<span class="badge badge-accent">' + escHtml(a.model) + '</span>' : '<span class="badge badge-ghost">' + t('default_model') + '</span>';
    const providerName = isProviderModel ? escHtml(capitalizeProvider(a.provider || '')) : escHtml(a.provider || '');
    const providerBadge = providerName ? '<span class="tag">' + providerName + (a.isDefault ? ' ⭐' : '') + '</span>' : '';
    const statusBadge = a.enabled !== false ? '<span class="badge badge-ok">' + t('active') + '</span>' : '<span class="badge badge-warn">' + t('disabled') + '</span>';
    const defaultBadge = a.isDefault ? ' <span class="badge badge-warn" style="font-size:10px">' + t('default_model_badge') + '</span>' : '';

    rows += \\\`<tr>
      <td>\${statusBadge}\${defaultBadge}</td>
      <td><div style="font-weight:600">\${escHtml(a.name || 'Agent ' + (i + 1))}</div><div class="mono" style="font-size:11px;color:var(--text3)">\${isProviderModel ? escHtml(a._configPath || '') : escHtml(a.id || '—')}</div></td>
      <td>\${modelBadge}</td>
      <td>\${providerBadge}</td>
      <td>\${escHtml(a.systemPrompt ? a.systemPrompt.substring(0, 60) + '...' : '—')}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-ghost" onclick="viewAgent(\${i})" title="View">👁️</button>
          <button class="btn btn-sm btn-ok" onclick="showEditAgentModal(\${i})" title="Edit">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAgent(\${i})" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>\\\`;
  });

  if (!agents.length) {
    html(el, \\\`
      <p class="section-desc">\${t('agent_list_from')} <strong>\${escHtml(configSource)}</strong></p>
      <div class="empty"><div class="icon">🤖</div><p>\${t('no_agents_configured')}</p><p class="sub">\${t('add_agents_hint')}</p></div>
    \\\`);
    return;
  }

  html(el, \\\`
    <div class="toolbar">
      <div class="search-box"><input type="text" placeholder="\${t('search_agents')}" id="agent-search" oninput="filterAgentTable()"></div>
      <button class="btn btn-sm btn-primary" onclick="showAddAgentModal()">\${t('add_agent')}</button>
      <button class="btn btn-sm btn-default" onclick="loadAgents()">🔄 \${t('refresh')}</button>
    </div>
    <p class="section-desc">\${t('agent_list_from')} <strong style="color:var(--accent2)">\${escHtml(configSource)}</strong>. \${t('total_label')}: <strong>\${agents.length}</strong> \${t('agents_configured')}.</p>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th style="width:80px">\${t('status')}</th><th>\${t('agent')}</th><th>\${t('model')}</th><th>\${t('provider')}</th><th>\${t('system_prompt')}</th><th style="width:90px">\${t('actions')}</th></tr></thead>
          <tbody id="agent-table-body">\${rows}</tbody>
        </table>
      </div>
    </div>
  \\\`);
}

function capitalizeProvider(id) {
  const names = {
    modelscope: 'ModelScope', zhipu: 'Zhipu AI', qwen: 'Qwen', doubao: 'Doubao',
    moonshot: 'Moonshot', minimax: 'MiniMax', stepfun: 'StepFun', baidu: 'Baidu',
    spark: 'Spark', deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic',
    google: 'Google AI', groq: 'Groq', ollama: 'Ollama', openrouter: 'OpenRouter',
    mistral: 'Mistral AI', together: 'Together AI', fireworks: 'Fireworks AI',
  };
  return names[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '—');
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
  html('#view-agent-body', details || '<div class="empty"><p>' + t('no_data') + '</p></div>');
  $('#view-agent-title').textContent = a.name || a.id || t('agent');
  showModal('modal-view-agent');
}

async function deleteAgent(index) {
  const agents = window._lastAgentsData?.agents || [];
  const a = agents[index];
  if (!a) return;
  if (!confirm(t('confirm_delete_agent'))) return;
  let identifier;
  if (a._source === 'provider-model') {
    identifier = 'provider:' + (a._providerId || '') + ':' + (a._modelIndex || 0);
  } else {
    identifier = index;
  }
  const r = await api('/agents/' + encodeURIComponent(identifier), { method: 'DELETE' });
  if (r.success) { toast(t('agent_deleted'), 'ok'); loadAgents(); }
  else { toast(r.message || r.error || t('delete_failed'), 'err'); }
}

let _editAgentIndex = null;
let _editAgentIsProviderModel = false;

function showAddAgentModal() {
  _editAgentIndex = null;
  _editAgentIsProviderModel = false;
  $('#agent-form-title').textContent = t('add_new_agent');
  $('#agent-form-name').value = '';
  $('#agent-form-id').value = '';
  $('#agent-form-model').value = '';
  $('#agent-form-provider').value = '';
  $('#agent-form-prompt').value = '';
  $('#agent-form-enabled').checked = true;
  $('#agent-form-temperature').value = '0.7';
  $('#agent-form-max-tokens').value = '4096';
  $('#agent-form-top-p').value = '1';
  $('#agent-form-tools').value = '';
  showModal('modal-add-agent');
  setTimeout(() => $('#agent-form-name')?.focus(), 100);
}

function showEditAgentModal(index) {
  const agents = window._lastAgentsData?.agents || [];
  const a = agents[index];
  if (!a) return;
  _editAgentIndex = index;
  _editAgentIsProviderModel = a._source === 'provider-model';
  $('#agent-form-title').textContent = t('edit_agent');
  $('#agent-form-name').value = a.name || '';
  $('#agent-form-id').value = a._source === 'provider-model' ? (a._configPath || '') : (a.id || '');
  $('#agent-form-model').value = a.model || '';
  $('#agent-form-provider').value = a.provider || '';
  $('#agent-form-prompt').value = a.systemPrompt || '';
  $('#agent-form-enabled').checked = a.enabled !== false;
  $('#agent-form-temperature').value = a.temperature ?? 0.7;
  $('#agent-form-max-tokens').value = a.maxTokens ?? 4096;
  $('#agent-form-top-p').value = a.topP ?? 1;
  $('#agent-form-tools').value = Array.isArray(a.tools) ? a.tools.join(', ') : (a.tools || '');
  if (a._source === 'provider-model') {
    $('#agent-form-id').readOnly = true;
    $('#agent-form-id').title = a._configPath || '';
  } else {
    $('#agent-form-id').readOnly = false;
    $('#agent-form-id').title = '';
  }
  showModal('modal-add-agent');
}

async function saveAgent() {
  const tempVal = parseFloat($('#agent-form-temperature')?.value);
  const maxTokensVal = parseInt($('#agent-form-max-tokens')?.value, 10);
  const topPVal = parseFloat($('#agent-form-top-p')?.value);
  const toolsRaw = $('#agent-form-tools')?.value?.trim() || '';

  const agent = {
    name: $('#agent-form-name')?.value?.trim() || '',
    id: $('#agent-form-id')?.value?.trim() || '',
    model: $('#agent-form-model')?.value?.trim() || '',
    provider: $('#agent-form-provider')?.value?.trim() || '',
    systemPrompt: $('#agent-form-prompt')?.value?.trim() || '',
    enabled: $('#agent-form-enabled')?.checked ?? true,
    temperature: isNaN(tempVal) ? 0.7 : Math.min(2, Math.max(0, tempVal)),
    maxTokens: isNaN(maxTokensVal) ? 4096 : maxTokensVal,
    topP: isNaN(topPVal) ? 1 : Math.min(1, Math.max(0, topPVal)),
    tools: toolsRaw ? toolsRaw.split(',').map(t => t.trim()).filter(Boolean) : [],
  };

  if (!agent.name) { toast(t('agent_name_required'), 'warn'); return; }

  let r;
  if (_editAgentIndex !== null) {
    let identifier;
    if (_editAgentIsProviderModel) {
      const a = (window._lastAgentsData?.agents || [])[_editAgentIndex];
      identifier = 'provider:' + (a?._providerId || '') + ':' + (a?._modelIndex || 0);
    } else {
      identifier = _editAgentIndex;
    }
    r = await api('/agents/' + encodeURIComponent(identifier), { method: 'PUT', body: JSON.stringify({ agent }) });
  } else {
    // Add new
    r = await api('/agents', { method: 'POST', body: JSON.stringify({ agent }) });
  }

  if (r.success) {
    toast(_editAgentIndex !== null ? t('agent_updated') : t('agent_added'), 'ok');
    hideModal('modal-add-agent');
    loadAgents();
  } else {
    toast(r.message || r.error || t('failed'), 'err');
  }
}

// ════════════════════════════════════════════════════════════
// PAGE: Friends Management
// ════════════════════════════════════════════════════════════
let friendsFilter = 'all';

async function loadFriends() {
  const el = $('#friends-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>' + t('loading_friends') + '</div>');
  const results = await Promise.allSettled([api('/friends'), api('/friends/requests'), api('/sessions')]);
  const friends = results[0].status === 'fulfilled' ? results[0].value : { friends: [] };
  const requests = results[1].status === 'fulfilled' ? results[1].value : { requests: [] };
  const sessions = results[2].status === 'fulfilled' ? results[2].value : { sessions: [] };

  // Show offline banner if friends data came from cache
  if (friends.offline || friends.error) {
    showOfflineBanner();
  } else {
    hideOfflineBanner();
  }

  // Sub-tabs
  const friendCount = (friends.friends || []).length;
  const reqCount = (requests.requests || []).length;
  const sessCount = (sessions.sessions || []).length;

  html('#friends-tabs', \\\`
    <button class="filter-btn \${friendsSubTab==='friends'?'active':''}" onclick="friendsSubTab='friends';loadFriends()">👥 \${t('friends')} (<span id="fc">\${friendCount}</span>)</button>
    <button class="filter-btn \${friendsSubTab==='requests'?'active':''}" onclick="friendsSubTab='requests';loadFriends()">📨 \${t('requests')} (<span id="rc">\${reqCount}</span>)</button>
    <button class="filter-btn \${friendsSubTab==='sessions'?'active':''}" onclick="friendsSubTab='sessions';loadFriends()">🔗 \${t('sessions')} (<span id="sc">\${sessCount}</span>)</button>
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
      <div class="search-box"><input type="text" placeholder="\${t('search_friends')}" id="friend-search" oninput="filterFriendTable()"></div>
      <div class="filter-group">
        <button class="filter-btn \${friendsFilter==='all'?'active':''}" onclick="friendsFilter='all';filterFriendTable()">\${t('all')}</button>
        <button class="filter-btn \${friendsFilter==='ai'?'active':''}" onclick="friendsFilter='ai';filterFriendTable()">\${t('ai')}</button>
        <button class="filter-btn \${friendsFilter==='human'?'active':''}" onclick="friendsFilter='human';filterFriendTable()">\${t('human')}</button>
      </div>
      <span style="flex:1"></span>
      <button class="btn btn-sm btn-primary" onclick="showAddFriendModal()" \${isOffline ? 'disabled title="' + t('unavailable_offline') + '"' : ''}>\${t('add_friend')}</button>
      <button class="btn btn-sm btn-default" onclick="loadFriends()">🔄</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto;max-height:calc(100vh - 280px);overflow-y:auto">
        <table>
          <thead><tr><th style="width:60px">\${t('type')}</th><th>\${t('friend_label')}</th><th>\${t('permissions')}</th><th>\${t('fingerprint')}</th><th>\${t('last_message')}</th><th style="width:80px">\${t('actions')}</th></tr></thead>
          <tbody id="friend-table-body">\${rows}</tbody>
        </table>
      </div>
      \${!friends.length ? '<div class="empty"><div class="icon">👥</div><p>' + t('no_friends_yet') + '</p><p class="sub">' + t('add_friend_hint') + '</p></div>' : ''}
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
        \${r.status === 'pending' ? '<div class="actions-cell"><button class="btn btn-sm btn-ok" onclick="acceptFriendReq(\\'' + escHtml(r.id) + '\\')">✓ \${t('accept')}</button><button class="btn btn-sm btn-danger" onclick="rejectFriendReq(\\'' + escHtml(r.id) + '\\')">✗ \${t('reject')}</button></div>' : '—'}
      </td>
    </tr>\\\`;
  });
  html(el, \\\`
    <div class="toolbar"><button class="btn btn-sm btn-default" onclick="loadFriends()">🔄 \${t('refresh')}</button></div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto"><table>
        <thead><tr><th>\${t('request_id')}</th><th>\${t('from')}</th><th>\${t('status')}</th><th>\${t('time')}</th><th style="width:160px">\${t('actions')}</th></tr></thead>
        <tbody>\${rows}</tbody>
      </table></div>
      \${!requests.length ? '<div class="empty"><div class="icon">📨</div><p>' + t('no_pending_requests') + '</p></div>' : ''}
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
      <td><span class="badge badge-info">\${s.messageCount} \${t('messages')}</span></td>
    </tr>\\\`;
  });
  html(el, \\\`
    <div class="toolbar"><button class="btn btn-sm btn-default" onclick="loadFriends()">🔄 \${t('refresh')}</button></div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto"><table>
        <thead><tr><th>\${t('peer_id')}</th><th>\${t('established')}</th><th>\${t('messages')}</th></tr></thead>
        <tbody>\${rows}</tbody>
      </table></div>
      \${!sessions.length ? '<div class="empty"><div class="icon">🔗</div><p>' + t('no_active_sessions') + '</p></div>' : ''}
    </div>
  \\\`);
}

function showAddFriendModal() { $('#add-friend-target').value = ''; showModal('modal-add-friend'); setTimeout(() => $('#add-friend-target')?.focus(), 100); }
async function addFriend() {
  const target = $('#add-friend-target').value.trim();
  if (!target) { toast(t('enter_temp_or_id'), 'warn'); return; }
  hideModal('modal-add-friend');
  toast(t('sending_request'), 'info');
  const r = await api('/friends', { method: 'POST', body: JSON.stringify({ target }) });
  if (r.success) { toast(r.message || t('friend_request_sent'), 'ok'); loadFriends(); }
  else { toast(r.message || r.error || t('failed_add_friend'), 'err'); }
}
async function removeFriend(id) {
  if (!confirm(t('remove_friend_confirm') + id + '?')) return;
  const r = await api('/friends/' + encodeURIComponent(id), { method: 'DELETE' });
  if (r.success) { toast(t('friend_removed'), 'ok'); loadFriends(); }
  else { toast(r.message || r.error || t('failed'), 'err'); }
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
  if (r.success) { toast(t('permissions_updated'), 'ok'); hideModal('modal-permissions'); loadFriends(); }
  else { toast(r.message || r.error || t('failed'), 'err'); }
}
async function acceptFriendReq(id) {
  const r = await api('/friends/requests/' + encodeURIComponent(id) + '/accept', { method: 'POST', body: JSON.stringify({ permissions: ['chat'] }) });
  if (r.success) { toast(t('request_accepted'), 'ok'); loadFriends(); } else { toast(r.message || r.error || t('failed'), 'err'); }
}
async function rejectFriendReq(id) {
  const r = await api('/friends/requests/' + encodeURIComponent(id) + '/reject', { method: 'POST', body: JSON.stringify({}) });
  if (r.success) { toast(t('request_rejected'), 'ok'); loadFriends(); } else { toast(r.message || r.error || t('failed'), 'err'); }
}

// ════════════════════════════════════════════════════════════
// PAGE: Model Management
// ════════════════════════════════════════════════════════════
let _modelProviders = null;

async function loadModels() {
  const el = $('#models-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>' + t('loading_models') + '</div>');
  const data = await api('/models');
  if (data.error) { html(el, '<div class="empty"><div class="icon">⚠️</div><p>' + escHtml(data.error) + '</p></div>'); return; }
  _modelProviders = data;
  renderModels(data);
}

function getProviderIcon(id) {
  const icons = {
    openai: '🟢', anthropic: '🟠', google: '🔵', ollama: '🟣', deepseek: '🔷',
    groq: '⚡', openrouter: '🌐', mistral: '🌀', together: '🔮', fireworks: '🎆',
    modelscope: '🏗️', zhipu: '🧠', qwen: '☁️', doubao: '🫘', moonshot: '🌙',
    minimax: '🔷', stepfun: '📈', baidu: '🔍', spark: '✨',
  };
  return icons[id] || '⚪';
}

function renderModels(data) {
  const el = $('#models-content');
  const providers = data.providers || [];
  const configured = providers.filter(p => p.configured).length;
  const defaultModel = data.defaultModel || '';

  // Default model banner
  let defaultBanner = '';
  if (defaultModel) {
    defaultBanner = \\\`
      <div class="card" style="border-color:var(--warn);background:var(--warn-bg)">
        <div class="card-header">
          <div class="card-title" style="color:#d97706">⭐ \${t('default_model_global')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="badge badge-warn" style="font-size:13px;padding:4px 14px">\${escHtml(defaultModel)}</span>
        </div>
      </div>\\\`;
  }

  let cards = '';
  providers.forEach(p => {
    const icon = getProviderIcon(p.id);
    const statusBadge = p.configured
      ? '<span class="badge badge-ok">' + t('key_set') + '</span>'
      : '<span class="badge badge-ghost">' + t('not_set') + '</span>';

    // Show multi-model info
    let modelInfo = '';
    if (p.configured && p.modelCount > 0) {
      modelInfo = '<span class="prov-model">' + t('multi_model') + ': ' + p.modelCount + ' ' + t('models_under_provider') + '</span>';
      const shownModels = (p.models || []).slice(0, 3);
      shownModels.forEach(m => {
        const isDef = defaultModel === (m.id || '');
        modelInfo += '<span class="prov-model" style="margin-left:4px">' + escHtml(m.name || m.id || '') + (isDef ? ' ⭐' : '') + '</span>';
      });
      if (p.modelCount > 3) {
        modelInfo += '<span class="prov-model" style="color:var(--text3);margin-left:4px">+' + (p.modelCount - 3) + ' more</span>';
      }
    } else if (p.modelId) {
      modelInfo = '<span class="prov-model">' + escHtml(p.modelId) + '</span>';
    }

    cards += \\\`
      <div class="provider-card" onclick="showModelConfigModal('\${escHtml(p.id)}')">
        <div class="prov-head">
          <div class="prov-name">\${icon} \${escHtml(p.name)}</div>
          \${statusBadge}
        </div>
        <div class="prov-desc">\${escHtml(p.description)}</div>
        \${modelInfo}
        <div class="prov-actions">
          <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();showModelConfigModal('\${escHtml(p.id)}')">\${t('configure')}</button>
        </div>
      </div>\\\`;
  });

  let activeModelsSection = '';
  if (data.currentModels && data.currentModels.length) {
    let rows = '';
    data.currentModels.forEach(m => {
      const defaultTag = m.isDefault ? ' <span class="badge badge-warn" style="font-size:10px">⭐ ' + t('default_model_badge') + '</span>' : '';
      rows += \\\`<tr>
        <td style="font-weight:500">\${escHtml(m.provider)}</td>
        <td class="mono">\${escHtml(m.modelId)}\${defaultTag}</td>
        <td>\${escHtml(m.modelName || '')}</td>
        <td><span class="badge badge-ok">' + t('key_set') + '</span></td>
        <td class="mono" style="font-size:11px">\${escHtml(m.baseUrl || t('default_model'))}</td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-sm btn-ghost" onclick="showModelConfigModal('\${escHtml(m.providerId)}')">\${t('configure')}</button>
            <button class="btn btn-sm btn-danger" onclick="deleteModelProvider('\${escHtml(m.providerId)}')" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>\\\`;
    });
    activeModelsSection = \\\`
      <div class="card" style="margin-top:20px">
        <div class="card-header"><div class="card-title">📊 \${t('active_model_configs')}</div></div>
        <div style="overflow-x:auto"><table>
          <thead><tr><th>\${t('provider')}</th><th>\${t('model')}</th><th>\${t('model_name_label')}</th><th>API Key</th><th>\${t('base_url')}</th><th>\${t('actions')}</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table></div>
      </div>\\\`;
  }

  html(el, \\\`
    \${defaultBanner}
    <div class="stats-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--accent-bg)">🧠</div>
        <div class="stat-label">\${t('configured')}</div>
        <div class="stat-value">\${configured} / \${providers.length}</div>
        <div class="stat-sub">\${t('providers_with_keys')}</div>
      </div>
      \${defaultModel ? '<div class="stat-card"><div class="stat-icon" style="background:var(--warn-bg)">⭐</div><div class="stat-label">' + t('default_model_label') + '</div><div class="stat-value mono" style="font-size:13px">' + escHtml(defaultModel) + '</div></div>' : ''}
    </div>
    <p class="section-desc">\${t('configure_providers_desc')}</p>
    <div class="provider-grid">\${cards}</div>
    \${activeModelsSection}
  \\\`);
}

let _editProviderId = null;
function showModelConfigModal(id) {
  const p = (_modelProviders?.providers || []).find(x => x.id === id);
  if (!p) { toast(t('provider_not_found'), 'err'); return; }
  _editProviderId = id;
  $('#model-name').textContent = p.name;
  $('#model-icon').textContent = getProviderIcon(p.id);
  $('#model-api-key').value = '';
  $('#model-api-key').placeholder = p.apiKeyHint || t('enter_api_key');
  $('#model-model-id').value = p.modelId || '';
  $('#model-model-id').placeholder = p.modelHint || t('enter_model_id');
  $('#model-base-url').value = p.baseUrl || '';
  $('#model-base-url').placeholder = p.baseUrlHint || t('default_url');
  $('#model-current-key').textContent = p.apiKeyHasValue ? t('current_key') + p.apiKey : t('no_api_key');
  // Show multi-model list if available
  const modelsListEl = document.getElementById('model-multi-list');
  if (modelsListEl) {
    if (p.models && p.models.length > 0) {
      const defaultModel = _modelProviders?.defaultModel || '';
      let html = '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;font-weight:600">' + t('model_count') + ': ' + p.models.length + '</div>';
      html += '<div style="max-height:160px;overflow-y:auto">';
      p.models.forEach(m => {
        const isDef = defaultModel === (m.id || '');
        html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border)">' +
          '<span class="mono" style="flex:1">' + escHtml(m.name || m.id || '') + '</span>' +
          '<span class="mono" style="color:var(--text3);font-size:11px">' + escHtml(m.id || '') + '</span>' +
          (isDef ? '<span class="badge badge-warn" style="font-size:10px">⭐</span>' : '') +
          '</div>';
      });
      html += '</div>';
      modelsListEl.innerHTML = html;
      modelsListEl.style.display = '';
    } else {
      modelsListEl.innerHTML = '';
      modelsListEl.style.display = 'none';
    }
  }
  showModal('modal-model-config');
}
async function saveModelConfig() {
  const apiKey = $('#model-api-key').value.trim();
  const modelId = $('#model-model-id').value.trim();
  const baseUrl = $('#model-base-url').value.trim();
  if (!apiKey && !modelId) { toast(t('enter_api_key_or_model'), 'warn'); return; }
  hideModal('modal-model-config');
  toast(t('saving_config'), 'info');
  const r = await api('/models/' + encodeURIComponent(_editProviderId), { method: 'PUT', body: JSON.stringify({ apiKey, modelId, baseUrl }) });
  if (r.success) { toast(r.message || t('config_saved'), 'ok'); loadModels(); }
  else { toast(r.message || r.error || t('failed_save'), 'err'); }
}
async function deleteModelProvider(providerId) {
  if (!confirm(t('confirm_delete_provider') + providerId + '"?')) return;
  const r = await api('/models/' + encodeURIComponent(providerId), { method: 'DELETE' });
  if (r.success) { toast(t('provider_deleted'), 'ok'); loadModels(); }
  else { toast(r.message || r.error || t('delete_failed'), 'err'); }
}

// ════════════════════════════════════════════════════════════
// PAGE: Settings (comprehensive with AJAX, tabs, live test)
// ════════════════════════════════════════════════════════════
let _settingsSaving = false;
let _settingsData = null;
let _settingsTab = 'connection';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  let parts = [];
  if (d > 0) parts.push(d + 'd');
  if (h > 0) parts.push(h + 'h');
  if (m > 0) parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}

async function loadSettings() {
  const el = $('#settings-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>' + t('loading_settings') + '</div>');

  const settings = await api('/settings');
  if (settings.error) {
    html(el, '<div class="empty"><div class="icon">⚠️</div><p>' + escHtml(settings.error) + '</p></div>');
    return;
  }

  _settingsData = settings;

  // Render settings tabs nav
  html('#settings-tabs', \\\`
    <button class="filter-btn \${_settingsTab==='connection'?'active':''}" onclick="_settingsTab='connection';renderSettingsTab()">\${t('tab_connection')}</button>
    <button class="filter-btn \${_settingsTab==='friends'?'active':''}" onclick="_settingsTab='friends';renderSettingsTab()">\${t('tab_friends')}</button>
    <button class="filter-btn \${_settingsTab==='security'?'active':''}" onclick="_settingsTab='security';renderSettingsTab()">\${t('tab_security')}</button>
    <button class="filter-btn \${_settingsTab==='advanced'?'active':''}" onclick="_settingsTab='advanced';renderSettingsTab()">\${t('tab_advanced')}</button>
    <button class="filter-btn \${_settingsTab==='json'?'active':''}" onclick="_settingsTab='json';renderSettingsTab()">\${t('tab_json')}</button>
  \\\`);

  renderSettingsTab();
}

function renderSettingsTab() {
  // Update tab buttons
  html('#settings-tabs', \\\`
    <button class="filter-btn \${_settingsTab==='connection'?'active':''}" onclick="_settingsTab='connection';renderSettingsTab()">\${t('tab_connection')}</button>
    <button class="filter-btn \${_settingsTab==='friends'?'active':''}" onclick="_settingsTab='friends';renderSettingsTab()">\${t('tab_friends')}</button>
    <button class="filter-btn \${_settingsTab==='security'?'active':''}" onclick="_settingsTab='security';renderSettingsTab()">\${t('tab_security')}</button>
    <button class="filter-btn \${_settingsTab==='advanced'?'active':''}" onclick="_settingsTab='advanced';renderSettingsTab()">\${t('tab_advanced')}</button>
    <button class="filter-btn \${_settingsTab==='json'?'active':''}" onclick="_settingsTab='json';renderSettingsTab()">\${t('tab_json')}</button>
  \\\`);

  switch (_settingsTab) {
    case 'connection': renderSettingsConnection(); break;
    case 'friends': renderSettingsFriends(); break;
    case 'security': renderSettingsSecurity(); break;
    case 'advanced': renderSettingsAdvanced(); break;
    case 'json': renderSettingsJsonEditor(); break;
  }
}

function sectionSaveBtn(section, id) {
  return \\\`<button class="btn btn-primary btn-sm" id="btn-save-\${id}" onclick="saveSettingsSection('\${section}', '\${id}')">\${t('save')}</button>
    <span id="status-\${id}" style="font-size:12px;color:var(--text3);margin-left:8px"></span>\\\`;
}

// ── CONNECTION TAB ──
function renderSettingsConnection() {
  const s = _settingsData;
  const el = $('#settings-content');

  html(el, \\\`
    <p class="section-desc">\${t('conn_desc')}</p>

    <div class="card">
      <div class="card-header">
        <div class="card-title">\${t('server_connection')}</div>
        <span class="badge badge-\${s.connected ? 'ok' : 'danger'}">\${s.connected ? '● ' + t('connected') : '○ ' + t('disconnected')}</span>
      </div>
      <div class="form-group">
        <label>\${t('server_url_label')}</label>
        <div style="display:flex;gap:8px;align-items:start">
          <div style="flex:1">
            <div class="input-prefix">
              <span class="prefix">🌐</span>
              <input type="url" id="set-server-url" value="\${escHtml(s.serverUrl || '')}" placeholder="https://aicq.online">
            </div>
            <div class="hint">\${t('server_url_hint')}</div>
          </div>
          <button class="btn btn-ok btn-sm" id="btn-test-conn" onclick="testConnection()" style="white-space:nowrap;margin-top:1px">🔍 \${t('test')}</button>
        </div>
        <div id="conn-test-result" style="margin-top:8px"></div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>\${t('conn_timeout')}</label>
          <input type="number" id="set-connection-timeout" value="\${s.connectionTimeout || 30}" min="5" max="120" placeholder="30">
          <div class="hint">\${t('conn_timeout_hint')}</div>
        </div>
        <div class="form-group">
          <label>\${t('ws_auto_reconnect')}</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <label class="toggle-label">
              <input type="checkbox" id="set-ws-auto-reconnect" \${s.wsAutoReconnect ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span>\${t('auto_reconnect_label')}</span>
            </label>
          </div>
          <div class="hint">\${t('auto_reconnect_hint')}</div>
        </div>
      </div>

      <div class="form-group">
        <label>\${t('ws_reconnect_interval')}</label>
        <input type="number" id="set-ws-reconnect-interval" value="\${s.wsReconnectInterval || 60}" min="5" max="600" placeholder="60">
        <div class="hint">\${t('ws_reconnect_hint')}</div>
      </div>

      <div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:8px">
        \${sectionSaveBtn('connection', 'conn')}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">\${t('config_file')}</div></div>
      <div class="detail-row"><div class="detail-key">\${t('source')}</div><div class="detail-val mono" style="cursor:pointer" onclick="copyText('\${escHtml(s.configPath || '')}')">\${escHtml(s.configPath || t('not_found'))} 📋</div></div>
      <div class="detail-row"><div class="detail-key">\${t('plugin_version')}</div><div class="detail-val">1.1.1</div></div>
      <div class="detail-row"><div class="detail-key">\${t('mgmt_ui')}</div><div class="detail-val" id="mgmt-url-display" style="cursor:pointer" onclick="copyText(document.getElementById('mgmt-url-display')?.textContent || '')"></div></div>
      <div class="detail-row"><div class="detail-key">\${t('uptime')}</div><div class="detail-val">\${formatUptime(s.uptimeSeconds)}</div></div>
    </div>
  \\\`);
}

async function testConnection() {
  const btn = $('#btn-test-conn');
  const resultEl = $('#conn-test-result');
  const url = $('#set-server-url')?.value?.trim() || _settingsData.serverUrl;

  if (!url) { toast(t('enter_server_url'), 'warn'); return; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin:0"></span> ' + t('testing'); }
  if (resultEl) html(resultEl, '<div style="font-size:12px;color:var(--text3);display:flex;align-items:center;gap:6px"><span class="spinner" style="width:12px;height:12px;border-width:2px"></span> ' + t('testing_conn_to') + escHtml(url) + '...</div>');

  const r = await api('/settings/test-connection', {
    method: 'POST',
    body: JSON.stringify({ serverUrl: url, timeout: 10000 }),
  });

  if (btn) { btn.disabled = false; btn.innerHTML = '🔍 ' + t('test'); }

  if (r.success) {
    const latencyBadge = r.latency < 200 ? '<span class="badge badge-ok">' + r.latency + 'ms</span>' : r.latency < 1000 ? '<span class="badge badge-warn">' + r.latency + 'ms</span>' : '<span class="badge badge-danger">' + r.latency + 'ms</span>';
    if (resultEl) html(resultEl, \\\`
      <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ok)">
        <span class="dot dot-ok"></span> \${t('conn_ok')} \${latencyBadge}
        \${r.serverInfo?.version ? '<span class="tag">v' + escHtml(r.serverInfo.version) + '</span>' : ''}
      </div>
    \\\`);
    toast(t('conn_ok_latency') + r.latency + 'ms', 'ok');
  } else {
    const cls = r.status === 'timeout' ? 'warn' : 'danger';
    const icon = r.status === 'timeout' ? '⏱️' : '❌';
    if (resultEl) html(resultEl, \\\`
      <div style="font-size:12px;color:var(--\${cls});display:flex;align-items:center;gap:8px">
        \${icon} \${escHtml(r.message || t('conn_failed'))}
        <span class="badge badge-ghost">\${r.latency}ms</span>
      </div>
    \\\`);
    toast(r.message || t('conn_failed'), 'err');
  }
}

// ── FRIENDS TAB ──
function renderSettingsFriends() {
  const s = _settingsData;
  const el = $('#settings-content');

  html(el, \\\`
    <p class="section-desc">\${t('friends_tab_desc')}</p>

    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--ok-bg)">👥</div>
        <div class="stat-label">\${t('friends')}</div>
        <div class="stat-value">\${s.friendCount || 0}</div>
        <div class="stat-sub">\${t('of_max')}\${s.maxFriends || 200}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--info-bg)">🔗</div>
        <div class="stat-label">\${t('sessions')}</div>
        <div class="stat-value">\${s.sessionCount || 0}</div>
        <div class="stat-sub">\${t('encrypted_sessions')}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">👥 \${t('max_friends')} & \${t('permissions')}</div></div>
      <div class="form-row">
        <div class="form-group">
          <label>\${t('max_friends')}</label>
          <input type="number" id="set-max-friends" value="\${s.maxFriends || 200}" min="1" max="10000" placeholder="200">
          <div class="hint">\${t('max_friends')} (1–10,000)</div>
        </div>
        <div class="form-group">
          <label>\${t('auto_accept')}</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <label class="toggle-label">
              <input type="checkbox" id="set-auto-accept" \${s.autoAcceptFriends ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span>\${t('auto_accept_label')}</span>
            </label>
          </div>
          <div class="hint">\${t('auto_accept_hint')}</div>
        </div>
      </div>
      <div class="form-group">
        <label>\${t('default_perms')}</label>
        <div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap">
          <label class="toggle-label">
            <input type="checkbox" id="set-perm-chat" \${(s.defaultPermissions || []).includes('chat') ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span>\${t('chat_perm')}</span>
          </label>
          <label class="toggle-label">
            <input type="checkbox" id="set-perm-exec" \${(s.defaultPermissions || []).includes('exec') ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span>\${t('exec_perm')}</span>
          </label>
        </div>
        <div class="hint">\${t('default_perms_hint')}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:8px">
        \${sectionSaveBtn('friends', 'friends')}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">\${t('temp_numbers')}</div></div>
      <div class="form-group">
        <label>\${t('temp_expiry')}</label>
        <input type="number" id="set-temp-expiry" value="\${s.tempNumberExpiry || 300}" min="60" max="3600" placeholder="300">
        <div class="hint">\${t('temp_expiry_hint')}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:8px">
        \${sectionSaveBtn('temp', 'temp')}
      </div>
    </div>
  \\\`);
}

// ── SECURITY TAB ──
function renderSettingsSecurity() {
  const s = _settingsData;
  const el = $('#settings-content');

  html(el, \\\`
    <p class="section-desc">\${t('sec_desc')}</p>

    <div class="card">
      <div class="card-header"><div class="card-title">\${t('agent_identity')}</div></div>
      <div class="detail-row"><div class="detail-key">\${t('agent_id')}</div><div class="detail-val mono" style="cursor:pointer" onclick="copyText('\${escHtml(s.agentId)}')">\${escHtml(s.agentId)} 📋</div></div>
      <div class="detail-row"><div class="detail-key">\${t('public_key_fp')}</div><div class="detail-val mono">\${escHtml(s.publicKeyFingerprint || '—')}</div></div>
      <div style="padding-top:12px;display:flex;gap:8px">
        <button class="btn btn-danger btn-sm" onclick="showResetIdentityModal()">\${t('reset_identity')}</button>
        <span style="font-size:12px;color:var(--text3);display:flex;align-items:center">\${t('reset_identity_warn')}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">\${t('p2p_encryption')}</div></div>
      <div class="form-row">
        <div class="form-group">
          <label>\${t('enable_p2p')}</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <label class="toggle-label">
              <input type="checkbox" id="set-enable-p2p" \${s.enableP2P ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span>\${t('allow_p2p')}</span>
            </label>
          </div>
          <div class="hint">\${t('enable_p2p_hint')}</div>
        </div>
        <div class="form-group">
          <label>\${t('hs_timeout')}</label>
          <input type="number" id="set-handshake-timeout" value="\${s.handshakeTimeout || 60}" min="10" max="300" placeholder="60">
          <div class="hint">\${t('hs_timeout_hint')}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:8px">
        \${sectionSaveBtn('security', 'sec')}
      </div>
    </div>
  \\\`);
}

// ── ADVANCED TAB ──
function renderSettingsAdvanced() {
  const s = _settingsData;
  const el = $('#settings-content');

  html(el, \\\`
    <p class="section-desc">\${t('adv_desc')}</p>

    <div class="card">
      <div class="card-header"><div class="card-title">\${t('file_transfer')}</div></div>
      <div class="form-row">
        <div class="form-group">
          <label>\${t('enable_ft')}</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <label class="toggle-label">
              <input type="checkbox" id="set-enable-ft" \${s.enableFileTransfer ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span>\${t('allow_ft')}</span>
            </label>
          </div>
          <div class="hint">\${t('enable_ft_hint')}</div>
        </div>
        <div class="form-group">
          <label>\${t('max_file_size')}</label>
          <select id="set-max-file-size">
            <option value="10485760" \${s.maxFileSize <= 10485760 ? 'selected' : ''}>10 MB</option>
            <option value="52428800" \${s.maxFileSize > 10485760 && s.maxFileSize <= 52428800 ? 'selected' : ''}>50 MB</option>
            <option value="104857600" \${s.maxFileSize > 52428800 && s.maxFileSize <= 104857600 ? 'selected' : ''}>100 MB</option>
            <option value="524288000" \${s.maxFileSize > 104857600 && s.maxFileSize <= 524288000 ? 'selected' : ''}>500 MB</option>
            <option value="1073741824" \${s.maxFileSize > 524288000 ? 'selected' : ''}>1 GB</option>
          </select>
          <div class="hint">\${t('max_file_size_hint')}\${formatBytes(s.maxFileSize)}.</div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:8px">
        \${sectionSaveBtn('filetransfer', 'ft')}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">\${t('logging')}</div></div>
      <div class="form-group">
        <label>\${t('log_level')}</label>
        <select id="set-log-level" style="max-width:300px">
          <option value="debug" \${s.logLevel === 'debug' ? 'selected' : ''}>\${t('log_debug')}</option>
          <option value="info" \${s.logLevel === 'info' ? 'selected' : ''}>\${t('log_info')}</option>
          <option value="warn" \${s.logLevel === 'warn' ? 'selected' : ''}>\${t('log_warn')}</option>
          <option value="error" \${s.logLevel === 'error' ? 'selected' : ''}>\${t('log_error')}</option>
          <option value="none" \${s.logLevel === 'none' ? 'selected' : ''}>\${t('log_none')}</option>
        </select>
        <div class="hint">\${t('log_level_hint')}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:8px">
        \${sectionSaveBtn('logging', 'log')}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">\${t('import_export')}</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-default btn-sm" onclick="exportSettings()">\${t('export_settings')}</button>
        <button class="btn btn-ok btn-sm" onclick="showImportSettingsModal()">\${t('import_settings')}</button>
      </div>
      <div class="hint" style="margin-top:10px">\${t('import_export_hint')}</div>
    </div>
  \\\`);
}

// ── Section Save (AJAX) ──
async function saveSettingsSection(section, id) {
  const btn = $('#btn-save-' + id);
  const statusEl = $('#status-' + id);
  if (btn) { btn.disabled = true; btn.textContent = t('saving'); }
  if (statusEl) { statusEl.textContent = ''; statusEl.style.color = 'var(--text3)'; }

  let data = {};
  switch (section) {
    case 'connection':
      data = {
        serverUrl: $('#set-server-url')?.value?.trim(),
        connectionTimeout: parseInt($('#set-connection-timeout')?.value, 10),
        wsAutoReconnect: $('#set-ws-auto-reconnect')?.checked ?? true,
        wsReconnectInterval: parseInt($('#set-ws-reconnect-interval')?.value, 10),
      };
      break;
    case 'friends':
      data = {
        maxFriends: parseInt($('#set-max-friends')?.value, 10),
        autoAcceptFriends: $('#set-auto-accept')?.checked ?? false,
        defaultPermissions: [
          ...(($('#set-perm-chat')?.checked) ? ['chat'] : []),
          ...(($('#set-perm-exec')?.checked) ? ['exec'] : []),
        ],
      };
      break;
    case 'temp':
      data = { tempNumberExpiry: parseInt($('#set-temp-expiry')?.value, 10) };
      break;
    case 'security':
      data = {
        enableP2P: $('#set-enable-p2p')?.checked ?? true,
        handshakeTimeout: parseInt($('#set-handshake-timeout')?.value, 10),
      };
      break;
    case 'filetransfer':
      data = {
        enableFileTransfer: $('#set-enable-ft')?.checked ?? true,
        maxFileSize: parseInt($('#set-max-file-size')?.value, 10),
      };
      break;
    case 'logging':
      data = { logLevel: $('#set-log-level')?.value || 'info' };
      break;
  }

  const r = await api('/settings/section', {
    method: 'POST',
    body: JSON.stringify({ section, data }),
  });

  if (btn) { btn.disabled = false; btn.textContent = t('save'); }

  if (r.success) {
    toast(t('settings_saved') + section, 'ok');
    if (statusEl) { statusEl.textContent = t('saved'); statusEl.style.color = 'var(--ok)'; }
    // Refresh settings data
    const fresh = await api('/settings');
    if (fresh && !fresh.error) { _settingsData = fresh; }
  } else {
    toast(r.message || r.error || t('failed_save'), 'err');
    if (statusEl) { statusEl.textContent = '✗ ' + (r.message || t('failed')); statusEl.style.color = 'var(--danger)'; }
  }
}

// ── Full Save All (legacy support) ──
async function saveSettings() {
  if (_settingsSaving) return;
  _settingsSaving = true;

  const allData = {
    serverUrl: $('#set-server-url')?.value?.trim(),
    maxFriends: parseInt($('#set-max-friends')?.value, 10),
    autoAcceptFriends: $('#set-auto-accept')?.checked ?? false,
  };

  const r = await api('/settings', { method: 'PUT', body: JSON.stringify(allData) });
  _settingsSaving = false;

  if (r.success) { toast(t('all_saved'), 'ok'); setTimeout(() => loadSettings(), 800); }
  else { toast(r.message || r.error || t('failed_save'), 'err'); }
}

// ── Reset Identity ──
function showResetIdentityModal() {
  $('#reset-confirm-input').value = '';
  $('#reset-confirm-btn').disabled = true;
  $('#reset-confirm-btn').textContent = t('delete_everything');
  showModal('modal-reset-identity');
  setTimeout(() => $('#reset-confirm-input')?.focus(), 100);
}

function checkResetConfirm() {
  const v = $('#reset-confirm-input')?.value?.trim();
  const btn = $('#reset-confirm-btn');
  if (btn) { btn.disabled = (v !== 'RESET'); btn.textContent = v === 'RESET' ? t('confirm_delete') : t('delete_everything'); }
}

async function executeResetIdentity() {
  const btn = $('#reset-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('resetting'); }

  const r = await api('/settings/reset-identity', {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });

  if (btn) { btn.disabled = false; btn.textContent = t('delete_everything'); }

  if (r.success) {
    toast(t('reset_success'), 'ok');
    hideModal('modal-reset-identity');
    // Reload settings to reflect cleared state
    setTimeout(() => loadSettings(), 1000);
  } else {
    toast(r.message || r.error || t('reset_failed'), 'err');
  }
}

// ── Export / Import ──
async function exportSettings() {
  const r = await api('/settings/export');
  if (r.error) { toast(r.error, 'err'); return; }

  const json = JSON.stringify(r.settings || r, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aicq-settings-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast(t('exported_success'), 'ok');
}

function showImportSettingsModal() {
  $('#import-json-input').value = '';
  showModal('modal-import-settings');
  setTimeout(() => $('#import-json-input')?.focus(), 100);
}

async function executeImportSettings() {
  const raw = $('#import-json-input')?.value?.trim();
  if (!raw) { toast(t('paste_json'), 'warn'); return; }

  let settings;
  try { settings = JSON.parse(raw); } catch (e) { toast(t('invalid_json') + e.message, 'err'); return; }

  const btn = $('#import-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('importing'); }

  const r = await api('/settings/import', {
    method: 'POST',
    body: JSON.stringify({ settings, merge: true }),
  });

  if (btn) { btn.disabled = false; btn.textContent = t('import_settings'); }

  if (r.success) {
    toast(t('imported_success'), 'ok');
    hideModal('modal-import-settings');
    setTimeout(() => loadSettings(), 800);
  } else {
    toast(r.message || r.error || t('import_failed'), 'err');
  }
}

// ════════════════════════════════════════════════════════════
// JSON Config Editor
// ════════════════════════════════════════════════════════════
let _jsonEditorConfigFile = '';

async function renderSettingsJsonEditor() {
  const el = $('#settings-content');
  html(el, '<div class="loading-mask"><div class="spinner"></div>' + t('loading_config') + '</div>');

  const queryParams = _jsonEditorConfigFile ? '?file=' + encodeURIComponent(_jsonEditorConfigFile) : '';
  const data = await api('/config-file/raw' + queryParams);
  if (data.error) {
    html(el, '<div class="empty"><div class="icon">⚠️</div><p>' + escHtml(data.error) + '</p></div>');
    return;
  }

  _jsonEditorConfigFile = data.fileName || '';
  const hasMultipleFiles = data.availableFiles && data.availableFiles.length > 1;
  let fileSelectorHtml = '';
  if (hasMultipleFiles) {
    const options = data.availableFiles.map(f =>
      '<option value="' + escHtml(f) + '"' + (f === data.fileName ? ' selected' : '') + '>' + escHtml(f) + '</option>'
    ).join('');
    fileSelectorHtml = \\\`
      <div class="form-group" style="margin-bottom:16px">
        <label>📄 Config File</label>
        <select id="json-editor-file-select" onchange="_jsonEditorConfigFile=this.value;renderSettingsJsonEditor()" style="max-width:300px">
          \${options}
        </select>
      </div>\\\`;
  }

  html(el, \\\`\
    <p class="section-desc">
      Edit the raw JSON configuration directly. Be careful with syntax — invalid JSON will be rejected.
      <span class="badge badge-accent" style="margin-left:8px">📄 \${escHtml(data.fileName)}</span>
    </p>

    <div class="card">
      <div class="card-header">
        <div class="card-title">\${t('json_editor')}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="mono" style="font-size:11px;color:var(--text3)">\${escHtml(data.filePath)}</span>
          <button class="btn btn-sm btn-default" onclick="renderSettingsJsonEditor()">🔄 Reload</button>
        </div>
      </div>
      \${fileSelectorHtml}
      <div class="form-group">
        <label>\${t('raw_json')}</label>
        <textarea id="json-editor" style="min-height:400px;font-family:'SF Mono','Fira Code','Cascadia Code',monospace;font-size:12px;line-height:1.5;tab-size:2;background:var(--bg)" spellcheck="false">\${escHtml(data.content)}</textarea>
        <div class="hint">\${t('raw_json_hint')}</div>
      </div>
      <div id="json-editor-status" style="margin-bottom:12px;font-size:12px"></div>
      <div class="form-actions" style="justify-content:space-between">
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-default" onclick="formatJsonEditor()">\${t('format')}</button>
          <button class="btn btn-sm btn-default" onclick="copyText($('#json-editor')?.value || '')">\${t('copy')}</button>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-default" onclick="renderSettingsJsonEditor()">\${t('revert')}</button>
          <button class="btn btn-sm btn-primary" id="btn-save-json" onclick="saveJsonConfig()">\${t('save_config')}</button>
        </div>
      </div>
    </div>
  \`);
}

function formatJsonEditor() {
  const ta = $('#json-editor');
  if (!ta) return;
  try {
    const obj = JSON.parse(ta.value);
    ta.value = JSON.stringify(obj, null, 2);
    toast(t('json_formatted'), 'ok');
    $('#json-editor-status').innerHTML = '<span style="color:var(--ok)">' + t('valid_json') + '</span>';
  } catch (e) {
    toast(t('invalid_json') + e.message, 'err');
    $('#json-editor-status').innerHTML = '<span style="color:var(--danger)">✗ ' + escHtml(e.message) + '</span>';
  }
}

async function saveJsonConfig() {
  const btn = $('#btn-save-json');
  const statusEl = $('#json-editor-status');
  const raw = $('#json-editor')?.value;
  if (!raw) { toast(t('no_content'), 'warn'); return; }

  // Validate first
  try { JSON.parse(raw); } catch (e) {
    toast(t('invalid_json') + e.message, 'err');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--danger)">✗ ' + escHtml(e.message) + '</span>';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = t('saving'); }
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text3)"><span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></span> ' + t('saving') + '</span>';

  const queryParams = _jsonEditorConfigFile ? '?file=' + encodeURIComponent(_jsonEditorConfigFile) : '';
  const r = await api('/config-file/raw' + queryParams, { method: 'PUT', body: JSON.stringify({ content: raw }) });

  if (btn) { btn.disabled = false; btn.textContent = t('save_config'); }

  if (r.success) {
    toast(t('config_saved'), 'ok');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--ok)">✓ Saved at ' + new Date().toLocaleTimeString() + '</span>';
  } else {
    toast(r.message || t('failed_save'), 'err');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--danger)">✗ ' + escHtml(r.message || t('failed')) + '</span>';
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
    updateOnlineStatus();
    if (currentPage === 'dashboard') loadDashboard();
    // Update status dot
    api('/status').then(s => {
      if (!s.error) {
        const dot = $('#header-dot');
        if (dot) { dot.className = 'dot ' + (s.connected ? 'dot-ok' : 'dot-err'); }
        const txt = $('#header-status');
        if (txt) txt.textContent = s.connected ? t('connected') : t('disconnected');
        // Auto-remove offline banner when server reconnects
        if (s.connected) hideOfflineBanner();
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
      <div class="page" id="page-settings">
        <div id="settings-tabs" style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap"></div>
        <div id="settings-content"></div>
      </div>

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
    <div id="model-multi-list" style="display:none;margin-top:12px"></div>
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

<!-- Modal: Reset Identity -->
<div class="modal-overlay hidden" id="modal-reset-identity" onclick="if(event.target===this)hideModal('modal-reset-identity')">
  <div class="modal">
    <div class="modal-header"><h3>🗑️ Reset Agent Identity</h3><button class="modal-close" onclick="hideModal('modal-reset-identity')">✕</button></div>
    <div style="margin-bottom:16px">
      <div class="card" style="border-color:var(--danger);background:var(--danger-bg)">
        <p style="font-size:13px;color:#991b1b;line-height:1.6">
          <strong>⚠️ WARNING: This is a destructive operation!</strong><br><br>
          This will permanently delete:<br>
          • Your Ed25519 key pair and agent ID<br>
          • All friend connections and sessions<br>
          • All pending friend requests<br>
          • All temporary numbers<br><br>
          After reset, you must restart the plugin to generate a new identity.
        </p>
      </div>
    </div>
    <div class="form-group">
      <label>Type RESET to confirm</label>
      <input id="reset-confirm-input" type="text" placeholder="RESET" oninput="checkResetConfirm()" autocomplete="off" style="border-color:var(--danger)">
    </div>
    <div class="form-actions">
      <button class="btn btn-default" onclick="hideModal('modal-reset-identity')">Cancel</button>
      <button class="btn btn-danger" id="reset-confirm-btn" onclick="executeResetIdentity()" disabled>🗑️ Delete Everything</button>
    </div>
  </div>
</div>

<!-- Modal: Import Settings -->
<div class="modal-overlay hidden" id="modal-import-settings" onclick="if(event.target===this)hideModal('modal-import-settings')">
  <div class="modal" style="max-width:580px">
    <div class="modal-header"><h3>📤 Import Settings</h3><button class="modal-close" onclick="hideModal('modal-import-settings')">✕</button></div>
    <div class="form-group">
      <label>Paste JSON Settings</label>
      <textarea id="import-json-input" rows="10" placeholder='{"serverUrl": "https://...", "maxFriends": 200, ...}' style="font-family:'SF Mono','Fira Code','Cascadia Code',monospace;font-size:12px;line-height:1.5"></textarea>
      <div class="hint">Paste the JSON settings exported from another AICQ instance. Settings will be merged with existing values.</div>
    </div>
    <div class="form-actions">
      <button class="btn btn-default" onclick="hideModal('modal-import-settings')">Cancel</button>
      <button class="btn btn-primary" id="import-confirm-btn" onclick="executeImportSettings()">📤 Import</button>
    </div>
  </div>
</div>

<!-- Toast Container -->
<div id="toast-container" class="toast-container"></div>

<!-- Modal: Add/Edit Agent -->
<div class="modal-overlay hidden" id="modal-add-agent" onclick="if(event.target===this)hideModal('modal-add-agent')">
  <div class="modal">
    <div class="modal-header"><h3 id="agent-form-title">➕ Add Agent</h3><button class="modal-close" onclick="hideModal('modal-add-agent')">✕</button></div>
    <div class="form-group">
      <label>Agent Name *</label>
      <input type="text" id="agent-form-name" placeholder="e.g. My Assistant">
    </div>
    <div class="form-group">
      <label>Agent ID</label>
      <input type="text" id="agent-form-id" placeholder="auto-generated if empty">
      <div class="hint">Unique identifier. Leave empty for auto-generation.</div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Model</label>
        <input type="text" id="agent-form-model" placeholder="gpt-4o">
      </div>
      <div class="form-group">
        <label>Provider</label>
        <input type="text" id="agent-form-provider" placeholder="openai">
      </div>
    </div>
    <div class="form-group">
      <label>System Prompt</label>
      <textarea id="agent-form-prompt" rows="4" placeholder="You are a helpful assistant..."></textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Temperature</label>
        <input type="number" id="agent-form-temperature" min="0" max="2" step="0.1" value="0.7">
        <div class="hint">0 = deterministic, 2 = creative. Default: 0.7</div>
      </div>
      <div class="form-group">
        <label>Max Tokens</label>
        <input type="number" id="agent-form-max-tokens" min="1" step="1" value="4096">
        <div class="hint">Maximum response length. Default: 4096</div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Top P</label>
        <input type="number" id="agent-form-top-p" min="0" max="1" step="0.05" value="1">
        <div class="hint">Nucleus sampling. Default: 1</div>
      </div>
      <div class="form-group">
        <label>Tools</label>
        <input type="text" id="agent-form-tools" placeholder="web_search, code_exec, ...">
        <div class="hint">Comma-separated list of tool names</div>
      </div>
    </div>
    <div class="form-group">
      <label class="toggle-label">
        <input type="checkbox" id="agent-form-enabled" checked>
        <span class="toggle-slider"></span>
        <span>Enabled</span>
      </label>
    </div>
    <div class="form-actions">
      <button class="btn btn-default" onclick="hideModal('modal-add-agent')">Cancel</button>
      <button class="btn btn-primary" onclick="saveAgent()">💾 Save Agent</button>
    </div>
  </div>
</div>

<script>${JS}</script>
</body>
</html>`;

export function getManagementHTML(): string {
  return HTML;
}
