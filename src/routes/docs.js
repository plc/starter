/**
 * API documentation route
 *
 * GET /docs — serves a self-contained HTML page documenting all CalDave endpoints
 */

const { Router } = require('express');

const router = Router();

const DOMAIN = process.env.CALDAVE_DOMAIN || 'caldave.ai';
const EMAIL_DOMAIN = process.env.CALDAVE_EMAIL_DOMAIN || 'invite.caldave.ai';

router.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CalDave — API Documentation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem 1rem; line-height: 1.6; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #fff; }
    h1 a { color: #60a5fa; text-decoration: none; font-size: 1rem; margin-left: 1rem; }
    h1 a:hover { color: #93c5fd; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    h2 { font-size: 1.25rem; color: #fff; margin-top: 2.5rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #334155; }
    h3 { font-size: 1rem; color: #fff; margin-top: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #cbd5e1; margin-bottom: 0.75rem; }
    .endpoint { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .method-path { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
    .method { font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.625rem; border-radius: 6px; letter-spacing: 0.05em; flex-shrink: 0; }
    .method.get { background: #065f46; color: #6ee7b7; }
    .method.post { background: #1e3a5f; color: #60a5fa; }
    .method.patch { background: #713f12; color: #fbbf24; }
    .method.delete { background: #7f1d1d; color: #fca5a5; }
    .path { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.95rem; color: #fff; }
    .auth-badge { font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: #334155; color: #94a3b8; flex-shrink: 0; }
    .auth-badge.required { background: #312e81; color: #a5b4fc; }
    .desc { color: #94a3b8; margin-bottom: 1rem; }
    pre { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 1rem; overflow-x: auto; margin-bottom: 0.75rem; position: relative; }
    code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8125rem; color: #e2e8f0; }
    .inline-code { background: #334155; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.8125rem; }
    .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.375rem; }
    .params { margin-bottom: 1rem; }
    .param { display: flex; gap: 0.75rem; padding: 0.375rem 0; border-bottom: 1px solid #1e293b; font-size: 0.875rem; }
    .param:last-child { border-bottom: none; }
    .param-name { font-family: 'SF Mono', 'Fira Code', monospace; color: #60a5fa; min-width: 140px; flex-shrink: 0; }
    .param-desc { color: #94a3b8; }
    .param-req { color: #f87171; font-size: 0.75rem; }
    .param-opt { color: #64748b; font-size: 0.75rem; }
    .response-note { color: #64748b; font-size: 0.8125rem; font-style: italic; }
    .toc { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
    .toc h2 { margin-top: 0; border-bottom: none; padding-bottom: 0; }
    .toc ul { list-style: none; }
    .toc li { padding: 0.25rem 0; }
    .toc a { color: #60a5fa; text-decoration: none; font-size: 0.875rem; }
    .toc a:hover { color: #93c5fd; }
    .toc .section { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.75rem; margin-bottom: 0.25rem; }
    .toc .section:first-child { margin-top: 0; }
    .note { background: #1a1a2e; border-left: 3px solid #60a5fa; padding: 0.75rem 1rem; border-radius: 0 8px 8px 0; margin-bottom: 1rem; font-size: 0.875rem; color: #94a3b8; }
    .copy-btn { position: absolute; top: 0.5rem; right: 0.5rem; background: #334155; border: none; color: #94a3b8; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.7rem; }
    .copy-btn:hover { background: #475569; color: #fff; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CalDave API <a href="/">← Status</a></h1>
    <p class="subtitle">Calendar-as-a-service for AI agents. Base URL: <code class="inline-code">https://${DOMAIN}</code></p>

    <div style="background:#1a1a2e; border-left:3px solid #fbbf24; padding:0.75rem 1rem; border-radius:0 8px 8px 0; margin-bottom:1.5rem; font-size:0.875rem; color:#fbbf24;">
      <strong>AI agents:</strong> This is a REST API. Use <code class="inline-code">curl</code> or HTTP requests from your code — not a browser. Start with <code class="inline-code">POST https://${DOMAIN}/man</code> for a machine-readable guide.
    </div>

    <div style="background:#1a1a2e; border-left:3px solid #60a5fa; padding:0.75rem 1rem; border-radius:0 8px 8px 0; margin-bottom:1.5rem; font-size:0.875rem; color:#94a3b8;">
      <strong style="color:#60a5fa;">Stay up to date:</strong> CalDave is actively evolving. Check <a href="/changelog" style="color:#60a5fa;">GET /changelog</a> periodically to discover new features and improvements. Pass your API key as a Bearer token to <code class="inline-code">/changelog</code> and <code class="inline-code">POST /man</code> to get personalized info — including which changes are new since you signed up and recommendations based on your usage.
    </div>

    <div class="toc">
      <h2>Endpoints</h2>
      <div class="section">Agents</div>
      <ul>
        <li><a href="#post-agents">POST /agents</a> — Create agent</li>
        <li><a href="#get-agents-me">GET /agents/me</a> — Get agent profile</li>
        <li><a href="#patch-agents">PATCH /agents</a> — Update agent</li>
      </ul>
      <div class="section">Calendars</div>
      <ul>
        <li><a href="#post-calendars">POST /calendars</a> — Create calendar</li>
        <li><a href="#get-calendars">GET /calendars</a> — List calendars</li>
        <li><a href="#get-calendar">GET /calendars/:id</a> — Get calendar</li>
        <li><a href="#patch-calendar">PATCH /calendars/:id</a> — Update calendar</li>
        <li><a href="#delete-calendar">DELETE /calendars/:id</a> — Delete calendar</li>
      </ul>
      <div class="section">Events</div>
      <ul>
        <li><a href="#post-events">POST /calendars/:id/events</a> — Create event</li>
        <li><a href="#get-events">GET /calendars/:id/events</a> — List events</li>
        <li><a href="#get-event">GET /calendars/:id/events/:eid</a> — Get event</li>
        <li><a href="#patch-event">PATCH /calendars/:id/events/:eid</a> — Update event</li>
        <li><a href="#delete-event">DELETE /calendars/:id/events/:eid</a> — Delete event</li>
        <li><a href="#get-upcoming">GET /calendars/:id/upcoming</a> — Upcoming events</li>
        <li><a href="#get-view">GET /calendars/:id/view</a> — Plain text calendar view</li>
        <li><a href="#post-respond">POST /calendars/:id/events/:eid/respond</a> — Respond to invite</li>
      </ul>
      <div class="section">Feeds &amp; Webhooks</div>
      <ul>
        <li><a href="#get-feed">GET /feeds/:id.ics</a> — iCal feed</li>
        <li><a href="#post-inbound">POST /inbound/:token</a> — Inbound email webhook</li>
      </ul>
      <div class="section">Discovery</div>
      <ul>
        <li><a href="#get-changelog">GET /changelog</a> — API changelog</li>
        <li><a href="#post-man">POST /man</a> — Machine-readable API manual</li>
      </ul>
    </div>

    <!-- ============================================================ -->
    <h2>Authentication</h2>
    <p>Most endpoints require a Bearer token. Include it in every request:</p>
    <pre><code>Authorization: Bearer sk_live_your_api_key_here</code></pre>
    <p>Exceptions: <code class="inline-code">POST /agents</code> (no auth), <code class="inline-code">GET /feeds</code> (token in query param), and <code class="inline-code">POST /inbound</code> (token in URL path).</p>

    <!-- ============================================================ -->
    <h2>Agents</h2>

    <div class="endpoint" id="post-agents">
      <div class="method-path">
        <span class="method post">POST</span>
        <span class="path">/agents</span>
        <span class="auth-badge">No auth</span>
      </div>
      <p class="desc">Create a new agent identity. Returns credentials you must save — the API key is shown once.</p>
      <div class="label">Body parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">name <span class="param-opt">optional</span></span><span class="param-desc">Display name for the agent (max 255 chars). Shown in outbound email From headers.</span></div>
        <div class="param"><span class="param-name">description <span class="param-opt">optional</span></span><span class="param-desc">What the agent does (max 1000 chars). Surfaced in POST /man context.</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/agents \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Meeting Scheduler", "description": "Books rooms and sends reminders"}'</code></pre>
      <div class="label">Response</div>
      <pre><code>{
  "agent_id": "agt_x7y8z9AbCd",
  "api_key": "sk_live_abc123...",
  "name": "Meeting Scheduler",
  "description": "Books rooms and sends reminders",
  "message": "Store these credentials securely. The API key will not be shown again."
}</code></pre>
    </div>

    <div class="endpoint" id="get-agents-me">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/agents/me</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Get the authenticated agent's profile.</p>
      <div class="label">Example</div>
      <pre><code>curl -s https://${DOMAIN}/agents/me \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
      <div class="label">Response</div>
      <pre><code>{
  "agent_id": "agt_x7y8z9AbCd",
  "name": "Meeting Scheduler",
  "description": "Books rooms and sends reminders",
  "created_at": "2026-02-14T10:30:00.000Z"
}</code></pre>
    </div>

    <div class="endpoint" id="patch-agents">
      <div class="method-path">
        <span class="method patch">PATCH</span>
        <span class="path">/agents</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Update agent metadata. Does not change the API key. Set a field to <code class="inline-code">null</code> to clear it.</p>
      <div class="label">Body parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">name</span><span class="param-desc">Display name (max 255 chars)</span></div>
        <div class="param"><span class="param-name">description</span><span class="param-desc">What the agent does (max 1000 chars)</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s -X PATCH https://${DOMAIN}/agents \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"name": "Updated Name"}'</code></pre>
      <div class="label">Response</div>
      <pre><code>{
  "agent_id": "agt_x7y8z9AbCd",
  "name": "Updated Name",
  "description": "Books rooms and sends reminders",
  "created_at": "2026-02-14T10:30:00.000Z"
}</code></pre>
      <div class="note">When an agent has a name, outbound invite and RSVP reply emails use it as the From display name (e.g. "Meeting Scheduler" &lt;cal-xxx@${EMAIL_DOMAIN}&gt;).</div>
    </div>

    <!-- ============================================================ -->
    <h2>Calendars</h2>

    <div class="endpoint" id="post-calendars">
      <div class="method-path">
        <span class="method post">POST</span>
        <span class="path">/calendars</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Create a new calendar for the authenticated agent.</p>
      <div class="label">Body parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">name <span class="param-req">required</span></span><span class="param-desc">Calendar display name</span></div>
        <div class="param"><span class="param-name">timezone <span class="param-opt">optional</span></span><span class="param-desc">IANA timezone (default: UTC)</span></div>
        <div class="param"><span class="param-name">agentmail_api_key <span class="param-opt">optional</span></span><span class="param-desc">AgentMail API key for fetching inbound email attachments</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/calendars \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"name": "Work Schedule", "timezone": "America/Denver"}'</code></pre>
      <div class="label">Response</div>
      <pre><code>{
  "calendar_id": "cal_a1b2c3XyZ",
  "name": "Work Schedule",
  "timezone": "America/Denver",
  "email": "cal-a1b2c3XyZ@${EMAIL_DOMAIN}",
  "ical_feed_url": "https://${DOMAIN}/feeds/cal_a1b2c3XyZ.ics?token=feed_...",
  "feed_token": "feed_...",
  "inbound_webhook_url": "https://${DOMAIN}/inbound/inb_...",
  "message": "This calendar can receive invites at cal-a1b2c3XyZ@${EMAIL_DOMAIN}. ..."
}</code></pre>
    </div>

    <div class="endpoint" id="get-calendars">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/calendars</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">List all calendars for the authenticated agent.</p>
      <div class="label">Example</div>
      <pre><code>curl -s https://${DOMAIN}/calendars \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
    </div>

    <div class="endpoint" id="get-calendar">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/calendars/:id</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Get a single calendar by ID.</p>
      <div class="label">Example</div>
      <pre><code>curl -s https://${DOMAIN}/calendars/cal_a1b2c3XyZ \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
    </div>

    <div class="endpoint" id="patch-calendar">
      <div class="method-path">
        <span class="method patch">PATCH</span>
        <span class="path">/calendars/:id</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Update calendar settings. All fields are optional.</p>
      <div class="label">Body parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">name</span><span class="param-desc">Calendar display name</span></div>
        <div class="param"><span class="param-name">timezone</span><span class="param-desc">IANA timezone</span></div>
        <div class="param"><span class="param-name">webhook_url</span><span class="param-desc">URL to receive event notifications</span></div>
        <div class="param"><span class="param-name">webhook_secret</span><span class="param-desc">HMAC secret for webhook signatures</span></div>
        <div class="param"><span class="param-name">webhook_offsets</span><span class="param-desc">Array of offsets, e.g. ["-5m", "-1m"]</span></div>
        <div class="param"><span class="param-name">agentmail_api_key</span><span class="param-desc">AgentMail API key for this calendar</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s -X PATCH https://${DOMAIN}/calendars/cal_a1b2c3XyZ \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"name": "Updated Name", "timezone": "America/New_York"}'</code></pre>
    </div>

    <div class="endpoint" id="delete-calendar">
      <div class="method-path">
        <span class="method delete">DELETE</span>
        <span class="path">/calendars/:id</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Delete a calendar and all its events. Returns 204 on success.</p>
      <div class="label">Example</div>
      <pre><code>curl -s -X DELETE https://${DOMAIN}/calendars/cal_a1b2c3XyZ \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
    </div>

    <!-- ============================================================ -->
    <h2>Events</h2>

    <div class="endpoint" id="post-events">
      <div class="method-path">
        <span class="method post">POST</span>
        <span class="path">/calendars/:id/events</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Create an event on a calendar. Supports one-off and recurring events.</p>
      <div class="label">Body parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">title <span class="param-req">required</span></span><span class="param-desc">Event title/summary</span></div>
        <div class="param"><span class="param-name">start <span class="param-req">required</span></span><span class="param-desc">ISO 8601 datetime, or YYYY-MM-DD for all-day events</span></div>
        <div class="param"><span class="param-name">end <span class="param-req">required</span></span><span class="param-desc">ISO 8601 datetime, or YYYY-MM-DD for all-day events (inclusive)</span></div>
        <div class="param"><span class="param-name">all_day <span class="param-opt">optional</span></span><span class="param-desc">Boolean. When true, start/end must be YYYY-MM-DD and end is inclusive.</span></div>
        <div class="param"><span class="param-name">description <span class="param-opt">optional</span></span><span class="param-desc">Free text (max 64KB)</span></div>
        <div class="param"><span class="param-name">metadata <span class="param-opt">optional</span></span><span class="param-desc">Structured JSON payload (max 16KB)</span></div>
        <div class="param"><span class="param-name">location <span class="param-opt">optional</span></span><span class="param-desc">Free text or URL</span></div>
        <div class="param"><span class="param-name">status <span class="param-opt">optional</span></span><span class="param-desc">confirmed (default), tentative, cancelled</span></div>
        <div class="param"><span class="param-name">attendees <span class="param-opt">optional</span></span><span class="param-desc">Array of email addresses</span></div>
        <div class="param"><span class="param-name">recurrence <span class="param-opt">optional</span></span><span class="param-desc">RFC 5545 RRULE string (e.g. FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR). Alias: <code class="inline-code">rrule</code></span></div>
      </div>
      <div class="label">Example — one-off event</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/calendars/CAL_ID/events \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "title": "Team standup",
    "start": "2025-03-01T09:00:00-07:00",
    "end": "2025-03-01T09:15:00-07:00",
    "location": "https://meet.google.com/abc-defg-hij"
  }'</code></pre>
      <div class="label">Example — recurring event</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/calendars/CAL_ID/events \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "title": "Daily weather email",
    "start": "2025-03-01T08:00:00-07:00",
    "end": "2025-03-01T08:05:00-07:00",
    "metadata": {"action": "send_email", "prompt": "Send weather forecast"},
    "recurrence": "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"
  }'</code></pre>
      <div class="label">Example — all-day event</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/calendars/CAL_ID/events \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "title": "Company Holiday",
    "start": "2025-12-25",
    "end": "2025-12-25",
    "all_day": true
  }'</code></pre>
      <div class="note">All-day events use date-only strings (YYYY-MM-DD). The end date is inclusive, so start and end on the same date means a single day.</div>
      <div class="note">Recurring events are expanded into individual instances for the next 90 days. The response includes <code class="inline-code">instances_created</code> count.</div>
    </div>

    <div class="endpoint" id="get-events">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/calendars/:id/events</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">List events with optional filters. Returns expanded recurring event instances.</p>
      <div class="label">Query parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">start</span><span class="param-desc">Filter events starting after this datetime</span></div>
        <div class="param"><span class="param-name">end</span><span class="param-desc">Filter events starting before this datetime</span></div>
        <div class="param"><span class="param-name">status</span><span class="param-desc">Filter by status (confirmed, tentative, cancelled)</span></div>
        <div class="param"><span class="param-name">limit</span><span class="param-desc">Max results (default 50, max 200)</span></div>
        <div class="param"><span class="param-name">offset</span><span class="param-desc">Pagination offset (default 0)</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s "https://${DOMAIN}/calendars/CAL_ID/events?start=2025-03-01T00:00:00Z&limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
    </div>

    <div class="endpoint" id="get-event">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/calendars/:id/events/:event_id</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Get a single event by ID.</p>
      <div class="label">Example</div>
      <pre><code>curl -s https://${DOMAIN}/calendars/CAL_ID/events/evt_abc123 \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
    </div>

    <div class="endpoint" id="patch-event">
      <div class="method-path">
        <span class="method patch">PATCH</span>
        <span class="path">/calendars/:id/events/:event_id</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Update an event. For recurring events: patching an instance marks it as an exception; patching the parent propagates to all non-exception instances.</p>
      <div class="label">Body parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">title</span><span class="param-desc">Event title</span></div>
        <div class="param"><span class="param-name">start</span><span class="param-desc">New start time (YYYY-MM-DD for all-day)</span></div>
        <div class="param"><span class="param-name">end</span><span class="param-desc">New end time (YYYY-MM-DD for all-day, inclusive)</span></div>
        <div class="param"><span class="param-name">all_day</span><span class="param-desc">Toggle all-day mode on/off</span></div>
        <div class="param"><span class="param-name">description</span><span class="param-desc">Free text</span></div>
        <div class="param"><span class="param-name">metadata</span><span class="param-desc">JSON payload</span></div>
        <div class="param"><span class="param-name">location</span><span class="param-desc">Location</span></div>
        <div class="param"><span class="param-name">status</span><span class="param-desc">confirmed, tentative, cancelled</span></div>
        <div class="param"><span class="param-name">attendees</span><span class="param-desc">Array of email addresses</span></div>
        <div class="param"><span class="param-name">recurrence</span><span class="param-desc">Updated RRULE (parent only — triggers rematerialization). Alias: <code class="inline-code">rrule</code></span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s -X PATCH https://${DOMAIN}/calendars/CAL_ID/events/evt_abc123 \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"title": "Updated title", "location": "Room 42"}'</code></pre>
    </div>

    <div class="endpoint" id="delete-event">
      <div class="method-path">
        <span class="method delete">DELETE</span>
        <span class="path">/calendars/:id/events/:event_id</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Delete an event. For recurring event instances, use the <code class="inline-code">mode</code> query parameter.</p>
      <div class="label">Query parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">mode</span><span class="param-desc"><code class="inline-code">single</code> — cancel this instance only (default)<br><code class="inline-code">future</code> — cancel this and all future instances<br><code class="inline-code">all</code> — delete entire series</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s -X DELETE "https://${DOMAIN}/calendars/CAL_ID/events/evt_abc123?mode=single" \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
    </div>

    <div class="endpoint" id="get-upcoming">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/calendars/:id/upcoming</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Get the next N events starting from now. Designed for agent polling.</p>
      <div class="label">Query parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">limit</span><span class="param-desc">Number of events to return (default 5, max 50)</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s https://${DOMAIN}/calendars/CAL_ID/upcoming \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
      <div class="label">Response</div>
      <pre><code>{
  "events": [...],
  "next_event_starts_in": "PT14M30S"
}</code></pre>
      <div class="note"><code class="inline-code">next_event_starts_in</code> is an ISO 8601 duration showing how long until the next event. Useful for setting poll intervals.</div>
    </div>

    <div class="endpoint" id="get-view">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/calendars/:id/view</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Plain text table of upcoming events. Useful for quick inspection via curl or agent debugging.</p>
      <div class="label">Query parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">limit</span><span class="param-desc">Number of events to show (default 10, max 50)</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s https://${DOMAIN}/calendars/CAL_ID/view \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
      <div class="label">Response (text/plain)</div>
      <pre><code>Work (cal_xxx)  tz: America/Denver
-----------------------------------------
TITLE          START                 ...
-----------------------------------------
Daily standup  2026-02-13 16:00:00Z  ...
-----------------------------------------
1 event(s)</code></pre>
    </div>

    <div class="endpoint" id="post-respond">
      <div class="method-path">
        <span class="method post">POST</span>
        <span class="path">/calendars/:id/events/:event_id/respond</span>
        <span class="auth-badge required">Bearer token</span>
      </div>
      <p class="desc">Accept or decline an inbound calendar invite.</p>
      <div class="label">Body parameters</div>
      <div class="params">
        <div class="param"><span class="param-name">response <span class="param-req">required</span></span><span class="param-desc">accepted, declined, or tentative</span></div>
      </div>
      <div class="label">Example</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/calendars/CAL_ID/events/evt_abc123/respond \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"response": "accepted"}'</code></pre>
    </div>

    <!-- ============================================================ -->
    <h2>iCal Feed</h2>

    <div class="endpoint" id="get-feed">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/feeds/:calendar_id.ics</span>
        <span class="auth-badge">Token in query param</span>
      </div>
      <p class="desc">Read-only iCalendar feed. Subscribe to this URL from Google Calendar, Apple Calendar, or any iCal-compatible app. The <code class="inline-code">feed_token</code> is returned when you create a calendar.</p>
      <div class="label">Example</div>
      <pre><code>curl -s "https://${DOMAIN}/feeds/cal_a1b2c3XyZ.ics?token=feed_xyz789"</code></pre>
      <div class="note">Add this URL to Google Calendar via "Other calendars" → "From URL". Events appear as read-only.</div>
    </div>

    <!-- ============================================================ -->
    <h2>Inbound Email Webhook</h2>

    <div class="endpoint" id="post-inbound">
      <div class="method-path">
        <span class="method post">POST</span>
        <span class="path">/inbound/:token</span>
        <span class="auth-badge">Token in URL</span>
      </div>
      <p class="desc">Receives forwarded emails containing .ics calendar invite attachments. Each calendar has a unique webhook URL (returned at creation as <code class="inline-code">inbound_webhook_url</code>). Supports Postmark and AgentMail providers.</p>
      <div class="label">How it works</div>
      <div class="params">
        <div class="param"><span class="param-name">REQUEST / PUBLISH</span><span class="param-desc">Creates a new event (or updates if ical_uid matches). Status set to tentative.</span></div>
        <div class="param"><span class="param-name">CANCEL</span><span class="param-desc">Sets matching event status to cancelled</span></div>
      </div>
      <div class="note">
        <strong>Postmark:</strong> Set your inbound domain to forward to the webhook URL. Attachments are decoded from base64 inline.<br><br>
        <strong>AgentMail:</strong> Set the webhook URL in AgentMail's inbox settings. CalDave fetches .ics attachments via the AgentMail API using the calendar's <code class="inline-code">agentmail_api_key</code>.
      </div>
      <div class="label">Response (always 200)</div>
      <pre><code>{ "status": "created", "event_id": "evt_xxx" }
{ "status": "updated", "event_id": "evt_xxx" }
{ "status": "cancelled", "event_id": "evt_xxx" }
{ "status": "ignored", "reason": "..." }</code></pre>
    </div>

    <!-- ============================================================ -->
    <h2>Discovery</h2>

    <div class="endpoint" id="get-changelog">
      <div class="method-path">
        <span class="method get">GET</span>
        <span class="path">/changelog</span>
        <span class="auth-badge">No auth (optional Bearer)</span>
      </div>
      <p class="desc">Structured list of API changes with dates and docs links. With a Bearer token, highlights changes since your agent was created and includes personalized recommendations. Poll ~weekly to discover new features.</p>
      <div class="label">Example</div>
      <pre><code>curl -s https://${DOMAIN}/changelog \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
      <div class="label">Response (authenticated)</div>
      <pre><code>{
  "description": "CalDave API changelog...",
  "your_agent": { "agent_id": "agt_...", "created_at": "..." },
  "changes_since_signup": [{ "date": "2026-02-14", "changes": [...] }],
  "changes_since_signup_count": 2,
  "changelog": [{ "date": "2026-02-08", "changes": [...] }],
  "recommendations": [
    { "action": "Name your agent", "why": "...", "how": "PATCH /agents ...", "docs": "..." }
  ]
}</code></pre>
      <div class="note">The <code class="inline-code">recommendations</code> array includes actionable suggestions based on your agent state (e.g. name your agent, create a calendar, create an event). Only present when authenticated and there are suggestions.</div>
    </div>

    <div class="endpoint" id="post-man">
      <div class="method-path">
        <span class="method post">POST</span>
        <span class="path">/man</span>
        <span class="auth-badge">No auth (optional Bearer)</span>
      </div>
      <p class="desc">Machine-readable API manual. Returns all endpoints with curl examples and parameters. With Bearer auth, includes your real calendar IDs and a recommended next step. Use <code class="inline-code">?guide</code> for a compact onboarding overview.</p>
      <div class="label">Example — full reference</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/man \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
      <div class="label">Example — guided onboarding</div>
      <pre><code>curl -s -X POST "https://${DOMAIN}/man?guide" \\
  -H "Authorization: Bearer YOUR_API_KEY"</code></pre>
      <div class="note">The <code class="inline-code">?guide</code> mode returns only an overview, your context, a recommended next step, and links to discover more. Ideal for first-time agent onboarding.</div>
    </div>

    <!-- ============================================================ -->
    <h2>Quick Start</h2>
    <div class="endpoint">
      <p class="desc">Get up and running in three steps:</p>
      <div class="label">1. Create an agent</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/agents</code></pre>
      <p class="response-note">Save the agent_id and api_key from the response.</p>

      <div class="label" style="margin-top: 1rem;">2. Create a calendar</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/calendars \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"name": "My Calendar", "timezone": "America/Denver"}'</code></pre>
      <p class="response-note">Save the calendar_id, email, and feed URLs from the response.</p>

      <div class="label" style="margin-top: 1rem;">3. Create an event</div>
      <pre><code>curl -s -X POST https://${DOMAIN}/calendars/YOUR_CAL_ID/events \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "title": "My first event",
    "start": "2025-03-01T10:00:00-07:00",
    "end": "2025-03-01T11:00:00-07:00"
  }'</code></pre>
    </div>

    <footer style="margin-top:3rem; padding-top:1.5rem; border-top:1px solid #334155; text-align:center; font-size:0.8125rem; color:#64748b;">
      <a href="/terms" style="color:#94a3b8; text-decoration:none;">Terms</a> &middot;
      <a href="/privacy" style="color:#94a3b8; text-decoration:none;">Privacy</a> &middot;
      Created by <a href="https://plc.vc/qbs" style="color:#94a3b8; text-decoration:none;">Peter Clark</a>
    </footer>
  </div>

  <script>
    // Add copy buttons to code blocks
    document.querySelectorAll('pre').forEach(pre => {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(pre.querySelector('code').textContent);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      };
      pre.appendChild(btn);
    });
  </script>
</body>
</html>`;

  res.send(html);
});

module.exports = router;
