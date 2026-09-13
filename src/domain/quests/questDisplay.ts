import type { GameData } from '../gamedata/gameData.ts';
import type { Quest, QuestDate, QuestRequirement } from '../gamedata/schemas.ts';
import type { ItemIconType } from '../gamedata/visualSchemas.ts';
import { isSeasonOpen } from './questFilter.ts';
import type { QuestMapRegion } from './questGraphLayout.ts';
import { planQuestLoot, type GrantLine } from './questLoot.ts';

// Pure display helpers for the Quest tab: enum labels, requirement humanization, and the
// reward-chip model the detail panel + graph nodes render. No React, no I/O - unit-testable.

/** EQuestType (m_questType) -> label. */
const QUEST_TYPE_LABEL: Record<number, string> = {
  0: '任务线',
  1: '标准',
  2: '线索',
  3: '每日',
  4: '每周',
  5: '活动',
  6: '惊喜',
};

/** EQuestScheme (m_questScheme) -> label; DefaultToType(0) has no badge. */
const QUEST_SCHEME_LABEL: Record<number, string> = {
  1: '感恩节',
  2: '万圣节',
  3: '圣诞节',
  4: '电视节目',
  5: '赛季',
};

/** EQuestEnvironment (m_questEnvironment) -> label. First(0)/Count(17) never appear on a quest. */
const QUEST_ENVIRONMENT_LABEL: Record<number, string> = {
  0: '初始',
  1: '历史遗迹',
  2: '工业',
  3: '避难所',
  4: '红火箭',
  5: '废弃房屋',
  6: '集市',
  7: '洞穴',
  8: 'RobCo',
  9: '码头',
  10: '陵墓',
  11: '菲利',
  12: '天文台',
  13: '钢铁兄弟会',
  14: '诺瓦克',
  15: '新维加斯大道',
  16: 'CIT',
};

/** QuestMapRegion -> label; the map's own section names, so the panel names a quest's home the
 * same way the map's heading and the Region facet do. */
const QUEST_REGION_LABEL: Record<QuestMapRegion, string> = {
  chain: '剧情任务线',
  standalone: '独立任务',
  repeatable: '可重复 / 每日',
};

/**
 * The Season Pass season a quest BELONGS to ("NewVegasA"), or null for the other 976 quests.
 *
 * This is the answer to "scheme says Season - which season?". EQuestScheme only records THAT a
 * quest is season content; the season itself is named by the sole m_validity=2 entry in
 * m_validityForExVaultBySeasonList (see questSeasonValiditySchema for why validity 2 is the
 * belongs-to marker rather than the far commoner validity 1).
 *
 * Returns the raw id: the id is data, and turning it into "New Vegas A" is the UI's seasonLabel.
 */
export function questSeasonId(quest: Quest): string | null {
  const owned = (quest.m_validityForExVaultBySeasonList ?? []).find((v) => v.m_validity === 2);
  return owned?.m_seasonID ?? null;
}

export const questTypeLabel = (type: number): string => QUEST_TYPE_LABEL[type] ?? `类型 ${type}`;
export const questSchemeLabel = (scheme: number | undefined): string | null =>
  scheme === undefined ? null : (QUEST_SCHEME_LABEL[scheme] ?? null);
export const questEnvironmentLabel = (env: number): string =>
  QUEST_ENVIRONMENT_LABEL[env] ?? `环境 ${env}`;
export const questRegionLabel = (region: QuestMapRegion): string => QUEST_REGION_LABEL[region];

/**
 * Scheme label where a value is always required (a detail row, a filter option).
 *
 * questSchemeLabel is nullable because a BADGE for DefaultToType(0) would be noise, but a row
 * reading "Scheme: -" is worse than one reading "Scheme: Default", and a missing field means the
 * same thing as 0. Unknown ids fall back to their number rather than silently reading "Default",
 * which would misreport a scheme the catalog gained after this table was written.
 */
export const questSchemeName = (scheme: number | undefined): string =>
  scheme === undefined || scheme === 0 ? '默认' : (QUEST_SCHEME_LABEL[scheme] ?? `方案 ${scheme}`);

// --- availability window ----------------------------------------------------------------

const MONTH_ABBR = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];

/** "Oct 12" - the whole day is the unit, because isSeasonOpen compares whole days. */
const monthDayText = (d: QuestDate): string =>
  `${MONTH_ABBR[d.m_month - 1] ?? `${d.m_month} 月`}${d.m_day}日`;

/**
 * A quest's availability window, ready to render.
 *
 * `always` is not "unknown" or "missing" - it is the correct answer for 992 of the catalog's 1040
 * quests. They clear m_isTimeLimited and carry a 1970/01/01..2100/01/01 SENTINEL meaning "no window
 * at all". It is deliberately NOT formatted as a date range: printing the sentinel would invite the
 * reader to treat a 130-year span as a real deadline, when the truth is there is no deadline.
 *
 * A seasonal window is month/day ONLY. THE AUTHORED YEARS ARE DELIBERATELY DROPPED, not merely
 * unformatted: the game compares month/day and ignores the years (see isSeasonOpen), so every
 * window in the catalog is authored in 2016-2018 yet still comes round every year. Printing the
 * year would assert an expiry the game does not enforce, and would contradict the annual
 * recurrence in the same breath - the Irish line's authored end year of 2999 shows how little the
 * years mean.
 */
export type QuestSeason =
  | { kind: 'always' }
  | {
      kind: 'seasonal';
      /** "Oct 12 – Nov 1" - the window as it recurs each year, which is what `open` tests. */
      recurring: string;
      /** Is the window open today? */
      open: boolean;
      /** True when the window runs through the new year ("Dec 14 – Jan 2"), which reads backwards. */
      wraps: boolean;
    };

