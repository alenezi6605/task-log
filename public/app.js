/* ── Constants ── */
const TASKS_API  = '/api/tasks';
const AGENTS_API = '/api/agents';

/* ── State ── */
let activeTab  = 'all';
let allTasks   = [];
let allAgents  = [];

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
  abdulrahman: {
    accent: '#f59e0b',
    accentBg: 'rgba(245,158,11,0.10)',
    accentBorder: 'rgba(245,158,11,0.28)',
    initial: 'A'
  },
  v: {
    accent: '#00f0ff',
    accentBg: 'rgba(0,240,255,0.08)',
    accentBorder: 'rgba(0,240,255,0.25)',
    initial: 'V'
  },
  aurore: {
    accent: '#b84fff',
    accentBg: 'rgba(184,79,255,0.10)',
    accentBorder: 'rgba(184,79,255,0.25)',
    initial: 'Au'
  },
  judy: {
    accent: '#ff4fa0',
    accentBg: 'rgba(255,79,160,0.10)',
    accentBorder: 'rgba(255,79,160,0.25)',
    initial: 'J'
  },
  rex: {
    accent: '#ff6b2b',
    accentBg: 'rgba(255,107,43,0.10)',
    accentBorder: 'rgba(255,107,43,0.25)',
    initial: 'R'
  },
  pixel: {
    accent: '#4fa8ff',
    accentBg: 'rgba(79,168,255,0.10)',
    accentBorder: 'rgba(79,168,255,0.25)',
    initial: 'Px'
  },
  ghost: {
    accent: '#8892a4',
    accentBg: 'rgba(136,146,164,0.10)',
    accentBorder: 'rgba(136,146,164,0.25)',
    initial: 'Gh'
  },
  zara: {
    accent: '#00e676',
    accentBg: 'rgba(0,230,118,0.08)',
    accentBorder: 'rgba(0,230,118,0.25)',
    initial: 'Z'
  },
  mia: {
    accent: '#ff6b8a',
    accentBg: 'rgba(255,107,138,0.10)',
    accentBorder: 'rgba(255,107,138,0.25)',
    initial: 'M'
  },
  nova: {
    accent: '#ffe566',
    accentBg: 'rgba(255,229,102,0.10)',
    accentBorder: 'rgba(255,229,102,0.25)',
    initial: 'N'
  }
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

/* ── Badge helpers ── */
function assigneeBadgeClass(assignee) {
  if (!assignee) return 'badge-tbd';
  const a = assignee.trim().toLowerCase();
  const known = ['aurore','judy','v','abdulrahman','rex','pixel','ghost','zara','mia','nova','tbd'];
  if (a === 'tbd' || !assignee) return 'badge-tbd';
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

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/* ── Tab filter logic ── */
function filterTasksForTab(tasks, tab) {
  if (tab === 'my') {
    return tasks.filter(t => t.assigned_to && t.assigned_to.trim().toLowerCase() === 'abdulrahman');
  }
  if (tab === 'crew') {
    return tasks.filter(t => {
      if (!t.assigned_to) return true;
      return t.assigned_to.trim().toLowerCase() !== 'abdulrahman';
    });
  }
  return tasks; // 'all'
}

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

/* ── Agents view ── */
function renderAgents() {
  const grid = document.getElementById('agents-grid');
  grid.innerHTML = '';

  if (!allAgents.length) {
    grid.innerHTML = '<div class="empty-state">// NO AGENTS //</div>';
    return;
  }

  for (const agent of allAgents) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    applyAgentColorVars(card, agent.name);

    const c = getAgentColor(agent.name);
    const initial = c ? c.initial : agent.name.charAt(0).toUpperCase();
    const reportsTo = agent.reports_to || '—';
    const isActive = agent.status === 'active';
    const taskCount = agent.active_task_count || 0;

    card.innerHTML = `
      <div class="agent-card-top">
        <div class="agent-avatar">${escHtml(initial)}</div>
        <div class="agent-info">
          <div class="agent-name">${escHtml(agent.name)}</div>
          <div class="agent-designation">${escHtml(agent.designation)}</div>
        </div>
        <span class="badge badge-${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="agent-meta">
        <div class="agent-reports">Reports to: <strong>${escHtml(reportsTo)}</strong></div>
        <div class="agent-tasks-count ${taskCount > 0 ? 'has-tasks' : ''}">${taskCount} active task${taskCount !== 1 ? 's' : ''}</div>
      </div>
    `;
    grid.appendChild(card);
  }
}

