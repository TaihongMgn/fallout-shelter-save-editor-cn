import type { ReactNode } from 'react';
import type { Quest } from '../../../domain/gamedata/schemas.ts';
import { isReactivatingEventQuest } from '../../../domain/quests/questCompletion.ts';
import {
  formatRequirement,
  questEnvironmentLabel,
  questRegionLabel,
  questSchemeLabel,
  questSchemeName,
  questSeason,
  questSeasonId,
  questTypeLabel,
  type RewardChip,
} from '../../../domain/quests/questDisplay.ts';
import type { QuestStatus } from '../../../domain/quests/questFilter.ts';
import type { QuestMapRegion } from '../../../domain/quests/questGraphLayout.ts';
import { seasonLabel } from '../season/seasonText.ts';
import { RewardChips } from './RewardChips.tsx';

// Selected-quest detail panel (master-detail in the Quests tab), following the RecipeSidePanel
// conventions: amber uppercase section headers, a meta box grid, a right-hand overlay on mobile
// from the parent ResizableSplit. Shows every captured quest field as read-only display; the one
// editable action is completion (mark complete grants loot; mark incomplete is tip-only, 5.7).
//
// EVERY FILTER FACET IS ANSWERED HERE. A facet the panel omits is a question the user can ask the
// map but not the quest: filtering to Environment=Cave and clicking a result used to leave them no
// way to confirm WHY it matched. So Status, Type, Region, Questline, Scheme, Environment, Rewards,
// Flags and Difficulty each have a badge or a Details row, and the values come from the filter's
// own helpers (questStatuses, regionOf) rather than a second reading of the same save fields.

const BOX = 'rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400/80">
        {title}
      </h4>
      {children}
    </section>
  );
}

function StatRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span title={title} className="text-right font-medium text-neutral-100">
        {value}
      </span>
    </div>
  );
}

function Badge({
  children,
  tone,
  title,
}: {
  children: ReactNode;
  tone: string;
  // `| undefined` is required by exactOptionalPropertyTypes: callers pass a conditional title.
  title?: string | undefined;
}) {
  return (
    <span title={title} className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {children}
    </span>
  );
}

/**
 * The quest-log statuses that get their own badge, with the Status facet's wording.
 *
 * completed/incomplete are absent by design: they are the panel's headline state and already have
 * a dedicated badge next to the completion button, so listing them here would print it twice.
 * These three are the save-derived extras the panel had no way to show at all.
 */
const LOG_STATUS_BADGES: { value: QuestStatus; label: string; tone: string; hint: string }[] = [
  {
    value: 'inLog',
    label: '在任务日志中',
    tone: 'bg-sky-900/40 text-sky-200',
    hint: '当前可接取：轮换任务 + 已解锁的剧情步骤',
  },
  {
    value: 'deployed',
    label: '小队已派出',
    tone: 'bg-blue-900/50 text-blue-200',
    hint: '当前有小队正在执行此任务',
  },
  {
    value: 'skipped',
    label: '已跳过',
    tone: 'bg-neutral-800 text-neutral-400',
    hint: '在轮换中被跳过',
  },
];

export interface QuestDetailPanelProps {
  quest: Quest;
  questlineTitle: string | null;
  completed: boolean;
  /** Save-derived statuses from the filter's questStatuses - the Status facet's own answer. */
  statuses: readonly QuestStatus[];
  /** Which map region draws this quest; null until the catalog resolves it. */
  region: QuestMapRegion | null;
  /** True when the quest may be un-completed (completed with no completed dependents). */
  isTip: boolean;
  /** Completed quests that block un-completing this one (shown when !isTip). */
  blockedBy: string[];
  rewardChips: RewardChip[];
  /** Whether a save is loaded - completion edits require one. */
  canEdit: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  /** Navigate to a dependency quest (present only for deps that exist in the catalog). */
  onSelectDependency: (questName: string) => void;
  /** Dependency names that resolve to a catalog quest (clickable). */
  knownDependencies: Set<string>;
  onClose: () => void;
}

