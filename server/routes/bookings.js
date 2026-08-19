const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, s.name_en, s.name_fa, s.price, ch.name as channel_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN channels ch ON b.channel_id = ch.id
       ORDER BY b.created_at DESC`
    )
    .all();
  res.json(bookings);
});

router.post('/:id/status', (req, res) => {
  const { status } = req.body; // pending | confirmed | done | cancelled
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
