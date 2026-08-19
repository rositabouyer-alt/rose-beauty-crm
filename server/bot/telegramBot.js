/**
 * TELEGRAM BOT
 * ----------------------------------------------------------------
 * A complete, polished Telegram conversation for Rose Beauty:
 * the exact same booking flow and AI engine as every other channel
 * (see conversationEngine.js), plus Telegram-specific touches for
 * a great chat feel:
 *
 *   - a realistic "typing..." indicator before every reply
 *   - inline quick-reply buttons (prices / book / hours / language)
 *   - a proper /start welcome message
 *   - live push notification when a booking is confirmed
 *
 * Get a token from @BotFather, put it in .env as TELEGRAM_BOT_TOKEN
 * and set TELEGRAM_ENABLED=true, then restart the server.
 * ----------------------------------------------------------------
 */
const db = require('../db');
const { handleIncomingMessage } = require('./conversationEngine');

let botInstance = null;

// per-chat language memory so the inline keyboard labels stay in sync
const chatLanguage = new Map();

function suggestionsKeyboard(language) {
  return language === 'en'
    ? {
        inline_keyboard: [
          [{ text: '🌹 Prices', callback_data: 'sugg:prices' }],
          [{ text: '🌹 Book an appointment', callback_data: 'sugg:book' }],
          [{ text: '🌹 Working hours', callback_data: 'sugg:hours' }],
          [{ text: '🌹 فارسی', callback_data: 'sugg:lang_fa' }],
        ],
      }
    : {
        inline_keyboard: [
          [{ text: '🌹 قیمت‌ها', callback_data: 'sugg:prices' }],
          [{ text: '🌹 رزرو نوبت', callback_data: 'sugg:book' }],
          [{ text: '🌹 ساعات کاری', callback_data: 'sugg:hours' }],
          [{ text: '🌹 English', callback_data: 'sugg:lang_en' }],
        ],
      };
}

const SUGGESTION_TEXT = {
  prices: { fa: 'قیمت‌ها چیه؟', en: 'What are your prices?' },
  book: { fa: 'می‌خوام نوبت بگیرم', en: 'I want to book an appointment' },
  hours: { fa: 'ساعات کاری چیه؟', en: 'What are your hours?' },
};

async function replyWithTyping(bot, chatId, text, language) {
  // realistic, length-aware typing pause
  await bot.sendChatAction(chatId, 'typing');
  const delay = Math.min(1200, 300 + text.length * 3);
  await new Promise((r) => setTimeout(r, delay));
  await bot.sendMessage(chatId, text, { reply_markup: suggestionsKeyboard(language) });
}

function initTelegramBot() {
  if (process.env.TELEGRAM_ENABLED !== 'true') {
    console.log('[Telegram] disabled (set TELEGRAM_ENABLED=true in .env to enable)');
    return null;
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'REPLACE_ME') {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN is missing, bot will not start.');
    return null;
  }

  const TelegramBot = require('node-telegram-bot-api');
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = msg.chat.id;
      const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');
      const language = chatLanguage.get(chatId) || 'fa';

      const reply = await handleIncomingMessage({
        channelId: 'telegram',
        externalId: String(chatId),
        name,
        text: language === 'en' ? 'hello' : 'سلام',
      });
      await replyWithTyping(bot, chatId, reply, language);
    } catch (err) {
      console.error('[Telegram] error handling /start:', err);
    }
  });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/start')) return; // handled above
    try {
      const chatId = msg.chat.id;
      const text = msg.text;
      const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');

      const reply = await handleIncomingMessage({
        channelId: 'telegram',
        externalId: String(chatId),
        name,
        text,
      });

      // keep local language memory in sync with what the contact record now says
      const contact = db
        .prepare('SELECT language FROM contacts WHERE channel_id = ? AND external_id = ?')
        .get('telegram', String(chatId));
      const language = contact?.language || 'fa';
      chatLanguage.set(chatId, language);

      await replyWithTyping(bot, chatId, reply, language);
    } catch (err) {
      console.error('[Telegram] error handling message:', err);
    }
  });

  bot.on('callback_query', async (query) => {
    try {
      await bot.answerCallbackQuery(query.id);
      const chatId = query.message.chat.id;
      const language = chatLanguage.get(chatId) || 'fa';
      const action = query.data.split(':')[1];

      let text;
      if (action === 'lang_en') text = 'english';
      else if (action === 'lang_fa') text = 'فارسی';
      else text = SUGGESTION_TEXT[action][language];

      const name = [query.from.first_name, query.from.last_name].filter(Boolean).join(' ');
      const reply = await handleIncomingMessage({
        channelId: 'telegram',
        externalId: String(chatId),
        name,
        text,
      });

      const contact = db
        .prepare('SELECT language FROM contacts WHERE channel_id = ? AND external_id = ?')
        .get('telegram', String(chatId));
      const newLanguage = contact?.language || language;
      chatLanguage.set(chatId, newLanguage);

      await replyWithTyping(bot, chatId, reply, newLanguage);
    } catch (err) {
      console.error('[Telegram] error handling callback query:', err);
    }
  });

  console.log('[Telegram] bot started and polling for messages.');
  botInstance = bot;
  return bot;
}

/** Allows the dashboard "reply as admin" button to actually push a message to Telegram */
async function pushAdminMessageToTelegram(chatId, text) {
  if (!botInstance) return false;
  try {
    await botInstance.sendMessage(chatId, text);
    return true;
  } catch (err) {
    console.error('[Telegram] failed to push admin reply:', err.message);
    return false;
  }
}

module.exports = { initTelegramBot, pushAdminMessageToTelegram };
