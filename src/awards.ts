import { query } from './db.js';
import { getLogger } from './logger.js';
import { canonicalJson } from './util.js';
import { AchievementRule } from './rules.js';

export interface PlayerAward {
  id: string;
  rule_id: string;
  player_id: string;
  scope_key?: string | undefined;
  level: number;
  title: string;
  tier: string;
  game_year?: string | undefined;
  league_id?: string | undefined;
  season_id?: string | undefined;
  match_id?: string | undefined;
  awarded_at: string;
  stats: Record<string, unknown>;
  issuer: string;
  version: string;
  asset_svg_url?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface AwardInsertData {
  rule_id: string;
  player_id: string;
  scope_key?: string | undefined;
  level: number;
  title: string;
  tier: string;
  game_year?: string | undefined;
  league_id?: string | undefined;
  season_id?: string | undefined;
  match_id?: string | undefined;
  stats: Record<string, unknown>;
}

export async function insertAward(data: AwardInsertData): Promise<string | null> {
  const logger = getLogger();
  
  const insertQuery = `
    INSERT INTO public.player_awards (
      rule_id, player_id, scope_key, level,
      title, tier, game_year, league_id, season_id, match_id,
      awarded_at, stats, issuer, version
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10,
      NOW(), $11, 'BodegaCatsGC', '1.0'
    )
    ON CONFLICT (player_id, rule_id, scope_key, level) DO NOTHING
    RETURNING id;
  `;

  const statsJson = canonicalJson(data.stats);
  
  const params = [
    data.rule_id,
    data.player_id,
    data.scope_key,
    data.level,
    data.title,
    data.tier,
    data.game_year,
    data.league_id,
    data.season_id,
    data.match_id,
    statsJson,
  ];

  try {
    const result = await query<{ id: string }>(insertQuery, params);
    
    const awardId = result.rows[0]?.id ?? null;
    
    if (awardId) {
      logger.info({
        awardId,
        playerId: data.player_id,
        ruleId: data.rule_id,
        title: data.title,
        tier: data.tier,
        scope_key: data.scope_key,
        level: data.level,
      }, 'New player award created');
    } else {
      logger.debug({
        playerId: data.player_id,
        ruleId: data.rule_id,
        title: data.title,
        scope_key: data.scope_key,
        level: data.level,
      }, 'Player award already exists (conflict ignored)');
    }
    
    return awardId;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      data,
    }, 'Failed to insert player award');
    throw error;
  }
}

export async function attachAssetUrl(awardId: string, assetUrl: string): Promise<void> {
  const logger = getLogger();
  
  const updateQuery = `
    UPDATE public.player_awards
    SET asset_svg_url = $2, updated_at = NOW()
    WHERE id = $1;
  `;

  try {
    const result = await query(updateQuery, [awardId, assetUrl]);
    
    if (result.rowCount === 0) {
      throw new Error(`Award ${awardId} not found`);
    }
    
    logger.debug({
      awardId,
      assetUrl,
    }, 'Attached asset URL to award');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      awardId,
      assetUrl,
    }, 'Failed to attach asset URL to award');
    throw error;
  }
}

export function determineScopeKey(
  rule: AchievementRule,
  matchId?: string,
  seasonId?: string
): string | undefined {
  switch (rule.scope) {
    case 'per_game':
      return matchId;
    case 'season':
      return seasonId;
    case 'career':
      return undefined;
    default:
      return undefined;
  }
}

export function determineLevel(rule: AchievementRule): number {
  // For now, all awards are level 1
  // Future: Parse rule template or tier to determine levels
  return 1;
}

export async function fetchPlayerAward(
  playerId: number,
  ruleId: number,
  scopeKey?: string,
  level: number = 1
): Promise<PlayerAward | null> {
  const logger = getLogger();
  
  const fetchQuery = `
    SELECT 
      id, rule_id, player_id, scope_key, level,
      title, tier, game_year, league_id, season_id, match_id,
      awarded_at, stats, issuer, version, asset_svg_url,
      created_at, updated_at
    FROM public.player_awards
    WHERE player_id = $1 
      AND rule_id = $2 
      AND (scope_key IS NULL AND $3 IS NULL OR scope_key = $3)
      AND level = $4;
  `;

  try {
    const result = await query<PlayerAward>(fetchQuery, [playerId, ruleId, scopeKey, level]);
    
    const award = result.rows[0] ?? null;
    
    logger.debug({
      playerId,
      ruleId,
      scopeKey,
      level,
      found: !!award,
    }, 'Fetched player award');
    
    return award;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      playerId,
      ruleId,
      scopeKey,
      level,
    }, 'Failed to fetch player award');
    throw error;
  }
}
