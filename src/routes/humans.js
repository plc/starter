/**
 * Human account routes
 *
 * GET  /signup    — signup HTML page
 * POST /signup    — create account, set cookie, redirect to /dashboard
 * GET  /login     — login HTML page
 * POST /login     — authenticate, set cookie, redirect to /dashboard
 * POST /logout    — clear cookie, redirect to /login
 * GET  /dashboard — lists claimed agents (session auth)
 * POST /dashboard/claim                — claim agent by sk_live_ key
 * POST /dashboard/agents/:agent_id/release — remove association
 */

const { Router } = require('express');
const { pool } = require('../db');
const { humanId, humanAgentId, sessionToken, humanApiKey } = require('../lib/ids');
const { hashKey } = require('../lib/keys');
const { hashPassword, verifyPassword } = require('../lib/passwords');
const { logError } = require('../lib/errors');
const { sessionAuth } = require('../middleware/humanAuth');

const router = Router();

const SESSION_DAYS = 7;
const MAX_NAME = 255;
const MAX_EMAIL = 255;
const MAX_PASSWORD = 1024;
const MIN_PASSWORD = 8;

// ---------------------------------------------------------------------------
// Shared CSS for all HTML pages (dark theme matching docs.js)
// ---------------------------------------------------------------------------

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
  .container { max-width: 480px; width: 100%; }
  .container.wide { max-width: 720px; }
  h1 { font-size: 2rem; color: #fff; margin-bottom: 0.5rem; }
  h1 a { color: #60a5fa; text-decoration: none; font-size: 1rem; margin-left: 1rem; }
  h1 a:hover { color: #93c5fd; }
  .subtitle { color: #94a3b8; margin-bottom: 2rem; font-size: 0.9375rem; }
  .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  label { display: block; font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.375rem; }
  input[type="text"], input[type="email"], input[type="password"] {
    width: 100%; padding: 0.625rem 0.75rem; background: #0f172a; border: 1px solid #334155;
    border-radius: 8px; color: #e2e8f0; font-size: 0.875rem; margin-bottom: 1rem;
    font-family: system-ui, -apple-system, sans-serif;
  }
  input:focus { outline: none; border-color: #2563eb; }
  button, .btn {
    display: inline-block; padding: 0.625rem 1.25rem; border-radius: 8px; border: none;
    font-size: 0.875rem; font-weight: 500; cursor: pointer; text-decoration: none;
    transition: background 0.15s;
  }
  .btn-primary { background: #2563eb; color: #fff; }
  .btn-primary:hover { background: #3b82f6; }
  .btn-danger { background: #7f1d1d; color: #fca5a5; }
  .btn-danger:hover { background: #991b1b; }
  .btn-secondary { background: #334155; color: #94a3b8; }
  .btn-secondary:hover { background: #475569; color: #e2e8f0; }
  .flash { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.875rem; }
  .flash-error { background: #7f1d1d; color: #fca5a5; }
  .flash-success { background: #065f46; color: #6ee7b7; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th { text-align: left; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.5rem 0.75rem; border-bottom: 1px solid #334155; }
  td { padding: 0.625rem 0.75rem; border-bottom: 1px solid #1e293b; color: #cbd5e1; }
  .mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8125rem; }
  .key-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 0.75rem 1rem; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8125rem; color: #fbbf24; word-break: break-all; margin-bottom: 1rem; }
  .section-title { font-size: 1rem; color: #fff; margin-bottom: 0.75rem; }
  .links { display: flex; gap: 1rem; margin-top: 1rem; }
  .text-link { color: #60a5fa; text-decoration: none; font-size: 0.875rem; }
  .text-link:hover { color: #93c5fd; }
  .nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
  .nav-right { display: flex; gap: 1rem; align-items: center; }
  .nav-right .name { color: #94a3b8; font-size: 0.875rem; }
  form.inline { display: inline; }
`;

// ---------------------------------------------------------------------------
// Helper: wrap HTML page
// ---------------------------------------------------------------------------

function page(title, bodyHtml) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + title + ' — CalDave</title><style>' + CSS + '</style></head><body>' + bodyHtml + '</body></html>';
}

function flashHtml(type, message) {
  if (!message) return '';
  return '<div class="flash flash-' + type + '">' + escapeHtml(message) + '</div>';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// GET /signup
// ---------------------------------------------------------------------------

router.get('/signup', (req, res) => {
  const error = req.query.error || '';
  const html = page('Sign Up', '<div class="container">'
    + '<h1>CalDave <a href="/">home</a></h1>'
    + '<p class="subtitle">Create an account to manage your agent keys.</p>'
    + flashHtml('error', error)
    + '<div class="card">'
    + '<form method="POST" action="/signup">'
    + '<label for="name">Name</label>'
    + '<input type="text" id="name" name="name" required maxlength="255" placeholder="Your name">'
    + '<label for="email">Email</label>'
    + '<input type="email" id="email" name="email" required maxlength="255" placeholder="you@example.com">'
    + '<label for="password">Password</label>'
    + '<input type="password" id="password" name="password" required minlength="8" maxlength="1024" placeholder="Min 8 characters">'
    + '<button type="submit" class="btn btn-primary" style="width:100%">Create Account</button>'
    + '</form>'
    + '</div>'
    + '<p><a href="/login" class="text-link">Already have an account? Log in</a></p>'
    + '</div>');
  res.send(html);
});

// ---------------------------------------------------------------------------
// POST /signup
// ---------------------------------------------------------------------------

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.redirect('/signup?error=' + encodeURIComponent('Name is required'));
    }
    if (name.length > MAX_NAME) {
      return res.redirect('/signup?error=' + encodeURIComponent('Name must be ' + MAX_NAME + ' characters or fewer'));
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.redirect('/signup?error=' + encodeURIComponent('Valid email is required'));
    }
    if (email.length > MAX_EMAIL) {
      return res.redirect('/signup?error=' + encodeURIComponent('Email must be ' + MAX_EMAIL + ' characters or fewer'));
    }
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return res.redirect('/signup?error=' + encodeURIComponent('Password must be at least ' + MIN_PASSWORD + ' characters'));
    }
    if (password.length > MAX_PASSWORD) {
      return res.redirect('/signup?error=' + encodeURIComponent('Password must be ' + MAX_PASSWORD + ' characters or fewer'));
    }

    // Check if email already taken
    const existing = await pool.query(
      'SELECT id FROM humans WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    if (existing.rows.length > 0) {
      return res.redirect('/signup?error=' + encodeURIComponent('An account with that email already exists'));
    }

    const id = humanId();
    const pwHash = await hashPassword(password);
    const hKey = humanApiKey();
    const hKeyHash = hashKey(hKey);

    await pool.query(
      'INSERT INTO humans (id, name, email, password_hash, api_key_hash) VALUES ($1, $2, $3, $4, $5)',
      [id, name.trim(), email.trim().toLowerCase(), pwHash, hKeyHash]
    );

    // Create session
    const sessId = sessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO human_sessions (id, human_id, expires_at) VALUES ($1, $2, $3)',
      [sessId, id, expiresAt]
    );

    res.cookie('caldave_session', sessId, {
      httpOnly: true,
      sameSite: 'lax',
      expires: expiresAt,
      secure: process.env.NODE_ENV === 'production',
    });

    // Redirect to dashboard with the human key shown once
    res.redirect('/dashboard?new_key=' + encodeURIComponent(hKey));
  } catch (err) {
    logError(err, { route: 'POST /signup', method: 'POST' });
    res.redirect('/signup?error=' + encodeURIComponent('Failed to create account'));
  }
});

// ---------------------------------------------------------------------------
// GET /login
// ---------------------------------------------------------------------------

router.get('/login', (req, res) => {
  const error = req.query.error || '';
  const html = page('Log In', '<div class="container">'
    + '<h1>CalDave <a href="/">home</a></h1>'
    + '<p class="subtitle">Log in to manage your agent keys.</p>'
    + flashHtml('error', error)
    + '<div class="card">'
    + '<form method="POST" action="/login">'
    + '<label for="email">Email</label>'
    + '<input type="email" id="email" name="email" required placeholder="you@example.com">'
    + '<label for="password">Password</label>'
    + '<input type="password" id="password" name="password" required placeholder="Password">'
    + '<button type="submit" class="btn btn-primary" style="width:100%">Log In</button>'
    + '</form>'
    + '</div>'
    + '<p><a href="/signup" class="text-link">Don' + "'" + 't have an account? Sign up</a></p>'
    + '</div>');
  res.send(html);
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.redirect('/login?error=' + encodeURIComponent('Email and password are required'));
    }

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash FROM humans WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (rows.length === 0) {
      return res.redirect('/login?error=' + encodeURIComponent('Invalid email or password'));
    }

    const human = rows[0];
    const valid = await verifyPassword(password, human.password_hash);
    if (!valid) {
      return res.redirect('/login?error=' + encodeURIComponent('Invalid email or password'));
    }

    // Create session
    const sessId = sessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO human_sessions (id, human_id, expires_at) VALUES ($1, $2, $3)',
      [sessId, human.id, expiresAt]
    );

    res.cookie('caldave_session', sessId, {
      httpOnly: true,
      sameSite: 'lax',
      expires: expiresAt,
      secure: process.env.NODE_ENV === 'production',
    });

    res.redirect('/dashboard');
  } catch (err) {
    logError(err, { route: 'POST /login', method: 'POST' });
    res.redirect('/login?error=' + encodeURIComponent('Failed to log in'));
  }
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------

router.post('/logout', async (req, res) => {
  const sessId = req.cookies && req.cookies.caldave_session;
  if (sessId) {
    await pool.query('DELETE FROM human_sessions WHERE id = $1', [sessId]).catch(() => {});
  }
  res.clearCookie('caldave_session');
  res.redirect('/login');
});

// ---------------------------------------------------------------------------
// GET /dashboard (session auth required)
// ---------------------------------------------------------------------------

router.get('/dashboard', sessionAuth, async (req, res) => {
  try {
    const newKey = req.query.new_key || '';
    const error = req.query.error || '';
    const success = req.query.success || '';

    // Fetch claimed agents
    const { rows: agents } = await pool.query(
      'SELECT ha.agent_id, a.name, a.description, ha.claimed_at FROM human_agents ha JOIN agents a ON a.id = ha.agent_id WHERE ha.human_id = $1 ORDER BY ha.claimed_at DESC',
      [req.human.id]
    );

    let agentRows = '';
    if (agents.length === 0) {
      agentRows = '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:1.5rem;">No agents yet. Claim one below or create a new one.</td></tr>';
    } else {
      for (const a of agents) {
        agentRows += '<tr>'
          + '<td class="mono">' + escapeHtml(a.agent_id) + '</td>'
          + '<td>' + escapeHtml(a.name || '(unnamed)') + '</td>'
          + '<td>' + new Date(a.claimed_at).toLocaleDateString() + '</td>'
          + '<td><form class="inline" method="POST" action="/dashboard/agents/' + encodeURIComponent(a.agent_id) + '/release" onsubmit="return confirm(' + "'Release this agent?'" + ')"><button type="submit" class="btn btn-danger" style="padding:0.375rem 0.75rem; font-size:0.75rem;">Release</button></form></td>'
          + '</tr>';
      }
    }

    const html = page('Dashboard', '<div class="container wide">'
      + '<div class="nav">'
      + '<h1>Dashboard</h1>'
      + '<div class="nav-right">'
      + '<span class="name">' + escapeHtml(req.human.name) + '</span>'
      + '<form class="inline" method="POST" action="/logout"><button type="submit" class="btn btn-secondary" style="padding:0.375rem 0.75rem; font-size:0.75rem;">Log out</button></form>'
      + '</div>'
      + '</div>'
      + flashHtml('error', error)
      + flashHtml('success', success)
      + (newKey ? '<div class="card"><p class="section-title">Your Human API Key</p><p style="color:#94a3b8; font-size:0.8125rem; margin-bottom:0.75rem;">Use this key with the <span class="mono">X-Human-Key</span> header to create agents via the API. Store it securely — it will not be shown again.</p><div class="key-box">' + escapeHtml(newKey) + '</div></div>' : '')
      + '<div class="card">'
      + '<p class="section-title">Your Agents</p>'
      + '<table><thead><tr><th>Agent ID</th><th>Name</th><th>Claimed</th><th></th></tr></thead><tbody>'
      + agentRows
      + '</tbody></table>'
      + '</div>'
      + '<div class="card">'
      + '<p class="section-title">Claim an Existing Agent</p>'
      + '<p style="color:#94a3b8; font-size:0.8125rem; margin-bottom:0.75rem;">Paste an agent\'s secret key to claim ownership.</p>'
      + '<form method="POST" action="/dashboard/claim">'
      + '<input type="text" name="api_key" required placeholder="sk_live_..." style="font-family: ' + "'SF Mono', 'Fira Code', monospace" + '">'
      + '<button type="submit" class="btn btn-primary">Claim Agent</button>'
      + '</form>'
      + '</div>'
      + '</div>');
    res.send(html);
  } catch (err) {
    logError(err, { route: 'GET /dashboard', method: 'GET', human_id: req.human.id });
    res.status(500).send(page('Error', '<div class="container"><h1>Error</h1><p>Failed to load dashboard.</p></div>'));
  }
});

// ---------------------------------------------------------------------------
// POST /dashboard/claim (session auth required)
// ---------------------------------------------------------------------------

router.post('/dashboard/claim', sessionAuth, async (req, res) => {
  try {
    const { api_key } = req.body || {};

    if (!api_key || typeof api_key !== 'string' || !api_key.startsWith('sk_live_')) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('Please provide a valid agent API key (sk_live_...)'));
    }

    const hash = hashKey(api_key);
    const { rows: agentRows } = await pool.query(
      'SELECT id, name FROM agents WHERE api_key_hash = $1',
      [hash]
    );

    if (agentRows.length === 0) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid API key — no agent found'));
    }

    const agent = agentRows[0];

    // Check if already claimed by this human
    const existing = await pool.query(
      'SELECT id FROM human_agents WHERE human_id = $1 AND agent_id = $2',
      [req.human.id, agent.id]
    );
    if (existing.rows.length > 0) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('You already own this agent'));
    }

    await pool.query(
      'INSERT INTO human_agents (id, human_id, agent_id) VALUES ($1, $2, $3)',
      [humanAgentId(), req.human.id, agent.id]
    );

    res.redirect('/dashboard?success=' + encodeURIComponent('Agent ' + agent.id + ' claimed successfully'));
  } catch (err) {
    logError(err, { route: 'POST /dashboard/claim', method: 'POST', human_id: req.human.id });
    res.redirect('/dashboard?error=' + encodeURIComponent('Failed to claim agent'));
  }
});

// ---------------------------------------------------------------------------
// POST /dashboard/agents/:agent_id/release (session auth required)
// ---------------------------------------------------------------------------

router.post('/dashboard/agents/:agent_id/release', sessionAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM human_agents WHERE human_id = $1 AND agent_id = $2',
      [req.human.id, req.params.agent_id]
    );

    if (rowCount === 0) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('Agent not found or not owned by you'));
    }

    res.redirect('/dashboard?success=' + encodeURIComponent('Agent released'));
  } catch (err) {
    logError(err, { route: 'POST /dashboard/release', method: 'POST', human_id: req.human.id });
    res.redirect('/dashboard?error=' + encodeURIComponent('Failed to release agent'));
  }
});

module.exports = router;
