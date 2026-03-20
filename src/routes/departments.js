const express = require('express');
const router = express.Router();
const db = require('../db');
const sse = require('../sse');

// GET /api/departments — list all departments with agent count
router.get('/', (req, res) => {
  try {
    const departments = db.prepare(`
      SELECT
        d.*,
        COUNT(a.id) as agent_count
      FROM departments d
      LEFT JOIN agents a ON a.department_id = d.id AND a.status = 'active'
      GROUP BY d.id
      ORDER BY d.id ASC
    `).all();
    res.json(departments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/departments/:slug — single department by slug
router.get('/:slug', (req, res) => {
  try {
    const dept = db.prepare(`
      SELECT
        d.*,
        COUNT(a.id) as agent_count
      FROM departments d
      LEFT JOIN agents a ON a.department_id = d.id AND a.status = 'active'
      WHERE d.slug = ?
      GROUP BY d.id
    `).get(req.params.slug);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    res.json(dept);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/departments/:slug/agents — agents in a department
router.get('/:slug/agents', (req, res) => {
  try {
    const dept = db.prepare('SELECT id FROM departments WHERE slug = ?').get(req.params.slug);
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const agents = db.prepare(`
      SELECT
        a.*,
        COUNT(CASE WHEN t.status != 'done' THEN 1 END) as active_task_count
      FROM agents a
      LEFT JOIN tasks t ON LOWER(t.assigned_to) = LOWER(a.name)
      WHERE a.department_id = ?
      GROUP BY a.id
      ORDER BY a.id ASC
    `).all(dept.id);
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/departments/:slug — update department
router.put('/:slug', (req, res) => {
  try {
    const dept = db.prepare('SELECT * FROM departments WHERE slug = ?').get(req.params.slug);
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const { name, color, icon, lead_agent, description, status } = req.body;
    const updated = {
      name:        name        !== undefined ? name        : dept.name,
      color:       color       !== undefined ? color       : dept.color,
      icon:        icon        !== undefined ? icon        : dept.icon,
      lead_agent:  lead_agent  !== undefined ? lead_agent  : dept.lead_agent,
      description: description !== undefined ? description : dept.description,
      status:      status      !== undefined ? status      : dept.status
    };

    db.prepare(`
      UPDATE departments SET name = ?, color = ?, icon = ?, lead_agent = ?, description = ?, status = ?
      WHERE slug = ?
    `).run(updated.name, updated.color, updated.icon, updated.lead_agent, updated.description, updated.status, req.params.slug);

    const result = db.prepare('SELECT * FROM departments WHERE slug = ?').get(req.params.slug);
    sse.broadcast('dept_update', { department: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
