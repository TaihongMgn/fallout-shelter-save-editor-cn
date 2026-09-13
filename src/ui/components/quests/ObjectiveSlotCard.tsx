import type { ObjectiveDef } from '../../../domain/gamedata/schemas.ts';
import type { ObjectiveSlot } from '../../../domain/model/saveSchema.ts';
import { slotEscalation } from '../../../domain/quests/objectiveOps.ts';
import {
  formatObjectiveDescription,
  objectiveGoal,
  objectiveLevel,
  objectiveRewardLabel,
  objectiveScaling,
  requirementProgressEntries,
  scaledObjectiveGoal,
} from '../../../domain/quests/objectiveDisplay.ts';
import { NumberField } from '../forms/NumberField.tsx';

// One of the 3 daily-objective slots, rendered as a card (Section 7). The objective can be swapped
// for another (Replace, never removed - the game assumes 3 slots), marked complete/ready-to-collect,
// and its reward-tier state (`lottery` 5 booleans, escalation level) edited. Goal and reward are
// shown at the slot's TRUE escalation level (base + per-level scaling), with the formula in a
// hover tooltip. The requirement's per-save progress counters vary by objective type and are
// shown read-only, humanized.

const BOX = 'rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2';

interface ObjectiveSlotCardProps {
  index: number;
  slot: ObjectiveSlot;
  /** The catalog definition for the slot's objectiveID, if resolved. */
  def: ObjectiveDef | undefined;
  canEdit: boolean;
  onReplace: () => void;
  onToggleCompleted: (completed: boolean) => void;
  onLotteryChange: (lottery: boolean[]) => void;
  onIncLevelChange: (incLevel: number) => void;
  /** Commit one numeric progress counter (requirement row `reqIndex`, save key `key`). */
  onProgressChange: (reqIndex: number, key: string, value: number) => void;
}

