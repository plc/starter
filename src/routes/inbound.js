/**
 * Inbound email webhook routes
 *
 * POST /inbound/:token — receives webhook payloads from email services
 *
 * Each calendar has a unique inbound_token. The webhook URL is:
 *   https://caldave.fly.dev/inbound/<token>
 *
 * Supports multiple email-to-webhook providers:
 *   - Postmark Inbound (Attachments array with base64 Content)
 *   - AgentMail (message.received event; attachment content fetched via API)
 *
 * No Bearer auth — the unguessable token in the URL authenticates the request.
 */

const { Router } = require('express');
const ical = require('node-ical');
const { pool } = require('../db');
const { eventId } = require('../lib/ids');

const router = Router();

const AGENTMAIL_API = 'https://api.agentmail.to/v0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether the incoming payload is from AgentMail.
 */
function isAgentMail(body) {
  return body.event_type === 'message.received' && body.message;
}

/**
 * Normalize an incoming webhook payload into a common shape:
 *   { subject, textBody, attachments: [{ ct, name, content? | agentmail? }] }
 *
 * For Postmark, attachments include inline base64 content.
 * For AgentMail, attachments include metadata needed to fetch content via API.
 */
function normalizePayload(body) {
  if (isAgentMail(body)) {
    const msg = body.message;
    return {
      subject: msg.subject || '',
      textBody: msg.text || '',
      attachments: (msg.attachments || []).map((a) => ({
        ct: a.content_type || '',
        name: a.filename || '',
        content: null, // must be fetched via API
        agentmail: {
          inboxId: msg.inbox_id,
          messageId: msg.message_id,
          attachmentId: a.attachment_id,
        },
      })),
    };
  }

  // Postmark format (default)
  return {
    subject: body.Subject || '',
    textBody: body.TextBody || '',
    attachments: (body.Attachments || []).map((a) => ({
      ct: a.ContentType || '',
      name: a.Name || '',
      content: a.Content || null, // base64
    })),
  };
}

/**
 * Find the first .ics attachment from normalized attachments.
 * Returns the attachment object or null.
 */
function findIcsAttachment(attachments) {
  if (!attachments || !Array.isArray(attachments)) return null;
  return attachments.find((a) =>
    a.ct.includes('text/calendar') ||
    a.ct.includes('application/ics') ||
    a.name.endsWith('.ics')
  ) || null;
}

/**
 * Fetch .ics content from AgentMail's attachment API.
 * Returns the iCal string, or null on failure.
 */
async function fetchAgentMailAttachment(meta, apiKey) {
  if (!apiKey) {
    console.log('Inbound email: no agentmail_api_key on calendar, cannot fetch attachment');
    return null;
  }

  const url = `${AGENTMAIL_API}/inboxes/${meta.inboxId}/messages/${meta.messageId}/attachments/${meta.attachmentId}`;

  // Step 1: Get the download URL
  const metaRes = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!metaRes.ok) {
    console.log(`Inbound email: AgentMail attachment metadata fetch failed: ${metaRes.status}`);
    return null;
  }

  const metaJson = await metaRes.json();
  const downloadUrl = metaJson.download_url;
  if (!downloadUrl) {
    console.log('Inbound email: AgentMail attachment has no download_url');
    return null;
  }

  // Step 2: Download the actual file
  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) {
    console.log(`Inbound email: AgentMail attachment download failed: ${fileRes.status}`);
    return null;
  }

  return await fileRes.text();
}

/**
 * Parse iCal string into a node-ical object.
 */
function parseIcsString(icsString) {
  if (!icsString) return null;
  return ical.sync.parseICS(icsString);
}

/**
 * Decode an inline attachment's content.
 * Handles base64-encoded or plain-text iCal data.
 */
function decodeInlineContent(content) {
  if (!content) return null;
  // If it looks like base64, decode it; otherwise treat as plain text
  if (/^[A-Za-z0-9+/\r\n]+=*\s*$/.test(content) && !content.includes('BEGIN:VCALENDAR')) {
    return Buffer.from(content, 'base64').toString('utf-8');
  }
  return content;
}

