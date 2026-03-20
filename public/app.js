/* ── Constants ── */
const TASKS_API       = '/api/tasks';
const AGENTS_API      = '/api/agents';
const MESSAGES_API    = '/api/messages';
const ROOMS_API       = '/api/rooms';
const ENG_TASKS_API   = '/api/eng-tasks';
const DEPTS_API       = '/api/departments';
const PROJECTS_API    = '/api/projects';
const EVENTS_URL      = '/api/events';

/* ── Auth ── */
let API_TOKEN = '';  // loaded from /api/config on init

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (API_TOKEN) h['Authorization'] = `Bearer ${API_TOKEN}`;
  return h;
}

function authedFetch(url, opts = {}) {
  if (API_TOKEN) {
    opts.headers = { ...(opts.headers || {}), 'Authorization': `Bearer ${API_TOKEN}` };
  }
  return fetch(url, opts);
}

/* ── State ── */
let activeDept      = 'engineering';
let activeSection   = 'dashboard';
let activeFilter    = 'all';
let activeProjFilter = 'all';
let activeAgentDeptFilter = 'all';
let allTasks        = [];
let allAgents       = [];
let allMessages     = [];
let allRooms        = [];
let allEngTasks     = [];
let allDepts        = [];
let allProjects     = [];
let unreadMessages  = 0;
let eventSource     = null;
let activityLog     = []; // { text, status, time }
let agentActivityLog = []; // { agentName, action, time, isoTime }
let activeRoomId    = null;
let roomMessages    = {}; // roomId -> array of messages

/* ── Theme ── */
(function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
})();

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '◑' : '◐';
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
});

/* ── Agent color config ── */
const AGENT_COLORS = {
  abdulrahman: { accent: '#f59e0b', accentBg: 'rgba(245,158,11,0.10)', accentBorder: 'rgba(245,158,11,0.28)', initial: 'A' },
  v:           { accent: '#00f0ff', accentBg: 'rgba(0,240,255,0.08)',   accentBorder: 'rgba(0,240,255,0.25)',  initial: 'V' },
  aurore:      { accent: '#b84fff', accentBg: 'rgba(184,79,255,0.10)',  accentBorder: 'rgba(184,79,255,0.25)', initial: 'Au' },
  judy:        { accent: '#ff4fa0', accentBg: 'rgba(255,79,160,0.10)',  accentBorder: 'rgba(255,79,160,0.25)', initial: 'J' },
  rex:         { accent: '#ff6b2b', accentBg: 'rgba(255,107,43,0.10)',  accentBorder: 'rgba(255,107,43,0.25)', initial: 'R' },
  pixel:       { accent: '#4fa8ff', accentBg: 'rgba(79,168,255,0.10)',  accentBorder: 'rgba(79,168,255,0.25)', initial: 'Px' },
  ghost:       { accent: '#8892a4', accentBg: 'rgba(136,146,164,0.10)', accentBorder: 'rgba(136,146,164,0.25)', initial: 'Gh' },
  zara:        { accent: '#00e676', accentBg: 'rgba(0,230,118,0.08)',   accentBorder: 'rgba(0,230,118,0.25)',  initial: 'Z' },
  mia:         { accent: '#ff6b8a', accentBg: 'rgba(255,107,138,0.10)', accentBorder: 'rgba(255,107,138,0.25)', initial: 'Mi' },
  nova:        { accent: '#ffe566', accentBg: 'rgba(255,229,102,0.10)', accentBorder: 'rgba(255,229,102,0.25)', initial: 'N' }
};

function getAgentColor(name) {
  if (!name) return null;
  return AGENT_COLORS[name.trim().toLowerCase()] || null;
}

function applyAgentColorVars(el, name) {
  const c = getAgentColor(name);
  if (c) {
    el.style.setProperty('--agent-accent', c.accent);
    el.style.setProperty('--agent-accent-bg', c.accentBg);
    el.style.setProperty('--agent-accent-border', c.accentBorder);
  }
}

function getAgentInitial(name) {
  const c = getAgentColor(name);
  return c ? c.initial : (name || '?').charAt(0).toUpperCase();
}

/* ── Get avatar URL for agent by name ── */
function getAgentAvatarUrl(name) {
  if (!name) return null;
  const agent = allAgents.find(a => a.name.toLowerCase() === name.trim().toLowerCase());
  return agent ? agent.avatar_url : null;
}

/* ── Build avatar element (img or initials circle) ── */
function buildAvatarEl(name, sizeClass) {
  const avatarUrl = getAgentAvatarUrl(name);
  const el = document.createElement('div');
  el.className = `chat-msg-avatar ${sizeClass || ''}`;
  applyAgentColorVars(el, name);

  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = name;
    img.className = 'avatar-img';
    img.onerror = () => {
      img.remove();
      el.textContent = getAgentInitial(name);
    };
    el.appendChild(img);
  } else {
    el.textContent = getAgentInitial(name);
  }
  return el;
}

/* ── Helpers ── */
function assigneeBadgeClass(assignee) {
  if (!assignee) return 'badge-tbd';
  const a = assignee.trim().toLowerCase();
  const known = ['aurore','judy','v','abdulrahman','rex','pixel','ghost','zara','mia','nova'];
  if (a === 'tbd') return 'badge-tbd';
  if (known.includes(a)) return `badge-${a}`;
  return 'badge-other';
}

function statusLabel(status) {
  return { pending: 'Pending', in_progress: 'In Progress', done: 'Done' }[status] || status;
}

function engStatusLabel(status) {
  return { backlog: 'Backlog', in_progress: 'In Progress', review: 'In Review', done: 'Done' }[status] || status;
}

/* ── Force UTC parse for naive DB timestamp strings ── */
function forceUTC(dt) {
  if (!dt) return dt;
  if (typeof dt === 'string' && !dt.endsWith('Z') && !dt.includes('+') && !dt.includes('-', 10)) {
    // Naive string like "2026-03-19 15:55:57" — no tz suffix; replace space with T and append Z
    return dt.replace(' ', 'T') + 'Z';
  }
  return dt;
}

/* ── UTC+3 (Kuwait) offset helper ── */
function toUTC3(dt) {
  if (!dt) return null;
  const d = new Date(forceUTC(dt));
  // Shift by +3 hours: add 3 * 60 * 60 * 1000 ms
  return new Date(d.getTime() + 3 * 60 * 60 * 1000);
}

