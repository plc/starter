/**
 * CalDave MCP Server — STDIO transport
 *
 * Thin HTTP-client wrapper that exposes CalDave's REST API as MCP tools.
 * Uses STDIO transport for local agent usage (Claude Desktop, Claude Code).
 *
 * For the remote HTTP transport, see src/routes/mcp.mjs (served at /mcp).
 *
 * Environment variables:
 *   CALDAVE_API_KEY  — required, Bearer token for auth
 *   CALDAVE_URL      — optional, defaults to https://caldave.ai
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools, INSTRUCTIONS } from './lib/mcp-tools.mjs';

const API_KEY = process.env.CALDAVE_API_KEY;
const BASE_URL = (process.env.CALDAVE_URL || 'https://caldave.ai').replace(/\/$/, '');

if (!API_KEY) {
  console.error('CALDAVE_API_KEY environment variable is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function callApi(method, path, body) {
  const headers = { Authorization: `Bearer ${API_KEY}` };
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
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: 'caldave', version: '1.0.0' },
  { instructions: INSTRUCTIONS }
);

registerTools(server, callApi, BASE_URL, API_KEY);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('CalDave MCP server running on stdio');