/**
 * Extract the METHOD from parsed iCal data.
 * Checks VCALENDAR component first, then individual VEVENTs.
 * Defaults to 'REQUEST' if not found.
 */
function extractMethod(parsed) {
  for (const key of Object.keys(parsed)) {
    const component = parsed[key];
    if (component.type === 'VCALENDAR' && component.method) {
      return component.method.toUpperCase();
    }
  }
  for (const key of Object.keys(parsed)) {
    if (parsed[key].type === 'VEVENT' && parsed[key].method) {
      return parsed[key].method.toUpperCase();
    }
  }
  return 'REQUEST';
}

/**
 * Find the first VEVENT in parsed iCal data.
 */
function findVEvent(parsed) {
  for (const key of Object.keys(parsed)) {
    if (parsed[key].type === 'VEVENT') return parsed[key];
  }
  return null;
}

/**
 * Extract a clean email from an organizer/attendee value.
 * Handles both plain strings and node-ical ParameterValue objects.
 * Strips "mailto:" prefix.
 */
function cleanEmail(value) {
  if (!value) return null;
  const str = typeof value === 'object' && value.val ? value.val : String(value);
  return str.replace(/^mailto:/i, '').trim().toLowerCase();
}

/**
 * Extract attendee emails from VEVENT attendee field.
 * Can be a single value or an array. Returns string[] or null.
 */
function extractAttendees(attendeeField) {
  if (!attendeeField) return null;
  const list = Array.isArray(attendeeField) ? attendeeField : [attendeeField];
  const emails = list.map((a) => cleanEmail(a)).filter(Boolean);
  return emails.length > 0 ? emails : null;
}

/**
 * Safely extract a string from a node-ical field that may be a string
 * or a ParameterValue object.
 */
