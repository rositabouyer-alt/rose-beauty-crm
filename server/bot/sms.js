/**
 * SMS SENDER
 * ----------------------------------------------------------------
 * This is written against a generic REST SMS provider. Swap the
 * fetch() call below for your provider's SDK (Twilio, Kavenegar,
 * SMS.ir, MessageBird, etc). Every place in the app that needs to
 * send an SMS calls sendSms(to, text) - you only need to edit this
 * one file when you plug in your real provider.
 * ----------------------------------------------------------------
 */
const fetch = require('node-fetch');

async function sendSms(to, text) {
  if (process.env.SMS_ENABLED !== 'true') {
    console.log(`[SMS - disabled, would send] to=${to} text="${text}"`);
    return { ok: true, simulated: true };
  }

  try {
    const res = await fetch(process.env.SMS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SMS_API_KEY}`,
      },
      body: JSON.stringify({
        sender: process.env.SMS_SENDER_NUMBER,
        receptor: to,
        message: text,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err) {
    console.error('[SMS] failed to send:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendSms };
