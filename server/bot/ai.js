/**
 * AI ENGINE
 * ----------------------------------------------------------------
 * Three modes, controlled by AI_MODE in .env (or the Settings page):
 *
 *  - "local" : a smart rule/keyword based responder that works
 *              completely offline, no API key needed. Good enough
 *              to answer FAQs, prices, hours, and to drive the
 *              booking flow.
 *
 *  - "ollama": forwards the conversation to a local Ollama model
 *              (e.g. gemma3:4b). Requires Ollama running locally
 *              (https://ollama.com) with the model already pulled:
 *                  ollama pull gemma3:4b
 *              Configure OLLAMA_URL / OLLAMA_MODEL in .env.
 *
 *  - "api"   : forwards the conversation to any OpenAI-compatible
 *              LLM endpoint (OpenAI, Anthropic via a compat proxy,
 *              Groq, etc). Fill in AI_API_URL / AI_API_KEY / AI_MODEL.
 *
 * Every mode falls back to "local" automatically on any failure, so
 * the bot never goes silent.
 * ----------------------------------------------------------------
 */

const fetch = require('node-fetch');
const db = require('../db');

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function systemPromptFor(language) {
  return language === 'en'
    ? 'You are Rose AI, the smart assistant of Rose Beauty salon. Be warm, concise and helpful. Help the customer book services, answer questions and suggest add-on services. Use the 🌹 emoji as the salon\'s signature mark instead of other emoji where it fits.'
    : 'شما دستیار هوشمند سالن زیبایی Rose Beauty هستید به اسم رز. مودب، کوتاه و مفید پاسخ بده. به مشتری برای رزرو وقت کمک کن، سوالاتش را جواب بده و خدمات مکمل هم پیشنهاد بده. به‌جای ایموجی‌های مختلف، فقط از ایموجی 🌹 به‌عنوان نشان سالن استفاده کن.';
}

async function callOllama(messages, language) {
  const url = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
  const model = process.env.OLLAMA_MODEL || 'gemma3:4b';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPromptFor(language) }, ...messages],
        stream: false,
        options: { temperature: 0.3 },
      }),
    });
    const data = await res.json();
    return data?.message?.content || null;
  } catch (err) {
    console.error('[AI] Ollama call failed, falling back to local engine:', err.message);
    return null;
  }
}

async function callExternalAI(messages, language) {
  const url = process.env.AI_API_URL;
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  if (!url || !key || key === 'REPLACE_ME') {
    // No key configured yet -> fall back to local engine so the app never breaks
    return null;
  }

  const body = {
    model,
    messages: [{ role: 'system', content: systemPromptFor(language) }, ...messages],
    max_tokens: 500,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[AI] external call failed, falling back to local engine:', err.message);
    return null;
  }
}

// ---------- LOCAL RULE-BASED ENGINE ----------

function getServices() {
  return db.prepare('SELECT * FROM services WHERE active = 1').all();
}

function formatPrice(p) {
  return Number(p).toLocaleString('en-US') + ' T';
}

function servicesListText(language) {
  const services = getServices();
  return services
    .map((s) => `🌹 ${language === 'en' ? s.name_en : s.name_fa} — ${formatPrice(s.price)} (${s.duration_minutes} min)`)
    .join('\n');
}

function localReply(userText, language, context = {}) {
  const text = (userText || '').toLowerCase();

  const has = (words) => words.some((w) => text.includes(w));

  if (has(['price', 'قیمت', 'هزینه', 'cost'])) {
    return language === 'en'
      ? `Here are our current prices at Rose Beauty:\n${servicesListText('en')}\n\nWould you like to book one of these?`
      : `این قیمت‌های فعلی سالن Rose Beauty هست:\n${servicesListText('fa')}\n\nمی‌خواید یکی از این خدمات رو رزرو کنید؟`;
  }

  if (has(['hour', 'ساعت کار', 'open', 'باز', 'زمان کاری'])) {
    const hours = getSetting('working_hours', '10:00-20:00');
    return language === 'en'
      ? `Rose Beauty is open daily from ${hours}. Would you like to book an appointment?`
      : `سالن Rose Beauty هر روز از ساعت ${hours} باز هست. می‌خواید نوبت بگیرید؟`;
  }

  if (has(['book', 'appointment', 'رزرو', 'نوبت', 'وقت'])) {
    return language === 'en'
      ? `Great! Which service would you like to book?\n${servicesListText('en')}\n\nJust tell me the service name, and your preferred date & time.`
      : `عالیه! کدوم خدمت رو می‌خواید رزرو کنید؟\n${servicesListText('fa')}\n\nفقط اسم خدمت و تاریخ/ساعت مورد نظرتون رو بگید.`;
  }

  if (has(['hi', 'hello', 'سلام', 'درود'])) {
    return language === 'en'
      ? `🌹 Welcome to Rose Beauty! I can help you book an appointment, check prices, or answer any question. How can I help you today?`
      : `🌹 به سالن زیبایی Rose Beauty خوش اومدید! می‌تونم براتون نوبت رزرو کنم، قیمت‌ها رو بگم یا به سوالاتون جواب بدم. چطور می‌تونم کمکتون کنم؟`;
  }

  if (has(['thank', 'مرسی', 'ممنون'])) {
    return language === 'en'
      ? `You're very welcome! Is there anything else I can help you with?`
      : `خواهش می‌کنم! کار دیگه‌ای هم هست که بتونم کمکتون کنم؟`;
  }

  // Default fallback: keep the conversation going, offer options
  return language === 'en'
    ? `I'm here to help with bookings, prices, working hours or any question about Rose Beauty. Could you tell me a bit more about what you need? For example: "I want to book a nail appointment" or "what is the price of hair coloring?"`
    : `من اینجام تا در مورد رزرو، قیمت‌ها، ساعت کاری یا هر سوال دیگه‌ای درباره Rose Beauty کمکتون کنم. می‌تونید کمی بیشتر توضیح بدید؟ مثلا: «می‌خوام وقت ناخن بگیرم» یا «قیمت رنگ مو چنده؟»`;
}

/**
 * Main entry point used by the whole app.
 * history: [{role: 'user'|'assistant', content: string}]
 */
async function generateAIReply({ userText, language = 'fa', history = [] }) {
  const mode = getSetting('ai_mode', process.env.AI_MODE || 'local');
  const messages = [...history, { role: 'user', content: userText }];

  if (mode === 'ollama') {
    const ollamaReply = await callOllama(messages, language);
    if (ollamaReply) return { reply: ollamaReply, source: 'ollama' };
  } else if (mode === 'api') {
    const externalReply = await callExternalAI(messages, language);
    if (externalReply) return { reply: externalReply, source: 'api' };
  }

  return { reply: localReply(userText, language), source: 'local' };
}

module.exports = { generateAIReply, servicesListText, getServices, formatPrice };
