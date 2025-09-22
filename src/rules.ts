import { getSupabaseClient, query } from './db.js';
import { getLogger } from './logger.js';
import { get, isNumber, isBoolean, isArray, isObject } from './util.js';

export interface AchievementRule {
  id: string;
  title: string;
  description: string;
  predicate: Record<string, unknown>;
  scope: 'per_game' | 'season' | 'career';
  tier: string;
  game_year?: string;
  league_id?: string;
  season_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluationContext {
  per_game: Record<string, unknown>;
  season: Record<string, unknown>;
  career: Record<string, unknown>;
}

export async function fetchCandidateRules(
  gameYear?: string,
  leagueId?: string,
  seasonId?: string
): Promise<AchievementRule[]> {
  const logger = getLogger();
  
  const fetchQuery = `
    SELECT 
      id, title, description, predicate, scope, tier,
      game_year, league_id, season_id, is_active,
      created_at, updated_at
    FROM public.achievement_rules
    WHERE is_active = true
      AND scope IN ('per_game', 'season', 'career')
      AND (game_year IS NULL OR game_year = $1)
      AND (league_id IS NULL OR league_id = $2)
      AND (season_id IS NULL OR season_id = $3)
    ORDER BY id;
  `;

  try {
    const result = await query<AchievementRule>(fetchQuery, [gameYear, leagueId, seasonId]);
    
    logger.debug({
      gameYear,
      leagueId,
      seasonId,
      rulesCount: result.rows.length,
    }, 'Fetched candidate achievement rules');
    
    return result.rows;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      gameYear,
      leagueId,
      seasonId,
    }, 'Failed to fetch candidate achievement rules');
    throw error;
  }
}

// JsonLogic-style predicate evaluator
export function evalPredicate(predicate: unknown, context: EvaluationContext): boolean {
  try {
    return evaluateNode(predicate, context);
  } catch (error) {
    getLogger().warn({
      error: error instanceof Error ? error.message : String(error),
      predicate,
    }, 'Failed to evaluate predicate');
    return false;
  }
}

function evaluateNode(node: unknown, context: EvaluationContext): boolean {
  if (node === true || node === false) {
    return node;
  }
  
  if (typeof node === 'string' || typeof node === 'number') {
    return !!node;
  }
  
  if (!isObject(node)) {
    return false;
  }
  
  const keys = Object.keys(node);
  if (keys.length !== 1) {
    return false;
  }
  
  const operator = keys[0]!;
  const args = node[operator];
  
  switch (operator) {
    case '>=':
      return handleComparison(args, context, (a, b) => a >= b);
    case '>':
      return handleComparison(args, context, (a, b) => a > b);
    case '<=':
      return handleComparison(args, context, (a, b) => a <= b);
    case '<':
      return handleComparison(args, context, (a, b) => a < b);
    case '==':
      return handleEquality(args, context, (a, b) => a === b);
    case '!=':
      return handleEquality(args, context, (a, b) => a !== b);
    case 'and':
      return handleLogical(args, context, 'and');
    case 'or':
      return handleLogical(args, context, 'or');
    case 'not':
      return handleNot(args, context);
    case '+':
      return handleArithmetic(args, context, (a, b) => a + b) !== 0;
    case '-':
      return handleArithmetic(args, context, (a, b) => a - b) !== 0;
    case '*':
      return handleArithmetic(args, context, (a, b) => a * b) !== 0;
    case '/':
      return handleArithmetic(args, context, (a, b) => b !== 0 ? a / b : 0) !== 0;
    case 'has':
      return handleHas(args, context);
    default:
      return false;
  }
}

function handleComparison(
  args: unknown,
  context: EvaluationContext,
  compareFn: (a: number, b: number) => boolean
): boolean {
  if (!isArray(args) || args.length !== 2) {
    return false;
  }
  
  const left = resolveValue(args[0], context);
  const right = resolveValue(args[1], context);
  
  if (!isNumber(left) || !isNumber(right)) {
    return false;
  }
  
  return compareFn(left, right);
}

function handleEquality(
  args: unknown,
  context: EvaluationContext,
  compareFn: (a: unknown, b: unknown) => boolean
): boolean {
  if (!isArray(args) || args.length !== 2) {
    return false;
  }
  
  const left = resolveValue(args[0], context);
  const right = resolveValue(args[1], context);
  
  return compareFn(left, right);
}

function handleLogical(
  args: unknown,
  context: EvaluationContext,
  operator: 'and' | 'or'
): boolean {
  if (!isArray(args)) {
    return false;
  }
  
  if (operator === 'and') {
    return args.every(arg => evaluateNode(arg, context));
  } else {
    return args.some(arg => evaluateNode(arg, context));
  }
}

function handleNot(args: unknown, context: EvaluationContext): boolean {
  if (!isArray(args) || args.length !== 1) {
    return false;
  }
  
  return !evaluateNode(args[0], context);
}

function handleArithmetic(
  args: unknown,
  context: EvaluationContext,
  operatorFn: (a: number, b: number) => number
): number {
  if (!isArray(args) || args.length !== 2) {
    return 0;
  }
  
  const left = resolveValue(args[0], context);
  const right = resolveValue(args[1], context);
  
  if (!isNumber(left) || !isNumber(right)) {
    return 0;
  }
  
  return operatorFn(left, right);
}

function handleHas(args: unknown, context: EvaluationContext): boolean {
  if (!isArray(args) || args.length !== 2) {
    return false;
  }
  
  const obj = resolveValue(args[0], context);
  const key = resolveValue(args[1], context);
  
  if (!isObject(obj) || typeof key !== 'string') {
    return false;
  }
  
  return key in obj;
}

function resolveValue(value: unknown, context: EvaluationContext): unknown {
  if (typeof value === 'string' && value.includes('.')) {
    // Path reference like "per_game.points" or "season.pts_total"
    return get(context, value);
  }
  
  if (isObject(value)) {
    // Nested expression - evaluate it first
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const operator = keys[0]!;
      const args = value[operator];
      
      // For arithmetic operations, return the numeric result
      if (['+', '-', '*', '/'].includes(operator)) {
        return handleArithmetic(args, context, getArithmeticOperator(operator));
      }
    }
    
    return evaluateNode(value, context);
  }
  
  return value;
}

function getArithmeticOperator(operator: string): (a: number, b: number) => number {
  switch (operator) {
    case '+': return (a, b) => a + b;
    case '-': return (a, b) => a - b;
    case '*': return (a, b) => a * b;
    case '/': return (a, b) => b !== 0 ? a / b : 0;
    default: return () => 0;
  }
}
