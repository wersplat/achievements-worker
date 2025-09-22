import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getEnv } from './env.js';
import { getLogger } from './logger.js';

let pool: Pool;

export function createPool(): Pool {
  if (pool) {
    return pool;
  }

  const env = getEnv();
  const logger = getLogger();
  
  // Disable SSL certificate verification for Railway + Supabase
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // Try direct connection first (not pooling)
  const connectionUrl = new URL(env.SUPABASE_DB_URL);
  
  // Remove pooling parameters if present
  if (connectionUrl.hostname.includes('pooler')) {
    // Convert pooling URL to direct connection
    const projectRef = connectionUrl.hostname.split('.')[0];
    connectionUrl.hostname = `db.${projectRef}.supabase.co`;
    connectionUrl.port = '5432';
  }
  
  connectionUrl.searchParams.set('sslmode', 'require');
  connectionUrl.searchParams.set('sslcert', '');
  connectionUrl.searchParams.set('sslkey', '');
  connectionUrl.searchParams.set('sslrootcert', '');

  pool = new Pool({
    connectionString: connectionUrl.toString(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: {
      rejectUnauthorized: false, // Allow self-signed certificates for Supabase
      checkServerIdentity: () => undefined, // Disable hostname verification
      secureProtocol: 'TLSv1_2_method', // Force TLS 1.2
    },
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Database pool error');
  });

  pool.on('connect', (client) => {
    logger.debug('New database connection established');
  });

  // Test the connection immediately
  pool.query('SELECT 1 as test')
    .then(() => {
      logger.info('Database connection test successful');
    })
    .catch((err) => {
      logger.error({
        error: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
      }, 'Database connection test failed');
    });

  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call createPool() first.');
  }
  return pool;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const logger = getLogger();
  const start = Date.now();
  
  try {
    const result = await getPool().query<T>(text, params);
    const duration = Date.now() - start;
    
    logger.debug({
      query: text,
      params,
      duration,
      rowCount: result.rowCount,
    }, 'Database query executed');
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error({
      query: text,
      params,
      duration,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : undefined,
    }, 'Database query failed');
    throw error;
  }
}

export async function tx<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const logger = getLogger();
  const client = await getPool().connect();
  
  try {
    await client.query('BEGIN');
    logger.debug('Transaction started');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    logger.debug('Transaction committed');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.debug('Transaction rolled back');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    getLogger().info('Database pool closed');
  }
}
