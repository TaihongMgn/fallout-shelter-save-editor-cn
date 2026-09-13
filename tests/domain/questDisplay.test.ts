// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Quest, QuestRequirement } from '../../src/domain/gamedata/schemas.ts';
import type { GrantLine } from '../../src/domain/quests/questLoot.ts';
import {
  formatRequirement,
  grantLineChip,
  questEnvironmentLabel,
  questRegionLabel,
  questSchemeLabel,
  questSchemeName,
  questSeason,
  questSeasonId,
  questTypeLabel,
} from '../../src/domain/quests/questDisplay.ts';

describe('questSeasonId', () => {
  const withSeasons = (list: { m_seasonID: string; m_validity: number }[]): Quest =>
    ({
      m_questName: 'Q',
      m_questType: 0,
      title: 'Q',
      m_validityForExVaultBySeasonList: list,
    }) as Quest;

  // Validity 2 is the belongs-to marker; validity 1 only means "still playable during it", and
  // 345 catalog entries are validity 1, so reading the first entry would name the wrong season.
  it('names the season a quest belongs to, ignoring merely-valid-during seasons', () => {
    expect(
      questSeasonId(
        withSeasons([
          { m_seasonID: 'Institute', m_validity: 1 },
          { m_seasonID: 'NewVegasA', m_validity: 2 },
        ]),
      ),
    ).toBe('NewVegasA');
  });

  it('returns null when no season owns the quest', () => {
    expect(questSeasonId(withSeasons([{ m_seasonID: 'Enclave', m_validity: 1 }]))).toBeNull();
    expect(questSeasonId(withSeasons([]))).toBeNull();
    expect(questSeasonId({ m_questName: 'Q', m_questType: 0, title: 'Q' } as Quest)).toBeNull();
  });
});

describe('enum labels', () => {
  it('labels quest types and schemes (Default scheme has no badge)', () => {
    expect(questTypeLabel(0)).toBe('任务线');
    expect(questTypeLabel(5)).toBe('活动');
    expect(questSchemeLabel(0)).toBeNull();
    expect(questSchemeLabel(2)).toBe('万圣节');
    expect(questSchemeLabel(undefined)).toBeNull();
  });

  it('labels environments and map regions', () => {
    expect(questEnvironmentLabel(7)).toBe('洞穴');
    expect(questRegionLabel('chain')).toBe('剧情任务线');
    expect(questRegionLabel('repeatable')).toBe('可重复 / 每日');
  });

  it('names every scheme for the detail row, defaulting only 0 and absent', () => {
    expect(questSchemeName(0)).toBe('默认');
    expect(questSchemeName(undefined)).toBe('默认');
    expect(questSchemeName(2)).toBe('万圣节');
    // An id the table has not learned yet must not masquerade as Default.
    expect(questSchemeName(9)).toBe('方案 9');
  });
});