/* ── Org Tree view ── */
function buildOrgTree(agents) {
  // Build lookup
  const byName = {};
  for (const a of agents) {
    byName[a.name.toLowerCase()] = a;
  }

  // Build children map
  const childrenOf = {};
  for (const a of agents) {
    const key = a.name.toLowerCase();
    childrenOf[key] = [];
  }
  for (const a of agents) {
    if (a.reports_to) {
      const parentKey = a.reports_to.toLowerCase();
      if (childrenOf[parentKey]) {
        childrenOf[parentKey].push(a);
      }
    }
  }

  // Find roots (no reports_to or reports_to not in list)
  const roots = agents.filter(a => !a.reports_to || !byName[a.reports_to.toLowerCase()]);

  const tree = document.getElementById('org-tree');
  tree.innerHTML = '';

  function renderNode(agent, container) {
    const children = childrenOf[agent.name.toLowerCase()] || [];
    const wrapper = document.createElement('div');
    wrapper.className = 'org-node-wrapper' + (children.length ? ' has-children' : '');

    const node = document.createElement('div');
    node.className = 'org-node';
    applyAgentColorVars(node, agent.name);

    const c = getAgentColor(agent.name);
    const badgeBg  = c ? c.accentBg  : 'var(--bg-column)';
    const badgeBdr = c ? c.accentBorder : 'var(--border)';
    const badgeClr = c ? c.accent : 'var(--text-dim)';

    node.innerHTML = `
      <div class="org-node-name">${escHtml(agent.name)}</div>
      <div class="org-node-role">${escHtml(agent.designation)}</div>
    `;
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

      // Draw horizontal connector line spanning children
      wrapper.appendChild(childRow);

      // After DOM insert, position the line
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

  for (const root of roots) {
    renderNode(root, tree);
  }
}

/* ── Tab switching ── */
function switchTab(tab) {
  activeTab = tab;

  const tabs = ['all', 'crew', 'my', 'agents', 'org'];
  for (const t of tabs) {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
  }

  const viewKanban = document.getElementById('view-kanban');
  const viewAgents = document.getElementById('view-agents');
  const viewOrg    = document.getElementById('view-org');

  viewKanban.classList.add('hidden');
  viewAgents.classList.add('hidden');
  viewOrg.classList.add('hidden');

  if (tab === 'agents') {
    viewAgents.classList.remove('hidden');
    renderAgents();
  } else if (tab === 'org') {
    viewOrg.classList.remove('hidden');
    buildOrgTree(allAgents);
  } else {
    viewKanban.classList.remove('hidden');
    renderBoard(filterTasksForTab(allTasks, tab));
  }
}

window.switchTab = switchTab;

/* ── Data loading ── */
async function loadTasks() {
  try {
    const res = await fetch(TASKS_API);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    allTasks = await res.json();
    if (['all', 'crew', 'my'].includes(activeTab)) {
      renderBoard(filterTasksForTab(allTasks, activeTab));
    }
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

async function loadAgents() {
  try {
    const res = await fetch(AGENTS_API);
    if (!res.ok) throw new Error('Failed to fetch agents');
    allAgents = await res.json();
    if (activeTab === 'agents') renderAgents();
    if (activeTab === 'org') buildOrgTree(allAgents);
  } catch (err) {
    console.error('Error loading agents:', err);
  }
}

async function loadAll() {
  await Promise.all([loadTasks(), loadAgents()]);
}

loadAll();
setInterval(loadAll, 30000);
