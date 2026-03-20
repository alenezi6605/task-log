const express = require('express');
const router = express.Router();
const db = require('../db');
const sse = require('../sse');

// GET /api/products — list all products, optional ?status= ?category=
router.get('/', (req, res) => {
  try {
    let query = `
      SELECT p.*, i.quantity, i.reserved, i.low_stock_threshold,
        CASE WHEN i.quantity IS NOT NULL AND i.quantity <= i.low_stock_threshold THEN 1 ELSE 0 END as low_stock
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.status) {
      conditions.push('p.status = ?');
      params.push(req.query.status);
    }
    if (req.query.category) {
      conditions.push('p.category = ?');
      params.push(req.query.category);
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY p.created_at DESC';

    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/categories — distinct category list
router.get('/categories', (req, res) => {
  try {
    const rows = db.prepare(`SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category`).all();
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, i.quantity, i.reserved, i.low_stock_threshold, i.location, i.notes as inv_notes,
        CASE WHEN i.quantity IS NOT NULL AND i.quantity <= i.low_stock_threshold THEN 1 ELSE 0 END as low_stock
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products
router.post('/', (req, res) => {
  try {
    const { sku, name, description, category, price, cost, status, cloudinary_public_id, cloudinary_url, tags } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = db.prepare(`
      INSERT INTO products (sku, name, description, category, price, cost, status, cloudinary_public_id, cloudinary_url, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sku || null, name, description || null, category || null,
      price || null, cost || null, status || 'draft',
      cloudinary_public_id || null, cloudinary_url || null, tags || null
    );

    // Auto-create inventory record
    db.prepare(`INSERT INTO inventory (product_id, quantity, reserved) VALUES (?, 0, 0)`).run(result.lastInsertRowid);

    const product = db.prepare(`
      SELECT p.*, i.quantity, i.reserved, i.low_stock_threshold
      FROM products p LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = ?
    `).get(result.lastInsertRowid);

    sse.broadcast('product_update', { action: 'created', product });
    res.status(201).json(product);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { sku, name, description, category, price, cost, status, cloudinary_public_id, cloudinary_url, tags } = req.body;
    const updated = {
      sku:                  sku                  !== undefined ? sku                  : product.sku,
      name:                 name                 !== undefined ? name                 : product.name,
      description:          description          !== undefined ? description          : product.description,
      category:             category             !== undefined ? category             : product.category,
      price:                price                !== undefined ? price                : product.price,
      cost:                 cost                 !== undefined ? cost                 : product.cost,
      status:               status               !== undefined ? status               : product.status,
      cloudinary_public_id: cloudinary_public_id !== undefined ? cloudinary_public_id : product.cloudinary_public_id,
      cloudinary_url:       cloudinary_url       !== undefined ? cloudinary_url       : product.cloudinary_url,
      tags:                 tags                 !== undefined ? tags                 : product.tags
    };

    db.prepare(`
      UPDATE products SET sku=?, name=?, description=?, category=?, price=?, cost=?, status=?,
        cloudinary_public_id=?, cloudinary_url=?, tags=? WHERE id=?
    `).run(
      updated.sku, updated.name, updated.description, updated.category,
      updated.price, updated.cost, updated.status,
      updated.cloudinary_public_id, updated.cloudinary_url, updated.tags,
      req.params.id
    );

    const result = db.prepare(`
      SELECT p.*, i.quantity, i.reserved, i.low_stock_threshold
      FROM products p LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = ?
    `).get(req.params.id);

    sse.broadcast('product_update', { action: 'updated', product: result });
    res.json(result);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    sse.broadcast('product_update', { action: 'deleted', id: req.params.id });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id/cloudinary — update cloudinary asset mapping
router.put('/:id/cloudinary', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { cloudinary_public_id, cloudinary_url } = req.body;
    db.prepare(`UPDATE products SET cloudinary_public_id=?, cloudinary_url=? WHERE id=?`)
      .run(cloudinary_public_id || null, cloudinary_url || null, req.params.id);

    const result = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    sse.broadcast('product_update', { action: 'updated', product: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
