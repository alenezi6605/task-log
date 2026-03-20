const express = require('express');
const router = express.Router();
const db = require('../db');
const sse = require('../sse');

// GET /api/revenue — list all revenue snapshots
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 90;
    const snapshots = db.prepare(`
      SELECT * FROM revenue_snapshots ORDER BY date DESC LIMIT ?
    `).all(limit);
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/revenue/summary — aggregate stats
router.get('/summary', (req, res) => {
  try {
    const total = db.prepare(`SELECT COALESCE(SUM(revenue),0) as total_revenue, COALESCE(SUM(orders),0) as total_orders FROM revenue_snapshots`).get();
    const today = db.prepare(`SELECT * FROM revenue_snapshots WHERE date = date('now') LIMIT 1`).get();
    const last30 = db.prepare(`SELECT COALESCE(SUM(revenue),0) as revenue, COALESCE(SUM(orders),0) as orders FROM revenue_snapshots WHERE date >= date('now', '-30 days')`).get();
    res.json({ total, today: today || null, last_30_days: last30 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/revenue — add a revenue snapshot
router.post('/', (req, res) => {
  try {
    const { date, revenue, orders, source, notes } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    if (revenue === undefined) return res.status(400).json({ error: 'revenue is required' });

    const result = db.prepare(`
      INSERT INTO revenue_snapshots (date, revenue, orders, source, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(date, parseFloat(revenue), parseInt(orders) || 0, source || 'manual', notes || null);

    const snapshot = db.prepare('SELECT * FROM revenue_snapshots WHERE id = ?').get(result.lastInsertRowid);
    sse.broadcast('revenue_update', { snapshot });
    res.status(201).json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/revenue/:id — update snapshot
router.put('/:id', (req, res) => {
  try {
    const snap = db.prepare('SELECT * FROM revenue_snapshots WHERE id = ?').get(req.params.id);
    if (!snap) return res.status(404).json({ error: 'Snapshot not found' });

    const { date, revenue, orders, source, notes } = req.body;
    const updated = {
      date:    date    !== undefined ? date    : snap.date,
      revenue: revenue !== undefined ? revenue : snap.revenue,
      orders:  orders  !== undefined ? orders  : snap.orders,
      source:  source  !== undefined ? source  : snap.source,
      notes:   notes   !== undefined ? notes   : snap.notes
    };

    db.prepare(`UPDATE revenue_snapshots SET date=?, revenue=?, orders=?, source=?, notes=? WHERE id=?`)
      .run(updated.date, parseFloat(updated.revenue), parseInt(updated.orders), updated.source, updated.notes, req.params.id);

    const result = db.prepare('SELECT * FROM revenue_snapshots WHERE id = ?').get(req.params.id);
    sse.broadcast('revenue_update', { snapshot: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/revenue/:id
router.delete('/:id', (req, res) => {
  try {
    const snap = db.prepare('SELECT * FROM revenue_snapshots WHERE id = ?').get(req.params.id);
    if (!snap) return res.status(404).json({ error: 'Snapshot not found' });
    db.prepare('DELETE FROM revenue_snapshots WHERE id = ?').run(req.params.id);
    res.json({ message: 'Snapshot deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
