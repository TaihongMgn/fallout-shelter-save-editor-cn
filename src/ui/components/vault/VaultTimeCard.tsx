import { useState } from 'react';
import { VaultCard } from './VaultCard.tsx';
import { NumberField } from '../forms/NumberField.tsx';
import { InfoTooltip } from '../InfoTooltip.tsx';
import { fieldHelp } from '../../lib/fieldHelp.ts';
import { formatDuration } from '../../../domain/tasks/taskLookup.ts';
import type { DailyRewardStatus } from '../../../domain/ops/timerOps.ts';

// Global "hands of time" controls: fast-forward every vault timer at once
// (timerOps.fastForwardVault backdates timeMgr.timeSaveDate), plus the daily
// poker-chip reward timer. Presentational; VaultView applies the edits.
// `clockAheadSeconds` is the persistent feedback: cumulative fast-forward vs the
// imported save, so repeated clicks visibly add up (and undo visibly rolls back).

const PRESETS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '+1 小时', seconds: 3_600 },
  { label: '+8 小时', seconds: 8 * 3_600 },
  { label: '+1 天', seconds: 86_400 },
  { label: '+1 周', seconds: 7 * 86_400 },
];

const MAX_CUSTOM_HOURS = 87_600; // 10 years, the op's own cap

const BUTTON =
  'rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 pointer-coarse:px-4';

export function VaultTimeCard({
  canFastForward,
  clockAheadSeconds,
  onFastForward,
  dailyRewards,
  onMakeDailyRewardsClaimable,
}: {
  /** False when the save carries no readable timeSaveDate (nothing to backdate). */
  canFastForward: boolean;
  /** Cumulative fast-forward vs the imported save (0 = untouched; null = unreadable). */
  clockAheadSeconds: number | null;
  onFastForward: (seconds: number, label: string) => void;
  dailyRewards: DailyRewardStatus;
  onMakeDailyRewardsClaimable: () => void;
}) {
  const [customHours, setCustomHours] = useState(12);

  return (
    <VaultCard
      title="避难所时间"
      help={fieldHelp.vaultTime}
      description="一次性快进避难所内的所有计时器。"
    >
      <p className="text-sm text-neutral-300">
        避难所时钟{' '}
        <span className="text-neutral-100">
          {clockAheadSeconds === null
            ? '无法从此存档读取'
            : clockAheadSeconds > 0
              ? `比导入存档快 ${formatDuration(clockAheadSeconds)}`
              : '与导入存档一致'}
        </span>
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map(({ label, seconds }) => (
          <button
            key={label}
            type="button"
            disabled={!canFastForward}
            onClick={() => onFastForward(seconds, `快进 ${label.replace('+', '+ ')}`)}
            className={`${BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <NumberField
          label="自定义（小时）"
          value={customHours}
          min={1}
          max={MAX_CUSTOM_HOURS}
          onCommit={setCustomHours}
          className="w-32"
        />
        <button
          type="button"
          disabled={!canFastForward}
          onClick={() => onFastForward(customHours * 3_600, `快进 +${customHours} 小时`)}
          className={`${BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          应用
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-neutral-400">
        多次点击会累加；撤销每次只回退一步。效果在下次于游戏中载入存档时生效：游戏会视同你离开了这么久并统一赶上进度——生产与制作完成、怀孕到期、训练与探索推进、冷却结束。循环型计时器只完成一轮，然后照常节奏继续。此时钟与赛季通行证页的赛季时钟相互独立——避难所时间存于此存档，赛季时间存于赛季文件，移动其中一个绝不会移动另一个。
      </p>

      <div className="mt-3 border-t border-neutral-800 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm text-neutral-300">
            每日奖励计时器
            <InfoTooltip text={fieldHelp.dailyRewards} />
          </div>
          {dailyRewards.pending > 0 && (
            <button type="button" onClick={onMakeDailyRewardsClaimable} className={BUTTON}>
              立即设为可领取
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          {dailyRewards.pending > 0
            ? `下一个奖励 ${
                dailyRewards.soonestSeconds !== null && Number.isFinite(dailyRewards.soonestSeconds)
                  ? formatDuration(dailyRewards.soonestSeconds)
                  : '很久之后'
              } 可领取（按现实世界时钟计）。`
            : dailyRewards.total > 0
              ? '已可领取——下次载入此存档时游戏即会发放。'
              : '未记录计时器——载入此存档时，游戏会将其创建为已可领取（赛季避难所每日获得一枚 Spin-to-Win 扑克筹码）。'}
        </p>
      </div>
    </VaultCard>
  );
}
