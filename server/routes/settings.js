const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach((r) => (settings[r.key] = r.value));
  res.json(settings);
});

router.post('/', (req, res) => {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  Object.entries(req.body || {}).forEach(([key, value]) => upsert.run(key, String(value)));
  res.json({ ok: true });
});

// Dashboard-wide summary numbers
router.get('/overview', (req, res) => {
  const totalMessages = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
  const totalContacts = db.prepare('SELECT COUNT(*) as c FROM contacts').get().c;
  const totalBookings = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
  const pendingCalls = db.prepare('SELECT COUNT(*) as c FROM calls WHERE called = 0').get().c;
  const bookingsByStatus = db
    .prepare('SELECT status, COUNT(*) as c FROM bookings GROUP BY status')
    .all();
  const messagesByChannel = db
    .prepare('SELECT channel_id, COUNT(*) as c FROM messages GROUP BY channel_id')
    .all();
  res.json({ totalMessages, totalContacts, totalBookings, pendingCalls, bookingsByStatus, messagesByChannel });
});

module.exports = router;
