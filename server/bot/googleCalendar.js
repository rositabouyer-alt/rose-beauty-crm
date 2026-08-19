/**
 * GOOGLE CALENDAR INTEGRATION
 * ----------------------------------------------------------------
 * Automatically creates a Google Calendar event the moment a
 * booking is confirmed. You provide your own Google credentials
 * (as you mentioned) - this file just needs them in .env:
 *
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI      (e.g. https://developers.google.com/oauthplayground)
 *   GOOGLE_REFRESH_TOKEN
 *   GOOGLE_CALENDAR_ID       (use "primary" for your main calendar)
 *
 * How to get a refresh token (one-time setup):
 *   1. Go to https://console.cloud.google.com/ -> create a project
 *      -> enable the "Google Calendar API".
 *   2. Create an OAuth 2.0 Client ID (type: Web application), add
 *      https://developers.google.com/oauthplayground as an
 *      authorized redirect URI. Copy the client id/secret into .env.
 *   3. Open https://developers.google.com/oauthplayground, click the
 *      gear icon top-right, check "Use your own OAuth credentials",
 *      paste your client id/secret.
 *   4. In the left panel, find "Google Calendar API v3", select the
 *      `https://www.googleapis.com/auth/calendar` scope, click
 *      "Authorize APIs", sign in, then click "Exchange authorization
 *      code for tokens". Copy the refresh token into .env.
 *
 * If these env vars aren't set, this module quietly no-ops so the
 * rest of the app keeps working without Google Calendar configured.
 * ----------------------------------------------------------------
 */

let googleApisAvailable = true;
let google;
try {
  ({ google } = require('googleapis'));
} catch (err) {
  googleApisAvailable = false;
}

function isConfigured() {
  return (
    googleApisAvailable &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    process.env.GOOGLE_CLIENT_ID !== 'REPLACE_ME'
  );
}

function getCalendarClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: oAuth2Client });
}

/**
 * Parses the loose date/time text the booking flow collects
 * ("2026-08-20", "17:00") into a JS Date. Falls back to "now + 1h"
 * if parsing fails, so the calendar event is still created.
 */
function parseBookingDateTime(dateText, timeText) {
  const combined = `${dateText || ''} ${timeText || ''}`.trim();
  const parsed = new Date(combined);
  if (!isNaN(parsed.getTime())) return parsed;
  const fallback = new Date();
  fallback.setHours(fallback.getHours() + 1);
  return fallback;
}

/**
 * Creates a calendar event for a confirmed booking.
 * booking: { serviceName, customerName, customerPhone, date, time, durationMinutes }
 */
async function createBookingEvent(booking) {
  if (!isConfigured()) {
    console.log('[Google Calendar] not configured (missing env vars) - skipping event creation.');
    return { ok: false, skipped: true };
  }

  try {
    const calendar = getCalendarClient();
    const start = parseBookingDateTime(booking.date, booking.time);
    const end = new Date(start.getTime() + (booking.durationMinutes || 60) * 60000);

    const event = {
      summary: `Rose Beauty: ${booking.serviceName} - ${booking.customerName || booking.customerPhone}`,
      description: `Service: ${booking.serviceName}\nCustomer: ${booking.customerName || 'N/A'}\nPhone: ${booking.customerPhone}\nBooked via: ${booking.channel || 'website'}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      reminders: { useDefault: true },
    };

    const res = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      requestBody: event,
    });

    console.log(`[Google Calendar] event created: ${res.data.htmlLink}`);
    return { ok: true, eventLink: res.data.htmlLink };
  } catch (err) {
    console.error('[Google Calendar] failed to create event:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { createBookingEvent, isConfigured };
