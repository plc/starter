/**
 * Legal pages — Terms of Service and Privacy Policy
 *
 * GET /terms    — Terms of Service
 * GET /privacy  — Privacy Policy
 */

const { Router } = require('express');
const router = Router();

const DOMAIN = process.env.CALDAVE_DOMAIN || 'caldave.ai';

const HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 2rem; color: #fff; margin-bottom: 0.5rem; }
    h1 a { color: #94a3b8; text-decoration: none; font-size: 0.875rem; }
    h1 a:hover { color: #e2e8f0; }
    h2 { font-size: 1.25rem; color: #fff; margin-top: 2rem; margin-bottom: 0.75rem; }
    p, li { font-size: 0.9375rem; color: #cbd5e1; line-height: 1.7; margin-bottom: 0.75rem; }
    ul { padding-left: 1.5rem; margin-bottom: 1rem; }
    a { color: #60a5fa; }
    .updated { font-size: 0.8125rem; color: #64748b; margin-bottom: 2rem; }
    footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #334155; text-align: center; font-size: 0.8125rem; color: #64748b; }
    footer a { color: #94a3b8; text-decoration: none; }
    footer a:hover { color: #e2e8f0; }
  </style>`;

const FOOTER = `  <footer>
    <a href="/terms">Terms</a> &middot;
    <a href="/privacy">Privacy</a> &middot;
    Created by <a href="https://plc.vc/qbs">Peter Clark</a>
  </footer>`;

router.get('/terms', (req, res) => {
  res.send(`${HEAD}
  <title>Terms of Service - CalDave</title>
</head>
<body>
  <div class="container">
    <h1><a href="/">&larr; Home</a></h1>
    <h1>Terms of Service</h1>
    <p class="updated">Last updated: February 2026</p>

    <h2>1. Acceptance of Terms</h2>
    <p>By accessing or using the CalDave API ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>

    <h2>2. Description of Service</h2>
    <p>CalDave provides a calendar-as-a-service REST API designed for AI agents. The Service allows you to create calendars, manage events, send and receive calendar invites via email, and subscribe to iCal feeds.</p>

    <h2>3. API Access</h2>
    <p>You are responsible for keeping your API keys secure. Do not share your API keys publicly or embed them in client-side code. You are responsible for all activity that occurs under your API key.</p>

    <h2>4. Acceptable Use</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Use the Service to send spam, unsolicited emails, or abuse the email invite functionality</li>
      <li>Attempt to disrupt or overload the Service infrastructure</li>
      <li>Use the Service for any unlawful purpose</li>
      <li>Reverse engineer or attempt to extract the source code of the Service</li>
      <li>Resell access to the Service without permission</li>
    </ul>

    <h2>5. Rate Limits</h2>
    <p>The Service enforces rate limits to ensure fair usage. Exceeding rate limits may result in temporary or permanent restriction of access.</p>

    <h2>6. Data Ownership</h2>
    <p>You retain ownership of all data you create through the Service, including events, calendar names, and metadata. CalDave does not claim ownership of your data.</p>

    <h2>7. Service Availability</h2>
    <p>CalDave is provided on an "as is" and "as available" basis. We do not guarantee uninterrupted or error-free operation. We may modify, suspend, or discontinue the Service at any time with reasonable notice.</p>

    <h2>8. Limitation of Liability</h2>
    <p>To the maximum extent permitted by law, CalDave shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or revenue arising from your use of the Service.</p>

    <h2>9. Account Termination</h2>
    <p>We reserve the right to suspend or terminate your access to the Service at any time for violation of these terms or for any reason with reasonable notice. You may stop using the Service at any time.</p>

    <h2>10. Changes to Terms</h2>
    <p>We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated terms.</p>

    <h2>11. Contact</h2>
    <p>Questions about these terms? Email <a href="mailto:peterclark@me.com">peterclark@me.com</a>.</p>

${FOOTER}
  </div>
</body>
</html>`);
});

router.get('/privacy', (req, res) => {
  res.send(`${HEAD}
  <title>Privacy Policy - CalDave</title>
</head>
<body>
  <div class="container">
    <h1><a href="/">&larr; Home</a></h1>
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: February 2026</p>

    <h2>1. What We Collect</h2>
    <p>When you use CalDave, we collect and store:</p>
    <ul>
      <li><strong>Agent credentials</strong> — agent IDs and hashed API keys (we never store your raw API key after initial creation)</li>
      <li><strong>Calendar data</strong> — calendar names, timezones, and generated email addresses</li>
      <li><strong>Event data</strong> — event titles, descriptions, times, locations, attendees, and metadata you provide</li>
      <li><strong>Inbound emails</strong> — calendar invite emails sent to your calendar's email address, including sender information and .ics attachments</li>
      <li><strong>Email delivery logs</strong> — when outbound emails are sent (invites, RSVP replies), we log delivery status for debugging</li>
    </ul>

    <h2>2. How We Use Your Data</h2>
    <p>Your data is used exclusively to provide the CalDave service:</p>
    <ul>
      <li>Storing and serving your calendar events via the API</li>
      <li>Generating iCal feeds for calendar subscriptions</li>
      <li>Processing inbound email invites</li>
      <li>Sending outbound calendar invite and RSVP emails on your behalf</li>
    </ul>

    <h2>3. What We Do Not Do</h2>
    <ul>
      <li>We do not sell your data to third parties</li>
      <li>We do not use your data for advertising</li>
      <li>We do not train AI models on your data</li>
      <li>We do not share your data with third parties except as needed to operate the Service (e.g., Postmark for email delivery)</li>
    </ul>

    <h2>4. Third-Party Services</h2>
    <p>CalDave uses the following third-party services:</p>
    <ul>
      <li><strong>Fly.io</strong> — application hosting</li>
      <li><strong>Postmark</strong> — inbound and outbound email processing</li>
    </ul>
    <p>These providers have their own privacy policies governing their handling of data.</p>

    <h2>5. Data Storage and Security</h2>
    <p>Your data is stored in a PostgreSQL database hosted on Fly.io infrastructure. API keys are hashed using SHA-256 before storage. All connections to the API are encrypted via HTTPS.</p>

    <h2>6. Data Retention</h2>
    <p>Your data is retained as long as your agent account exists. If you delete a calendar, all associated events are permanently deleted. There is no soft-delete or recycle bin.</p>

    <h2>7. Data Export</h2>
    <p>You can export your data at any time through the API (list events) or by subscribing to your calendar's iCal feed.</p>

    <h2>8. Changes to This Policy</h2>
    <p>We may update this policy from time to time. Continued use of the Service after changes constitutes acceptance of the updated policy.</p>

    <h2>9. Contact</h2>
    <p>Questions about privacy? Email <a href="mailto:peterclark@me.com">peterclark@me.com</a>.</p>

${FOOTER}
  </div>
</body>
</html>`);
});

module.exports = router;
