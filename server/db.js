const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'rosebeauty.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- website | telegram | instagram | whatsapp | phone
  is_connected INTEGER DEFAULT 0,
  color TEXT DEFAULT '#ff5da2',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES channels(id),
  external_id TEXT,      -- telegram chat id / phone number / etc
  name TEXT,
  phone TEXT,
  language TEXT DEFAULT 'fa', -- fa | en
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES channels(id),
  contact_id TEXT REFERENCES contacts(id),
  direction TEXT NOT NULL,     -- in | out
  sender TEXT,                 -- customer name or 'bot' or 'admin'
  body TEXT,
  is_ai INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_fa TEXT NOT NULL,
  price REAL NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  channel_id TEXT REFERENCES channels(id),
  service_id TEXT REFERENCES services(id),
  customer_name TEXT,
  customer_phone TEXT,
  requested_date TEXT,
  requested_time TEXT,
  status TEXT DEFAULT 'pending', -- pending | confirmed | done | cancelled
  notified_admin INTEGER DEFAULT 0,
  notified_customer INTEGER DEFAULT 0,
  google_event_link TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  reason TEXT,
  contact_id TEXT REFERENCES contacts(id),
  registered_at TEXT DEFAULT (datetime('now')),
  called INTEGER DEFAULT 0,
  called_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// Seed channels
const channelSeed = [
  { id: 'website', name: 'Website', type: 'website', color: '#7b5cff' },
  { id: 'telegram', name: 'Telegram', type: 'telegram', color: '#29a9eb' },
  { id: 'instagram', name: 'Instagram', type: 'instagram', color: '#e1306c' },
  { id: 'whatsapp', name: 'WhatsApp', type: 'whatsapp', color: '#25d366' },
];
const insertChannel = db.prepare(`INSERT OR IGNORE INTO channels (id, name, type, color) VALUES (@id, @name, @type, @color)`);
channelSeed.forEach((c) => insertChannel.run(c));

// Seed services (Rose Beauty salon)
const serviceCount = db.prepare('SELECT COUNT(*) as c FROM services').get().c;
if (serviceCount === 0) {
  const insertService = db.prepare(`INSERT INTO services (id, name_en, name_fa, price, duration_minutes) VALUES (?, ?, ?, ?, ?)`);
  const { v4: uuid } = require('uuid');
  const defaults = [
    ['Nail Appointment', 'وقت ناخن', 350000, 60],
    ['Blow-dry (Brushing)', 'براشینگ', 200000, 45],
    ['Hair Bleach / Color', 'دکلره مو', 900000, 120],
    ['Nail Repair', 'ترمیم ناخن', 250000, 40],
    ['Nail Extension', 'کاشت ناخن', 500000, 90],
    ['Haircut', 'کوتاهی مو', 300000, 45],
    ['Bridal Package', 'خدمات عروس', 5000000, 240],
  ];
  defaults.forEach((d) => insertService.run(uuid(), d[0], d[1], d[2], d[3]));
}

// Seed default settings
const defaultSettings = {
  salon_name: 'Rose Beauty',
  ai_mode: process.env.AI_MODE || 'local',
  admin_phone: process.env.ADMIN_PHONE || '',
  working_hours: '10:00-20:00',
};
const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
Object.entries(defaultSettings).forEach(([k, v]) => insertSetting.run(k, v));

module.exports = db;
