const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all channels with basic stats
router.get('/', (req, res) => {
  const channels = db.prepare('SELECT * FROM channels').all();
  const withStats = channels.map((c) => {
    const messageCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE channel_id = ?').get(c.id).c;
    const contactCount = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE channel_id = ?').get(c.id).c;
    const lastMessage = db
      .prepare('SELECT body, created_at FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(c.id);
    return { ...c, messageCount, contactCount, lastMessage: lastMessage || null };
  });
  res.json(withStats);
});

// GET all contacts (conversations) for one channel
router.get('/:channelId/contacts', (req, res) => {
  const { channelId } = req.params;
  const contacts = db
    .prepare(
      `SELECT c.*,
        (SELECT body FROM messages m WHERE m.contact_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages m WHERE m.contact_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id) as message_count
       FROM contacts c WHERE c.channel_id = ? ORDER BY last_message_at DESC`
    )
    .all(channelId);
  res.json(contacts);
});

module.exports = router;
