import type { ObjectiveDef } from '../gamedata/schemas.ts';

// Pure display helpers for the daily-objectives panel: resolve an objective's goal amount, its
// human-readable description (the catalog `description` template with {0} filled in), its
// reward, and the escalation-level scaling of both. Also humanizes a SAVE requirement row's
// per-type progress counters. No store access, so trivially unit-testable.
//
// Escalation model (ObjectiveMgr.cs / Objective.cs): each slot carries `incLevel`, bumped when
// the slot's objective completes; the objective assigned into the slot captures it as
// `incrementLevel`. That level scales the goal (+m_requirementIncreasePerLevel per level, capped
// at m_requirementMaxValue) and the reward (+m_rewardIncrement per level).

/** EReward (from enums.json), indexed by `m_baseRewardType`. */
export const REWARD_LABEL: Record<number, string> = {
  0: '瓶盖',
  1: '午餐盒',
  2: '巧手先生',
  3: '宠物箱',
  4: '量子核子可乐',
};

// Requirement keys that are NOT the goal amount (bookkeeping / per-level scaling), excluded when
// scanning for the objective's base goal below.
const NON_GOAL_KEYS = new Set([
  'm_requirementIncreasePerLevel',
  'm_requirementMaxValue',
  'm_permanentTrigger',
]);

/**
 * The objective's base (level-0) goal amount, e.g. 200 for "Collect 200 Food". Objectives have
 * exactly one requirement; the goal lives under a per-type key: `m_baseGoalResources` (a resource
 * map - take its largest non-zero entry), any other `m_base*` numeric, or `m_numberItemsToCollect`.
 * Returns null when no goal amount is present (a few purely descriptive objectives).
 */
export function objectiveGoal(def: ObjectiveDef): number | null {
  const req = def.requirements?.[0];
  if (!req) return null;
  const resources = req.m_baseGoalResources;
  if (resources) {
    const values = Object.values(resources).filter((n) => n > 0);
    if (values.length > 0) return Math.max(...values);
  }
  const record = req as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (NON_GOAL_KEYS.has(key)) continue;
    if (key.startsWith('m_base') && typeof value === 'number' && value > 0) return value;
  }
  // Non-m_base goal keys: m_numberItemsToCollect, m_numRequiredDays.
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('m_num') && typeof value === 'number' && value > 0) return value;
  }
  return null;
}

/** A goal-candidate key (excluded when checking a text number against non-goal parameters). */
const isGoalKey = (key: string): boolean => key.startsWith('m_base') || key.startsWith('m_num');

/**
 * Swap a template's hardcoded goal number for the true goal. Most catalog templates bake a
 * literal into the text instead of a `{0}` placeholder - "Level up 1 Dweller" is the description
 * of objectives whose real base goal is 4 or 15 - so the first standalone integer is replaced
 * with the resolved goal. Guard: a number > 1 that equals a NON-goal numeric parameter of the
 * requirement is left alone (the 2 in "Merge 2 rooms together" is `m_mergeLevel`, the merge
 * size, not the goal count).
 */
function replaceLiteralGoal(template: string, goal: number, def: ObjectiveDef): string {
  const match = /\d+/.exec(template);
  if (!match) return template;
  const literal = Number(match[0]);
  if (literal !== 1) {
    const req = (def.requirements?.[0] ?? {}) as Record<string, unknown>;
    const collides = Object.entries(req).some(
      ([key, value]) => !isGoalKey(key) && value === literal,
    );
    if (collides) return template;
  }
  return (
    template.slice(0, match.index) + String(goal) + template.slice(match.index + match[0].length)
  );
}

/** The per-escalation-level scaling knobs, for scaled values and explanatory copy. */
export function objectiveScaling(def: ObjectiveDef): {
  goalPerLevel: number;
  goalCap: number | null;
  rewardPerLevel: number;
} {
  const req = def.requirements?.[0];
  const cap = req?.m_requirementMaxValue;
  return {
    goalPerLevel: req?.m_requirementIncreasePerLevel ?? 0,
    goalCap: cap != null && cap > 0 ? cap : null,
    rewardPerLevel: def.m_rewardIncrement ?? 0,
  };
}

/** The goal amount at escalation `level`: base + per-level increase, capped at the catalog max. */
export function scaledObjectiveGoal(def: ObjectiveDef, level: number): number | null {
  const base = objectiveGoal(def);
  if (base == null) return null;
  const { goalPerLevel, goalCap } = objectiveScaling(def);
  const scaled = base + goalPerLevel * Math.max(0, level);
  return goalCap != null ? Math.min(scaled, goalCap) : scaled;
}