describe('questSeason', () => {
  const quest = (
    timeLimited: number,
    start?: [number, number, number],
    end?: [number, number, number],
  ): Quest =>
    ({
      m_questName: 'Q',
      m_questType: 0,
      title: 'Q',
      m_isTimeLimited: timeLimited,
      ...(start ? { m_startDate: { m_year: start[0], m_month: start[1], m_day: start[2] } } : {}),
      ...(end ? { m_endDate: { m_year: end[0], m_month: end[1], m_day: end[2] } } : {}),
    }) as Quest;

  // The 992-quest majority: the sentinel window must never be formatted as a date range.
  it('reports the 1970..2100 sentinel as always available, not a date range', () => {
    const sentinel = quest(0, [1970, 1, 1], [2100, 1, 1]);
    expect(questSeason(sentinel, new Date('2026-07-14'))).toEqual({ kind: 'always' });
  });

  it('treats a missing endpoint as always available, mirroring isSeasonOpen', () => {
    expect(questSeason(quest(1, [2016, 10, 12]), new Date('2026-10-20')).kind).toBe('always');
  });

  // Month/day only. The authored years are dropped rather than formatted: they would claim an
  // expiry the game never enforces, contradicting the annual recurrence the window IS.
  it('formats a window as month/day, never surfacing the authored years', () => {
    const halloween = quest(1, [2016, 10, 12], [2016, 11, 1]);
    const season = questSeason(halloween, new Date('2026-10-20'));
    expect(season).toEqual({
      kind: 'seasonal',
      recurring: '10月12日 – 11月1日',
      open: true,
      wraps: false,
    });
    expect(JSON.stringify(season)).not.toContain('2016');
  });

  // The authored years are a decade stale, yet the window still governs: open in October, shut in
  // July. This is why the years are metadata rather than bounds.
  it('ignores the authored years when deciding whether the window is open', () => {
    const halloween = quest(1, [2016, 10, 12], [2016, 11, 1]);
    expect(questSeason(halloween, new Date('2026-07-14')).kind === 'seasonal').toBe(true);
    expect((questSeason(halloween, new Date('2026-07-14')) as { open: boolean }).open).toBe(false);
    expect((questSeason(halloween, new Date('2026-10-31')) as { open: boolean }).open).toBe(true);
  });

  it('flags a window that wraps the new year and keeps it open on both sides', () => {
    const christmas = quest(1, [2016, 12, 14], [2017, 1, 2]);
    const onNewYearsEve = questSeason(christmas, new Date('2026-12-31'));
    expect(onNewYearsEve).toMatchObject({
      recurring: '12月14日 – 1月2日',
      wraps: true,
      open: true,
    });
    expect((questSeason(christmas, new Date('2027-01-01')) as { open: boolean }).open).toBe(true);
    expect((questSeason(christmas, new Date('2026-11-30')) as { open: boolean }).open).toBe(false);
  });
});

describe('formatRequirement', () => {
  const req = (t: number, q?: number, id?: string): QuestRequirement =>
    ({
      m_questRequirementType: t,
      ...(q !== undefined ? { m_questRequirementQuantity: q } : {}),
      ...(id !== undefined ? { m_questRequirementID: id } : {}),
    }) as QuestRequirement;

  it('humanizes stat/level requirements with a >= threshold', () => {
    expect(formatRequirement(req(4, 20))).toBe('居民等级 ≥ 20');
    expect(formatRequirement(req(5, 5))).toBe('力量 ≥ 5');
    expect(formatRequirement(req(12, 9))).toBe('武器最小伤害 ≥ 9');
    expect(formatRequirement(req(3, 3))).toBe('队伍人数 ≥ 3');
  });

  it('humanizes weapon/outfit requirements', () => {
    expect(formatRequirement(req(1, 0, 'LaserRifle'))).toBe('需要武器：LaserRifle');
    expect(formatRequirement(req(2, 0))).toBe('需要服装');
  });
});

describe('grantLineChip', () => {
  it('maps currency lines to a labelled currency chip (no icon)', () => {
    const line: GrantLine = { kind: 'resource', key: 'Nuka', qty: 2500, label: 'Nuka' };
    expect(grantLineChip(line)).toEqual({
      label: '瓶盖',
      qty: 2500,
      icon: null,
      tone: 'currency',
      rolled: false,
    });
  });

  it('maps item lines to an item chip with a catalog icon', () => {
    const line: GrantLine = {
      kind: 'item',
      itemType: 'Weapon',
      id: 'LaserRifle',
      qty: 1,
      label: 'Laser Rifle',
      rolled: true,
    };
    expect(grantLineChip(line)).toEqual({
      label: 'Laser Rifle',
      qty: 1,
      icon: { type: 'weapons', id: 'LaserRifle' },
      tone: 'item',
      rolled: true,
    });
  });

  it('maps random/unsupported lines to a mystery chip', () => {
    const line: GrantLine = { kind: 'random', lootType: 100, qty: 1, label: 'Random Loot' };
    expect(grantLineChip(line).tone).toBe('mystery');
  });
});
