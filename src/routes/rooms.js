const express = require('express');
const router = express.Router();
const db = require('../db');
const sse = require('../sse');

// GET /api/rooms — list all rooms with message count and last activity
router.get('/', (req, res) => {
  try {
    const rooms = db.prepare(`
      SELECT
        r.*,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM rooms r
      LEFT JOIN messages m ON m.room_id = r.id
      GROUP BY r.id
      ORDER BY r.updated_at DESC
    `).all();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:id — single room
router.get('/:id', (req, res) => {
  try {
    const room = db.prepare(`
      SELECT
        r.*,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM rooms r
      LEFT JOIN messages m ON m.room_id = r.id
      WHERE r.id = ?
      GROUP BY r.id
    `).get(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:id/messages — messages for a specific room
router.get('/:id/messages', (req, res) => {
  try {
    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const before = req.query.before ? parseInt(req.query.before) : null;

    let messages;
    if (before) {
      messages = db.prepare(`
        SELECT * FROM messages
        WHERE room_id = ? AND id < ?
        ORDER BY id DESC
        LIMIT ?
      `).all(req.params.id, before, limit);
    } else {
      messages = db.prepare(`
        SELECT * FROM messages
        WHERE room_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(req.params.id, limit);
    }

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms — create a room
router.post('/', (req, res) => {
  try {
    const { title, status } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

    const validStatuses = ['active', 'done', 'cancelled'];
    const roomStatus = validStatuses.includes(status) ? status : 'active';

    const result = db.prepare(
      'INSERT INTO rooms (title, status) VALUES (?, ?)'
    ).run(title.trim(), roomStatus);

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid);

    sse.broadcast('room_update', { action: 'created', room });

    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/rooms/:id — update room status or title
router.put('/:id', (req, res) => {
  try {
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { title, status } = req.body;
    const validStatuses = ['active', 'done', 'cancelled'];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const updated = {
      title: title !== undefined ? title.trim() : room.title,
      status: status !== undefined ? status : room.status,
    };

    db.prepare('UPDATE rooms SET title = ?, status = ? WHERE id = ?')
      .run(updated.title, updated.status, req.params.id);

    const result = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    sse.broadcast('room_update', { action: 'updated', room: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
