# 🌹 Rose Beauty CRM

A complete, real, running CRM for a beauty salon: multi-channel inbox (Website, Telegram,
Instagram, WhatsApp), an AI-ready smart chat bot with a booking flow, editable services &
prices, a call-request queue, and a colorful animated dashboard.

Everything works out of the box with **zero API keys** (the bot uses a built-in local smart
responder). When you're ready, plug in your own LLM, SMS provider, and messaging platform
tokens — the code is already structured for it.

---

## 1. Requirements

- Node.js 18+
- npm

## 2. Install & Run

```bash
cd rose-beauty-crm
npm install
cp .env.example .env
npm start
```

Open **http://localhost:4000** — the dashboard loads immediately, with a SQLite database
created automatically at `server/data/rosebeauty.db`.

Try the **"Test Website Chat"** tab right away — it runs through the real AI + booking engine,
no setup needed.

## 3. Project structure

```
rose-beauty-crm/
├── server/
│   ├── index.js              # Express app entry point
│   ├── db.js                 # SQLite schema + seed data (channels, services)
│   ├── routes/                # REST API (channels, messages, bookings, calls, services, settings)
│   └── bot/
│       ├── conversationEngine.js  # Shared brain used by every channel (booking state machine)
│       ├── ai.js               # Local smart responder + external LLM hook
│       ├── sms.js              # SMS sender (stub, ready for any provider)
│       └── telegramBot.js      # Telegram integration (node-telegram-bot-api)
├── public/                    # Dashboard frontend (vanilla HTML/CSS/JS, no build step)
├── .env.example
└── package.json
```

## 4. Connecting real channels

### Telegram
1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. In `.env`, set:
   ```
   TELEGRAM_ENABLED=true
   TELEGRAM_BOT_TOKEN=your-token
   ```
3. Restart the server. The bot now gives a **complete, polished conversation**:
   - `/start` sends a proper welcome message
   - every reply comes with inline quick-reply buttons (Prices / Book / Hours / switch language)
   - a realistic "typing…" indicator plays before each reply
   - it runs through the exact same booking flow, AI engine, and Google Calendar /
     SMS notifications as every other channel
   - every message appears live in the dashboard's **Channels → Telegram** tab

### WhatsApp / Instagram (Meta Cloud API)
Point your Meta webhook at:
```
POST /api/messages/webhook/whatsapp
POST /api/messages/webhook/instagram
Body: { "externalId": "<sender id>", "name": "<sender name>", "text": "<message text>" }
```
Then wire the outbound "send message" call for each platform inside
`server/routes/messages.js` (`/reply` route) next to the existing Telegram example.

### Website widget
`POST /api/messages/website/send` with `{ visitorId, name, text }` — embed a small chat widget
on your site that calls this endpoint (the "Test Website Chat" tab in the dashboard, and the
full `public/website.html` marketing page, are both working reference implementations).

## 5. Connecting a real AI (optional)

By default `AI_MODE=local` — a built-in rule-based responder that already understands prices,
working hours, booking requests, greetings, and free text, in **both Persian and English**
(customers can switch anytime by typing "english" / "فارسی").

