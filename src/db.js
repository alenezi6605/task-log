const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tasks.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'done')),
    assigned_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TRIGGER IF NOT EXISTS update_tasks_updated_at
    AFTER UPDATE ON tasks
    FOR EACH ROW
    BEGIN
      UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
    END;

  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    designation TEXT NOT NULL,
    reports_to TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    content TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT 'general',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations — add columns if they don't exist
const agentColumns = db.pragma('table_info(agents)').map(c => c.name);

if (!agentColumns.includes('current_activity')) {
  db.exec(`ALTER TABLE agents ADD COLUMN current_activity TEXT`);
}
if (!agentColumns.includes('last_active')) {
  db.exec(`ALTER TABLE agents ADD COLUMN last_active DATETIME`);
}
if (!agentColumns.includes('model')) {
  db.exec(`ALTER TABLE agents ADD COLUMN model TEXT DEFAULT 'claude-sonnet-4-6'`);
}
if (!agentColumns.includes('tagline')) {
  db.exec(`ALTER TABLE agents ADD COLUMN tagline TEXT`);
}
if (!agentColumns.includes('bio')) {
  db.exec(`ALTER TABLE agents ADD COLUMN bio TEXT`);
}
if (!agentColumns.includes('philosophy')) {
  db.exec(`ALTER TABLE agents ADD COLUMN philosophy TEXT`);
}
if (!agentColumns.includes('demands')) {
  db.exec(`ALTER TABLE agents ADD COLUMN demands TEXT`);
}
if (!agentColumns.includes('hates')) {
  db.exec(`ALTER TABLE agents ADD COLUMN hates TEXT`);
}

// Seed agents if table is empty
const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents').get();
if (agentCount.count === 0) {
  const insertAgent = db.prepare(
    'INSERT OR IGNORE INTO agents (name, designation, reports_to, status, model) VALUES (?, ?, ?, ?, ?)'
  );
  const seedAgents = db.transaction(() => {
    insertAgent.run('Abdulrahman', 'Owner', null, 'active', 'claude-sonnet-4-6');
    insertAgent.run('V', 'CEO', 'Abdulrahman', 'active', 'claude-sonnet-4-6');
    insertAgent.run('Aurore', 'CTO', 'V', 'active', 'claude-sonnet-4-6');
    insertAgent.run('Judy', 'Designer', 'V', 'active', 'claude-sonnet-4-6');
    insertAgent.run('Rex', 'Backend Engineer', 'Aurore', 'active', 'claude-sonnet-4-6');
    insertAgent.run('Pixel', 'Frontend Engineer', 'Aurore', 'active', 'claude-sonnet-4-6');
    insertAgent.run('Ghost', 'DevOps Engineer', 'Aurore', 'active', 'claude-sonnet-4-6');
    insertAgent.run('Zara', 'QA Engineer', 'Aurore', 'active', 'claude-sonnet-4-6');
    insertAgent.run('Mia', 'E-commerce Specialist', 'Aurore', 'active', 'claude-sonnet-4-6');
    insertAgent.run('Nova', 'Data Analyst', 'Aurore', 'active', 'claude-sonnet-4-6');
  });
  seedAgents();
}

module.exports = db;
