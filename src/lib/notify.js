/**
 * Fire-and-forget Discord webhook notifications for internal monitoring.
 *
 * Usage:
 *   const { notify } = require('../lib/notify');
 *   notify('agent_created', { agent_id: 'agt_xxx', name: 'My Agent' });
 *
 * Env vars (optional — if not set, the notification is silently skipped):
 *   DISCORD_WEBHOOK_AGENT_CREATED
 *   DISCORD_WEBHOOK_EMAIL_SENT
 *   DISCORD_WEBHOOK_ERROR
 */

const CHANNELS = {
  agent_created: 'DISCORD_WEBHOOK_AGENT_CREATED',
  email_sent: 'DISCORD_WEBHOOK_EMAIL_SENT',
  error: 'DISCORD_WEBHOOK_ERROR',
};

/**
 * Post a notification to Discord. Never blocks, never throws.
 *
 * @param {'agent_created'|'email_sent'|'error'} event
 * @param {object} data — included in the Discord message
 */
function notify(event, data = {}) {
  const envKey = CHANNELS[event];
  if (!envKey) return;

  const url = process.env[envKey];
  if (!url) return;

  const lines = Object.entries(data)
    .map(([k, v]) => `**${k}:** ${v}`)
    .join('\n');

  const content = `[${event}] ${new Date().toISOString()}\n${lines}`;

  // Fire and forget — no await, no .then()
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, 2000) }),
  }).catch(() => {}); // swallow silently
}

module.exports = { notify };
