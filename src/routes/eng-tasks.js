const express = require('express');
const router = express.Router();
const db = require('../db');
const sse = require('../sse');

const VALID_STATUSES = ['backlog', 'in_progress', 'review', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

// GET /api/eng-tasks — list all, optional ?status= ?assigned_to=
router.get('/', (req, res) => {
  try {
    const { status, assigned_to } = req.query;
    let query = 'SELECT * FROM eng_tasks WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (assigned_to) {
      query += ' AND LOWER(assigned_to) = LOWER(?)';
      params.push(assigned_to);
    }

    query += ' ORDER BY created_at ASC';
    const tasks = db.prepare(query).all(...params);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/eng-tasks/:id
router.get('/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM eng_tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Eng task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/eng-tasks
router.post('/', (req, res) => {
  try {
    const { title, description, status, assigned_to, priority } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    const result = db.prepare(
      'INSERT INTO eng_tasks (title, description, status, assigned_to, priority) VALUES (?, ?, ?, ?, ?)'
    ).run(
      title.trim(),
      description || null,
      status || 'backlog',
      assigned_to || null,
      priority || 'medium'
    );

    const task = db.prepare('SELECT * FROM eng_tasks WHERE id = ?').get(result.lastInsertRowid);
    sse.broadcast('eng_task_update', { action: 'created', task });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/eng-tasks/:id
router.put('/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM eng_tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Eng task not found' });

    const { title, description, status, assigned_to, priority } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    const updated = {
      title: title !== undefined ? title.trim() : task.title,
      description: description !== undefined ? description : task.description,
      status: status !== undefined ? status : task.status,
      assigned_to: assigned_to !== undefined ? assigned_to : task.assigned_to,
      priority: priority !== undefined ? priority : task.priority,
    };

    db.prepare(`
      UPDATE eng_tasks SET title = ?, description = ?, status = ?, assigned_to = ?, priority = ?
      WHERE id = ?
    `).run(updated.title, updated.description, updated.status, updated.assigned_to, updated.priority, req.params.id);

    const result = db.prepare('SELECT * FROM eng_tasks WHERE id = ?').get(req.params.id);
    sse.broadcast('eng_task_update', { action: 'updated', task: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/eng-tasks/:id
router.delete('/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM eng_tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Eng task not found' });
    db.prepare('DELETE FROM eng_tasks WHERE id = ?').run(req.params.id);
    sse.broadcast('eng_task_update', { action: 'deleted', id: parseInt(req.params.id) });
    res.json({ message: 'Eng task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
