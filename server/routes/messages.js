const express = require('express');
const router = express.Router();
const db = require('../db');
const { handleIncomingMessage, sendAdminReply } = require('../bot/conversationEngine');
const { pushAdminMessageToTelegram } = require('../bot/telegramBot');

// Full message thread with one contact (click a message on the dashboard)
router.get('/thread/:contactId', (req, res) => {
  const { contactId } = req.params;
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  const messages = db
    .prepare('SELECT * FROM messages WHERE contact_id = ? ORDER BY created_at ASC')
    .all(contactId);
  res.json({ contact, messages });
});

// Website widget: visitor sends a message, gets a bot reply back (used by the public chat widget)
router.post('/website/send', async (req, res) => {
  const { visitorId, name, text } = req.body;
  if (!visitorId || !text) return res.status(400).json({ error: 'visitorId and text are required' });
  const reply = await handleIncomingMessage({ channelId: 'website', externalId: visitorId, name, text });
  res.json({ reply });
});

// Generic inbound webhook you can point WhatsApp / Instagram (Meta Cloud API) at later
router.post('/webhook/:channelId', async (req, res) => {
  const { channelId } = req.params;
  const { externalId, name, text } = req.body;
  if (!externalId || !text) return res.status(400).json({ error: 'externalId and text are required' });
  const reply = await handleIncomingMessage({ channelId, externalId, name, text });
  res.json({ reply });
});

// Admin manually replies to a customer from the dashboard
router.post('/reply', async (req, res) => {
  const { channelId, contactId, text } = req.body;
  if (!channelId || !contactId || !text) return res.status(400).json({ error: 'missing fields' });

  sendAdminReply({ channelId, contactId, text });

  if (channelId === 'telegram') {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    if (contact) await pushAdminMessageToTelegram(contact.external_id, text);
  }
  // For whatsapp/instagram: wire your Meta Cloud API send-message call here the same way.

  res.json({ ok: true });
});

module.exports = router;
