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
 *   sendInviteEmail(event, calendar, recipients)  — send invite via SMTP or Postmark
 *   sendReplyEmail(event, calendar, response)     — send RSVP reply via SMTP or Postmark
 */

const { default: ical } = require('ical-generator');
const { pool } = require('../db');

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
 * Look up the agent's SMTP configuration from the database.
 * Returns { host, port, user, pass, from } or null if not configured.
 */
async function getAgentSmtpConfig(agentId) {
  if (!agentId) return null;
  const { rows } = await pool.query(
    'SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_secure FROM agents WHERE id = $1',
    [agentId]
  );
  if (rows.length === 0 || !rows[0].smtp_host) return null;
  const r = rows[0];
  return { host: r.smtp_host, port: r.smtp_port, user: r.smtp_user, pass: r.smtp_pass, from: r.smtp_from, secure: r.smtp_secure };
}

/**
 * Send an email via SMTP using nodemailer.
 *
 * @param {Object} smtpConfig — { host, port, user, pass, from }
 * @param {Object} params     — { from, to, subject, textBody, icsAttachment: { name, content, contentType } }
 * @returns {Promise<{ sent: boolean, reason?: string, messageId?: string }>}
 */
async function sendViaSmtp(smtpConfig, params) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure !== null && smtpConfig.secure !== undefined ? smtpConfig.secure : (smtpConfig.port === 465),
    auth: { user: smtpConfig.user, pass: smtpConfig.pass },
  });

  const mailOpts = {
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.textBody,
  };

  if (params.icsAttachment) {
    mailOpts.attachments = [{
      filename: params.icsAttachment.name,
      content: params.icsAttachment.content,
      contentType: params.icsAttachment.contentType,
    }];
  }

  const info = await transporter.sendMail(mailOpts);
  return { sent: true, messageId: info.messageId };
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
  if (!recipientEmails || recipientEmails.length === 0) {
    console.log('[outbound] Skipping invite (no recipients): event=%s', event.id);
    return { sent: false, reason: 'no_recipients' };
  }

  const { icsString, icalUid } = generateInviteIcs(event, calendar);
  const to = recipientEmails.join(',');
  const subject = 'Invitation: ' + event.title;
  const textBody = [
    'You have been invited to: ' + event.title,
    '',
    'Start: ' + event.start_time,
    'End: ' + event.end_time,
    event.location ? 'Location: ' + event.location : null,
    event.description ? '' : null,
    event.description || null,
  ].filter((l) => l !== null).join('\n');

  // Check for agent SMTP configuration
  const smtpConfig = await getAgentSmtpConfig(options.agentId);
  if (smtpConfig) {
    const from = options.agentName ? '"' + options.agentName + '" <' + smtpConfig.from + '>' : smtpConfig.from;
    console.log('[outbound] Sending invite via SMTP: event=%s from=%s to=%s title="%s"', event.id, from, to, event.title);
    try {
      const result = await sendViaSmtp(smtpConfig, {
        from, to, subject, textBody,
        icsAttachment: { name: 'invite.ics', content: icsString, contentType: 'text/calendar; method=REQUEST' },
      });
      console.log('[outbound] ✓ Invite sent via SMTP: event=%s from=%s messageId=%s to=%s', event.id, from, result.messageId, to);
      return { sent: true, icalUid };
    } catch (err) {
      console.error('[outbound] ✗ SMTP invite FAILED: event=%s to=%s error=%s', event.id, to, err.message);
      return { sent: false, reason: err.message };
    }
  }

  // Fall back to Postmark
  const client = getPostmarkClient();
  if (!client) {
    console.log('[outbound] Skipping invite (no email transport): event=%s', event.id);
    return { sent: false, reason: 'no_email_transport' };
  }

  const from = options.agentName ? '"' + options.agentName + '" <' + calendar.email + '>' : calendar.email;
  console.log('[outbound] Sending invite: event=%s from=%s to=%s title="%s"', event.id, from, to, event.title);

  try {
    const pmResponse = await client.sendEmail({
      From: from,
      To: to,
      Subject: subject,
      TextBody: textBody,
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
  const subject = statusLabel + ': ' + event.title;
  const textBody = calendar.name + ' has ' + response + ' the invitation: ' + event.title;

  // Check for agent SMTP configuration
  const smtpConfig = await getAgentSmtpConfig(options.agentId);
  if (smtpConfig) {
    const from = options.agentName ? '"' + options.agentName + '" <' + smtpConfig.from + '>' : smtpConfig.from;
    console.log('[outbound] Sending %s reply via SMTP: event=%s from=%s to=%s title="%s"', response, event.id, from, event.organiser_email, event.title);
    try {
      const result = await sendViaSmtp(smtpConfig, {
        from, to: event.organiser_email, subject, textBody,
        icsAttachment: { name: 'response.ics', content: icsString, contentType: 'text/calendar; method=REPLY' },
      });
      console.log('[outbound] ✓ Reply sent via SMTP: event=%s response=%s from=%s messageId=%s to=%s', event.id, response, from, result.messageId, event.organiser_email);
      return { sent: true };
    } catch (err) {
      console.error('[outbound] ✗ SMTP reply FAILED: event=%s response=%s to=%s error=%s', event.id, response, event.organiser_email, err.message);
      return { sent: false, reason: err.message };
    }
  }

  // Fall back to Postmark
  const client = getPostmarkClient();
  if (!client) {
    console.log('[outbound] Skipping reply (no email transport): event=%s', event.id);
    return { sent: false, reason: 'no_email_transport' };
  }

  const from = options.agentName ? '"' + options.agentName + '" <' + calendar.email + '>' : calendar.email;
  console.log('[outbound] Sending %s reply: event=%s from=%s to=%s title="%s"', response, event.id, from, event.organiser_email, event.title);

  try {
    const pmResponse = await client.sendEmail({
      From: from,
      To: event.organiser_email,
      Subject: subject,
      TextBody: textBody,
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
