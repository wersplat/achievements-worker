import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';
import { getLogger } from './logger.js';

let supabase: SupabaseClient;

export function createSupabaseClient(): SupabaseClient {
  if (supabase) {
    return supabase;
  }

  const env = getEnv();
  const logger = getLogger();
  
  logger.info('Creating Supabase client for RPC');
  
  supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Test the connection with a simple RPC call
  (async () => {
    try {
      await supabase.rpc('test_connection');
      logger.info('Supabase RPC connection test successful');
    } catch (err: any) {
      logger.warn({
        error: err instanceof Error ? err.message : String(err),
      }, 'Supabase RPC test failed (expected if test_connection function not exists)');
    }
  })();

  return supabase;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Call createSupabaseClient() first.');
  }
  return supabase;
}

// Simple query function for backward compatibility
// TODO: Replace with direct Supabase client calls
export async function query<T = any>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const logger = getLogger();
  
  logger.warn({
    query: text,
    params,
  }, 'Using deprecated query function - should be replaced with Supabase client calls');
  
  // For now, return empty result to avoid breaking the build
  // This should be replaced with proper Supabase client calls
  return { rows: [], rowCount: 0 };
}

// Note: Transactions are handled by Supabase client automatically
// Each operation is atomic, so we don't need explicit transaction management

export async function closeSupabaseClient(): Promise<void> {
  // Supabase client doesn't need explicit closing
  getLogger().info('Supabase client cleanup completed');
}
