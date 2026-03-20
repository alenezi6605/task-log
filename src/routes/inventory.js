const express = require('express');
const router = express.Router();
const db = require('../db');
const sse = require('../sse');

// GET /api/inventory — list all inventory with product info
router.get('/', (req, res) => {
  try {
    let query = `
      SELECT i.*, p.name as product_name, p.sku as product_sku, p.category as product_category,
        p.status as product_status, p.cloudinary_url as product_image,
        CASE WHEN i.quantity <= i.low_stock_threshold THEN 1 ELSE 0 END as low_stock
      FROM inventory i
      JOIN products p ON i.product_id = p.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.low_stock === 'true') {
      conditions.push('i.quantity <= i.low_stock_threshold');
    }
    if (req.query.category) {
      conditions.push('p.category = ?');
      params.push(req.query.category);
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY p.name ASC';

    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/summary — aggregate stats
router.get('/summary', (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_products,
        SUM(i.quantity) as total_units,
        SUM(CASE WHEN i.quantity <= i.low_stock_threshold THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN i.quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_count
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.status = 'active'
    `).get();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:product_id
router.get('/:product_id', (req, res) => {
  try {
    const item = db.prepare(`
      SELECT i.*, p.name as product_name, p.sku as product_sku, p.cloudinary_url as product_image
      FROM inventory i JOIN products p ON i.product_id = p.id
      WHERE i.product_id = ?
    `).get(req.params.product_id);
    if (!item) return res.status(404).json({ error: 'Inventory record not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:product_id — update inventory
router.put('/:product_id', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM inventory WHERE product_id = ?').get(req.params.product_id);
    if (!item) return res.status(404).json({ error: 'Inventory record not found' });

    const { quantity, reserved, location, low_stock_threshold, notes } = req.body;
    const updated = {
      quantity:            quantity            !== undefined ? quantity            : item.quantity,
      reserved:            reserved            !== undefined ? reserved            : item.reserved,
      location:            location            !== undefined ? location            : item.location,
      low_stock_threshold: low_stock_threshold !== undefined ? low_stock_threshold : item.low_stock_threshold,
      notes:               notes               !== undefined ? notes               : item.notes
    };

    db.prepare(`
      UPDATE inventory SET quantity=?, reserved=?, location=?, low_stock_threshold=?, notes=?
      WHERE product_id=?
    `).run(updated.quantity, updated.reserved, updated.location, updated.low_stock_threshold, updated.notes, req.params.product_id);

    const result = db.prepare(`
      SELECT i.*, p.name as product_name, p.sku as product_sku
      FROM inventory i JOIN products p ON i.product_id = p.id
      WHERE i.product_id = ?
    `).get(req.params.product_id);

    sse.broadcast('inventory_update', { inventory: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/:product_id/adjust — adjust quantity by delta
router.post('/:product_id/adjust', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM inventory WHERE product_id = ?').get(req.params.product_id);
    if (!item) return res.status(404).json({ error: 'Inventory record not found' });

    const { delta, notes } = req.body;
    if (delta === undefined || isNaN(delta)) return res.status(400).json({ error: 'delta (number) is required' });

    const newQty = Math.max(0, item.quantity + parseInt(delta));
    db.prepare(`UPDATE inventory SET quantity=?, notes=? WHERE product_id=?`)
      .run(newQty, notes !== undefined ? notes : item.notes, req.params.product_id);

    const result = db.prepare(`
      SELECT i.*, p.name as product_name, p.sku as product_sku
      FROM inventory i JOIN products p ON i.product_id = p.id
      WHERE i.product_id = ?
    `).get(req.params.product_id);

    sse.broadcast('inventory_update', { inventory: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
