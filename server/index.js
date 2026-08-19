require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const db = require('./db');
const { initTelegramBot } = require('./bot/telegramBot');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---- API routes ----
app.use('/api/channels', require('./routes/channels'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/services', require('./routes/services'));
app.use('/api/settings', require('./routes/settings'));

// ---- Static dashboard ----
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🌹 Rose Beauty CRM running at http://localhost:${PORT}\n`);
  initTelegramBot();
});
