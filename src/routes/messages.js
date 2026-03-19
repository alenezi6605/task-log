const express = require('express');
const router = express.Router();
const db = require('../db');
const sse = require('../sse');

// GET /api/messages?room=general&limit=100&before=id  (legacy room name support)
router.get('/', (req, res) => {
  try {
    const room = req.query.room || 'general';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const before = req.query.before ? parseInt(req.query.before) : null;

    let messages;
    if (before) {
      messages = db.prepare(`
        SELECT * FROM messages
        WHERE room = ? AND id < ?
        ORDER BY id DESC
        LIMIT ?
      `).all(room, before, limit);
    } else {
      messages = db.prepare(`
        SELECT * FROM messages
        WHERE room = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(room, limit);
    }

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages — post a message, supports room_id or legacy room name
router.post('/', (req, res) => {
  try {
    const { agent_name, content, room, room_id } = req.body;
    if (!agent_name) return res.status(400).json({ error: 'agent_name is required' });
    if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });

    let targetRoomId = null;
    let targetRoom = room || 'general';

    if (room_id) {
      // room_id provided — validate it exists
      const roomRow = db.prepare('SELECT id, title FROM rooms WHERE id = ?').get(room_id);
      if (!roomRow) return res.status(404).json({ error: 'Room not found' });
      targetRoomId = roomRow.id;
      targetRoom = roomRow.title;
    } else {
      // Legacy: look up by room name to get room_id
      const roomRow = db.prepare('SELECT id FROM rooms WHERE LOWER(title) = LOWER(?)').get(targetRoom);
      if (roomRow) targetRoomId = roomRow.id;
    }

    const result = db.prepare(
      'INSERT INTO messages (agent_name, content, room, room_id) VALUES (?, ?, ?, ?)'
    ).run(agent_name.trim(), content.trim(), targetRoom, targetRoomId);

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

    sse.broadcast('new_message', { message });

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