function extractString(field) {
  if (!field) return null;
  if (typeof field === 'object' && field.val) return field.val;
  return String(field);
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /:token
 * Per-calendar inbound email webhook.
 *
 * The token in the URL identifies the calendar. No additional auth needed.
 * Always returns 200 (even on errors) to prevent webhook retries.
 */
router.post('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // 1. Look up calendar by inbound token
    const { rows: calendars } = await pool.query(
      'SELECT * FROM calendars WHERE inbound_token = $1',
      [token]
    );

    if (calendars.length === 0) {
      return res.status(404).json({ error: 'Invalid inbound webhook token' });
    }

    const calendar = calendars[0];
    const provider = isAgentMail(req.body) ? 'agentmail' : 'postmark';

    // 2. Normalize payload
    const payload = normalizePayload(req.body);

    // Log attachment info
    if (payload.attachments.length > 0) {
      console.log(`Inbound email (${provider}): ${payload.attachments.length} attachment(s) for calendar ${calendar.id}:`,
        payload.attachments.map(a => `${a.name} (${a.ct})`).join(', '));
    }

    // 3. Find and parse .ics attachment
    const icsAttachment = findIcsAttachment(payload.attachments);
    let parsed = null;

    if (icsAttachment) {
      let icsString;

      if (icsAttachment.agentmail) {
        // AgentMail: fetch attachment content via API
        icsString = await fetchAgentMailAttachment(icsAttachment.agentmail, calendar.agentmail_api_key);
      } else {
        // Postmark: decode inline content
        icsString = decodeInlineContent(icsAttachment.content);
      }

      if (icsString) {
        parsed = parseIcsString(icsString);
      }
    }

    // Fallback: check if text body contains raw iCal data
    if (!parsed && payload.textBody && payload.textBody.includes('BEGIN:VCALENDAR')) {
      try {
        parsed = parseIcsString(payload.textBody);
        console.log(`Inbound email (${provider}): parsed iCal from text body for calendar ${calendar.id}`);
      } catch (e) {
        console.log(`Inbound email (${provider}): text body looked like iCal but failed to parse for calendar ${calendar.id}`);
      }
    }

    if (!parsed) {
      console.log(`Inbound email (${provider}): no .ics data found for calendar ${calendar.id} (Subject: ${payload.subject || 'none'})`);
      return res.json({ status: 'ignored', reason: 'No .ics attachment found' });
    }

    // 4. Extract method and VEVENT
    const method = extractMethod(parsed);
    const vevent = findVEvent(parsed);

    if (!vevent) {
      return res.json({ status: 'ignored', reason: 'No VEVENT found in .ics' });
    }

    // 5. Extract event data
    const title = extractString(vevent.summary) || payload.subject || 'Untitled';
    const start = vevent.start ? new Date(vevent.start).toISOString() : null;
    const end = vevent.end
      ? new Date(vevent.end).toISOString()
      : start
        ? new Date(new Date(start).getTime() + 3600000).toISOString()
        : null;

    if (!start) {
      return res.json({ status: 'ignored', reason: 'VEVENT missing start time' });
    }

    const location = extractString(vevent.location);
    const description = vevent.description || null;
    const uid = vevent.uid || null;
    const organiserEmail = cleanEmail(vevent.organizer);
    const attendees = extractAttendees(vevent.attendee);

    // 6. Handle by method

    // --- CANCEL ---
    if (method === 'CANCEL') {
      if (!uid) {
        return res.json({ status: 'ignored', reason: 'CANCEL without UID' });
      }

      const { rows: existing } = await pool.query(
        'SELECT id FROM events WHERE calendar_id = $1 AND ical_uid = $2',
        [calendar.id, uid]
      );

      if (existing.length === 0) {
        return res.json({ status: 'ignored', reason: 'No matching event to cancel' });
      }

      await pool.query(
        "UPDATE events SET status = 'cancelled', updated_at = now() WHERE id = $1",
        [existing[0].id]
      );

      console.log(`Inbound email (${provider}): cancelled event ${existing[0].id} for calendar ${calendar.id}`);
      return res.json({ status: 'cancelled', event_id: existing[0].id });
    }

    // --- REQUEST / PUBLISH (new invite or update) ---
    if (method === 'REQUEST' || method === 'PUBLISH') {
      // Check for existing event by ical_uid
      if (uid) {
        const { rows: existing } = await pool.query(
          'SELECT * FROM events WHERE calendar_id = $1 AND ical_uid = $2',
          [calendar.id, uid]
        );

        if (existing.length > 0) {
          // Update existing event
          const evt = existing[0];
          const timesChanged =
            new Date(evt.start_time).getTime() !== new Date(start).getTime() ||
            new Date(evt.end_time).getTime() !== new Date(end).getTime();

          // Reset to tentative if times changed (agent needs to re-confirm)
          const newStatus = timesChanged ? 'tentative' : evt.status;

          await pool.query(
            `UPDATE events SET
               title = $1, start_time = $2, end_time = $3,
               location = $4, description = $5, attendees = $6,
               organiser_email = $7, status = $8, updated_at = now()
             WHERE id = $9`,
            [
              title,
              start,
              end,
              location,
              description,
              attendees ? JSON.stringify(attendees) : null,
              organiserEmail,
              newStatus,
              evt.id,
            ]
          );

          console.log(`Inbound email (${provider}): updated event ${evt.id} for calendar ${calendar.id}`);
          return res.json({ status: 'updated', event_id: evt.id });
        }
      }

      // Create new event
      const id = eventId();
      await pool.query(
        `INSERT INTO events
           (id, calendar_id, title, start_time, end_time, location, description,
            status, source, organiser_email, ical_uid, attendees)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'tentative', 'inbound_email', $8, $9, $10)`,
        [
          id,
          calendar.id,
          title,
          start,
          end,
          location,
          description,
          organiserEmail,
          uid,
          attendees ? JSON.stringify(attendees) : null,
        ]
      );

      console.log(`Inbound email (${provider}): created event ${id} for calendar ${calendar.id}`);
      return res.json({ status: 'created', event_id: id });
    }

    // --- Unsupported method ---
    return res.json({ status: 'ignored', reason: `Unsupported method: ${method}` });
  } catch (err) {
    console.error('Inbound email error:', err.message);
    // Always return 200 so webhook services don't retry
    return res.json({ status: 'error', reason: 'Internal processing error' });
  }
});

module.exports = router;
