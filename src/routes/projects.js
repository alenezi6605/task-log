const express = require('express');
const router = express.Router();
const db = require('../db');
const sse = require('../sse');

// GET /api/projects — list all projects, optional ?department_id=
router.get('/', (req, res) => {
  try {
    let query = `
      SELECT p.*, d.name as department_name, d.slug as department_slug, d.color as department_color
      FROM projects p
      LEFT JOIN departments d ON p.department_id = d.id
    `;
    const params = [];
    if (req.query.department_id) {
      query += ' WHERE p.department_id = ?';
      params.push(req.query.department_id);
    } else if (req.query.department_slug) {
      query += ' WHERE d.slug = ?';
      params.push(req.query.department_slug);
    }
    query += ' ORDER BY p.created_at DESC';
    const projects = db.prepare(query).all(...params);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  try {
    const project = db.prepare(`
      SELECT p.*, d.name as department_name, d.slug as department_slug, d.color as department_color
      FROM projects p
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects
router.post('/', (req, res) => {
  try {
    const { title, description, department_id, status, lead_agent } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const result = db.prepare(`
      INSERT INTO projects (title, description, department_id, status, lead_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(title, description || null, department_id || null, status || 'active', lead_agent || null);

    const project = db.prepare(`
      SELECT p.*, d.name as department_name, d.slug as department_slug, d.color as department_color
      FROM projects p LEFT JOIN departments d ON p.department_id = d.id
      WHERE p.id = ?
    `).get(result.lastInsertRowid);

    sse.broadcast('project_update', { project });
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id
router.put('/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { title, description, department_id, status, lead_agent } = req.body;
    const updated = {
      title:         title         !== undefined ? title         : project.title,
      description:   description   !== undefined ? description   : project.description,
      department_id: department_id !== undefined ? department_id : project.department_id,
      status:        status        !== undefined ? status        : project.status,
      lead_agent:    lead_agent    !== undefined ? lead_agent    : project.lead_agent
    };

    db.prepare(`
      UPDATE projects SET title = ?, description = ?, department_id = ?, status = ?, lead_agent = ?
      WHERE id = ?
    `).run(updated.title, updated.description, updated.department_id, updated.status, updated.lead_agent, req.params.id);

    const result = db.prepare(`
      SELECT p.*, d.name as department_name, d.slug as department_slug, d.color as department_color
      FROM projects p LEFT JOIN departments d ON p.department_id = d.id
      WHERE p.id = ?
    `).get(req.params.id);

    sse.broadcast('project_update', { project: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
