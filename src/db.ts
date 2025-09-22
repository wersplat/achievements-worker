import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool, QueryResultRow } from 'pg';
import { getEnv } from './env.js';
import { getLogger } from './logger.js';

let supabase: SupabaseClient;
let pool: Pool;

export function createSupabaseClient(): SupabaseClient {
  if (supabase) {
    return supabase;
  }

  const env = getEnv();
  const logger = getLogger();
  
  logger.info('Creating Supabase client');
  
  supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Also create a PostgreSQL pool using Supabase's connection string
  const connectionString = `postgresql://postgres:${env.SUPABASE_SERVICE_ROLE_KEY}@${env.SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')}.supabase.co:5432/postgres?sslmode=require`;
  
  logger.info('Creating PostgreSQL pool from Supabase connection');
  
  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  // Test the connection
  pool.query('SELECT 1 as test')
    .then(() => {
      logger.info('Supabase PostgreSQL connection test successful');
    })
    .catch((err) => {
      logger.error({
        error: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
      }, 'Supabase PostgreSQL connection test failed');
    });

  return supabase;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Call createSupabaseClient() first.');
  }
  return supabase;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('PostgreSQL pool not initialized. Call createSupabaseClient() first.');
  }
  return pool;
}

// Export both clients
export function getClient() {
  return getSupabaseClient();
}

// Raw SQL query function using PostgreSQL pool
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
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
    
    return { rows: result.rows, rowCount: result.rowCount || 0 };
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

// Transaction support
export async function tx<T>(
  callback: (client: any) => Promise<T>
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

export async function closeSupabaseClient(): Promise<void> {
  if (pool) {
    await pool.end();
    getLogger().info('Supabase PostgreSQL pool closed');
  }
}
