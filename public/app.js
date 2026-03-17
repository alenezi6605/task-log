const API = '/api/tasks';

function assigneeBadgeClass(assignee) {
  if (!assignee) return 'badge-tbd';
  const a = assignee.trim().toLowerCase();
  if (a === 'aurore') return 'badge-aurore';
  if (a === 'judy')   return 'badge-judy';
  if (a === 'v')      return 'badge-v';
  if (a === 'tbd')    return 'badge-tbd';
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

function buildCard(task) {
  const div = document.createElement('div');
  div.className = 'card';
  div.setAttribute('data-id', task.id);

  const badgeClass = assigneeBadgeClass(task.assigned_to);
  const assigneeLabel = task.assigned_to || 'TBD';
  const descTruncated = (task.description || '').length > 0
    ? task.description
    : '<em style="opacity:0.4">No description</em>';

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
      <span style="margin-top:4px;color:#3a3a52">ID: #${task.id}</span>
    </div>
  `;

  overlay.classList.remove('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadTasks() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    const tasks = await res.json();

    const groups = { pending: [], in_progress: [], done: [] };
    for (const t of tasks) {
      if (groups[t.status]) groups[t.status].push(t);
    }

    for (const status of ['pending', 'in_progress', 'done']) {
      const list = document.getElementById(`list-${status}`);
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
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

loadTasks();
setInterval(loadTasks, 30000);
