const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/tasks — list all tasks, optional ?status= filter
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    let tasks;
    if (status) {
      tasks = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(status);
    } else {
      tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    }
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id — get single task
router.get('/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks — create task
router.post('/', (req, res) => {
  try {
    const { title, description, status, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const stmt = db.prepare(
      'INSERT INTO tasks (title, description, status, assigned_to) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(title, description || null, status || 'pending', assigned_to || null);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tasks/:id — update task
router.put('/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { title, description, status, assigned_to } = req.body;
    const updated = {
      title: title !== undefined ? title : task.title,
      description: description !== undefined ? description : task.description,
      status: status !== undefined ? status : task.status,
      assigned_to: assigned_to !== undefined ? assigned_to : task.assigned_to,
    };

    db.prepare(
      'UPDATE tasks SET title = ?, description = ?, status = ?, assigned_to = ? WHERE id = ?'
    ).run(updated.title, updated.description, updated.status, updated.assigned_to, req.params.id);

    const result = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id — delete task
router.delete('/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
