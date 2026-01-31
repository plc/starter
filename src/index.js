const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check endpoint
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
      database: {
        connected: false,
        error: error.message,
      },
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: process.env.npm_package_name || 'myapp',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      database: '/health/db',
    },
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
