/**
 * Health check script
 *
 * Tests if the server is running by making an HTTP request to /health
 * Used by: npm test
 *
 * Exit codes:
 * - 0: Health check passed
 * - 1: Health check failed
 *
 * Environment variables:
 * - PORT: Server port (default: 3000)
 * - HOST: Server host (default: localhost)
 */

const http = require('http');

const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

const options = {
  hostname: host,
  port: port,
  path: '/health',
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('Health check passed');
      console.log('Response:', data);
      process.exit(0);
    } else {
      console.log('Health check failed');
      console.log('Status:', res.statusCode);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.log('Health check failed');
  console.log('Error:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('Health check timed out');
  req.destroy();
  process.exit(1);
});

req.end();
