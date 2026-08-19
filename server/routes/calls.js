const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { sendSms } = require('../bot/sms');

router.get('/', (req, res) => {
  const calls = db.prepare('SELECT * FROM calls ORDER BY registered_at DESC').all();
  res.json(calls);
});

// Register a new phone number that needs a call back (e.g. captured by a bot channel for
// "other information" requests, or added manually from the dashboard)
router.post('/', async (req, res) => {
  const { phone, reason } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const id = uuid();
  db.prepare(`INSERT INTO calls (id, phone, reason) VALUES (?, ?, ?)`).run(id, phone, reason || null);

  // Notify the salon that a callback is needed
  const adminPhone = db.prepare("SELECT value FROM settings WHERE key = 'admin_phone'").get()?.value;
  if (adminPhone) {
    await sendSms(adminPhone, `Callback requested. Phone: ${phone}. Reason: ${reason || 'N/A'}`);
  }

  res.json({ ok: true, id });
});

router.post('/:id/called', (req, res) => {
  const { called } = req.body; // true/false
  db.prepare('UPDATE calls SET called = ?, called_at = ? WHERE id = ?').run(
    called ? 1 : 0,
    called ? new Date().toISOString() : null,
    req.params.id
  );
  res.json({ ok: true });
});

module.exports = router;
