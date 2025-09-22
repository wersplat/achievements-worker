import fastify from 'fastify';
import { loadEnv, getEnv } from './env.js';
import { createLogger, getLogger } from './logger.js';
import { createSupabaseClient, closeSupabaseClient } from './db.js';
import { createS3Client } from './svg.js';
import { claimBatch, loadEvents, markDone, markRetry, getQueueLag, EventData } from './queue.js';
import { updateCareerCounters, updateSeasonCounters, fetchPlayerCounters, PerGameStats } from './counters.js';
import { fetchCandidateRules, evalPredicate, EvaluationContext } from './rules.js';
import { insertAward, attachAssetUrl, determineScopeKey, determineLevel, AwardInsertData } from './awards.js';
import { generateAndUploadBadge, getTierTemplate } from './svg.js';
import { sleep, nowIso } from './util.js';

// Global state
let isShuttingDown = false;
let processingLoop: Promise<void> | null = null;

async function main(): Promise<void> {
  try {
    // Load environment and initialize services
    loadEnv();
    const env = getEnv();
    const logger = createLogger();
    
    logger.info({
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      batchSize: env.BATCH_SIZE,
      pollInterval: env.POLL_INTERVAL_MS,
      maxAttempts: env.MAX_ATTEMPTS,
    }, 'Starting achievements worker');
    
    // Initialize database and S3 client
    createSupabaseClient();
    createS3Client();
    
    // Create Fastify server for health checks
    const server = fastify({
      logger: false, // Use our own logger
    });
    
    // Health check endpoint
    server.get('/healthz', async (request, reply) => {
      try {
        const queueLag = await getQueueLag();
        
        return {
          status: 'ok',
          queueLag,
          time: nowIso(),
        };
      } catch (error) {
        reply.code(503);
        return {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          time: nowIso(),
        };
      }
    });
    
    // Start HTTP server
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT }, 'Health check server started');
    
    // Set up graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');
      isShuttingDown = true;
      
      try {
        // Stop accepting new HTTP connections
        await server.close();
        logger.info('HTTP server closed');
        
        // Wait for processing loop to finish
        if (processingLoop) {
          await processingLoop;
          logger.info('Processing loop stopped');
        }
        
        // Close database connections
        await closeSupabaseClient();
        logger.info('Database connections closed');
        
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error during shutdown');
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Start main processing loop
    processingLoop = startProcessingLoop();
    await processingLoop;
    
  } catch (error) {
    // Fallback to console if logger not initialized
    console.error('Failed to start worker:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function startProcessingLoop(): Promise<void> {
  const env = getEnv();
  const logger = getLogger();
  
  logger.info('Starting event processing loop');
  
  while (!isShuttingDown) {
    try {
      // Claim a batch of events
      const queueItems = await claimBatch();
      
      if (queueItems.length === 0) {
        // No work available, sleep and continue
        await sleep(env.POLL_INTERVAL_MS);
        continue;
      }
      
      logger.debug({ batchSize: queueItems.length }, 'Processing batch');
      
      // Load event data
      const eventIds = queueItems.map(item => item.event_id);
      const events = await loadEvents(eventIds);
      
      // Process each event
      const processedQueueIds: number[] = [];
      
      for (let i = 0; i < queueItems.length; i++) {
        const queueItem = queueItems[i]!;
        const event = events.find(e => e.id === queueItem.event_id);
        
        if (!event) {
          logger.warn({ queueId: queueItem.id, eventId: queueItem.event_id }, 'Event not found');
          await markRetry(queueItem.id, `Event ${queueItem.event_id} not found`);
          continue;
        }
        
        try {
          await processEvent(event);
          processedQueueIds.push(queueItem.id);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error({
            queueId: queueItem.id,
            eventId: event.id,
            error: errorMessage,
          }, 'Failed to process event');
          
          await markRetry(queueItem.id, errorMessage);
        }
      }
      
      // Mark successfully processed items as done
      if (processedQueueIds.length > 0) {
        await markDone(processedQueueIds);
        logger.debug({ count: processedQueueIds.length }, 'Marked events as done');
      }
      
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
      }, 'Error in processing loop');
      
      // Sleep before retrying to avoid tight error loops
      await sleep(Math.min(env.POLL_INTERVAL_MS * 5, 30000));
    }
  }
  
  logger.info('Processing loop stopped');
}

