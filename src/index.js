/**
 * CalDave — Calendar-as-a-service API for AI agents
 *
 * Entry point. Sets up Express server with:
 * - Schema initialization on startup
 * - Auth middleware (Bearer token)
 * - Rate limit stub headers
 * - Route modules (agents, calendars, events, feeds)
 * - Health check endpoints
 * - Status page
 *
 * Environment variables:
 * - PORT: Server port (default: 3000)
 * - DATABASE_URL: PostgreSQL connection string
 * - CALDAVE_DOMAIN: Domain for calendar emails (default: caldave.ai)
 */

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { pool, initSchema } = require('./db');
const auth = require('./middleware/auth');
const { apiLimiter, agentCreationLimiter, inboundLimiter } = require('./middleware/rateLimit');
const agentsRouter = require('./routes/agents');
const calendarsRouter = require('./routes/calendars');
const eventsRouter = require('./routes/events');
const feedsRouter = require('./routes/feeds');
const inboundRouter = require('./routes/inbound');
const docsRouter = require('./routes/docs');
const quickstartRouter = require('./routes/quickstart');
const manRouter = require('./routes/man');
const viewRouter = require('./routes/view');
const postmarkWebhooksRouter = require('./routes/postmark-webhooks');
const legalRouter = require('./routes/legal');
const { extendAllHorizons, EXTEND_INTERVAL_MS } = require('./lib/recurrence');

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'"],
      'upgrade-insecure-requests': null,
    },
  },
}));
app.use(express.json({ limit: '512kb' }));
app.use(apiLimiter);

// ---------------------------------------------------------------------------
// Public routes (no auth)
// ---------------------------------------------------------------------------

/**
 * GET /health
 * Basic health check — returns OK if server is running.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /health/db
 * Database health check — verifies PostgreSQL connection.
 */
app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    res.json({
      status: 'ok',
      database: {
        connected: true,
        time: result.rows[0].time,
        version: result.rows[0].version,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: { connected: false, error: error.message },
    });
  }
});

// Static logo
app.get('/logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'logo.png'));
});

/**
 * GET /
 * Landing page.
 */