export function QuestDetailPanel({
  quest,
  questlineTitle,
  completed,
  statuses,
  region,
  isTip,
  blockedBy,
  rewardChips,
  canEdit,
  onComplete,
  onUncomplete,
  onSelectDependency,
  knownDependencies,
  onClose,
}: QuestDetailPanelProps) {
  const scheme = questSchemeLabel(quest.m_questScheme);
  const requirements = (quest.m_questRequirements ?? []).filter(
    (r) => r.m_questRequirementType !== 0,
  );
  const deps = quest.m_questDependancies ?? [];
  const diffMin = quest.m_questDifficultyMin;
  const diffMax = quest.m_questDifficultyMax;
  const environment = quest.m_questEnvironment;
  const logBadges = LOG_STATUS_BADGES.filter((b) => statuses.includes(b.value));
  const season = questSeason(quest);
  // "Scheme: Season" on its own prompts the obvious question, so name the season wherever it is
  // known rather than making the reader go and look it up.
  const seasonId = questSeasonId(quest);
  const seasonName = seasonId ? seasonLabel(seasonId) : null;

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-900/40 p-4">
      {/* Identity: title + questline + type/scheme/state badges (no env art per Section 8.1). */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {questlineTitle && (
            <p className="truncate text-xs text-amber-400/80" title={questlineTitle}>
              {questlineTitle}
            </p>
          )}
          <h3 className="text-base font-semibold text-neutral-100" title={quest.title}>
            {quest.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭任务面板"
          className="shrink-0 rounded px-2 py-1 text-neutral-400 hover:text-neutral-100"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="bg-neutral-800 text-neutral-300">{questTypeLabel(quest.m_questType)}</Badge>
        {scheme && (
          <Badge
            tone="bg-purple-900/40 text-purple-200"
            title={seasonName ? `赛季通行证内容：${seasonName} 赛季` : undefined}
          >
            {seasonName ? `${scheme}：${seasonName}` : scheme}
          </Badge>
        )}
        {season.kind === 'seasonal' && (
          <Badge
            tone={season.open ? 'bg-red-900/40 text-red-200' : 'bg-neutral-800 text-neutral-400'}
            title={`每年开放时间：${season.recurring}。${
              season.open ? '今日在季。' : '今日不在季。'
            }`}
          >
            {season.open ? '限时 · 今日在季' : '限时 · 今日不在季'}
          </Badge>
        )}
        {quest.m_isVisible === 0 && (
          <Badge tone="bg-neutral-800 text-neutral-400" title="游戏中从不显示（m_isVisible = 0）">
            已隐藏
          </Badge>
        )}
        <Badge
          tone={completed ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/40 text-amber-200'}
        >
          {completed ? '已完成' : '未完成'}
        </Badge>
        {logBadges.map((b) => (
          <Badge key={b.value} tone={b.tone} title={b.hint}>
            {b.label}
          </Badge>
        ))}
      </div>

      {/* Completion action. Mark complete grants the rewards below; mark incomplete is tip-only. */}
      <div className="mt-3">
        {completed ? (
          <button
            type="button"
            disabled={!canEdit || !isTip}
            onClick={onUncomplete}
            title={
              !canEdit
                ? '请先载入存档才能编辑任务'
                : isTip
                  ? undefined
                  : `请先取消完成其后续任务：${blockedBy.join('、')}`
            }
            className="w-full rounded border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/40 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            标记为未完成
          </button>
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={onComplete}
            title={canEdit ? undefined : '请先载入存档才能编辑任务'}
            className="w-full rounded border border-emerald-700 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            标记为完成并发放奖励
          </button>
        )}
        {!completed && deps.length > 0 && (
          <p className="mt-1 text-[11px] text-neutral-500">
            同时会完成所有未满足的前置任务并发放其奖励。
          </p>
        )}
        {!completed && isReactivatingEventQuest(quest) && (
          <p className="mt-1 text-[11px] text-neutral-500">
            活动任务：完成时间会被固定，因此无论是否在活动期内，游戏都会将其保持为已完成。（游戏通常会在活动结束约
            180 天后清除该完成记录以便重玩；如需重玩，可在此处取消完成。）
          </p>
        )}
      </div>

      {(quest.shortDescription || quest.longDescription) && (
        <Section title="剧情">
          <div className={`${BOX} space-y-2 text-sm text-neutral-300`}>
            {quest.shortDescription && (
              <p className="italic text-neutral-400">{quest.shortDescription}</p>
            )}
            {quest.longDescription && <p>{quest.longDescription}</p>}
          </div>
        </Section>
      )}

      <Section title="奖励">
        <RewardChips chips={rewardChips} />
      </Section>

      {requirements.length > 0 && (
        <Section title="要求">
          <ul className={`${BOX} space-y-1 text-sm text-neutral-200`}>
            {requirements.map((r, i) => (
              <li key={i}>{formatRequirement(r)}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="详情">
        <div className={BOX}>
          {(diffMin !== undefined || diffMax !== undefined) && (
            <StatRow
              label="难度"
              value={
                diffMin === diffMax ? `${diffMin ?? '?'}` : `${diffMin ?? '?'}–${diffMax ?? '?'}`
              }
            />
          )}
          <StatRow label="类型" value={questTypeLabel(quest.m_questType)} />
          {region && <StatRow label="地区" value={questRegionLabel(region)} />}
          <StatRow label="方案" value={questSchemeName(quest.m_questScheme)} />
          {seasonName && (
            <StatRow label="赛季" value={seasonName} title={`赛季通行证赛季 ID：${seasonId}`} />
          )}
          {environment !== undefined && (
            <StatRow label="环境" value={questEnvironmentLabel(environment)} />
          )}
          <StatRow label="可重复" value={quest.m_isRepeatable === 1 ? '是' : '否'} />
          {/* Answers the Flags facet's "Time limited" outright, so there is no Yes/No row for it:
              a window IS the flag, spelled out. */}
          {season.kind === 'always' ? (
            <StatRow
              label="开放窗口"
              value="始终开放"
              title="无季节窗口：目录中的 1970/01/01–2100/01/01 哨兵值表示该任务从不受日期限制。"
            />
          ) : (
            <>
              {/* Month/day, no year: the catalog's authored years (2016-2018, and one 2999) are
                  metadata the game ignores, so printing them would contradict this recurrence. */}
              <StatRow
                label="开放窗口"
                value={season.recurring}
                title={`每年循环：游戏只比较月和日。${season.wraps ? '此窗口会跨越新年。' : ''}`}
              />
              <StatRow label="今日是否在季" value={season.open ? '是' : '否'} />
            </>
          )}
          <StatRow label="隐藏" value={quest.m_isVisible === 0 ? '是' : '否'} />
          <StatRow label="任务 ID" value={quest.m_questName} />
        </div>
      </Section>

      {deps.length > 0 && (
        <Section title="前置任务">
          <div className="flex flex-wrap gap-1.5">
            {deps.map((dep) =>
              knownDependencies.has(dep) ? (
                <button
                  key={dep}
                  type="button"
                  onClick={() => onSelectDependency(dep)}
                  className="rounded border border-sky-800 bg-sky-950/30 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-900/40"
                >
                  {dep} →
                </button>
              ) : (
                <span
                  key={dep}
                  className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-0.5 text-xs text-neutral-400"
                >
                  {dep}
                </span>
              ),
            )}
          </div>
        </Section>
      )}
    </aside>
  );
}