async function processEvent(event: EventData): Promise<void> {
  const logger = getLogger();
  
  logger.debug({
    eventId: event.id,
    eventType: event.event_type,
    playerId: event.player_id,
    matchId: event.match_id,
    seasonId: event.season_id,
  }, 'Processing event');
  
  if (event.event_type === 'player_stat_event') {
    await processPlayerStatEvent(event);
  } else if (event.event_type === 'match_event') {
    // No-op for now (future: team awards)
    logger.debug({ eventId: event.id }, 'Skipping match_event (not implemented)');
  } else {
    logger.warn({ eventId: event.id, eventType: event.event_type }, 'Unknown event type');
  }
}

async function processPlayerStatEvent(event: EventData): Promise<void> {
  const logger = getLogger();
  
  if (!event.player_id) {
    throw new Error('player_stat_event missing player_id');
  }
  
  // Extract per-game stats from payload
  const perGameStats = extractPerGameStats(event.payload);
  
  logger.debug({
    eventId: event.id,
    playerId: event.player_id,
    perGameStats,
  }, 'Extracted per-game stats');
  
  // Update counters
  await updateCareerCounters(event.player_id, perGameStats);
  
  if (event.season_id) {
    await updateSeasonCounters(event.player_id, event.season_id, perGameStats);
  }
  
  // Fetch updated counters
  const counters = await fetchPlayerCounters(event.player_id, event.season_id);
  
  // Build evaluation context
  const context: EvaluationContext = {
    per_game: perGameStats,
    season: counters.season || {},
    career: counters.career || {},
  };
  
  logger.debug({
    eventId: event.id,
    playerId: event.player_id,
    context,
  }, 'Built evaluation context');
  
  // Fetch candidate rules
  const rules = await fetchCandidateRules(
    event.game_year,
    event.league_id,
    event.season_id
  );
  
  logger.debug({
    eventId: event.id,
    rulesCount: rules.length,
  }, 'Fetched candidate rules');
  
  // Evaluate rules and create awards
  for (const rule of rules) {
    try {
      const passes = evalPredicate(rule.predicate, context);
      
      if (!passes) {
        continue;
      }
      
      logger.debug({
        eventId: event.id,
        ruleId: rule.id,
        ruleTitle: rule.title,
        rulePredicate: rule.predicate,
      }, 'Rule predicate passed');
      
      // Determine award parameters
      const scopeKey = determineScopeKey(rule, event.match_id, event.season_id);
      const level = determineLevel(rule);
      
      // Create award data
      const awardData: AwardInsertData = {
        rule_id: rule.id,
        player_id: event.player_id,
        scope_key: scopeKey,
        level,
        title: rule.title,
        tier: rule.tier,
        game_year: event.game_year,
        league_id: event.league_id,
        season_id: event.season_id,
        match_id: event.match_id,
        stats: {
          per_game: perGameStats,
          season: counters.season || {},
          career: counters.career || {},
          rule_predicate: rule.predicate,
        },
      };
      
      // Insert award (idempotent)
      const awardId = await insertAward(awardData);
      
      if (awardId) {
        // Generate and upload badge SVG
        const template = getTierTemplate(rule.tier);
        const badgeUrl = await generateAndUploadBadge({
          id: awardId,
          ...awardData,
          awarded_at: nowIso(),
        }, template);
        
        // Attach asset URL to award
        await attachAssetUrl(awardId, badgeUrl);
        
        logger.info({
          eventId: event.id,
          awardId,
          playerId: event.player_id,
          ruleTitle: rule.title,
          tier: rule.tier,
          badgeUrl,
        }, 'Created new award with badge');
      }
      
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        eventId: event.id,
        ruleId: rule.id,
        ruleTitle: rule.title,
      }, 'Failed to process rule');
      // Continue with other rules
    }
  }
}

function extractPerGameStats(payload: Record<string, unknown>): PerGameStats {
  const getNumber = (key: string, defaultValue: number = 0): number => {
    const value = payload[key];
    return typeof value === 'number' ? value : defaultValue;
  };
  
  return {
    points: getNumber('points'),
    ast: getNumber('ast'),
    reb: getNumber('reb'),
    stl: getNumber('stl'),
    blk: getNumber('blk'),
    tov: getNumber('tov'),
    minutes: getNumber('minutes'),
    fgm: getNumber('fgm'),
    fga: getNumber('fga'),
    tpm: getNumber('tpm'),
    tpa: getNumber('tpa'),
    ftm: getNumber('ftm'),
    fta: getNumber('fta'),
  };
}

// Start the application
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