app.get('/', (req, res) => {
  const DOMAIN = process.env.CALDAVE_DOMAIN || 'caldave.ai';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CalDave</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .container { max-width: 540px; width: 100%; }
    h1 { font-size: 2.5rem; color: #fff; margin-bottom: 0.75rem; }
    .tagline { font-size: 1.125rem; color: #94a3b8; line-height: 1.6; margin-bottom: 2rem; }
    .features { list-style: none; margin-bottom: 2rem; }
    .features li { padding: 0.5rem 0; color: #cbd5e1; font-size: 0.9375rem; display: flex; align-items: baseline; gap: 0.75rem; }
    .features li::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; position: relative; top: -1px; }
    .links { display: flex; gap: 1rem; flex-wrap: wrap; }
    .links a { display: inline-block; padding: 0.625rem 1.25rem; border-radius: 8px; text-decoration: none; font-size: 0.875rem; font-weight: 500; transition: background 0.15s; }
    .links .primary { background: #2563eb; color: #fff; }
    .links .primary:hover { background: #3b82f6; }
    .links .secondary { background: #1e293b; color: #94a3b8; }
    .links .secondary:hover { background: #334155; color: #e2e8f0; }
    pre { background: #1e293b; border-radius: 8px; padding: 1rem; overflow-x: auto; margin-bottom: 2rem; }
    code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8125rem; color: #e2e8f0; }
    .dim { color: #64748b; }
    .logo { width: 80px; height: 80px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <img src="/logo.png" alt="CalDave" class="logo">
    <h1>CalDave</h1>
    <p class="tagline">A calendar API for AI agents. Create calendars, manage events, receive invites from humans via email, and subscribe from Google Calendar.</p>

    <ul class="features">
      <li>REST API with Bearer token auth</li>
      <li>Per-calendar email addresses for receiving invites</li>
      <li>iCal feeds compatible with Google Calendar and Apple Calendar</li>
      <li>Recurring events with RRULE support</li>
      <li>Polling endpoint for agent scheduling</li>
      <li>Inbound email via Postmark or AgentMail</li>
    </ul>

    <pre><code><span class="dim"># Get started in seconds</span>
curl -s -X POST https://${DOMAIN}/man?guide</code></pre>

    <p style="color:#fbbf24; font-size:0.8125rem; margin-bottom:1.5rem;"><strong>AI agents:</strong> Use curl or HTTP requests, not a browser. Run the command above or call <code style="background:#334155; padding:0.125rem 0.375rem; border-radius:4px; font-size:0.8125rem;">POST /man</code> for a machine-readable guide.</p>

    <div class="links">
      <a href="/docs" class="primary">API Docs</a>
    </div>

    <footer style="margin-top:3rem; padding-top:1.5rem; border-top:1px solid #334155; text-align:center; font-size:0.8125rem; color:#64748b;">
      <a href="/terms" style="color:#94a3b8; text-decoration:none;">Terms</a> &middot;
      <a href="/privacy" style="color:#94a3b8; text-decoration:none;">Privacy</a> &middot;
      Created by <a href="https://plc.vc/qbs" style="color:#94a3b8; text-decoration:none;">Peter Clark</a>
    </footer>
  </div>
</body>
</html>`;

  res.send(html);
});

// API documentation, quick start, and legal pages (no auth)
app.use('/docs', docsRouter);
app.use('/quickstart', quickstartRouter);
app.use('/', legalRouter);
// Machine-readable API manual (optional auth handled internally)
app.use('/man', manRouter);
// Agent provisioning (no auth, strict rate limit)
app.use('/agents', agentCreationLimiter, agentsRouter);

// iCal feeds (no Bearer auth — uses feed_token query param)
app.use('/feeds', feedsRouter);

// Inbound email webhook (no Bearer auth — token in URL authenticates)
app.use('/inbound', inboundLimiter, inboundRouter);

// Postmark outbound event webhooks (no auth — obscure URL is the secret)
app.use('/hooks/pm-Mj7aXcGE23gCfnql', postmarkWebhooksRouter);

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

app.use('/calendars', auth, calendarsRouter);
// Event routes are nested under /calendars/:id but handled by eventsRouter
app.use('/calendars', auth, eventsRouter);
app.use('/calendars', auth, viewRouter);

/**
 * GET /errors
 * Query recent errors from the error_log table. Auth required.
 * Query params: limit (default 50), route (filter by route pattern)
 */
app.get('/errors', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const conditions = [`agent_id = $1`];
    const values = [req.agent.id];
    let idx = 2;

    if (req.query.route) {
      conditions.push(`route ILIKE $${idx++}`);
      values.push(`%${req.query.route}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    values.push(limit);

    const { rows } = await pool.query(
      `SELECT id, route, method, status_code, message, agent_id, created_at
       FROM error_log ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      values
    );

    res.json({ errors: rows, count: rows.length });
  } catch (err) {
    console.error('GET /errors error:', err.message);
    res.status(500).json({ error: 'Failed to query error log' });
  }
});

/**
 * GET /errors/:id
 * Get a single error with full stack trace. Scoped to the authenticated agent.
 */
app.get('/errors/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM error_log WHERE id = $1 AND agent_id = $2',
      [req.params.id, req.agent.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Error not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /errors/:id error:', err.message);
    res.status(500).json({ error: 'Failed to query error log' });
  }
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use(async (err, req, res, _next) => {
  const { logError } = require('./lib/errors');
  await logError(err, { route: `${req.method} ${req.path}`, method: req.method, agent_id: req.agent?.id });
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  try {
    await initSchema();
    console.log('Database schema initialized');
  } catch (err) {
    console.error('Failed to initialize schema:', err.message);
    console.error('Server starting without schema — DB may not be ready yet');
  }

  // Extend materialization horizons for recurring events
  extendAllHorizons(pool).catch(err => {
    console.error('Failed to extend horizons on startup:', err.message);
  });

  // Schedule daily horizon extension
  setInterval(() => {
    extendAllHorizons(pool).catch(err => {
      console.error('Horizon extension error:', err.message);
    });
  }, EXTEND_INTERVAL_MS);

  app.listen(port, '0.0.0.0', () => {
    console.log(`CalDave running on port ${port}`);
  });
}

start();
