/**
 * Database abstraction layer
 *
 * Supports SQLite (default) and PostgreSQL.
 * Set DB_TYPE=sqlite or DB_TYPE=postgres via environment variable.
 *
 * Exports:
 * - query(sql, params) - Execute a query, returns { rows: [...] }
 * - healthCheck() - Returns { time, version } or throws
 * - close() - Close the database connection
 * - dbType - 'sqlite' or 'postgres'
 *
 * Note: Parameter placeholders differ between databases:
 * - SQLite uses ? (e.g., WHERE id = ?)
 * - PostgreSQL uses $1 (e.g., WHERE id = $1)
 * The DB choice is permanent per project, so use the right syntax.
 */

const dbType = process.env.DB_TYPE || 'sqlite';

let query;
let healthCheck;
let close;

if (dbType === 'postgres') {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  query = async (sql, params) => {
    const result = await pool.query(sql, params);
    return { rows: result.rows };
  };

  healthCheck = async () => {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    return {
      time: result.rows[0].time,
      version: result.rows[0].version,
    };
  };

  close = async () => {
    await pool.end();
  };
} else {
  const Database = require('better-sqlite3');
  const path = require('path');

  const dbPath = process.env.SQLITE_PATH || './data/myapp.db';
  const dir = path.dirname(dbPath);
  require('fs').mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  query = async (sql, params) => {
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      const rows = params ? stmt.all(...params) : stmt.all();
      return { rows };
    }
    const result = params ? stmt.run(...params) : stmt.run();
    return { rows: [], changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  };

  healthCheck = async () => {
    const row = db.prepare("SELECT datetime('now') as time, sqlite_version() as version").get();
    return {
      time: row.time,
      version: 'SQLite ' + row.version,
    };
  };

  close = async () => {
    db.close();
  };
}

module.exports = { query, healthCheck, close, dbType };
