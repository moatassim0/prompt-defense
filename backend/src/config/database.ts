import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DB_DEBUG_QUERIES =
  process.env.DB_DEBUG_QUERIES === '1' || process.env.DB_DEBUG_QUERIES === 'true';

// Create connection pool for Neon
const rejectUnauthorized =
  process.env.DB_SSL_INSECURE === 'true'
    ? false
    : process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized,
  },
  min: 1,
  max: 20,
  idleTimeoutMillis: 60000,        // 60s — intentionally shorter than Neon PgBouncer's own idle
                                    // timeout (~1-2 min). Our pool proactively drops and recreates
                                    // connections before PgBouncer can force-reset them (ECONNRESET).
  connectionTimeoutMillis: 20000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Connection event handlers
pool.on('connect', () => {
  if (DB_DEBUG_QUERIES) console.log('✓ Connected to Neon PostgreSQL');
});

pool.on('error', (err: any) => {
  // ECONNRESET = Neon PgBouncer forcibly closed an idle connection.
  // The pool has already removed the dead client — just log it and let
  // the pool create a fresh replacement (min: 1 guarantees this).
  if (err.code === 'ECONNRESET' || err.message?.includes('ECONNRESET')) {
    console.warn('⚠ DB connection reset by Neon pooler (ECONNRESET) — pool will reconnect automatically');
  } else {
    console.error('❌ Unexpected database error:', err.message);
  }
});

/**
 * Execute a query with automatic retry for transient connection failures (e.g. Neon wakeup)
 */
export async function query(text: string, params?: any[], retries = 3) {
  const start = Date.now();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (DB_DEBUG_QUERIES) {
        console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
      }
      return res;
    } catch (error: any) {
      const isTransient =
        error?.message?.includes('timeout') ||
        error?.message?.includes('Connection terminated') ||
        error?.message?.includes('ECONNRESET') ||
        error?.message?.includes('ENOTFOUND') ||
        error?.code === '57P01'; // admin_shutdown

      if (isTransient && attempt < retries) {
        const delay = attempt * 2000;
        console.warn(`⚠ DB query failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`, error.message);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.error('Database query error:', error);
      throw error;
    }
  }
  throw new Error('Query failed after all retries');
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✓ Database connection successful');
    console.log('  Time:', result.rows[0].current_time);
    console.log('  PostgreSQL:', result.rows[0].pg_version.split(' ')[0], result.rows[0].pg_version.split(' ')[1]);
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    return false;
  }
}

/**
 * Close all database connections
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

// Keep-alive ping every 4 minutes to prevent Neon free-tier auto-suspension (suspends at 5 min idle)
const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(async () => {
    try {
      await pool.query('SELECT 1');
      if (DB_DEBUG_QUERIES) console.log('💓 DB keep-alive ping OK');
    } catch (err: any) {
      console.warn('⚠ DB keep-alive ping failed — attempting immediate reconnect:', err.message);
      // Actively try to re-warm the connection instead of waiting 4 more minutes
      try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        console.log('✓ DB reconnected successfully after keep-alive failure');
      } catch (reconnectErr: any) {
        console.error('✗ DB reconnect failed — next retry in 4 min:', reconnectErr.message);
      }
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  // Allow the Node.js process to exit normally even if this interval is active
  keepAliveTimer.unref();
}

export function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// Startup: connect + begin keep-alive (only if DATABASE_URL is configured)
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== 'your_neon_database_url_here') {
  testConnection()
    .then(ok => {
      if (ok) startKeepAlive();
    })
    .catch(err => {
      console.error('Failed to connect to database on startup:', err);
    });
} else {
  console.warn('⚠ DATABASE_URL not configured — database features (testing/analytics) will be unavailable.');
}
