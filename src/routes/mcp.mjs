/**
 * Remote MCP endpoint — Streamable HTTP transport
 *
 * Exposes CalDave's MCP tools at POST/GET/DELETE /mcp.
 * Agents connect with their API key as a Bearer token.
 *
 * Each MCP session gets its own McpServer + transport pair,
 * authenticated against the CalDave REST API using the agent's key.
 *
 * Install in any MCP client:
 *   { "url": "https://caldave.ai/mcp", "headers": { "Authorization": "Bearer sk_live_..." } }
 */

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, INSTRUCTIONS } from '../lib/mcp-tools.mjs';

const BASE_URL = (process.env.CALDAVE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');

/** sessionId → { transport, server } */
const sessions = new Map();

// Clean up stale sessions after 30 minutes of inactivity
const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of sessions) {
    if (now - entry.lastActive > SESSION_TTL_MS) {
      entry.transport.close?.();
      sessions.delete(sid);
    }
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Build a callApi function bound to an agent's API key
// ---------------------------------------------------------------------------

function makeCallApi(apiKey) {
  return async function callApi(method, path, body) {
    const headers = { Authorization: `Bearer ${apiKey}` };
    if (body) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return { ok: true };

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return data;
  };
}

// ---------------------------------------------------------------------------
// Extract Bearer token from request
// ---------------------------------------------------------------------------

function extractApiKey(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

// ---------------------------------------------------------------------------
// POST /mcp — JSON-RPC requests (initialize, tool calls, etc.)
// ---------------------------------------------------------------------------

export async function handlePost(req, res) {
  const sessionId = req.headers['mcp-session-id'];

  // Existing session — forward to its transport
  if (sessionId) {
    const entry = sessions.get(sessionId);
    if (!entry) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found. Send initialize without mcp-session-id to start a new session.' },
        id: req.body?.id ?? null,
      });
    }
    entry.lastActive = Date.now();
    return entry.transport.handleRequest(req, res, req.body);
  }

  // New session — must be an initialize request
  if (!req.body || req.body.method !== 'initialize') {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'First request must be "initialize". Include your API key as a Bearer token.' },
      id: req.body?.id ?? null,
    });
  }

  // Auth required
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Authorization: Bearer <api_key> header required.' },
      id: req.body?.id ?? null,
    });
  }

  // Verify the API key by calling /agents/me
  const callApi = makeCallApi(apiKey);
  try {
    await callApi('GET', '/agents/me');
  } catch {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Invalid API key.' },
      id: req.body?.id ?? null,
    });
  }

  // Create transport + MCP server for this session
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      sessions.set(sid, { transport, server: mcpServer, apiKey, lastActive: Date.now() });
    },
    onsessionclosed: (sid) => {
      sessions.delete(sid);
    },
  });

  const mcpServer = new McpServer(
    { name: 'caldave', version: '1.0.0' },
    { instructions: INSTRUCTIONS }
  );

  registerTools(mcpServer, callApi, BASE_URL, apiKey);

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) sessions.delete(sid);
  };

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// ---------------------------------------------------------------------------
// GET /mcp — SSE stream for server-to-client messages
// ---------------------------------------------------------------------------

export async function handleGet(req, res) {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'mcp-session-id header required. POST to /mcp with initialize first.' });
  }
  const entry = sessions.get(sessionId);
  if (!entry) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  entry.lastActive = Date.now();
  return entry.transport.handleRequest(req, res);
}

// ---------------------------------------------------------------------------
// DELETE /mcp — close session
// ---------------------------------------------------------------------------

export async function handleDelete(req, res) {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'mcp-session-id header required.' });
  }
  const entry = sessions.get(sessionId);
  if (!entry) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  return entry.transport.handleRequest(req, res);
}
