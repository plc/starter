/**
 * Postmark webhook event logger
 *
 * Receives delivery/bounce/spam/open events from Postmark's outbound
 * webhook and stores them for debugging email deliverability.
 *
 * No auth — the URL path itself is the secret (unguessable token).
 * Always returns 200 to prevent Postmark retries.
 */

const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

/**
 * POST /
 * Postmark sends one event per request.
 * Payload shape varies by event type but always includes RecordType and MessageID.
 */
router.post('/', async (req, res) => {
  const event = req.body;

  const recordType = event.RecordType || 'Unknown';
  const messageId = event.MessageID || null;
  const recipient = event.Recipient || event.Email || null;
  const tag = event.Tag || null;

  // Extract error info for bounces/spam
  let errorCode = null;
  let errorMessage = null;

  if (recordType === 'Bounce') {
    errorCode = event.TypeCode || event.Type;
    errorMessage = event.Description || event.Details;
  } else if (recordType === 'SpamComplaint') {
    errorCode = 'spam';
    errorMessage = event.Details || 'Spam complaint received';
  }

  console.log(
    '[postmark-webhook] %s: messageId=%s recipient=%s%s',
    recordType,
    messageId,
    recipient,
    errorMessage ? ' error=' + errorMessage : ''
  );

  try {
    await pool.query(
      `INSERT INTO postmark_webhooks (record_type, message_id, recipient, tag, error_code, error_message, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [recordType, messageId, recipient, tag, errorCode, errorMessage, JSON.stringify(event)]
    );
  } catch (err) {
    console.error('[postmark-webhook] DB insert failed:', err.message);
  }

  res.json({ status: 'ok' });
});

/**
 * GET /
 * Quick view of recent webhook events (most recent first).
 * Query params: ?limit=50&type=Bounce
 */
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const type = req.query.type || null;

  try {
    let query, values;
    if (type) {
      query = `SELECT id, record_type, message_id, recipient, tag, error_code, error_message, created_at
               FROM postmark_webhooks WHERE record_type = $1 ORDER BY created_at DESC LIMIT $2`;
      values = [type, limit];
    } else {
      query = `SELECT id, record_type, message_id, recipient, tag, error_code, error_message, created_at
               FROM postmark_webhooks ORDER BY created_at DESC LIMIT $1`;
      values = [limit];
    }

    const { rows } = await pool.query(query, values);
    res.json({ count: rows.length, events: rows });
  } catch (err) {
    console.error('[postmark-webhook] Query failed:', err.message);
    res.status(500).json({ error: 'Failed to query webhook events' });
  }
});

module.exports = router;