/**
 * Resolve a quest's window. `now` decides `open` and is injectable so tests can pin a date.
 *
 * The guards mirror isSeasonOpen's exactly (not time-limited, or either endpoint missing, means
 * always open), so the panel can never disagree with the season check the quest log runs.
 */
export function questSeason(quest: Quest, now: Date = new Date()): QuestSeason {
  const start = quest.m_startDate;
  const end = quest.m_endDate;
  if (quest.m_isTimeLimited !== 1 || !start || !end) return { kind: 'always' };
  return {
    kind: 'seasonal',
    recurring: `${monthDayText(start)} – ${monthDayText(end)}`,
    open: isSeasonOpen(quest, now),
    wraps: start.m_month * 100 + start.m_day > end.m_month * 100 + end.m_day,
  };
}

/** EQuestRequirementType (m_questRequirementType) -> a "≥ N" stat/level label, or null for id-based. */
const REQUIREMENT_STAT: Record<number, string> = {
  3: '队伍人数',
  4: '居民等级',
  5: '力量',
  6: '感知',
  7: '耐力',
  8: '魅力',
  9: '智力',
  10: '敏捷',
  11: '幸运',
  12: '武器最小伤害',
};

/** Humanize one entry requirement (e.g. "Dweller level ≥ 20", "Requires weapon: LaserRifle"). */
export function formatRequirement(req: QuestRequirement): string {
  const type = req.m_questRequirementType;
  const qty = req.m_questRequirementQuantity ?? 0;
  const id = req.m_questRequirementID ?? '';
  if (type === 1) return id ? `需要武器：${id}` : '需要武器';
  if (type === 2) return id ? `需要服装：${id}` : '需要服装';
  const stat = REQUIREMENT_STAT[type];
  if (stat) return `${stat} ≥ ${qty}`;
  return id ? `${id} ≥ ${qty}` : `要求 ${type}`;
}

/** Friendly labels for the currency/consumable grant lines (which have no item sprite). */
const RESOURCE_LABEL: Record<string, string> = {
  Nuka: '瓶盖',
  NukaColaQuantum: '量子核子可乐',
  StimPack: '治疗针',
  RadAway: '消辐宁',
  PokerChip: '扑克筹码',
};
const CONSUMABLE_LABEL: Record<number, string> = {
  0: '午餐盒',
  1: '巧手先生',
  2: '宠物箱',
};

/** The item-catalog icon a grant line maps to (null for currency / mystery lines). */
const ITEM_ICON_TYPE: Record<string, ItemIconType> = {
  Weapon: 'weapons',
  Outfit: 'outfits',
  Junk: 'junk',
};

/** A renderable reward line: a label + amount, an optional item sprite, and a display tone. */
export interface RewardChip {
  label: string;
  qty: number;
  /** ItemIcon reference when the reward has catalog art (items + pets); null for currency/mystery. */
  icon: { type: ItemIconType; id: string } | null;
  /** `special` = a named character or vault-helper robot (no item art exists for either). */
  tone: 'currency' | 'item' | 'pet' | 'special' | 'mystery';
  /** True for an item/pet drawn from a Random* loot type (surfaces "rolled" in the UI). */
  rolled: boolean;
}

/** Map one resolved grant line to its reward chip. */
export function grantLineChip(line: GrantLine): RewardChip {
  switch (line.kind) {
    case 'resource':
      return {
        label: RESOURCE_LABEL[line.key] ?? line.key,
        qty: line.qty,
        icon: null,
        tone: 'currency',
        rolled: false,
      };
    case 'consumable':
      return {
        label: CONSUMABLE_LABEL[line.code] ?? line.label,
        qty: line.qty,
        icon: null,
        tone: 'currency',
        rolled: false,
      };
    case 'item':
      return {
        label: line.label,
        qty: line.qty,
        icon: { type: ITEM_ICON_TYPE[line.itemType], id: line.id },
        tone: 'item',
        rolled: line.rolled,
      };
    case 'pet':
      return {
        label: line.label,
        qty: 1,
        icon: { type: 'pets', id: line.pet.petId },
        tone: 'pet',
        rolled: line.rolled,
      };
    case 'recipe':
      return {
        label: line.label,
        qty: line.ids.length,
        icon: null,
        tone: 'item',
        rolled: line.rolled,
      };
    case 'clue':
      // The chip names the reward, not the clue: `questName` is a raw quest id, and the game
      // treats which clue you get as the surprise.
      return { label: '任务线索', qty: 1, icon: null, tone: 'item', rolled: line.rolled };
    case 'dweller':
      return { label: line.label, qty: 1, icon: null, tone: 'special', rolled: line.rolled };
    case 'mrHandy':
      return { label: line.label, qty: 1, icon: null, tone: 'special', rolled: false };
    case 'recipePart':
      return { label: line.label, qty: line.qty, icon: null, tone: 'item', rolled: line.rolled };
    case 'random':
    case 'unsupported':
      return { label: line.label, qty: line.qty, icon: null, tone: 'mystery', rolled: false };
  }
}

/**
 * The deterministic reward preview for a quest (Random* loot shown as "?" descriptors, not rolled)
 * as renderable chips. Used by the detail panel's Rewards row and the node summary.
 */
export function questRewardChips(quest: Quest, gameData: GameData): RewardChip[] {
  return planQuestLoot(quest, gameData).map(grantLineChip);
}
