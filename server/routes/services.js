const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY name_en').all());
});

router.post('/', (req, res) => {
  const { name_en, name_fa, price, duration_minutes } = req.body;
  if (!name_en || !name_fa || price == null) return res.status(400).json({ error: 'missing fields' });
  const id = uuid();
  db.prepare(
    `INSERT INTO services (id, name_en, name_fa, price, duration_minutes) VALUES (?, ?, ?, ?, ?)`
  ).run(id, name_en, name_fa, price, duration_minutes || 60);
  res.json({ ok: true, id });
});

router.put('/:id', (req, res) => {
  const { name_en, name_fa, price, duration_minutes, active } = req.body;
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  db.prepare(
    `UPDATE services SET name_en = ?, name_fa = ?, price = ?, duration_minutes = ?, active = ? WHERE id = ?`
  ).run(
    name_en ?? existing.name_en,
    name_fa ?? existing.name_fa,
    price ?? existing.price,
    duration_minutes ?? existing.duration_minutes,
    active === undefined ? existing.active : active ? 1 : 0,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
