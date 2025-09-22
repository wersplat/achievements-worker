import { query } from './db.js';
import { getLogger } from './logger.js';

export interface PerGameStats extends Record<string, unknown> {
  points: number;
  ast: number;
  reb: number;
  stl: number;
  blk: number;
  tov: number;
  minutes: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
}

export interface PlayerCounters extends Record<string, unknown> {
  player_id: number;
  scope: 'career' | 'season';
  season_id?: number;
  
  // Totals
  games_played: number;
  minutes_total: number;
  pts_total: number;
  ast_total: number;
  reb_total: number;
  stl_total: number;
  blk_total: number;
  tov_total: number;
  fgm_total: number;
  fga_total: number;
  tpm_total: number;
  tpa_total: number;
  ftm_total: number;
  fta_total: number;
  
  // Flags/achievements
  has_50pt_game: boolean;
  has_triple_double: boolean;
  has_double_double: boolean;
  
  // Maximums
  max_pts_game: number;
  max_ast_game: number;
  max_reb_game: number;
  max_stl_game: number;
  max_blk_game: number;
  
  created_at: string;
  updated_at: string;
}

function detectAchievementFlags(stats: PerGameStats): {
  has_50pt_game: boolean;
  has_triple_double: boolean;
  has_double_double: boolean;
} {
  const has_50pt_game = stats.points >= 50;
  
  // Triple double: 10+ in three of these categories
  const categories = [stats.points, stats.ast, stats.reb, stats.stl, stats.blk];
  const doubleDigitCategories = categories.filter(val => val >= 10).length;
  const has_triple_double = doubleDigitCategories >= 3;
  const has_double_double = doubleDigitCategories >= 2;
  
  return { has_50pt_game, has_triple_double, has_double_double };
}

export async function updateCareerCounters(
  playerId: number,
  stats: PerGameStats
): Promise<void> {
  const logger = getLogger();
  const flags = detectAchievementFlags(stats);
  
  const mergeQuery = `
    INSERT INTO public.player_counters (
      player_id, scope, season_id,
      games_played, minutes_total, pts_total, ast_total, reb_total, stl_total, blk_total, tov_total,
      fgm_total, fga_total, tpm_total, tpa_total, ftm_total, fta_total,
      has_50pt_game, has_triple_double, has_double_double,
      max_pts_game, max_ast_game, max_reb_game, max_stl_game, max_blk_game,
      created_at, updated_at
    ) VALUES (
      $1, 'career', NULL,
      1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14,
      $15, $16, $17,
      $3, $4, $5, $6, $7,
      NOW(), NOW()
    )
    ON CONFLICT (player_id, scope, season_id) DO UPDATE SET
      games_played = player_counters.games_played + 1,
      minutes_total = player_counters.minutes_total + $2,
      pts_total = player_counters.pts_total + $3,
      ast_total = player_counters.ast_total + $4,
      reb_total = player_counters.reb_total + $5,
      stl_total = player_counters.stl_total + $6,
      blk_total = player_counters.blk_total + $7,
      tov_total = player_counters.tov_total + $8,
      fgm_total = player_counters.fgm_total + $9,
      fga_total = player_counters.fga_total + $10,
      tpm_total = player_counters.tpm_total + $11,
      tpa_total = player_counters.tpa_total + $12,
      ftm_total = player_counters.ftm_total + $13,
      fta_total = player_counters.fta_total + $14,
      has_50pt_game = player_counters.has_50pt_game OR $15,
      has_triple_double = player_counters.has_triple_double OR $16,
      has_double_double = player_counters.has_double_double OR $17,
      max_pts_game = GREATEST(player_counters.max_pts_game, $3),
      max_ast_game = GREATEST(player_counters.max_ast_game, $4),
      max_reb_game = GREATEST(player_counters.max_reb_game, $5),
      max_stl_game = GREATEST(player_counters.max_stl_game, $6),
      max_blk_game = GREATEST(player_counters.max_blk_game, $7),
      updated_at = NOW();
  `;

  const params = [
    playerId,
    stats.minutes,
    stats.points,
    stats.ast,
    stats.reb,
    stats.stl,
    stats.blk,
    stats.tov,
    stats.fgm,
    stats.fga,
    stats.tpm,
    stats.tpa,
    stats.ftm,
    stats.fta,
    flags.has_50pt_game,
    flags.has_triple_double,
    flags.has_double_double,
  ];

  try {
    await query(mergeQuery, params);
    
    logger.debug({
      playerId,
      scope: 'career',
      stats,
      flags,
    }, 'Updated career counters');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      playerId,
      scope: 'career',
      stats,
    }, 'Failed to update career counters');
    throw error;
  }
}

