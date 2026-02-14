/**
 * Outbound email module
 *
 * Handles sending calendar invite emails (METHOD:REQUEST) and RSVP
 * reply emails (METHOD:REPLY) via Postmark.
 *
 * If POSTMARK_SERVER_TOKEN is not set, all sends are silently skipped
 * and the functions return { sent: false, reason: 'no_postmark_token' }.
 *
 * Exports:
 *   generateInviteIcs(event, calendar)           — METHOD:REQUEST .ics string
 *   generateReplyIcs(event, calendar, response)   — METHOD:REPLY .ics string
 *   sendInviteEmail(event, calendar, recipients)  — send invite via Postmark
 *   sendReplyEmail(event, calendar, response)     — send RSVP reply via Postmark
 */

const { default: ical } = require('ical-generator');

let postmarkClient;

/**
 * Lazy-initialize the Postmark client.
 * Returns null if POSTMARK_SERVER_TOKEN is not set.
 */
function getPostmarkClient() {
  if (postmarkClient !== undefined) return postmarkClient;
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    postmarkClient = null;
    return null;
  }
  const postmark = require('postmark');
  postmarkClient = new postmark.ServerClient(token);
  return postmarkClient;
}

/**
 * Parse the attendees jsonb field into an array of email strings.
 */
function parseAttendees(attendees) {
  if (!attendees) return [];
  if (typeof attendees === 'string') return JSON.parse(attendees);
  return attendees;
}

/**
 * Generate a METHOD:REQUEST iCal string for an outbound invite.
 *
 * @param {Object} event    — event row from DB
 * @param {Object} calendar — calendar row from DB
 * @returns {{ icsString: string, icalUid: string }}
 */
function generateInviteIcs(event, calendar) {
  const cal = ical({
    prodId: { company: 'CalDave', product: 'CalDave', language: 'EN' },
    method: 'REQUEST',
  });

  const icalUid = event.ical_uid || event.id + '@caldave.ai';

  const eventOpts = {
    id: icalUid,
    start: event.start_time,
    end: event.end_time,
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
    organizer: { name: calendar.name, email: calendar.email },
    sequence: event.ical_sequence || 0,
    stamp: event.created_at || new Date(),
  };

  if (event.all_day) {
    eventOpts.allDay = true;
  }

  const vevent = cal.createEvent(eventOpts);

  const attendees = parseAttendees(event.attendees);
  for (const email of attendees) {
    vevent.createAttendee({
      email,
      rsvp: true,
      status: 'NEEDS-ACTION',
    });
  }

  return { icsString: cal.toString(), icalUid };
}

/**
 * Generate a METHOD:REPLY iCal string for an RSVP response.
 *
 * @param {Object} event    — event row from DB (must have organiser_email and ical_uid)
 * @param {Object} calendar — calendar row from DB
 * @param {string} response — 'accepted' | 'declined' | 'tentative'
 * @returns {string} iCal string
 */
function generateReplyIcs(event, calendar, response) {
  const cal = ical({
    prodId: { company: 'CalDave', product: 'CalDave', language: 'EN' },
    method: 'REPLY',
  });

  const statusMap = {
    accepted: 'ACCEPTED',
    declined: 'DECLINED',
    tentative: 'TENTATIVE',
  };

  const eventOpts = {
    id: event.ical_uid,
    start: event.start_time,
    end: event.end_time,
    summary: event.title,
    organizer: { name: event.organiser_email, email: event.organiser_email },
    stamp: new Date(),
  };

  if (event.all_day) {
    eventOpts.allDay = true;
  }

  const vevent = cal.createEvent(eventOpts);

  vevent.createAttendee({
    email: calendar.email,
    name: calendar.name,
    status: statusMap[response],
  });

  return cal.toString();
}

/**
 * Send an outbound calendar invite email to one or more recipients.
 *
 * @param {Object} event            — event row from DB
 * @param {Object} calendar         — calendar row from DB
 * @param {string[]} recipientEmails — email addresses to send to
 * @param {Object} [options]         — optional settings
 * @param {string} [options.agentName] — agent display name for From header
 * @returns {Promise<{ sent: boolean, reason?: string, icalUid?: string }>}
 */
