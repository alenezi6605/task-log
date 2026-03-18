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
`);

// Seed agents if table is empty
const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents').get();
if (agentCount.count === 0) {
  const insertAgent = db.prepare(
    'INSERT OR IGNORE INTO agents (name, designation, reports_to, status) VALUES (?, ?, ?, ?)'
  );
  const seedAgents = db.transaction(() => {
    insertAgent.run('Abdulrahman', 'Owner', null, 'active');
    insertAgent.run('V', 'CEO', 'Abdulrahman', 'active');
    insertAgent.run('Aurore', 'CTO', 'V', 'active');
    insertAgent.run('Judy', 'Designer', 'V', 'active');
    insertAgent.run('Rex', 'Backend Engineer', 'Aurore', 'active');
    insertAgent.run('Pixel', 'Frontend Engineer', 'Aurore', 'active');
    insertAgent.run('Ghost', 'DevOps Engineer', 'Aurore', 'active');
    insertAgent.run('Zara', 'QA Engineer', 'Aurore', 'active');
    insertAgent.run('Mia', 'E-commerce Specialist', 'Aurore', 'active');
    insertAgent.run('Nova', 'Data Analyst', 'Aurore', 'active');
  });
  seedAgents();
}

module.exports = db;