export function ObjectiveSlotCard({
  index,
  slot,
  def,
  canEdit,
  onReplace,
  onToggleCompleted,
  onLotteryChange,
  onIncLevelChange,
  onProgressChange,
}: ObjectiveSlotCardProps) {
  const objective = slot.objective;
  const objectiveID = objective?.objectiveID ?? '';
  const completed = objective?.completed === true;
  const level = def ? objectiveLevel(def) : null;

  // The CURRENT objective's escalation level. Normally equal to the slot's `incLevel` (the
  // counter that seeds each newly assigned objective); read the objective's own captured level
  // so the displayed goal/reward stay true even if the two have diverged.
  const escalation = slotEscalation(slot);
  const scaling = def ? objectiveScaling(def) : null;
  const baseGoal = def ? objectiveGoal(def) : null;
  const goal = def ? scaledObjectiveGoal(def, escalation) : null;

  const goalTitle =
    scaling && baseGoal != null
      ? `基础 ${baseGoal.toLocaleString()}` +
        (scaling.goalPerLevel > 0 ? `，每递增一级 +${scaling.goalPerLevel}` : '') +
        (scaling.goalCap != null ? `，上限 ${scaling.goalCap.toLocaleString()}` : '')
      : undefined;
  const rewardTitle =
    def && scaling
      ? `基础 ${objectiveRewardLabel(def)}` +
        (scaling.rewardPerLevel > 0 ? `，每递增一级 +${scaling.rewardPerLevel}` : '')
      : undefined;

  const description = def
    ? formatObjectiveDescription(def, escalation)
    : objectiveID || '（空槽位）';
  // The lottery is always 5 booleans in-game; pad/truncate a malformed save so the toggles render.
  const lottery = Array.from({ length: 5 }, (_, i) => slot.lottery?.[i] ?? true);

  const toggleLottery = (i: number): void => {
    const next = lottery.slice();
    next[i] = !next[i];
    onLotteryChange(next);
  };

  return (
    <section className="flex flex-col rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-amber-400/80">槽位 {index + 1}</p>
          <h3 className="text-sm font-semibold text-neutral-100" title={objectiveID}>
            {description}
          </h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {level != null && (
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
              {level} 级
            </span>
          )}
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              completed ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/40 text-amber-200'
            }`}
          >
            {completed ? '已完成' : '进行中'}
          </span>
        </div>
      </div>

      {!def && objectiveID && (
        <p className="mt-2 text-xs text-amber-500">
          未知的目标 ID——不在目录中；游戏加载存档时会重新分配此槽位。
        </p>
      )}

      {/* True goal & reward at the slot's current escalation level; formula on hover. */}
      <div className={`${BOX} mt-3 space-y-1 text-sm`}>
        {goal != null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-neutral-400">进度目标</span>
            <span className="cursor-help font-medium text-neutral-100" title={goalTitle}>
              {goal.toLocaleString()}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-400">奖励</span>
          <span className="cursor-help font-medium text-neutral-100" title={rewardTitle}>
            {def ? objectiveRewardLabel(def, escalation) : '-'}
          </span>
        </div>
      </div>

      {/* Progress counters (per-save fields vary by objective type). Numeric counters are
          EDITABLE, clamped to the scaled goal; hitting the goal marks the objective completed
          (see setObjectiveProgress). A freshly replaced objective has an empty requirements
          array - the game re-creates the rows on load - so the box stays mounted with a zeroed
          placeholder rather than vanishing. */}
      {objective && (
        <div className={`${BOX} mt-2 text-xs`}>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">进度</p>
          <div className="space-y-2">
            {objective.requirements && objective.requirements.length > 0 ? (
              objective.requirements.map((r, i) => {
                const entries = requirementProgressEntries(r as Record<string, unknown>);
                const counters = entries.filter((e) => e.numeric != null);
                const flags = entries.filter((e) => e.numeric == null);
                return (
                  <div key={i} className="flex flex-wrap items-end justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-end gap-2">
                      {counters.map((e) => (
                        <NumberField
                          key={e.key}
                          label={goal != null ? `${e.label} / ${goal.toLocaleString()}` : e.label}
                          value={e.numeric!}
                          onCommit={(v) => onProgressChange(i, e.key, v)}
                          min={0}
                          max={goal ?? 999999}
                          disabled={!canEdit}
                          className="w-36"
                        />
                      ))}
                      {flags.length > 0 && (
                        <span className="pb-1 text-neutral-400">
                          {flags.map((e) => `${e.label}: ${e.value}`).join(' · ')}
                        </span>
                      )}
                      {entries.length === 0 && (
                        <span className="text-neutral-400">由游戏内部跟踪</span>
                      )}
                    </div>
                    <span
                      className={`pb-1 ${r.satisfied ? 'text-emerald-400' : 'text-neutral-500'}`}
                    >
                      {r.satisfied ? '已达标' : '进行中'}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-neutral-400">
                  从 0 开始——游戏加载时会重建这些计数器
                </span>
                <span className="text-neutral-500">进行中</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit controls ------------------------------------------------------------ */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <button
          type="button"
          disabled={!canEdit}
          onClick={onReplace}
          title={canEdit ? undefined : '请先载入存档才能编辑目标'}
          className="rounded border border-sky-800 bg-sky-950/30 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-900/40 disabled:opacity-40 disabled:hover:bg-sky-950/30"
        >
          替换…
        </button>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={completed}
            onChange={(e) => onToggleCompleted(e.target.checked)}
            className="h-4 w-4 accent-emerald-500 disabled:opacity-40"
          />
          已完成
        </label>
        <NumberField
          label="递增等级"
          value={slot.incLevel ?? 0}
          onCommit={onIncLevelChange}
          min={0}
          max={999}
          disabled={!canEdit}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-500">
        每当该槽位的目标完成一次，游戏都会将此值加 1，并随之提升上方的进度目标与奖励
        {scaling && (scaling.goalPerLevel > 0 || scaling.rewardPerLevel > 0)
          ? `（此处每级：${[
              scaling.goalPerLevel > 0 ? `目标 +${scaling.goalPerLevel}` : null,
              scaling.rewardPerLevel > 0 ? `奖励 +${scaling.rewardPerLevel}` : null,
            ]
              .filter(Boolean)
              .join('、')}）`
          : ''}
        。设为 0 可重置为基础目标。
      </p>

      <div className="mt-3">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">
          下一个目标的难度
        </p>
        <p className="mb-1.5 text-[11px] text-neutral-500">
          当前目标完成后，游戏会从此处勾选的难度档位中随机抽取一个作为替换（1 = 最简单，5 = 最难，
          即上方显示的等级徽章）。每档用过后游戏会取消勾选，五种难度各出现一次后才会全部重置。只勾选一档可强制下一个目标使用该难度。
        </p>
        <div className="flex flex-wrap gap-1.5">
          {lottery.map((on, i) => (
            <label
              key={i}
              className="flex cursor-pointer items-center gap-1 rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1 text-xs text-neutral-300"
            >
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={on}
                onChange={() => toggleLottery(i)}
                className="h-3.5 w-3.5 accent-amber-500 disabled:opacity-40"
              />
              {i + 1}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
