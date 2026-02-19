/**
 * Rate limiting middleware
 *
 * Uses express-rate-limit for actual enforcement.
 * Exports multiple limiters for different route groups.
 *
 * Rate limiting is disabled when NODE_ENV=test so integration
 * tests can run without hitting limits.
 */

const rateLimit = require('express-rate-limit');

const skipInTest = () => process.env.NODE_ENV === 'test';

/**
 * General API rate limiter (authenticated routes).
 * 1000 requests per minute per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Strict limiter for agent creation (unauthenticated).
 * 20 requests per hour per IP.
 */
const agentCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
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
  skip: skipInTest,
  message: { error: 'Too many requests' },
});

/**
 * Human auth limiter (login/signup).
 * 10 requests per 15 minutes per IP.
 */
const humanAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many login/signup attempts, please try again later' },
});

module.exports = { apiLimiter, agentCreationLimiter, inboundLimiter, humanAuthLimiter };