async function sendInviteEmail(event, calendar, recipientEmails, options = {}) {
  const client = getPostmarkClient();
  if (!client) {
    console.log('[outbound] Skipping invite (no POSTMARK_SERVER_TOKEN): event=%s', event.id);
    return { sent: false, reason: 'no_postmark_token' };
  }

  if (!recipientEmails || recipientEmails.length === 0) {
    console.log('[outbound] Skipping invite (no recipients): event=%s', event.id);
    return { sent: false, reason: 'no_recipients' };
  }

  const { icsString, icalUid } = generateInviteIcs(event, calendar);

  const to = recipientEmails.join(',');
  const from = options.agentName ? '"' + options.agentName + '" <' + calendar.email + '>' : calendar.email;
  console.log('[outbound] Sending invite: event=%s from=%s to=%s title="%s"', event.id, from, to, event.title);

  try {
    const pmResponse = await client.sendEmail({
      From: from,
      To: to,
      Subject: 'Invitation: ' + event.title,
      TextBody: [
        'You have been invited to: ' + event.title,
        '',
        'Start: ' + event.start_time,
        'End: ' + event.end_time,
        event.location ? 'Location: ' + event.location : null,
        event.description ? '' : null,
        event.description || null,
      ].filter((l) => l !== null).join('\n'),
      Attachments: [{
        Name: 'invite.ics',
        Content: Buffer.from(icsString).toString('base64'),
        ContentType: 'text/calendar; method=REQUEST',
      }],
    });

    console.log('[outbound] ✓ Invite sent: event=%s messageId=%s to=%s', event.id, pmResponse.MessageID, to);
    return { sent: true, icalUid };
  } catch (err) {
    console.error('[outbound] ✗ Invite FAILED: event=%s to=%s error=%s', event.id, to, err.message);
    if (err.statusCode) console.error('[outbound]   Postmark status=%d code=%s', err.statusCode, err.code);
    return { sent: false, reason: err.message };
  }
}

/**
 * Send an RSVP reply email to the event organiser.
 *
 * @param {Object} event    — event row from DB (must have organiser_email and ical_uid)
 * @param {Object} calendar — calendar row from DB
 * @param {string} response — 'accepted' | 'declined' | 'tentative'
 * @param {Object} [options]         — optional settings
 * @param {string} [options.agentName] — agent display name for From header
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
async function sendReplyEmail(event, calendar, response, options = {}) {
  const client = getPostmarkClient();
  if (!client) {
    console.log('[outbound] Skipping reply (no POSTMARK_SERVER_TOKEN): event=%s', event.id);
    return { sent: false, reason: 'no_postmark_token' };
  }

  if (!event.organiser_email) {
    console.log('[outbound] Skipping reply (no organiser_email): event=%s', event.id);
    return { sent: false, reason: 'no_organiser_email' };
  }

  if (!event.ical_uid) {
    console.log('[outbound] Skipping reply (no ical_uid): event=%s', event.id);
    return { sent: false, reason: 'no_ical_uid' };
  }

  const icsString = generateReplyIcs(event, calendar, response);
  const statusLabel = response.charAt(0).toUpperCase() + response.slice(1);

  const from = options.agentName ? '"' + options.agentName + '" <' + calendar.email + '>' : calendar.email;
  console.log('[outbound] Sending %s reply: event=%s from=%s to=%s title="%s"', response, event.id, from, event.organiser_email, event.title);

  try {
    const pmResponse = await client.sendEmail({
      From: from,
      To: event.organiser_email,
      Subject: statusLabel + ': ' + event.title,
      TextBody: calendar.name + ' has ' + response + ' the invitation: ' + event.title,
      Attachments: [{
        Name: 'response.ics',
        Content: Buffer.from(icsString).toString('base64'),
        ContentType: 'text/calendar; method=REPLY',
      }],
    });

    console.log('[outbound] ✓ Reply sent: event=%s response=%s messageId=%s to=%s', event.id, response, pmResponse.MessageID, event.organiser_email);
    return { sent: true };
  } catch (err) {
    console.error('[outbound] ✗ Reply FAILED: event=%s response=%s to=%s error=%s', event.id, response, event.organiser_email, err.message);
    if (err.statusCode) console.error('[outbound]   Postmark status=%d code=%s', err.statusCode, err.code);
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  generateInviteIcs,
  generateReplyIcs,
  sendInviteEmail,
  sendReplyEmail,
  parseAttendees,
};