export async function updateSeasonCounters(
  playerId: number,
  seasonId: number,
  stats: PerGameStats
): Promise<void> {
  const logger = getLogger();
  const flags = detectAchievementFlags(stats);
  
  const mergeQuery = `
    INSERT INTO public.player_counters (
      player_id, scope, season_id,
      games_played, minutes_total, pts_total, ast_total, reb_total, stl_total, blk_total, tov_total,
      fgm_total, fga_total, tpm_total, tpa_total, ftm_total, fta_total,
      has_50pt_game, has_triple_double, has_double_double,
      max_pts_game, max_ast_game, max_reb_game, max_stl_game, max_blk_game,
      created_at, updated_at
    ) VALUES (
      $1, 'season', $2,
      1, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15,
      $16, $17, $18,
      $4, $5, $6, $7, $8,
      NOW(), NOW()
    )
    ON CONFLICT (player_id, scope, season_id) DO UPDATE SET
      games_played = player_counters.games_played + 1,
      minutes_total = player_counters.minutes_total + $3,
      pts_total = player_counters.pts_total + $4,
      ast_total = player_counters.ast_total + $5,
      reb_total = player_counters.reb_total + $6,
      stl_total = player_counters.stl_total + $7,
      blk_total = player_counters.blk_total + $8,
      tov_total = player_counters.tov_total + $9,
      fgm_total = player_counters.fgm_total + $10,
      fga_total = player_counters.fga_total + $11,
      tpm_total = player_counters.tpm_total + $12,
      tpa_total = player_counters.tpa_total + $13,
      ftm_total = player_counters.ftm_total + $14,
      fta_total = player_counters.fta_total + $15,
      has_50pt_game = player_counters.has_50pt_game OR $16,
      has_triple_double = player_counters.has_triple_double OR $17,
      has_double_double = player_counters.has_double_double OR $18,
      max_pts_game = GREATEST(player_counters.max_pts_game, $4),
      max_ast_game = GREATEST(player_counters.max_ast_game, $5),
      max_reb_game = GREATEST(player_counters.max_reb_game, $6),
      max_stl_game = GREATEST(player_counters.max_stl_game, $7),
      max_blk_game = GREATEST(player_counters.max_blk_game, $8),
      updated_at = NOW();
  `;

  const params = [
    playerId,
    seasonId,
    stats.minutes,
    stats.points,
    stats.ast,
    stats.reb,
    stats.stl,
    stats.blk,
    stats.tov,
    stats.fgm,
    stats.fga,
    stats.tpm,
    stats.tpa,
    stats.ftm,
    stats.fta,
    flags.has_50pt_game,
    flags.has_triple_double,
    flags.has_double_double,
  ];

  try {
    await query(mergeQuery, params);
    
    logger.debug({
      playerId,
      seasonId,
      scope: 'season',
      stats,
      flags,
    }, 'Updated season counters');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      playerId,
      seasonId,
      scope: 'season',
      stats,
    }, 'Failed to update season counters');
    throw error;
  }
}

export async function fetchPlayerCounters(
  playerId: number,
  seasonId?: number
): Promise<{
  career: PlayerCounters | undefined;
  season: PlayerCounters | undefined;
}> {
  const logger = getLogger();
  
  const fetchQuery = `
    SELECT 
      player_id, scope, season_id,
      games_played, minutes_total, pts_total, ast_total, reb_total, stl_total, blk_total, tov_total,
      fgm_total, fga_total, tpm_total, tpa_total, ftm_total, fta_total,
      has_50pt_game, has_triple_double, has_double_double,
      max_pts_game, max_ast_game, max_reb_game, max_stl_game, max_blk_game,
      created_at, updated_at
    FROM public.player_counters
    WHERE player_id = $1 
      AND (
        (scope = 'career' AND season_id IS NULL) 
        OR (scope = 'season' AND season_id = $2)
      );
  `;

  try {
    const result = await query<PlayerCounters>(fetchQuery, [playerId, seasonId]);
    
    const career = result.rows.find(row => row.scope === 'career');
    const season = result.rows.find(row => row.scope === 'season');
    
    logger.debug({
      playerId,
      seasonId,
      foundCareer: !!career,
      foundSeason: !!season,
    }, 'Fetched player counters');
    
    return { 
      career: career || undefined, 
      season: season || undefined 
    };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      playerId,
      seasonId,
    }, 'Failed to fetch player counters');
    throw error;
  }
}
