import { query, tx } from './db.js';
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
  
  const claimQuery = `
    WITH cte AS (
      SELECT id
      FROM public.event_queue
      WHERE status = 'queued' AND visible_at <= NOW()
      ORDER BY id
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.event_queue q
    SET status = 'processing', updated_at = NOW()
    FROM cte
    WHERE q.id = cte.id
    RETURNING q.id, q.event_id;
  `;

  try {
    const result = await query<QueueItem>(claimQuery, [env.BATCH_SIZE]);
    
    logger.debug({
      claimed: result.rows.length,
      batchSize: env.BATCH_SIZE,
    }, 'Claimed queue batch');
    
    return result.rows;
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
  const placeholders = eventIds.map((_, i) => `$${i + 1}`).join(', ');
  
  const loadQuery = `
    SELECT 
      id,
      event_type,
      payload,
      player_id,
      match_id,
      season_id,
      league_id,
      game_year,
      occurred_at
    FROM public.events
    WHERE id IN (${placeholders})
    ORDER BY id;
  `;

  try {
    const result = await query<EventData>(loadQuery, eventIds);
    
    logger.debug({
      requested: eventIds.length,
      found: result.rows.length,
    }, 'Loaded events');
    
    return result.rows;
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
  const placeholders = queueIds.map((_, i) => `$${i + 1}`).join(', ');
  
  const updateQuery = `
    UPDATE public.event_queue
    SET status = 'done', updated_at = NOW()
    WHERE id IN (${placeholders});
  `;

  try {
    const result = await query(updateQuery, queueIds);
    
    logger.debug({
      queueIds,
      updated: result.rowCount,
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
  
  await tx(async (client) => {
    // Get current attempts
    const getAttemptsQuery = `
      SELECT attempts FROM public.event_queue WHERE id = $1;
    `;
    
    const attemptsResult = await client.query(getAttemptsQuery, [queueId]);
    
    if (attemptsResult.rows.length === 0) {
      throw new Error(`Queue item ${queueId} not found`);
    }
    
    const currentAttempts = attemptsResult.rows[0]?.attempts ?? 0;
    const newAttempts = currentAttempts + 1;
    
    if (newAttempts >= env.MAX_ATTEMPTS) {
      // Mark as error
      const errorQuery = `
        UPDATE public.event_queue
        SET 
          status = 'error',
          attempts = $2,
          last_error = $3,
          updated_at = NOW()
        WHERE id = $1;
      `;
      
      await client.query(errorQuery, [queueId, newAttempts, errorMessage]);
      
      logger.warn({
        queueId,
        attempts: newAttempts,
        maxAttempts: env.MAX_ATTEMPTS,
        error: errorMessage,
      }, 'Queue item marked as error after max attempts');
    } else {
      // Schedule retry with exponential backoff
      const backoffMinutes = Math.pow(2, Math.min(newAttempts, 7));
      
      const retryQuery = `
        UPDATE public.event_queue
        SET 
          status = 'queued',
          attempts = $2,
          last_error = $3,
          visible_at = NOW() + INTERVAL '${backoffMinutes} minutes',
          updated_at = NOW()
        WHERE id = $1;
      `;
      
      await client.query(retryQuery, [queueId, newAttempts, errorMessage]);
      
      logger.warn({
        queueId,
        attempts: newAttempts,
        backoffMinutes,
        error: errorMessage,
      }, 'Queue item scheduled for retry');
    }
  });
}

export async function getQueueLag(): Promise<number> {
  const lagQuery = `
    SELECT COUNT(*) as count
    FROM public.event_queue
    WHERE status = 'queued' AND visible_at <= NOW();
  `;

  try {
    const result = await query<{ count: string }>(lagQuery);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  } catch (error) {
    getLogger().error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to get queue lag');
    return 0;
  }
}