function formatDate(dt) {
  if (!dt) return '—';
  const d = toUTC3(dt);
  // Format using UTC methods so the +3 shift is rendered as-is
  const day   = String(d.getUTCDate()).padStart(2, '0');
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  const year  = d.getUTCFullYear();
  const hh    = String(d.getUTCHours()).padStart(2, '0');
  const mm    = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

function formatTime(dt) {
  if (!dt) return '';
  const d = toUTC3(dt);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function timeAgo(dt) {
  if (!dt) return '';
  const diff = Date.now() - new Date(forceUTC(dt)).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function isRecentlyActive(last_active) {
  if (!last_active) return false;
  return (Date.now() - new Date(forceUTC(last_active)).getTime()) < 5 * 60 * 1000;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Department color config ── */
const DEPT_COLORS = {
  engineering: '#a855f7',
  design:      '#ec4899',
  commerce:    '#f59e0b',
  analytics:   '#eab308',
  operations:  '#6b7280',
  executive:   '#06b6d4'
};

/* ── Department switching ── */
function switchDept(dept) {
  activeDept = dept;

  // Update dept tab active state
  document.querySelectorAll('.dept-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.dept === dept);
  });

  // Apply dept color accent to sidebar label
  const labelEl = document.getElementById('sidebar-dept-label');
  if (labelEl) {
    labelEl.textContent = dept.charAt(0).toUpperCase() + dept.slice(1);
    labelEl.style.color = DEPT_COLORS[dept] || 'var(--text-dim)';
  }

  // Show correct sidebar nav
  document.querySelectorAll('.dept-nav').forEach(nav => nav.classList.add('hidden'));
  const navEl = document.getElementById(`nav-${dept}`);
  if (navEl) navEl.classList.remove('hidden');

  // Switch to default section for that dept
  const deptDefaults = {
    engineering: 'dashboard',
    operations:  'projects',
    design:      'design-assets',
    commerce:    'commerce-products',
    analytics:   'analytics-kpis',
    executive:   'exec-overview'
  };
  switchSection(deptDefaults[dept] || dept);
}

window.switchDept = switchDept;

/* ── Section navigation ── */
function switchSection(section) {
  activeSection = section;

  // Update active nav item in current dept nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });

  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.remove('hidden');

  if (section === 'dashboard')   renderDashboard();
  if (section === 'tasks')       renderBoard(filterTasks(allTasks, activeFilter));
  if (section === 'agents')      renderAgents();
  if (section === 'org')         buildOrgTree(allAgents);
  if (section === 'meeting') {
    unreadMessages = 0;
    updateMsgBadge();
    renderRoomList();
  }
  if (section === 'eng-tasks')   renderEngBoard();
  if (section === 'projects')    renderProjects();

  closeSidebar();
}

window.switchSection = switchSection;

/* ── Mobile sidebar ── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('visible', isOpen);
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('visible');
}

window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;

/* ── Dashboard clock ── */
function updateClock() {
  const el = document.getElementById('dashboard-time');
  if (el) {
    const now = new Date();
    // Display in UTC+3 (Kuwait time)
    const utc3 = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const hh = String(utc3.getUTCHours()).padStart(2, '0');
    const mm = String(utc3.getUTCMinutes()).padStart(2, '0');
    const ss = String(utc3.getUTCSeconds()).padStart(2, '0');
    el.textContent = `${hh}:${mm}:${ss}`;
  }
}

setInterval(updateClock, 1000);
updateClock();

/* ── Dashboard rendering ── */
function renderDashboard() {
  const active = allAgents.filter(a => a.status === 'active').length;
  const pending = allTasks.filter(t => t.status === 'pending').length;
  const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
  const done = allTasks.filter(t => t.status === 'done').length;

  const el = id => document.getElementById(id);
  el('stat-active-agents').textContent = active;
  el('stat-pending').textContent = pending;
  el('stat-inprogress').textContent = inProgress;
  el('stat-done').textContent = done;

  renderWhosWorking();
  renderActivityFeed();
  renderAgentActivityFeed();
}

function renderWhosWorking() {
  const container = document.getElementById('whos-working');
  const activeAgents = allAgents.filter(a => a.status === 'active');

  if (!activeAgents.length) {
    container.innerHTML = '<div class="empty-state">// NO ACTIVE AGENTS //</div>';
    return;
  }

  container.innerHTML = '';
  for (const agent of activeAgents) {
    const live = isRecentlyActive(agent.last_active);
    const item = document.createElement('div');
    item.className = 'working-item';
    applyAgentColorVars(item, agent.name);

    const avatarUrl = agent.avatar_url;
    const initial = getAgentInitial(agent.name);
    const activity = agent.current_activity || 'Standby';

    let avatarHtml;
    if (avatarUrl) {
      avatarHtml = `<div class="working-avatar"><img src="${escHtml(avatarUrl)}" alt="${escHtml(agent.name)}" class="avatar-img" onerror="this.parentElement.textContent='${escHtml(initial)}'"/></div>`;
    } else {
      avatarHtml = `<div class="working-avatar">${escHtml(initial)}</div>`;
    }

    item.innerHTML = `
      ${avatarHtml}
      <div class="working-info">
        <div class="working-name">
          ${escHtml(agent.name)}
          <span class="activity-dot ${live ? 'live' : ''}"></span>
        </div>
        <div class="working-activity">${escHtml(activity)}</div>
      </div>
    `;
    container.appendChild(item);
  }
}

function renderActivityFeed() {
  const container = document.getElementById('activity-feed');

  if (!activityLog.length) {
    container.innerHTML = '<div class="empty-state">// NO ACTIVITY //</div>';
    return;
  }

  container.innerHTML = '';
  const recent = activityLog.slice(-20).reverse();
  for (const entry of recent) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
      <div class="feed-dot feed-dot-${entry.status || 'in_progress'}"></div>
      <div class="feed-body">
        <div class="feed-text">${entry.text}</div>
        <div class="feed-time">${entry.time}</div>
      </div>
    `;
    container.appendChild(item);
  }
}

function logActivity(text, status) {
  activityLog.push({ text, status: status || 'in_progress', time: timeAgo(new Date().toISOString()) });
  if (activityLog.length > 50) activityLog.shift();
  if (activeSection === 'dashboard') renderActivityFeed();
}

function logAgentActivity(agentName, action) {
  const isoTime = new Date().toISOString();
  agentActivityLog.push({ agentName, action, time: formatTime(isoTime), isoTime });
  if (agentActivityLog.length > 100) agentActivityLog.shift();
  if (activeSection === 'dashboard') renderAgentActivityFeed();
}

function renderAgentActivityFeed() {
  const container = document.getElementById('agent-activity-feed');
  if (!container) return;

  if (!agentActivityLog.length) {
    container.innerHTML = '<div class="empty-state">// NO AGENT ACTIVITY //</div>';
    return;
  }

  container.innerHTML = '';
  const recent = agentActivityLog.slice(-50).reverse();
  for (const entry of recent) {
    const item = document.createElement('div');
    item.className = 'agent-feed-item';
    applyAgentColorVars(item, entry.agentName);

    const c = getAgentColor(entry.agentName);
    const accent = c ? c.accent : 'var(--text-dim)';

    const avatarEl = buildAvatarEl(entry.agentName, 'agent-feed-avatar');

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'agent-feed-body';
    bodyDiv.innerHTML = `
      <div class="agent-feed-line">
        <span class="agent-feed-name" style="color:${accent}">${escHtml(entry.agentName)}</span>
        <span class="agent-feed-action">${escHtml(entry.action)}</span>
      </div>
      <div class="agent-feed-time">${entry.time}</div>
    `;

    item.appendChild(avatarEl);
    item.appendChild(bodyDiv);
    container.appendChild(item);
  }
}

/* ── Task filter ── */
function filterTasks(tasks, filter) {
  if (filter === 'my') return tasks.filter(t => t.assigned_to && t.assigned_to.trim().toLowerCase() === 'abdulrahman');
  if (filter === 'crew') return tasks.filter(t => { if (!t.assigned_to) return true; return t.assigned_to.trim().toLowerCase() !== 'abdulrahman'; });
  return tasks;
}

function setTaskFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderBoard(filterTasks(allTasks, filter));
}

window.setTaskFilter = setTaskFilter;

/* ── Kanban board ── */
function renderBoard(tasks) {
  const groups = { pending: [], in_progress: [], done: [] };
  for (const t of tasks) {
    if (groups[t.status]) groups[t.status].push(t);
  }

  for (const status of ['pending', 'in_progress', 'done']) {
    const list  = document.getElementById(`list-${status}`);
    const count = document.getElementById(`count-${status}`);
    list.innerHTML = '';
    count.textContent = groups[status].length;

    if (groups[status].length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '// NO TASKS //';
      list.appendChild(empty);
    } else {
      for (const task of groups[status]) {
        list.appendChild(buildCard(task));
      }
    }
  }
}

/* ── Task Card ── */
function buildCard(task) {
  const div = document.createElement('div');
  div.className = 'card';
  div.setAttribute('data-id', task.id);

  const badgeClass = assigneeBadgeClass(task.assigned_to);
  const assigneeLabel = task.assigned_to || 'TBD';

  div.innerHTML = `
    <div class="card-top">
      <span class="card-title">${escHtml(task.title)}</span>
      <span class="badge ${badgeClass}">${escHtml(assigneeLabel)}</span>
    </div>
    <div class="card-desc">${escHtml(task.description || '')}</div>
    <div class="card-footer">
      <span class="status-badge status-${task.status}">${statusLabel(task.status)}</span>
      <span class="card-time">${timeAgo(task.updated_at)}</span>
    </div>
  `;
  div.addEventListener('click', () => openModal(task));
  return div;
}

/* ── Task detail slide-over ── */
function openModal(task) {
  const badgeClass = assigneeBadgeClass(task.assigned_to);
  const assigneeLabel = task.assigned_to || 'TBD';

  const bodyHtml = `
    <div class="slideover-meta">
      <span class="badge ${badgeClass}">${escHtml(assigneeLabel)}</span>
      <span class="status-badge status-${task.status}">${statusLabel(task.status)}</span>
    </div>
    ${task.description ? `
      <div class="slideover-section">
        <div class="slideover-label">Description</div>
        <div class="slideover-desc">${escHtml(task.description)}</div>
      </div>
    ` : `<div class="slideover-desc" style="color:var(--text-dim);font-style:italic">No description provided.</div>`}
    <div class="slideover-times">
      <span>Created: ${formatDate(task.created_at)}</span>
      <span>Updated: ${formatDate(task.updated_at)}</span>
      <span>ID: #${task.id}</span>
    </div>
  `;
  openSlideover(task.title, bodyHtml);
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
// Escape key handled by unified listener below (closes both modal and slideover)

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

/* ── Slide-over panel ── */
function openSlideover(titleText, bodyHtml) {
  const overlay = document.getElementById('slideover-overlay');
  const panel = document.getElementById('slideover');
  const title = document.getElementById('slideover-title');
  const body = document.getElementById('slideover-body');

  title.textContent = titleText;
  body.innerHTML = bodyHtml;
  overlay.classList.add('visible');
  panel.classList.add('open');

  // Prevent body scroll on mobile when slideover is open
  document.body.style.overflow = 'hidden';
}

function closeSlideover() {
  const overlay = document.getElementById('slideover-overlay');
  const panel = document.getElementById('slideover');
  overlay.classList.remove('visible');
  panel.classList.remove('open');
  document.body.style.overflow = '';
}

window.closeSlideover = closeSlideover;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSlideover();
    closeModal();
  }
});

/* ── Skeleton builders ── */
function buildKanbanSkeleton(cols) {
  return cols.map(() => `
    <div class="kanban-col">
      <div class="col-header">
        <span class="col-dot skeleton" style="border-radius:50%;display:inline-block"></span>
        <span class="skeleton skeleton-line" style="width:80px"></span>
        <span class="skeleton skeleton-badge" style="margin-left:auto;width:24px"></span>
      </div>
      <div class="card-list">
        ${[1,2,3].map(() => `
          <div class="skeleton-card">
            <div class="skeleton skeleton-line-lg skeleton-w-3-4"></div>
            <div class="skeleton skeleton-line skeleton-w-full"></div>
            <div class="skeleton skeleton-line-sm skeleton-w-1-2"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function buildAgentsSkeleton() {
  return [1,2,3,4,5,6].map(() => `
    <div class="skeleton-card agent-card">
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <div class="skeleton skeleton-avatar"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;padding-top:4px">
          <div class="skeleton skeleton-line-lg skeleton-w-1-2"></div>
          <div class="skeleton skeleton-line-sm skeleton-w-1-3"></div>
          <div class="skeleton skeleton-line-sm skeleton-w-3-4"></div>
        </div>
        <div class="skeleton skeleton-badge"></div>
      </div>
      <div class="skeleton skeleton-line-sm skeleton-w-full" style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px"></div>
    </div>
  `).join('');
}

function buildDashboardSkeleton() {
  return `
    <div class="stat-grid">
      ${[1,2,3,4].map(() => `
        <div class="stat-card skeleton-card">
          <div class="skeleton skeleton-line-lg skeleton-w-1-2" style="margin-bottom:8px"></div>
          <div class="skeleton skeleton-line-sm skeleton-w-3-4"></div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ── Agent Profile Modal ── */
function openAgentProfile(agent) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  const c = getAgentColor(agent.name);
  const initial = getAgentInitial(agent.name);
  const accent = c ? c.accent : 'var(--text-dim)';
  const accentBg = c ? c.accentBg : 'var(--bg-column)';
  const accentBorder = c ? c.accentBorder : 'var(--border)';
  const reportsTo = agent.reports_to || '—';
  const taskCount = agent.active_task_count || 0;
  const model = agent.model || 'claude-sonnet-4-6';
  const isActive = agent.status === 'active';

  const activeTasks = allTasks.filter(t =>
    t.assigned_to && t.assigned_to.trim().toLowerCase() === agent.name.trim().toLowerCase() && t.status !== 'done'
  );

  const taskListHtml = activeTasks.length
    ? activeTasks.map(t => `
        <div class="profile-task-item">
          <span class="profile-task-dot status-dot-${t.status}"></span>
          <span class="profile-task-title">${escHtml(t.title)}</span>
          <span class="status-badge status-${t.status}">${statusLabel(t.status)}</span>
        </div>
      `).join('')
    : '<div class="profile-empty">// NO ACTIVE TASKS //</div>';

  const avatarHtml = agent.avatar_url
    ? `<img src="${escHtml(agent.avatar_url)}" alt="${escHtml(agent.name)}" class="avatar-img" onerror="this.parentElement.innerHTML='${escHtml(initial)}'"/>`
    : escHtml(initial);

  content.innerHTML = `
    <div class="profile-modal" style="--agent-accent:${accent};--agent-accent-bg:${accentBg};--agent-accent-border:${accentBorder}">
      <div class="profile-header">
        <div class="profile-avatar">${avatarHtml}</div>
        <div class="profile-header-info">
          <div class="profile-name">${escHtml(agent.name)}</div>
          <div class="profile-designation">${escHtml(agent.designation)}</div>
          <div class="profile-badges">
            <span class="badge badge-${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
            <span class="profile-model-badge">${escHtml(model)}</span>
          </div>
        </div>
      </div>
      ${agent.tagline ? `<div class="profile-tagline">"${escHtml(agent.tagline)}"</div>` : ''}
      ${agent.bio ? `
        <div class="profile-section">
          <div class="profile-section-label">Bio</div>
          <div class="profile-section-body">${escHtml(agent.bio)}</div>
        </div>
      ` : ''}
      ${agent.philosophy ? `
        <div class="profile-section">
          <div class="profile-section-label">Philosophy</div>
          <div class="profile-section-body profile-philosophy">${escHtml(agent.philosophy)}</div>
        </div>
      ` : ''}
      ${(agent.demands || agent.hates) ? `
        <div class="profile-two-col">
          ${agent.demands ? `
            <div class="profile-col">
              <div class="profile-section-label profile-label-green">Demands</div>
              <div class="profile-section-body">${escHtml(agent.demands)}</div>
            </div>
          ` : ''}
          ${agent.hates ? `
            <div class="profile-col">
              <div class="profile-section-label profile-label-red">Hates</div>
              <div class="profile-section-body">${escHtml(agent.hates)}</div>
            </div>
          ` : ''}
        </div>
      ` : ''}
      <div class="profile-section">
        <div class="profile-section-label">Active Tasks <span class="profile-task-count">${taskCount}</span></div>
        <div class="profile-task-list">${taskListHtml}</div>
      </div>
      <div class="profile-footer">
        <span>Reports to: <strong>${escHtml(reportsTo)}</strong></span>
      </div>
    </div>
  `;

  overlay.classList.remove('hidden');
}

/* ── Agents view ── */
const VALID_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

function renderAgents() {
  buildAgentDeptFilterBtns();

  const grid = document.getElementById('agents-grid');
  grid.innerHTML = '';

  if (!allAgents.length) {
    grid.innerHTML = '<div class="empty-state">// NO AGENTS //</div>';
    return;
  }

  let agents = allAgents;
  if (activeAgentDeptFilter !== 'all') {
    agents = agents.filter(a => {
      const dept = allDepts.find(d => d.id === a.department_id);
      return dept && dept.name === activeAgentDeptFilter;
    });
  }

  if (!agents.length) {
    grid.innerHTML = '<div class="empty-state">// NO AGENTS IN THIS DEPARTMENT //</div>';
    return;
  }

  for (const agent of agents) {
    const card = document.createElement('div');
    card.className = 'agent-card agent-card-clickable';
    applyAgentColorVars(card, agent.name);

    const initial = getAgentInitial(agent.name);
    const reportsTo = agent.reports_to || '—';
    const isActive = agent.status === 'active';
    const taskCount = agent.active_task_count || 0;
    const live = isRecentlyActive(agent.last_active);
    const activity = agent.current_activity;
    const model = agent.model || 'claude-sonnet-4-6';

    const modelOptions = VALID_MODELS.map(m =>
      `<option value="${m}" ${m === model ? 'selected' : ''}>${m}</option>`
    ).join('');

    const avatarInnerHtml = agent.avatar_url
      ? `<img src="${escHtml(agent.avatar_url)}" alt="${escHtml(agent.name)}" class="avatar-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><span class="avatar-fallback" style="display:none">${escHtml(initial)}</span>`
      : escHtml(initial);

    const dept = allDepts.find(d => d.id === agent.department_id);
    const deptBadge = dept
      ? `<span class="agent-dept-badge" style="background:${dept.color}22;color:${dept.color};border-color:${dept.color}44">${escHtml(dept.name)}</span>`
      : '';

    card.innerHTML = `
      <div class="agent-card-top">
        <div class="agent-avatar">
          ${avatarInnerHtml}
          ${live ? '<div class="agent-live-ring"></div>' : ''}
        </div>
        <div class="agent-info">
          <div class="agent-name">${escHtml(agent.name)}</div>
          <div class="agent-designation">${escHtml(agent.designation)}</div>
          ${agent.tagline
            ? `<div class="agent-tagline-preview">${escHtml(agent.tagline)}</div>`
            : (activity
              ? `<div class="agent-activity-line has-activity">${escHtml(activity)}</div>`
              : `<div class="agent-activity-line">Standby</div>`)}
        </div>
        <span class="badge badge-${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="agent-meta">
        <div class="agent-reports">Reports to: <strong>${escHtml(reportsTo)}</strong></div>
        <div class="agent-tasks-count ${taskCount > 0 ? 'has-tasks' : ''}">${taskCount} active task${taskCount !== 1 ? 's' : ''}</div>
      </div>
      ${deptBadge ? `<div class="agent-dept-row">${deptBadge}</div>` : ''}
      <div class="agent-model-row" onclick="event.stopPropagation()">
        <span class="model-label">Model</span>
        <select class="model-select" data-agent-id="${agent.id}" onchange="updateAgentModel(${agent.id}, this.value, this)">
          ${modelOptions}
        </select>
        <span class="model-saved-flash" id="model-flash-${agent.id}">saved</span>
      </div>
    `;
    card.addEventListener('click', () => openAgentProfile(agent));
    grid.appendChild(card);
  }
}

/* ── Agent dept filter ── */
function setAgentDeptFilter(deptFilter) {
  activeAgentDeptFilter = deptFilter;
  document.querySelectorAll('[data-dept-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.deptFilter === deptFilter);
  });
  renderAgents();
}

window.setAgentDeptFilter = setAgentDeptFilter;

/* ── Build dynamic dept filter buttons for HR Roster ── */
function buildAgentDeptFilterBtns() {
  const container = document.getElementById('agent-dept-filter-btns');
  if (!container) return;
  container.innerHTML = `<button class="filter-btn ${activeAgentDeptFilter === 'all' ? 'active' : ''}" data-dept-filter="all" onclick="setAgentDeptFilter('all')">All</button>`;
  const deptNames = [...new Set(allAgents.map(a => a.department_name || a.department_id).filter(Boolean))];
  for (const name of deptNames) {
    const label = typeof name === 'string' ? name : name;
    const active = activeAgentDeptFilter === label ? 'active' : '';
    container.innerHTML += `<button class="filter-btn ${active}" data-dept-filter="${escHtml(label)}" onclick="setAgentDeptFilter('${escHtml(label)}')">${escHtml(label)}</button>`;
  }
}

async function updateAgentModel(agentId, model, selectEl) {
  try {
    const res = await authedFetch(`${AGENTS_API}/${agentId}/model`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    if (!res.ok) throw new Error('Failed to update model');

    const agent = allAgents.find(a => a.id === agentId);
    if (agent) agent.model = model;

    const flash = document.getElementById(`model-flash-${agentId}`);
    if (flash) {
      flash.classList.add('show');
      setTimeout(() => flash.classList.remove('show'), 1800);
    }
  } catch (err) {
    console.error('Model update failed:', err);
  }
}

window.updateAgentModel = updateAgentModel;

/* ── Org Tree ── */
function buildOrgTree(agents) {
  const byName = {};
  for (const a of agents) byName[a.name.toLowerCase()] = a;

  const childrenOf = {};
  for (const a of agents) childrenOf[a.name.toLowerCase()] = [];
  for (const a of agents) {
    if (a.reports_to) {
      const pk = a.reports_to.toLowerCase();
      if (childrenOf[pk]) childrenOf[pk].push(a);
    }
  }

  const roots = agents.filter(a => !a.reports_to || !byName[a.reports_to.toLowerCase()]);
  const tree = document.getElementById('org-tree');
  tree.innerHTML = '';

  function renderNode(agent, container) {
    const children = childrenOf[agent.name.toLowerCase()] || [];
    const wrapper = document.createElement('div');
    wrapper.className = 'org-node-wrapper' + (children.length ? ' has-children' : '');

    const node = document.createElement('div');
    node.className = 'org-node';
    node.style.cursor = 'pointer';
    applyAgentColorVars(node, agent.name);

    const initial = getAgentInitial(agent.name);
    const avatarInner = agent.avatar_url
      ? `<img src="${escHtml(agent.avatar_url)}" alt="${escHtml(agent.name)}" class="avatar-img" onerror="this.style.display='none';this.insertAdjacentText('afterend','${escHtml(initial)}')"/>`
      : escHtml(initial);

    node.innerHTML = `
      <div class="org-node-avatar">${avatarInner}</div>
      <div class="org-node-name">${escHtml(agent.name)}</div>
      <div class="org-node-role">${escHtml(agent.designation)}</div>
    `;
    node.addEventListener('click', () => openAgentProfile(agent));
    wrapper.appendChild(node);

    if (children.length) {
      const childRow = document.createElement('div');
      childRow.className = 'org-children';

      for (const child of children) {
        const connector = document.createElement('div');
        connector.className = 'org-child-connector';
        renderNode(child, connector);
        childRow.appendChild(connector);
      }

      wrapper.appendChild(childRow);

      requestAnimationFrame(() => {
        const connectors = childRow.querySelectorAll(':scope > .org-child-connector');
        if (connectors.length > 1) {
          const first = connectors[0].getBoundingClientRect();
          const last  = connectors[connectors.length - 1].getBoundingClientRect();
          const rowRect = childRow.getBoundingClientRect();
          const line = document.createElement('div');
          line.className = 'org-siblings-line';
          const leftOffset  = first.left + first.width / 2 - rowRect.left;
          const rightOffset = last.left + last.width / 2 - rowRect.left;
          line.style.left  = leftOffset + 'px';
          line.style.width = (rightOffset - leftOffset) + 'px';
          childRow.appendChild(line);
        }
      });
    }

    container.appendChild(wrapper);
  }

  for (const root of roots) renderNode(root, tree);
}

/* ── Meeting Rooms — Room List ── */
function renderRoomList() {
  // Ensure we're showing list view, not chat view
  const listEl = document.getElementById('meeting-room-list');
  const chatEl = document.getElementById('meeting-room-chat');
  if (listEl) listEl.classList.remove('hidden');
  if (chatEl) chatEl.classList.add('hidden');
  activeRoomId = null;

  const container = document.getElementById('room-list');
  if (!container) return;

  if (!allRooms.length) {
    container.innerHTML = '<div class="empty-state">// NO ROOMS YET //</div>';
    return;
  }

  container.innerHTML = '';
  for (const room of allRooms) {
    container.appendChild(buildRoomCard(room));
  }
}

function buildRoomCard(room) {
  const div = document.createElement('div');
  div.className = 'room-card';
  div.setAttribute('data-room-id', room.id);

  const statusColors = { active: 'room-status-active', done: 'room-status-done', cancelled: 'room-status-cancelled' };
  const statusClass = statusColors[room.status] || 'room-status-done';
  const msgCount = room.message_count || 0;
  const lastActivity = room.last_message_at ? timeAgo(room.last_message_at) : (room.created_at ? timeAgo(room.created_at) : '');

  div.innerHTML = `
    <div class="room-card-top">
      <div class="room-card-title">${escHtml(room.title)}</div>
      <span class="room-status-badge ${statusClass}">${escHtml(room.status)}</span>
    </div>
    <div class="room-card-meta">
      <span class="room-msg-count">${msgCount} message${msgCount !== 1 ? 's' : ''}</span>
      ${lastActivity ? `<span class="room-last-activity">${lastActivity}</span>` : ''}
    </div>
  `;

  div.addEventListener('click', () => enterRoom(room));
  return div;
}

async function enterRoom(room) {
  // Do NOT set activeRoomId yet — keep it null so SSE messages arriving during
  // the fetch are cached (not appended to DOM prematurely via appendRoomMessage).
  // They will be merged into roomMessages by loadRoomMessages before render.

  // Show chat view, hide list view
  const listEl = document.getElementById('meeting-room-list');
  const chatEl = document.getElementById('meeting-room-chat');
  if (listEl) listEl.classList.add('hidden');
  if (chatEl) chatEl.classList.remove('hidden');

  // Set room title and status
  const titleEl = document.getElementById('room-chat-title');
  const statusEl = document.getElementById('room-chat-status-badge');
  if (titleEl) titleEl.textContent = room.title;
  if (statusEl) {
    const statusColors = { active: 'room-status-active', done: 'room-status-done', cancelled: 'room-status-cancelled' };
    statusEl.className = `room-status-badge ${statusColors[room.status] || ''}`;
    statusEl.textContent = room.status;
  }

  // Always fetch from server — ensures full authoritative history is loaded.
  // loadRoomMessages also merges any SSE-cached messages so nothing is lost.
  await loadRoomMessages(room.id);

  // Now safe to set activeRoomId — SSE messages from here on append live.
  activeRoomId = room.id;

  renderRoomMessages(room.id);
}

function exitRoom() {
  activeRoomId = null;
  renderRoomList();
}

window.exitRoom = exitRoom;

async function loadRoomMessages(roomId) {
  try {
    const res = await authedFetch(`${ROOMS_API}/${roomId}/messages?limit=200`);
    if (!res.ok) throw new Error('Failed to fetch room messages');
    const fetched = await res.json();
    // Merge any SSE-cached messages that arrived during the fetch (dedup by id, sort by id)
    const existing = roomMessages[roomId] || [];
    const merged = [...fetched];
    for (const m of existing) {
      if (!merged.find(x => x.id === m.id)) merged.push(m);
    }
    merged.sort((a, b) => a.id - b.id);
    roomMessages[roomId] = merged;
  } catch (err) {
    console.error('Error loading room messages:', err);
    roomMessages[roomId] = roomMessages[roomId] || [];
  }
}

function renderRoomMessages(roomId) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msgs = roomMessages[roomId] || [];

  if (!msgs.length) {
    container.innerHTML = '<div class="empty-state">// NO MESSAGES YET //</div>';
    return;
  }

  container.innerHTML = '';
  let prevAgent = null;
  for (const msg of msgs) {
    container.appendChild(buildChatBubble(msg, prevAgent));
    prevAgent = msg.agent_name;
  }

  scrollChatToBottom();
}

/* ── Chat Bubble (new Slack-style design) ── */
function buildChatBubble(msg, prevAgent) {
  const isGrouped = prevAgent && prevAgent === msg.agent_name;
  const div = document.createElement('div');
  div.className = `chat-bubble ${isGrouped ? 'chat-bubble-grouped' : ''}`;
  div.setAttribute('data-msg-id', msg.id);
  applyAgentColorVars(div, msg.agent_name);

  const c = getAgentColor(msg.agent_name);
  const accent = c ? c.accent : 'var(--text-dim)';

  if (!isGrouped) {
    // Full bubble with avatar + name
    const avatarEl = buildAvatarEl(msg.agent_name, '');
    const headerDiv = document.createElement('div');
    headerDiv.className = 'chat-bubble-header';
    headerDiv.innerHTML = `
      <span class="chat-bubble-name" style="color:${accent}">${escHtml(msg.agent_name)}</span>
      <span class="chat-bubble-time">${formatTime(msg.created_at)}</span>
    `;

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'chat-bubble-body';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-bubble-content';
    contentDiv.textContent = msg.content;

    bodyDiv.appendChild(headerDiv);
    bodyDiv.appendChild(contentDiv);

    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'chat-bubble-wrap';
    wrapDiv.appendChild(avatarEl);
    wrapDiv.appendChild(bodyDiv);

    div.appendChild(wrapDiv);
  } else {
    // Grouped — no avatar, no name, just indented content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-bubble-content chat-bubble-continuation';
    contentDiv.textContent = msg.content;
    div.appendChild(contentDiv);
  }

  return div;
}

function appendRoomMessage(msg) {
  if (!activeRoomId || msg.room_id !== activeRoomId) return;

  const container = document.getElementById('chat-messages');
  if (!container) return;

  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  // Derive prevAgent from the last rendered DOM bubble — this is the ground truth
  // for grouping. The in-memory cache is not reliable here because it may have been
  // pre-seeded via SSE with messages that were never rendered to the DOM.
  const lastBubble = container.lastElementChild;
  let prevAgent = null;
  if (lastBubble) {
    const lastMsgId = lastBubble.getAttribute('data-msg-id');
    if (lastMsgId) {
      const cache = roomMessages[activeRoomId] || [];
      const lastRendered = cache.find(m => String(m.id) === String(lastMsgId));
      if (lastRendered) prevAgent = lastRendered.agent_name;
    }
  }

  if (!roomMessages[activeRoomId]) roomMessages[activeRoomId] = [];
  // Dedup — SSE can occasionally deliver the same message twice on reconnect
  if (!roomMessages[activeRoomId].find(m => m.id === msg.id)) {
    roomMessages[activeRoomId].push(msg);
  }

  container.appendChild(buildChatBubble(msg, prevAgent));
  scrollChatToBottom();
}

/* ── Legacy chat msg builder (kept for backward compat) ── */
function buildChatMsg(msg) {
  return buildChatBubble(msg, null);
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function updateMsgBadge() {
  const badge = document.getElementById('msg-badge');
  if (!badge) return;
  if (unreadMessages > 0) {
    badge.textContent = unreadMessages;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

/* ── Eng Tasks Board ── */
function renderEngBoard() {
  const groups = { backlog: [], in_progress: [], review: [], done: [] };
  for (const t of allEngTasks) {
    if (groups[t.status]) groups[t.status].push(t);
  }

  for (const status of ['backlog', 'in_progress', 'review', 'done']) {
    const list  = document.getElementById(`eng-list-${status}`);
    const count = document.getElementById(`eng-count-${status}`);
    if (!list || !count) continue;
    list.innerHTML = '';
    count.textContent = groups[status].length;

    if (groups[status].length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '// EMPTY //';
      list.appendChild(empty);
    } else {
      for (const task of groups[status]) {
        list.appendChild(buildEngCard(task));
      }
    }
  }
}

function buildEngCard(task) {
  const div = document.createElement('div');
  div.className = 'card eng-card';
  div.setAttribute('data-eng-id', task.id);

  const assigneeBadge = task.assigned_to
    ? `<span class="badge ${assigneeBadgeClass(task.assigned_to)}">${escHtml(task.assigned_to)}</span>`
    : '';

  const priorityClasses = {
    critical: 'priority-critical',
    high:     'priority-high',
    medium:   'priority-medium',
    low:      'priority-low'
  };
  const priorityClass = priorityClasses[task.priority] || 'priority-medium';

  div.innerHTML = `
    <div class="card-top">
      <span class="card-title">${escHtml(task.title)}</span>
      <span class="eng-priority-badge ${priorityClass}">${escHtml(task.priority)}</span>
    </div>
    ${task.description ? `<div class="card-desc">${escHtml(task.description)}</div>` : ''}
    <div class="card-footer">
      ${assigneeBadge}
      <span class="card-time">${timeAgo(task.updated_at)}</span>
    </div>
  `;

  div.addEventListener('click', () => openEngTaskModal(task));
  return div;
}

function openEngTaskModal(task) {
  const priorityClasses = { critical: 'priority-critical', high: 'priority-high', medium: 'priority-medium', low: 'priority-low' };
  const priorityClass = priorityClasses[task.priority] || 'priority-medium';

  const bodyHtml = `
    <div class="slideover-meta">
      ${task.assigned_to ? `<span class="badge ${assigneeBadgeClass(task.assigned_to)}">${escHtml(task.assigned_to)}</span>` : ''}
      <span class="eng-priority-badge ${priorityClass}">${escHtml(task.priority)}</span>
      <span class="status-badge status-${task.status === 'backlog' ? 'pending' : task.status === 'review' ? 'in_progress' : task.status}">${engStatusLabel(task.status)}</span>
    </div>
    ${task.description ? `
      <div class="slideover-section">
        <div class="slideover-label">Description</div>
        <div class="slideover-desc">${escHtml(task.description)}</div>
      </div>
    ` : `<div class="slideover-desc" style="color:var(--text-dim);font-style:italic">No description provided.</div>`}
    <div class="slideover-times">
      <span>Created: ${formatDate(task.created_at)}</span>
      <span>Updated: ${formatDate(task.updated_at)}</span>
      <span>ID: #${task.id}</span>
    </div>
  `;
  openSlideover(task.title, bodyHtml);
}

/* ── Projects ── */
function setProjectFilter(filter) {
  activeProjFilter = filter;
  document.querySelectorAll('[data-proj-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.projFilter === filter);
  });
  renderProjects();
}

window.setProjectFilter = setProjectFilter;

function renderProjects() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;

  let projects = allProjects;
  if (activeProjFilter !== 'all') {
    projects = projects.filter(p => p.status === activeProjFilter);
  }

  if (!projects.length) {
    grid.innerHTML = '<div class="empty-state">// NO PROJECTS //</div>';
    return;
  }

  grid.innerHTML = '';
  for (const proj of projects) {
    grid.appendChild(buildProjectCard(proj));
  }
}

function buildProjectCard(proj) {
  const div = document.createElement('div');
  div.className = 'project-card';
  div.setAttribute('data-proj-id', proj.id);

  const statusColors = {
    active:    'proj-status-active',
    on_hold:   'proj-status-hold',
    done:      'proj-status-done',
    cancelled: 'proj-status-cancelled'
  };
  const statusClass = statusColors[proj.status] || '';
  const statusLabels = { active: 'Active', on_hold: 'On Hold', done: 'Done', cancelled: 'Cancelled' };
  const statusLabel = statusLabels[proj.status] || proj.status;

  const deptColor = proj.department_color || '#888';
  const deptName  = proj.department_name  || 'Unassigned';

  div.innerHTML = `
    <div class="project-card-top">
      <div class="project-card-title">${escHtml(proj.title)}</div>
      <span class="project-status-badge ${statusClass}">${escHtml(statusLabel)}</span>
    </div>
    ${proj.description ? `<div class="project-card-desc">${escHtml(proj.description)}</div>` : ''}
    <div class="project-card-meta">
      <span class="project-dept-badge" style="background:${deptColor}22;color:${deptColor};border-color:${deptColor}44">${escHtml(deptName)}</span>
      ${proj.lead_agent ? `<span class="badge ${assigneeBadgeClass(proj.lead_agent)}">${escHtml(proj.lead_agent)}</span>` : ''}
      <span class="project-card-time">${timeAgo(proj.updated_at)}</span>
    </div>
  `;

  div.addEventListener('click', () => openProjectDetail(proj));
  return div;
}

function openProjectDetail(proj) {
  const statusLabels = { active: 'Active', on_hold: 'On Hold', done: 'Done', cancelled: 'Cancelled' };
  const statusColors = { active: 'proj-status-active', on_hold: 'proj-status-hold', done: 'proj-status-done', cancelled: 'proj-status-cancelled' };

  const bodyHtml = `
    <div class="slideover-meta">
      <span class="project-status-badge ${statusColors[proj.status] || ''}">${statusLabels[proj.status] || proj.status}</span>
      ${proj.lead_agent ? `<span class="badge ${assigneeBadgeClass(proj.lead_agent)}">${escHtml(proj.lead_agent)}</span>` : ''}
    </div>
    ${proj.description ? `
      <div class="slideover-section">
        <div class="slideover-label">Description</div>
        <div class="slideover-desc">${escHtml(proj.description)}</div>
      </div>
    ` : ''}
    ${proj.department_name ? `
      <div class="slideover-section">
        <div class="slideover-label">Department</div>
        <div class="slideover-desc">${escHtml(proj.department_name)}</div>
      </div>
    ` : ''}
    <div class="slideover-times">
      <span>Created: ${formatDate(proj.created_at)}</span>
      <span>Updated: ${formatDate(proj.updated_at)}</span>
      <span>ID: #${proj.id}</span>
    </div>
  `;
  openSlideover(proj.title, bodyHtml);
}

/* ── SSE connection ── */
let sseHeartbeatTimer = null;  // watchdog timer — reconnects if no heartbeat
const SSE_HEARTBEAT_TIMEOUT = 45000; // 25s server interval + 20s grace

function resetHeartbeatWatchdog(dot) {
  if (sseHeartbeatTimer) clearTimeout(sseHeartbeatTimer);
  sseHeartbeatTimer = setTimeout(() => {
    // No heartbeat received within timeout — connection silently dropped
    console.warn('[SSE] Heartbeat timeout — forcing reconnect');
    if (eventSource) { eventSource.close(); eventSource = null; }
    if (dot) dot.classList.remove('connected');
    connectSSE();
  }, SSE_HEARTBEAT_TIMEOUT);
}

function connectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (sseHeartbeatTimer) { clearTimeout(sseHeartbeatTimer); sseHeartbeatTimer = null; }

  const indicator = document.getElementById('live-indicator');
  const dot = indicator ? indicator.querySelector('.live-dot') : null;

  // Pass token as query param for EventSource (can't set custom headers)
  const sseUrl = API_TOKEN ? `${EVENTS_URL}?token=${encodeURIComponent(API_TOKEN)}` : EVENTS_URL;
  eventSource = new EventSource(sseUrl);

  eventSource.onopen = () => {
    if (dot) dot.classList.add('connected');
    resetHeartbeatWatchdog(dot);
  };

  eventSource.addEventListener('agent_update', (e) => {
    const data = JSON.parse(e.data);
    const agent = data.agent;
    const idx = allAgents.findIndex(a => a.id === agent.id);
    if (idx !== -1) allAgents[idx] = { ...allAgents[idx], ...agent };
    else allAgents.push(agent);

    if (activeSection === 'dashboard') renderWhosWorking();
    if (activeSection === 'agents') renderAgents();
    if (activeSection === 'org') buildOrgTree(allAgents);

    if (agent.current_activity) {
      logActivity(`<strong>${escHtml(agent.name)}</strong>: ${escHtml(agent.current_activity)}`, 'in_progress');
      logAgentActivity(agent.name, agent.current_activity);
    }
  });

  eventSource.addEventListener('new_message', (e) => {
    const data = JSON.parse(e.data);
    const msg = data.message;

    // Update room list metadata (message count + last activity)
    if (msg.room_id) {
      const roomIdx = allRooms.findIndex(r => r.id === msg.room_id);
      if (roomIdx !== -1) {
        allRooms[roomIdx].message_count = (allRooms[roomIdx].message_count || 0) + 1;
        allRooms[roomIdx].last_message_at = msg.created_at;
      }
    }

    if (activeSection === 'meeting') {
      if (activeRoomId === msg.room_id) {
        // appendRoomMessage handles cache push + DOM append
        appendRoomMessage(msg);
      } else if (activeRoomId === null) {
        // on room list — re-render to update counts
        // Still cache the message so entering the room later shows it
        if (msg.room_id) {
          if (!roomMessages[msg.room_id]) roomMessages[msg.room_id] = [];
          if (!roomMessages[msg.room_id].find(m => m.id === msg.id)) {
            roomMessages[msg.room_id].push(msg);
          }
        }
        renderRoomList();
        unreadMessages++;
        updateMsgBadge();
      } else {
        // In a different room — cache only
        if (msg.room_id) {
          if (!roomMessages[msg.room_id]) roomMessages[msg.room_id] = [];
          if (!roomMessages[msg.room_id].find(m => m.id === msg.id)) {
            roomMessages[msg.room_id].push(msg);
          }
        }
        unreadMessages++;
        updateMsgBadge();
      }
    } else {
      // Not in meeting section — cache so it's ready when user enters
      if (msg.room_id) {
        if (!roomMessages[msg.room_id]) roomMessages[msg.room_id] = [];
        if (!roomMessages[msg.room_id].find(m => m.id === msg.id)) {
          roomMessages[msg.room_id].push(msg);
        }
      }
      unreadMessages++;
      updateMsgBadge();
    }

    logActivity(`<strong>${escHtml(msg.agent_name)}</strong> posted in ${escHtml(msg.room || 'room')}`, 'in_progress');
  });

  eventSource.addEventListener('task_update', (e) => {
    const data = JSON.parse(e.data);

    if (data.action === 'created') {
      allTasks.unshift(data.task);
      logActivity(`Task created: <strong>${escHtml(data.task.title)}</strong>`, data.task.status);
    } else if (data.action === 'updated') {
      const idx = allTasks.findIndex(t => t.id === data.task.id);
      if (idx !== -1) allTasks[idx] = data.task;
      logActivity(`Task updated: <strong>${escHtml(data.task.title)}</strong> -> ${statusLabel(data.task.status)}`, data.task.status);
    } else if (data.action === 'deleted') {
      allTasks = allTasks.filter(t => t.id !== data.id);
      logActivity(`Task deleted`, 'in_progress');
    }

    if (activeSection === 'tasks') renderBoard(filterTasks(allTasks, activeFilter));
    if (activeSection === 'dashboard') renderDashboard();
  });

  eventSource.addEventListener('eng_task_update', (e) => {
    const data = JSON.parse(e.data);

    if (data.action === 'created') {
      allEngTasks.push(data.task);
      logActivity(`Eng task created: <strong>${escHtml(data.task.title)}</strong>`, 'in_progress');
    } else if (data.action === 'updated') {
      const idx = allEngTasks.findIndex(t => t.id === data.task.id);
      if (idx !== -1) allEngTasks[idx] = data.task;
      logActivity(`Eng task updated: <strong>${escHtml(data.task.title)}</strong>`, 'in_progress');
    } else if (data.action === 'deleted') {
      allEngTasks = allEngTasks.filter(t => t.id !== data.id);
    }

    if (activeSection === 'eng-tasks') renderEngBoard();
  });

  eventSource.addEventListener('room_update', (e) => {
    const data = JSON.parse(e.data);
    const room = data.room;

    if (data.action === 'created') {
      allRooms.unshift(room);
      logActivity(`Room created: <strong>${escHtml(room.title)}</strong>`, 'in_progress');
    } else if (data.action === 'updated') {
      const idx = allRooms.findIndex(r => r.id === room.id);
      if (idx !== -1) allRooms[idx] = { ...allRooms[idx], ...room };
    }

    if (activeSection === 'meeting' && !activeRoomId) {
      renderRoomList();
    }
  });

  // Heartbeat: server sends ': heartbeat\n\n' every 25s as an SSE comment.
  // EventSource parses comments — they trigger onmessage with no event type and null data.
  // We use any incoming message (named or unnamed) to reset the watchdog.
  const origOnMsg = eventSource.onmessage;
  eventSource.onmessage = (e) => {
    resetHeartbeatWatchdog(dot);
    if (origOnMsg) origOnMsg(e);
  };

  eventSource.addEventListener('project_update', (e) => {
    const data = JSON.parse(e.data);
    const project = data.project;
    const idx = allProjects.findIndex(p => p.id === project.id);
    if (idx !== -1) allProjects[idx] = project;
    else allProjects.unshift(project);
    if (activeSection === 'projects') renderProjects();
  });

  eventSource.addEventListener('dept_update', (e) => {
    const data = JSON.parse(e.data);
    const dept = data.department;
    const idx = allDepts.findIndex(d => d.id === dept.id);
    if (idx !== -1) allDepts[idx] = dept;
  });

  // Also reset on named events (agent_update, new_message, etc.)
  ['agent_update', 'new_message', 'task_update', 'eng_task_update', 'room_update', 'project_update', 'dept_update'].forEach(evtName => {
    // Heartbeat reset is handled by the onmessage + named event listeners above
    void evtName;
  });

  eventSource.onerror = () => {
    if (sseHeartbeatTimer) { clearTimeout(sseHeartbeatTimer); sseHeartbeatTimer = null; }
    if (dot) dot.classList.remove('connected');
    if (eventSource) { eventSource.close(); eventSource = null; }
    setTimeout(connectSSE, 5000);
  };
}

// Page Visibility API — reconnect SSE when tab comes back to foreground
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
      console.log('[SSE] Tab visible — reconnecting SSE');
      connectSSE();
    }
  }
});

/* ── Data loading ── */
async function loadTasks() {
  try {
    const res = await authedFetch(TASKS_API);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    allTasks = await res.json();
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

async function loadAgents() {
  try {
    const res = await authedFetch(AGENTS_API);
    if (!res.ok) throw new Error('Failed to fetch agents');
    allAgents = await res.json();
  } catch (err) {
    console.error('Error loading agents:', err);
  }
}

async function loadRooms() {
  try {
    const res = await authedFetch(ROOMS_API);
    if (!res.ok) throw new Error('Failed to fetch rooms');
    allRooms = await res.json();
  } catch (err) {
    console.error('Error loading rooms:', err);
  }
}

async function loadEngTasks() {
  try {
    const res = await authedFetch(ENG_TASKS_API);
    if (!res.ok) throw new Error('Failed to fetch eng tasks');
    allEngTasks = await res.json();
  } catch (err) {
    console.error('Error loading eng tasks:', err);
  }
}

async function loadDepts() {
  try {
    const res = await authedFetch(DEPTS_API);
    if (!res.ok) throw new Error('Failed to fetch departments');
    allDepts = await res.json();
  } catch (err) {
    console.error('Error loading departments:', err);
  }
}

async function loadProjects() {
  try {
    const res = await authedFetch(PROJECTS_API);
    if (!res.ok) throw new Error('Failed to fetch projects');
    allProjects = await res.json();
  } catch (err) {
    console.error('Error loading projects:', err);
  }
}

async function loadAll() {
  // Skeletons go inside list containers only — never replace column structure
  const skCard = '<div class="skeleton-card"><div class="skeleton skeleton-line-lg skeleton-w-3-4"></div><div class="skeleton skeleton-line skeleton-w-full"></div><div class="skeleton skeleton-line-sm skeleton-w-1-2"></div></div>'.repeat(3);
  if (!allTasks.length) ['list-pending','list-in_progress','list-done'].forEach(function(id){ var el=document.getElementById(id); if(el) el.innerHTML=skCard; });
  if (!allEngTasks.length) ['eng-list-backlog','eng-list-in_progress','eng-list-review','eng-list-done'].forEach(function(id){ var el=document.getElementById(id); if(el) el.innerHTML=skCard; });
  const agentsGrid = document.getElementById('agents-grid');
  if (agentsGrid && !allAgents.length) agentsGrid.innerHTML = buildAgentsSkeleton();

  await Promise.all([loadTasks(), loadAgents(), loadRooms(), loadEngTasks(), loadDepts(), loadProjects()]);
  renderDashboard();
  renderBoard(filterTasks(allTasks, activeFilter));
  renderEngBoard();
  renderAgents();
  renderProjects();
}

/* ── Config load ── */
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      API_TOKEN = cfg.token || '';
    }
  } catch (err) {
    console.warn('Could not load config:', err);
  }
}

/* ── Init ── */
loadConfig().then(() => {
  loadAll().then(() => {
    connectSSE();
  });
});

// Periodic full refresh as fallback (every 2 min)
setInterval(async () => {
  await Promise.all([loadTasks(), loadAgents(), loadRooms(), loadEngTasks(), loadDepts(), loadProjects()]);
  if (activeSection === 'dashboard') renderDashboard();
  if (activeSection === 'tasks') renderBoard(filterTasks(allTasks, activeFilter));
  if (activeSection === 'agents') renderAgents();
  if (activeSection === 'eng-tasks') renderEngBoard();
  if (activeSection === 'meeting' && !activeRoomId) renderRoomList();
  if (activeSection === 'projects') renderProjects();
}, 120000);
