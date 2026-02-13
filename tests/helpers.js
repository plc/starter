/**
 * Test helpers — HTTP client wrapper and utilities
 *
 * Tests run against a live server. Set TEST_BASE_URL to override the default.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3720';

/**
 * Make an API request and return { status, data, headers, raw }.
 *
 * @param {string} method  — GET, POST, PATCH, DELETE
 * @param {string} path    — e.g. '/agents' or '/calendars/cal_123/events'
 * @param {object} opts
 * @param {object} [opts.body]   — JSON body (auto-stringified)
 * @param {string} [opts.token]  — Bearer token
 * @param {boolean} [opts.raw]   — if true, return raw response text instead of parsed JSON
 */
async function api(method, path, { body, token, raw } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;

  if (raw) {
    data = await res.text();
  } else if (res.status === 204) {
    // No content
    data = null;
  } else if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data, headers: res.headers };
}

/**
 * Return an ISO 8601 date string offset from now.
 * @param {number} hours — hours from now (negative for past)
 */
function futureDate(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

module.exports = { BASE_URL, api, futureDate };
