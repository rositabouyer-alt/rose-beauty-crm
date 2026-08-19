const { v4: uuid } = require('uuid');
const db = require('../db');
const { generateAIReply, getServices, formatPrice } = require('./ai');
const { sendSms } = require('./sms');
const { createBookingEvent } = require('./googleCalendar');

// In-memory booking state per contact (simple + fast; swap for redis if you scale out)
const bookingState = new Map(); // contact_id -> { step, service_id, date, time }

function getOrCreateContact(channelId, externalId, name, phone) {
  let contact = db
    .prepare('SELECT * FROM contacts WHERE channel_id = ? AND external_id = ?')
    .get(channelId, externalId);

  if (!contact) {
    const id = uuid();
    db.prepare(
      `INSERT INTO contacts (id, channel_id, external_id, name, phone) VALUES (?, ?, ?, ?, ?)`
    ).run(id, channelId, externalId, name || null, phone || null);
    contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  } else if (name && !contact.name) {
    db.prepare('UPDATE contacts SET name = ? WHERE id = ?').run(name, contact.id);
  }
  return contact;
}

function logMessage(channelId, contactId, direction, sender, body, isAi = false) {
  db.prepare(
    `INSERT INTO messages (id, channel_id, contact_id, direction, sender, body, is_ai) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), channelId, contactId, direction, sender, body, isAi ? 1 : 0);
}

function setContactLanguage(contactId, language) {
  db.prepare('UPDATE contacts SET language = ? WHERE id = ?').run(language, contactId);
}

function detectLanguageSwitch(text) {
  const t = text.trim().toLowerCase();
  if (['english', 'en', '/en', 'انگلیسی'].includes(t)) return 'en';
  if (['persian', 'farsi', 'fa', '/fa', 'فارسی'].includes(t)) return 'fa';
  return null;
}

function findServiceByText(text) {
  const services = getServices();
  const t = text.toLowerCase();
  return services.find(
    (s) => t.includes(s.name_en.toLowerCase()) || t.includes(s.name_fa)
  );
}

function extractPhone(text) {
  const match = text.match(/(\+?\d[\d\s-]{7,})/);
  return match ? match[0].replace(/[\s-]/g, '') : null;
}

function getRecentHistory(contactId, limit = 10) {
  const rows = db
    .prepare('SELECT direction, body FROM messages WHERE contact_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(contactId, limit)
    .reverse();
  return rows.map((r) => ({ role: r.direction === 'in' ? 'user' : 'assistant', content: r.body }));
}

function suggestExtra(language) {
  const services = getServices();
  const pick = services[Math.floor(Math.random() * services.length)];
  const name = language === 'en' ? pick.name_en : pick.name_fa;
  return language === 'en'
    ? `\n\n🌹 Many clients also add "${name}" (${formatPrice(pick.price)}) to their visit — want me to add it too?`
    : `\n\n🌹 خیلی از مشتری‌ها همراه این کار «${name}» (${formatPrice(pick.price)}) رو هم انجام میدن — می‌خواید این رو هم اضافه کنم؟`;
}

/**
 * Main entry: handle any incoming message from ANY channel (telegram, website, whatsapp, instagram).
 * Returns the text reply to send back to the customer.
 */
async function handleIncomingMessage({ channelId, externalId, name, text }) {
  const contact = getOrCreateContact(channelId, externalId, name, null);
  logMessage(channelId, contact.id, 'in', name || externalId, text);

  // language switch command
  const switchTo = detectLanguageSwitch(text);
  if (switchTo) {
    setContactLanguage(contact.id, switchTo);
    const reply =
      switchTo === 'en' ? 'Language switched to English 🌹' : 'زبان به فارسی تغییر کرد 🌹';
    logMessage(channelId, contact.id, 'out', 'bot', reply, true);
    return reply;
  }

  const language = contact.language || 'fa';
  let state = bookingState.get(contact.id) || { step: 'idle' };

  // --- Booking state machine ---
  if (state.step === 'idle' && /book|appointment|رزرو|نوبت|وقت/i.test(text)) {
    state = { step: 'await_service' };
  }

  if (state.step === 'await_service') {
    const service = findServiceByText(text);
    if (service) {
      state = { step: 'await_datetime', service_id: service.id };
    }
  } else if (state.step === 'await_datetime') {
    // very light parsing: expects something like "2026-08-20 17:00" or free text date/time
    const parts = text.trim().split(/\s+/);
    state.date = parts[0] || text;
    state.time = parts[1] || '';
    state.step = 'await_phone';
  } else if (state.step === 'await_phone') {
    const phone = extractPhone(text) || text.trim();
    state.phone = phone;
    state.step = 'confirm';
  } else if (state.step === 'confirm') {
    if (/yes|بله|اره|آره|confirm|تایید/i.test(text)) {
      const bookingId = uuid();
      db.prepare(
        `INSERT INTO bookings (id, contact_id, channel_id, service_id, customer_name, customer_phone, requested_date, requested_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(bookingId, contact.id, channelId, state.service_id, name || contact.name, state.phone, state.date, state.time);

      db.prepare('UPDATE contacts SET phone = ? WHERE id = ?').run(state.phone, contact.id);

      const service = db.prepare('SELECT * from services WHERE id = ?').get(state.service_id);
      const serviceName = language === 'en' ? service.name_en : service.name_fa;

      // notify customer
      const customerMsg =
        language === 'en'
          ? `Your appointment at Rose Beauty is booked 🌹\nService: ${serviceName}\nDate: ${state.date} ${state.time}\nSee you soon!`
          : `نوبت شما در سالن Rose Beauty ثبت شد 🌹\nخدمت: ${serviceName}\nتاریخ: ${state.date} ${state.time}\nمنتظر دیدارتون هستیم!`;
      await sendSms(state.phone, customerMsg);
      db.prepare('UPDATE bookings SET notified_customer = 1 WHERE id = ?').run(bookingId);

      // notify admin (SMS)
      const adminPhone = db.prepare("SELECT value FROM settings WHERE key = 'admin_phone'").get()?.value;
      if (adminPhone) {
        const adminMsg = `New booking: ${serviceName} for ${name || state.phone} on ${state.date} ${state.time}. Phone: ${state.phone}`;
        await sendSms(adminPhone, adminMsg);
        db.prepare('UPDATE bookings SET notified_admin = 1 WHERE id = ?').run(bookingId);
      }

      // create the Google Calendar event automatically (no-ops quietly if not configured)
      const calendarResult = await createBookingEvent({
        serviceName,
        customerName: name || contact.name,
        customerPhone: state.phone,
        date: state.date,
        time: state.time,
        durationMinutes: service.duration_minutes,
        channel: channelId,
      });
      if (calendarResult.ok) {
        db.prepare('UPDATE bookings SET google_event_link = ? WHERE id = ?').run(calendarResult.eventLink, bookingId);
      }

      bookingState.delete(contact.id);
      const finalReply = customerMsg + suggestExtra(language);
      logMessage(channelId, contact.id, 'out', 'bot', finalReply, true);
      return finalReply;
    }
    bookingState.delete(contact.id);
    state = { step: 'idle' };
  }

  bookingState.set(contact.id, state);

  // Compose the next prompt based on state, or fall through to the AI engine
  let reply;
  if (state.step === 'await_service') {
    reply =
      language === 'en'
        ? `Sure! Which service would you like?\n${getServices().map((s) => `🌹 ${s.name_en} — ${formatPrice(s.price)}`).join('\n')}`
        : `باشه! کدوم خدمت رو می‌خواید؟\n${getServices().map((s) => `🌹 ${s.name_fa} — ${formatPrice(s.price)}`).join('\n')}`;
  } else if (state.step === 'await_datetime') {
    reply = language === 'en' ? 'Great choice! What date and time works for you? (e.g. 2026-08-20 17:00)' : 'انتخاب خوبیه! چه تاریخ و ساعتی براتون مناسبه؟ (مثلا 1405-05-29 17:00)';
  } else if (state.step === 'await_phone') {
    reply = language === 'en' ? 'Could you share your phone number so we can confirm the appointment?' : 'شماره تماستون رو می‌فرمایید تا نوبت رو تایید کنیم؟';
  } else if (state.step === 'confirm') {
    const service = db.prepare('SELECT * from services WHERE id = ?').get(state.service_id);
    const serviceName = language === 'en' ? service.name_en : service.name_fa;
    reply =
      language === 'en'
        ? `Please confirm: ${serviceName} on ${state.date} ${state.time}, phone ${state.phone}. Reply "yes" to confirm.`
        : `لطفا تایید کنید: ${serviceName} در تاریخ ${state.date} ${state.time}، شماره ${state.phone}. برای تایید «بله» بنویسید.`;
  } else {
    // No active booking flow -> let the AI engine answer (FAQ, prices, hours, general chat)
    const history = getRecentHistory(contact.id, 10);
    const { reply: aiReply } = await generateAIReply({ userText: text, language, history });
    reply = aiReply;
  }

  logMessage(channelId, contact.id, 'out', 'bot', reply, true);
  return reply;
}

/** Used by the dashboard "reply as admin" feature - a human takes over the conversation */
function sendAdminReply({ channelId, contactId, text }) {
  logMessage(channelId, contactId, 'out', 'admin', text, false);
  // NOTE: actually pushing this out to Telegram/WhatsApp/Instagram is wired in
  // server/bot/telegramBot.js (and the equivalent webhook handlers you add later).
}

module.exports = { handleIncomingMessage, sendAdminReply, getOrCreateContact, logMessage };
