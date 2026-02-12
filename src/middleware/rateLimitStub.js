/**
 * Rate limit header stub
 *
 * Attaches X-RateLimit-* headers to all responses with placeholder values.
 * No actual enforcement — just ensures the response shape is correct so
 * clients can be written against the headers now.
 *
 * Replace with express-rate-limit (or similar) when enforcement is needed.
 */

function rateLimitStub(req, res, next) {
  res.set('X-RateLimit-Limit', '100');
  res.set('X-RateLimit-Remaining', '99');
  res.set('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 60));
  next();
}

module.exports = rateLimitStub;
