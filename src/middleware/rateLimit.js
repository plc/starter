/**
 * Rate limiting middleware
 *
 * Uses express-rate-limit for actual enforcement.
 * Exports multiple limiters for different route groups.
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter (authenticated routes).
 * 200 requests per minute per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Strict limiter for agent creation (unauthenticated).
 * 5 requests per hour per IP.
 */
const agentCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many agent creation requests, please try again later' },
});

/**
 * Inbound webhook limiter.
 * 60 requests per minute per IP.
 */
const inboundLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

module.exports = { apiLimiter, agentCreationLimiter, inboundLimiter };
