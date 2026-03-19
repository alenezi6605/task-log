/* ── Constants ── */
const TASKS_API     = '/api/tasks';
const AGENTS_API    = '/api/agents';
const MESSAGES_API  = '/api/messages';
const ROOMS_API     = '/api/rooms';
const ENG_TASKS_API = '/api/eng-tasks';
const EVENTS_URL    = '/api/events';

/* ── State ── */
let activeSection   = 'dashboard';
let activeFilter    = 'all';
let allTasks        = [];
let allAgents       = [];
let allMessages     = [];
let allRooms        = [];
let allEngTasks     = [];
let unreadMessages  = 0;
let eventSource     = null;
let activityLog     = []; // { text, status, time }
let activeRoomId    = null; // currently viewed room
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

function formatDate(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dt) {
  if (!dt) return '';
  const diff = Date.now() - new Date(dt).getTime();
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
  return (Date.now() - new Date(last_active).getTime()) < 5 * 60 * 1000;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Section navigation ── */
function switchSection(section) {
  activeSection = section;

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

  document.getElementById('sidebar').classList.remove('open');
}

window.switchSection = switchSection;

/* ── Mobile sidebar ── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

window.toggleSidebar = toggleSidebar;

/* ── Dashboard clock ── */
function updateClock() {
  const el = document.getElementById('dashboard-time');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

/* ── Modal ── */
function openModal(task) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  const badgeClass = assigneeBadgeClass(task.assigned_to);
  const assigneeLabel = task.assigned_to || 'TBD';

  content.innerHTML = `
    <div class="modal-title">${escHtml(task.title)}</div>
    <div class="modal-meta">
      <span class="badge ${badgeClass}">${escHtml(assigneeLabel)}</span>
      <span class="status-badge status-${task.status}">${statusLabel(task.status)}</span>
    </div>
    <div class="modal-desc">${escHtml(task.description || 'No description provided.')}</div>
    <div class="modal-times">
      <span>Created: ${formatDate(task.created_at)}</span>
      <span>Updated: ${formatDate(task.updated_at)}</span>
      <span>ID: #${task.id}</span>
    </div>
  `;
  overlay.classList.remove('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
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
  const grid = document.getElementById('agents-grid');
  grid.innerHTML = '';

  if (!allAgents.length) {
    grid.innerHTML = '<div class="empty-state">// NO AGENTS //</div>';
    return;
  }

  for (const agent of allAgents) {
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

async function updateAgentModel(agentId, model, selectEl) {
  try {
    const res = await fetch(`${AGENTS_API}/${agentId}/model`, {
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
  activeRoomId = room.id;

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

  // Load messages for this room
  if (!roomMessages[room.id]) {
    await loadRoomMessages(room.id);
  }

  renderRoomMessages(room.id);
}

function exitRoom() {
  activeRoomId = null;
  renderRoomList();
}

window.exitRoom = exitRoom;

async function loadRoomMessages(roomId) {
  try {
    const res = await fetch(`${ROOMS_API}/${roomId}/messages?limit=200`);
    if (!res.ok) throw new Error('Failed to fetch room messages');
    roomMessages[roomId] = await res.json();
  } catch (err) {
    console.error('Error loading room messages:', err);
    roomMessages[roomId] = [];
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

  const msgs = roomMessages[activeRoomId] || [];
  const prevAgent = msgs.length > 0 ? msgs[msgs.length - 1].agent_name : null;

  if (!roomMessages[activeRoomId]) roomMessages[activeRoomId] = [];
  roomMessages[activeRoomId].push(msg);

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
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  const priorityClasses = { critical: 'priority-critical', high: 'priority-high', medium: 'priority-medium', low: 'priority-low' };
  const priorityClass = priorityClasses[task.priority] || 'priority-medium';

  content.innerHTML = `
    <div class="modal-title">${escHtml(task.title)}</div>
    <div class="modal-meta">
      ${task.assigned_to ? `<span class="badge ${assigneeBadgeClass(task.assigned_to)}">${escHtml(task.assigned_to)}</span>` : ''}
      <span class="eng-priority-badge ${priorityClass}">${escHtml(task.priority)}</span>
      <span class="status-badge status-${task.status === 'backlog' ? 'pending' : task.status === 'review' ? 'in_progress' : task.status}">${engStatusLabel(task.status)}</span>
    </div>
    <div class="modal-desc">${escHtml(task.description || 'No description provided.')}</div>
    <div class="modal-times">
      <span>Created: ${formatDate(task.created_at)}</span>
      <span>Updated: ${formatDate(task.updated_at)}</span>
      <span>ID: #${task.id}</span>
    </div>
  `;
  overlay.classList.remove('hidden');
}

/* ── SSE connection ── */
function connectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  const indicator = document.getElementById('live-indicator');
  const dot = indicator ? indicator.querySelector('.live-dot') : null;

  eventSource = new EventSource(EVENTS_URL);

  eventSource.onopen = () => {
    if (dot) dot.classList.add('connected');
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
    }
  });

  eventSource.addEventListener('new_message', (e) => {
    const data = JSON.parse(e.data);
    const msg = data.message;

    // Update roomMessages cache
    if (msg.room_id) {
      if (!roomMessages[msg.room_id]) roomMessages[msg.room_id] = [];
      // Only push if not already there (SSE might fire before load completes)
      if (!roomMessages[msg.room_id].find(m => m.id === msg.id)) {
        roomMessages[msg.room_id].push(msg);
      }

      // Also refresh room list to update message counts
      const roomIdx = allRooms.findIndex(r => r.id === msg.room_id);
      if (roomIdx !== -1) {
        allRooms[roomIdx].message_count = (allRooms[roomIdx].message_count || 0) + 1;
        allRooms[roomIdx].last_message_at = msg.created_at;
      }
    }

    if (activeSection === 'meeting') {
      if (activeRoomId === msg.room_id) {
        appendRoomMessage(msg);
      } else if (activeRoomId === null) {
        // on room list — re-render to update counts
        renderRoomList();
        unreadMessages++;
        updateMsgBadge();
      } else {
        unreadMessages++;
        updateMsgBadge();
      }
    } else {
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

  eventSource.onerror = () => {
    if (dot) dot.classList.remove('connected');
    eventSource.close();
    eventSource = null;
    setTimeout(connectSSE, 5000);
  };
}

/* ── Data loading ── */
async function loadTasks() {
  try {
    const res = await fetch(TASKS_API);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    allTasks = await res.json();
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

async function loadAgents() {
  try {
    const res = await fetch(AGENTS_API);
    if (!res.ok) throw new Error('Failed to fetch agents');
    allAgents = await res.json();
  } catch (err) {
    console.error('Error loading agents:', err);
  }
}

async function loadRooms() {
  try {
    const res = await fetch(ROOMS_API);
    if (!res.ok) throw new Error('Failed to fetch rooms');
    allRooms = await res.json();
  } catch (err) {
    console.error('Error loading rooms:', err);
  }
}

async function loadEngTasks() {
  try {
    const res = await fetch(ENG_TASKS_API);
    if (!res.ok) throw new Error('Failed to fetch eng tasks');
    allEngTasks = await res.json();
  } catch (err) {
    console.error('Error loading eng tasks:', err);
  }
}

async function loadAll() {
  await Promise.all([loadTasks(), loadAgents(), loadRooms(), loadEngTasks()]);
  renderDashboard();
}

/* ── Init ── */
loadAll().then(() => {
  connectSSE();
});

// Periodic full refresh as fallback (every 2 min)
setInterval(async () => {
  await Promise.all([loadTasks(), loadAgents(), loadRooms(), loadEngTasks()]);
  if (activeSection === 'dashboard') renderDashboard();
  if (activeSection === 'tasks') renderBoard(filterTasks(allTasks, activeFilter));
  if (activeSection === 'agents') renderAgents();
  if (activeSection === 'eng-tasks') renderEngBoard();
  if (activeSection === 'meeting' && !activeRoomId) renderRoomList();
}, 120000);
