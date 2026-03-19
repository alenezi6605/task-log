/* ── Constants ── */
const TASKS_API    = '/api/tasks';
const AGENTS_API   = '/api/agents';
const MESSAGES_API = '/api/messages';
const EVENTS_URL   = '/api/events';

/* ── State ── */
let activeSection  = 'dashboard';
let activeFilter   = 'all';
let allTasks       = [];
let allAgents      = [];
let allMessages    = [];
let unreadMessages = 0;
let eventSource    = null;
let activityLog    = []; // { text, status, time }

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

function formatDate(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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
  return (Date.now() - new Date(last_active).getTime()) < 5 * 60 * 1000; // 5 min
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

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });

  // Hide all sections
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

  // Show target
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.remove('hidden');

  // Render on switch
  if (section === 'dashboard')  renderDashboard();
  if (section === 'tasks')      renderBoard(filterTasks(allTasks, activeFilter));
  if (section === 'agents')     renderAgents();
  if (section === 'org')        buildOrgTree(allAgents);
  if (section === 'meeting') {
    unreadMessages = 0;
    updateMsgBadge();
    scrollChatToBottom();
  }

  // Close mobile sidebar
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
  // Stats
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

    const initial = getAgentInitial(agent.name);
    const activity = agent.current_activity || 'Standby';

    item.innerHTML = `
      <div class="working-avatar">${escHtml(initial)}</div>
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

  content.innerHTML = `
    <div class="profile-modal" style="--agent-accent:${accent};--agent-accent-bg:${accentBg};--agent-accent-border:${accentBorder}">
      <div class="profile-header">
        <div class="profile-avatar">${escHtml(initial)}</div>
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

    card.innerHTML = `
      <div class="agent-card-top">
        <div class="agent-avatar">
          ${escHtml(initial)}
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

    // Update local state
    const agent = allAgents.find(a => a.id === agentId);
    if (agent) agent.model = model;

    // Flash feedback
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

    node.innerHTML = `
      <div class="org-node-avatar">${escHtml(initial)}</div>
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

/* ── Meeting Room ── */
function renderMessages() {
  const container = document.getElementById('chat-messages');

  if (!allMessages.length) {
    container.innerHTML = '<div class="empty-state">// NO MESSAGES YET //</div>';
    return;
  }

  container.innerHTML = '';
  for (const msg of allMessages) {
    container.appendChild(buildChatMsg(msg));
  }

  scrollChatToBottom();
}

function buildChatMsg(msg) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.setAttribute('data-msg-id', msg.id);
  applyAgentColorVars(div, msg.agent_name);

  const initial = getAgentInitial(msg.agent_name);
  const c = getAgentColor(msg.agent_name);
  const accent = c ? c.accent : 'var(--text-dim)';

  div.innerHTML = `
    <div class="chat-msg-avatar">${escHtml(initial)}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-header">
        <span class="chat-msg-name" style="color: ${accent}">${escHtml(msg.agent_name)}</span>
        <span class="chat-msg-time">${formatDate(msg.created_at)}</span>
      </div>
      <div class="chat-msg-text">${escHtml(msg.content)}</div>
    </div>
  `;
  return div;
}

function appendChatMsg(msg) {
  const container = document.getElementById('chat-messages');

  // Remove empty state if present
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  container.appendChild(buildChatMsg(msg));
  scrollChatToBottom();
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

/* ── SSE connection ── */
function connectSSE() {
  if (eventSource) eventSource.close();

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
    allMessages.push(msg);

    if (activeSection === 'meeting') {
      appendChatMsg(msg);
    } else {
      unreadMessages++;
      updateMsgBadge();
    }

    logActivity(`<strong>${escHtml(msg.agent_name)}</strong> posted in #${escHtml(msg.room)}`, 'in_progress');
  });

  eventSource.addEventListener('task_update', (e) => {
    const data = JSON.parse(e.data);

    if (data.action === 'created') {
      allTasks.unshift(data.task);
      logActivity(`Task created: <strong>${escHtml(data.task.title)}</strong>`, data.task.status);
    } else if (data.action === 'updated') {
      const idx = allTasks.findIndex(t => t.id === data.task.id);
      if (idx !== -1) allTasks[idx] = data.task;
      logActivity(`Task updated: <strong>${escHtml(data.task.title)}</strong> → ${statusLabel(data.task.status)}`, data.task.status);
    } else if (data.action === 'deleted') {
      allTasks = allTasks.filter(t => t.id !== data.id);
      logActivity(`Task deleted`, 'in_progress');
    }

    if (activeSection === 'tasks') renderBoard(filterTasks(allTasks, activeFilter));
    if (activeSection === 'dashboard') renderDashboard();
  });

  eventSource.onerror = () => {
    if (dot) dot.classList.remove('connected');
    // Reconnect after 5 seconds
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

async function loadMessages() {
  try {
    const res = await fetch(`${MESSAGES_API}?room=general&limit=100`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    allMessages = await res.json();
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

async function loadAll() {
  await Promise.all([loadTasks(), loadAgents(), loadMessages()]);
  renderDashboard();
  renderMessages();
}

/* ── Init ── */
loadAll().then(() => {
  connectSSE();
});

// Periodic full refresh as fallback (every 2 min — SSE handles real-time)
setInterval(async () => {
  await Promise.all([loadTasks(), loadAgents()]);
  if (activeSection === 'dashboard') renderDashboard();
  if (activeSection === 'tasks') renderBoard(filterTasks(allTasks, activeFilter));
  if (activeSection === 'agents') renderAgents();
}, 120000);
