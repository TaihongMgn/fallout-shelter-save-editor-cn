import { VaultCard } from '../vault/VaultCard.tsx';
import { fieldHelp } from '../../lib/fieldHelp.ts';

// Season clock: the game's own debug time offset (spd.debugTimeOffset). Advancing it
// shifts ALL season timing forward (weekly challenge unlocks, event windows, season end)
// without touching the vault save. Presentational; SeasonPassView applies the edits
// (advanceSeasonClock / skipToSeasonEnd / resetSeasonClock in seasonOps).

const BUTTON =
  'rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:px-4';

export function SeasonClockCard({
  offsetDays,
  activeLabel,
  endDate,
  onAdvanceDays,
  onSkipToEnd,
  onReset,
}: {
  /** Current offset in whole days (0 = real time). */
  offsetDays: number;
  /** Display label of the ACTIVE season (the clock always applies to season timing globally). */
  activeLabel: string;
  /** The active season's scheduled end date ("YYYY-MM-DD"), or null when unknown. */
  endDate: string | null;
  onAdvanceDays: (days: number) => void;
  onSkipToEnd: () => void;
  onReset: () => void;
}) {
  return (
    <VaultCard
      title="赛季时钟"
      help={fieldHelp.seasonClock}
      description={`将 ${activeLabel} 的赛季时间向前推移。`}
    >
      <p className="text-sm text-neutral-300">
        时钟{' '}
        <span className="text-neutral-100">
          {offsetDays > 0 ? `快了 ${offsetDays} 天` : '与真实时间同步'}
        </span>
        {endDate && <span className="text-neutral-500"> · 赛季预定 {endDate} 结束</span>}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={() => onAdvanceDays(1)}>
          +1 天
        </button>
        <button type="button" className={BUTTON} onClick={() => onAdvanceDays(7)}>
          +7 天
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={endDate === null}
          title={endDate === null ? '赛季目录中没有该赛季的结束日期' : '将时钟直接跳到赛季结束之后'}
          onClick={onSkipToEnd}
        >
          跳到赛季结束之后
        </button>
        <button type="button" className={BUTTON} disabled={offsetDays <= 0} onClick={onReset}>
          重置为真实时间
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-neutral-400">
        这是游戏自带的调试时钟，保存在赛季文件中。它会提前解锁每周挑战和活动，也可能直接结束赛季；「重置为真实时间」可以完全撤销。它与「避难所」标签页中的避难所时间卡片相互独立{' '}
        - 该时钟只影响赛季时间，绝不会推进生产、制作或其他避难所计时器。
      </p>
    </VaultCard>
  );
}
