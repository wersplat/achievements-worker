import { getSupabaseClient } from './db.js';
import { getEnv } from './env.js';
import { getLogger } from './logger.js';

export interface QueueItem {
  id: number;
  event_id: string;
}

export interface EventData {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  player_id?: string;
  match_id?: string;
  season_id?: string;
  league_id?: string;
  game_year?: string;
  occurred_at: string;
}

export async function claimBatch(): Promise<QueueItem[]> {
  const env = getEnv();
  const logger = getLogger();
  
  try {
    // First, get the items to claim
    const { data: items, error: selectError } = await getSupabaseClient()
      .from('event_queue')
      .select('id, event_id')
      .eq('status', 'queued')
      .lte('visible_at', new Date().toISOString())
      .order('id')
      .limit(env.BATCH_SIZE);
    
    if (selectError) {
      throw new Error(`Failed to select queue items: ${selectError.message}`);
    }
    
    if (!items || items.length === 0) {
      return [];
    }
    
    // Update the status to 'processing'
    const ids = items.map(item => item.id);
    const { error: updateError } = await getSupabaseClient()
      .from('event_queue')
      .update({ 
        status: 'processing', 
        updated_at: new Date().toISOString() 
      })
      .in('id', ids);
    
    if (updateError) {
      throw new Error(`Failed to update queue items: ${updateError.message}`);
    }
    
    logger.debug({
      claimed: items.length,
      batchSize: env.BATCH_SIZE,
    }, 'Claimed queue batch');
    
    return items;
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to claim queue batch');
    throw error;
  }
}

export async function loadEvents(eventIds: string[]): Promise<EventData[]> {
  if (eventIds.length === 0) {
    return [];
  }

  const logger = getLogger();
  
  try {
    const { data, error } = await getSupabaseClient()
      .from('events')
      .select('id, event_type, payload, player_id, match_id, season_id, league_id, game_year, occurred_at')
      .in('id', eventIds)
      .order('id');
    
    if (error) {
      throw new Error(`Failed to load events: ${error.message}`);
    }
    
    logger.debug({
      requested: eventIds.length,
      found: data?.length || 0,
    }, 'Loaded events');
    
    return data || [];
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      eventIds,
    }, 'Failed to load events');
    throw error;
  }
}

export async function markDone(queueIds: number[]): Promise<void> {
  if (queueIds.length === 0) {
    return;
  }

  const logger = getLogger();
  
  try {
    const { error } = await getSupabaseClient()
      .from('event_queue')
      .update({ 
        status: 'done', 
        updated_at: new Date().toISOString() 
      })
      .in('id', queueIds);
    
    if (error) {
      throw new Error(`Failed to mark queue items as done: ${error.message}`);
    }
    
    logger.debug({
      queueIds,
      updated: queueIds.length,
    }, 'Marked queue items as done');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      queueIds,
    }, 'Failed to mark queue items as done');
    throw error;
  }
}

export async function markRetry(queueId: number, errorMessage: string): Promise<void> {
  const env = getEnv();
  const logger = getLogger();
  
  try {
    // Get current attempts
    const { data: queueItem, error: selectError } = await getSupabaseClient()
      .from('event_queue')
      .select('attempts')
      .eq('id', queueId)
      .single();
    
    if (selectError || !queueItem) {
      throw new Error(`Queue item ${queueId} not found`);
    }
    
    const currentAttempts = queueItem.attempts || 0;
    const newAttempts = currentAttempts + 1;
    
    if (newAttempts >= env.MAX_ATTEMPTS) {
      // Mark as error
      const { error: updateError } = await getSupabaseClient()
        .from('event_queue')
        .update({
          status: 'error',
          attempts: newAttempts,
          last_error: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', queueId);
      
      if (updateError) {
        throw new Error(`Failed to mark queue item as error: ${updateError.message}`);
      }
      
      logger.warn({
        queueId,
        attempts: newAttempts,
        maxAttempts: env.MAX_ATTEMPTS,
        error: errorMessage,
      }, 'Queue item marked as error after max attempts');
    } else {
      // Schedule retry with exponential backoff
      const backoffMinutes = Math.pow(2, Math.min(newAttempts, 7));
      const visibleAt = new Date();
      visibleAt.setMinutes(visibleAt.getMinutes() + backoffMinutes);
      
      const { error: updateError } = await getSupabaseClient()
        .from('event_queue')
        .update({
          status: 'queued',
          attempts: newAttempts,
          last_error: errorMessage,
          visible_at: visibleAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', queueId);
      
      if (updateError) {
        throw new Error(`Failed to schedule queue item retry: ${updateError.message}`);
      }
      
      logger.warn({
        queueId,
        attempts: newAttempts,
        backoffMinutes,
        error: errorMessage,
      }, 'Queue item scheduled for retry');
    }
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      queueId,
    }, 'Failed to mark queue item for retry');
    throw error;
  }
}

export async function getQueueLag(): Promise<number> {
  try {
    const { count, error } = await getSupabaseClient()
      .from('event_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lte('visible_at', new Date().toISOString());
    
    if (error) {
      throw new Error(`Failed to get queue lag: ${error.message}`);
    }
    
    return count || 0;
  } catch (error) {
    getLogger().error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to get queue lag');
    return 0;
  }
}
