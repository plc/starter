/**
 * CalDave — Calendar-as-a-service API for AI agents
 *
 * Entry point. Sets up Express server with:
 * - Schema initialization on startup
 * - Auth middleware (Bearer token)
 * - Rate limit stub headers
 * - Route modules (agents, calendars, events)
 * - Health check endpoints
 * - Status page
 *
 * Environment variables:
 * - PORT: Server port (default: 3000)
 * - DATABASE_URL: PostgreSQL connection string
 * - CALDAVE_DOMAIN: Domain for calendar emails (default: caldave.fly.dev)
 */

const express = require('express');
const { pool, initSchema } = require('./db');
const auth = require('./middleware/auth');
const rateLimitStub = require('./middleware/rateLimitStub');
const agentsRouter = require('./routes/agents');
const calendarsRouter = require('./routes/calendars');
const eventsRouter = require('./routes/events');

const app = express();
const port = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(rateLimitStub);

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

/**
 * GET /
 * Status page — dark-themed HTML dashboard showing server + DB health.
 */
app.get('/', async (req, res) => {
  const appName = 'CalDave';
  const serverTime = new Date().toISOString();

  let dbStatus = { connected: false, time: null, version: null, error: null };
  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    dbStatus = {
      connected: true,
      time: result.rows[0].time,
      version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1],
      error: null,
    };
  } catch (error) {
    dbStatus.error = error.message;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .container { max-width: 500px; width: 100%; }
    h1 { font-size: 2rem; margin-bottom: 1.5rem; color: #fff; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; }
    .card h2 { font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 1rem; }
    .status { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
    .status:last-child { margin-bottom: 0; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .dot.green { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
    .dot.red { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
    .label { color: #94a3b8; min-width: 80px; }
    .value { color: #fff; word-break: break-all; }
    .endpoints { margin-top: 1.5rem; }
    .endpoints a { display: block; color: #60a5fa; text-decoration: none; padding: 0.5rem 0; border-bottom: 1px solid #334155; }
    .endpoints a:last-child { border-bottom: none; }
    .endpoints a:hover { color: #93c5fd; }
    code { background: #334155; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${appName}</h1>

    <div class="card">
      <h2>Server</h2>
      <div class="status">
        <span class="dot green"></span>
        <span class="label">Status</span>
        <span class="value">Running</span>
      </div>
      <div class="status">
        <span class="dot green"></span>
        <span class="label">Time</span>
        <span class="value">${serverTime}</span>
      </div>
    </div>

    <div class="card">
      <h2>Database</h2>
      <div class="status">
        <span class="dot ${dbStatus.connected ? 'green' : 'red'}"></span>
        <span class="label">Status</span>
        <span class="value">${dbStatus.connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      ${dbStatus.connected ? `
      <div class="status">
        <span class="dot green"></span>
        <span class="label">Version</span>
        <span class="value">${dbStatus.version}</span>
      </div>
      <div class="status">
        <span class="dot green"></span>
        <span class="label">Time</span>
        <span class="value">${dbStatus.time}</span>
      </div>
      ` : `
      <div class="status">
        <span class="dot red"></span>
        <span class="label">Error</span>
        <span class="value">${dbStatus.error}</span>
      </div>
      `}
    </div>

    <div class="card endpoints">
      <h2>API Endpoints</h2>
      <a href="/health"><code>GET /health</code> — Server health check</a>
      <a href="/health/db"><code>GET /health/db</code> — Database health check</a>
      <a><code>POST /agents</code> — Create agent (get API key)</a>
      <a><code>POST /calendars</code> — Create calendar</a>
      <a><code>GET /calendars</code> — List calendars</a>
      <a><code>GET /calendars/:id/upcoming</code> — Upcoming events</a>
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});

// Agent provisioning (no auth)
app.use('/agents', agentsRouter);

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

app.use('/calendars', auth, calendarsRouter);
// Event routes are nested under /calendars/:id but handled by eventsRouter
app.use('/calendars', auth, eventsRouter);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
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

  app.listen(port, '0.0.0.0', () => {
    console.log(`CalDave running on port ${port}`);
  });
}

start();
