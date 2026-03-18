const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/agents — list all agents with active task count
router.get('/', (req, res) => {
  try {
    const agents = db.prepare(`
      SELECT
        a.*,
        COUNT(CASE WHEN t.status != 'done' THEN 1 END) as active_task_count
      FROM agents a
      LEFT JOIN tasks t ON LOWER(t.assigned_to) = LOWER(a.name)
      GROUP BY a.id
      ORDER BY a.id ASC
    `).all();
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id — single agent with active task count
router.get('/:id', (req, res) => {
  try {
    const agent = db.prepare(`
      SELECT
        a.*,
        COUNT(CASE WHEN t.status != 'done' THEN 1 END) as active_task_count
      FROM agents a
      LEFT JOIN tasks t ON LOWER(t.assigned_to) = LOWER(a.name)
      WHERE a.id = ?
      GROUP BY a.id
    `).get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents — create agent
router.post('/', (req, res) => {
  try {
    const { name, designation, reports_to, status } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!designation) return res.status(400).json({ error: 'designation is required' });

    const stmt = db.prepare(
      'INSERT INTO agents (name, designation, reports_to, status) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(name, designation, reports_to || null, status || 'active');
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(agent);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Agent name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/agents/:id — update agent
router.put('/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { name, designation, reports_to, status } = req.body;
    const updated = {
      name: name !== undefined ? name : agent.name,
      designation: designation !== undefined ? designation : agent.designation,
      reports_to: reports_to !== undefined ? reports_to : agent.reports_to,
      status: status !== undefined ? status : agent.status,
    };

    db.prepare(
      'UPDATE agents SET name = ?, designation = ?, reports_to = ?, status = ? WHERE id = ?'
    ).run(updated.name, updated.designation, updated.reports_to, updated.status, req.params.id);

    const result = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Agent name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id — delete agent
router.delete('/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
    res.json({ message: 'Agent deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
