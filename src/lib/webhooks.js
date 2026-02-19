/**
 * Fire-and-forget webhook delivery for calendar event mutations.
 *
 * Usage:
 *   const { fireWebhook } = require('../lib/webhooks');
 *   fireWebhook(calendarId, 'event.created', eventData);
 *
 * If the calendar has no webhook_url configured, this is a no-op.
 * If webhook_secret is set, the payload is signed with HMAC-SHA256
 * and sent in the X-CalDave-Signature header.
 */

const crypto = require('crypto');
const { pool } = require('../db');

/**
 * Deliver a webhook notification. Never blocks, never throws.
 *
 * @param {string} calendarId
 * @param {'event.created'|'event.updated'|'event.deleted'|'event.responded'} type
 * @param {object} eventData — full event object or { id } for deletes
 */
function fireWebhook(calendarId, type, eventData) {
  // Entire function is fire-and-forget — wrap in async IIFE, swallow errors
  (async () => {
    const { rows } = await pool.query(
      'SELECT webhook_url, webhook_secret FROM calendars WHERE id = $1',
      [calendarId]
    );

    if (rows.length === 0 || !rows[0].webhook_url) return;

    const { webhook_url, webhook_secret } = rows[0];

    const payload = {
      type,
      calendar_id: calendarId,
      event_id: eventData.id || null,
      event: eventData,
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'CalDave-Webhook/1.0',
    };

    if (webhook_secret) {
      headers['X-CalDave-Signature'] = crypto
        .createHmac('sha256', webhook_secret)
        .update(body)
        .digest('hex');
    }

    await fetch(webhook_url, { method: 'POST', headers, body });
  })().catch(() => {}); // swallow silently
}

module.exports = { fireWebhook };