/**
 * The objective's description with its TRUE goal stated (e.g. "Collect 200 Food"), scaled to
 * escalation `level` (0 = the catalog base). Templates with a `{0}` placeholder get it
 * substituted; the majority hardcode a stale number instead, which is swapped for the resolved
 * goal (see {@link replaceLiteralGoal}) so the text never contradicts the Goal readout. Any
 * remaining placeholders (rare multi-parameter descriptions whose extra params are runtime
 * state) are stripped so no raw `{1}` leaks into the UI. Falls back to the objective id.
 */
export function formatObjectiveDescription(def: ObjectiveDef, level = 0): string {
  const template = def.description ?? def.m_objectiveID;
  const goal = scaledObjectiveGoal(def, level);
  let withGoal = template;
  if (goal != null) {
    if (template.includes('{0}')) withGoal = template.replaceAll('{0}', String(goal));
    // Only rewrite real descriptions - the id fallback ("Food1") is not prose.
    else if (def.description != null) withGoal = replaceLiteralGoal(template, goal, def);
  }
  return withGoal.replace(/\s*\{\d+\}/g, '').trim();
}

/** "50 Caps", "1 Lunchbox", ... - the reward at escalation `level` (0 = the catalog base). */
export function objectiveRewardLabel(def: ObjectiveDef, level = 0): string {
  const amount =
    (def.m_baseRewardAmount ?? 0) + objectiveScaling(def).rewardPerLevel * Math.max(0, level);
  const label = REWARD_LABEL[def.m_baseRewardType ?? 0] ?? '奖励';
  return `${amount} ${label}`;
}

/** The objective's difficulty tier (`m_level`, 1..5), or null when unknown. */
export function objectiveLevel(def: ObjectiveDef): number | null {
  return def.m_level ?? null;
}

/** One humanized per-save progress counter from a requirement row, e.g. "Rush count: 3". */
export interface RequirementProgressEntry {
  /** The raw save-row key (`rushCount`), for writing the counter back. */
  key: string;
  label: string;
  value: string;
  /** The counter's numeric value when it is editable; null for boolean flags. */
  numeric: number | null;
}

// Save requirement-row keys that are identity/status, not progress counters.
const NON_PROGRESS_KEYS = new Set(['requirementID', 'satisfied']);

// 常见进度键的中文标签；未收录的键按 camelCase 拆分回退显示。
const PROGRESS_KEY_LABELS: Record<string, string> = {
  numSpinsMade: '已抽奖次数',
  currentBabies: '当前婴儿数',
  rushCount: '加速次数',
  numDwellers: '居民数',
  numDeaths: '死亡数',
  numCollected: '已收集数',
  numFood: '已收集食物',
  numWater: '已收集水',
  numPower: '已收集电力',
  numStimpack: '已收集治疗针',
  numRadaway: '已收集消辐宁',
  numCaps: '已收集瓶盖',
  numJunk: '已收集垃圾',
  numWeapons: '武器数',
  numOutfits: '服装数',
  numPets: '宠物数',
  numCraftedWeapons: '已制作武器数',
  numCraftedOutfits: '已制作服装数',
  numIncidentsResolved: '已处理事故数',
  numBattlesWon: '已赢战斗数',
  numCriticalHits: '暴击次数',
  numFriends: '朋友数',
  numLocations: '已探索地点数',
  lastBreedGender: '上次出生性别',
};

// 进度键 → 显示标签：映射表优先，未收录的键按 camelCase 拆词回退。
function humanizeProgressKey(key: string): string {
  if (PROGRESS_KEY_LABELS[key]) return PROGRESS_KEY_LABELS[key];
  const stripped = key.replace(/^(current|num|last)(?=[A-Z])/, '');
  return stripped.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * The humanized progress counters of one SAVE requirement row (`objective.requirements[i]`).
 * The counter keys vary by objective type (`rushCount`, `currentBabies`, `numSpinsMade`, ...);
 * scalar values become labeled entries, non-scalars (id lists like `lastWeapons`) are skipped.
 */
export function requirementProgressEntries(
  row: Record<string, unknown>,
): RequirementProgressEntry[] {
  const out: RequirementProgressEntry[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (NON_PROGRESS_KEYS.has(key)) continue;
    if (typeof value === 'number')
      out.push({ key, label: humanizeProgressKey(key), value: String(value), numeric: value });
    else if (typeof value === 'boolean')
      out.push({
        key,
        label: humanizeProgressKey(key),
        value: value ? '是' : '否',
        numeric: null,
      });
  }
  return out;
}

/**
 * Which game mode(s) the objective appears in ("Normal" / "Survival" / "Both"). Every catalog
 * entry sets at least one flag; "Both" keeps the filter list to three clean values.
 */
export function objectiveModeLabel(def: ObjectiveDef): string {
  const normal = def.m_isNormalMode === 1;
  const survival = def.m_isSurvivalMode === 1;
  if (normal && survival) return '两者';
  if (survival) return '生存模式';
  return '普通模式';
}