**Option A — a local Ollama model (e.g. Gemma):**
1. Install [Ollama](https://ollama.com) and pull a model:
   ```
   ollama pull gemma3:4b
   ```
2. In `.env` (or the dashboard **Settings** tab), set:
   ```
   AI_MODE=ollama
   OLLAMA_URL=http://localhost:11434/api/chat
   OLLAMA_MODEL=gemma3:4b
   ```
No API key needed — everything runs on your own machine.

**Option B — any OpenAI-compatible LLM:**
1. Set `AI_MODE=api` in `.env` (or in the dashboard **Settings** tab).
2. Fill in `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` — this works with any OpenAI-compatible
   endpoint (OpenAI, Groq, etc).

Whichever mode you pick, if the call fails or nothing is configured, the app **automatically
falls back** to the local engine so the bot never goes silent.

`server/bot/ai.js` is intentionally small and easy to rewrite if you want to call the
Anthropic API, a custom RAG pipeline over your PDFs, or anything else.

## 6. Connecting SMS

Set `SMS_ENABLED=true` and fill `SMS_API_URL` / `SMS_API_KEY` / `SMS_SENDER_NUMBER` in `.env`.
`server/bot/sms.js` sends a generic REST POST — swap it for your provider's SDK
(Twilio, Kavenegar, SMS.ir, etc). Until then, SMS sends are simulated and logged to the
server console so you can test the full flow. Every confirmed booking sends an SMS to both
the customer and to `admin_phone` (set in **Settings**).

## 7. Google Calendar (automatic event on every booking)

The moment a booking is confirmed — from **any** channel — `server/bot/googleCalendar.js`
automatically creates an event on your Google Calendar with the service, customer, phone
number, and time slot. You provide your own Google API credentials in `.env`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_REFRESH_TOKEN=...
GOOGLE_CALENDAR_ID=primary
```

Full step-by-step instructions for getting a client id/secret + refresh token (via Google
Cloud Console + the OAuth Playground) are written at the top of `server/bot/googleCalendar.js`.
If these variables aren't set, the app just skips calendar creation quietly — nothing breaks.

## 8. What's already working end-to-end

- **Booking flow**: customer says "I want to book" → bot asks for service → date/time →
  phone number → confirms → creates a booking, texts the customer, texts the admin, and
  suggests an add-on service.
- **Per-channel dashboard**: click any channel (Website / Telegram / Instagram / WhatsApp) to
  see every conversation, click a conversation to read the full message history with
  timestamps, and reply manually as a human at any time.
- **Call requests**: any phone number a customer leaves (or one you add manually) shows up in
  **Call Requests** with the date it was registered; check it off once you've called them back.
- **Editable prices**: change any service name/price/duration live from **Services & Prices** —
  the bot immediately uses the new prices in its replies.
- **Bilingual bot**: every reply is generated per-contact language (`fa` by default), and a
  customer can switch language mid-conversation.
- **PDF → RAG (your note on the whiteboard)**: this scaffold is deliberately kept out of the
  base app to keep it lightweight, but `server/bot/ai.js` is exactly where you'd add a
  retrieval step (embed your PDFs, fetch relevant chunks, inject them into the LLM prompt)
  before calling `callExternalAI()`.

## 8. Public website with the chat widget

Open **http://localhost:4000/website.html** — this is the customer-facing marketing page for
Rose Beauty: an animated hero (an animated silk-ribbon background plus a hand-drawn rose mark
that draws itself in on load), a live services/pricing grid pulled straight from
`GET /api/services`, and a floating chat widget (bottom-left, rose logo bubble) that opens into
a full chat panel.

The widget is **not a mockup** — it POSTs to the same `/api/messages/website/send` endpoint
used by the dashboard's "Test Website Chat" tab, so every message flows through the real
booking + AI engine (`server/bot/conversationEngine.js`), gets logged to SQLite, and shows up
live in the dashboard's **Channels → Website** tab. Clicking "Book this service" on any service
card opens the widget and starts a booking for that exact service.

It also includes a Persian/English toggle (top-right, "EN / فا") that switches all page copy —
independent from the bot's own per-conversation language switch (type "english" / "فارسی" in
the chat itself).

Files: `public/website.html`, `public/css/website.css`, `public/js/website.js`.
Swap the inline SVG rose mark (used in the nav, hero, and chat avatar) for your own logo file
whenever you have one — search each file for `rose-mark`/`chat-avatar` to find every spot.

## 9. Security note

This is a development-ready CRM. Before putting it in production, add authentication to the
dashboard (it currently has none), rate-limit the public endpoints
(`/api/messages/website/send`, `/api/messages/webhook/*`), and move secrets out of `.env`
into your hosting platform's secret manager.
