import { VaultCard } from './VaultCard.tsx';
import { NumberField } from '../forms/NumberField.tsx';
import { fieldHelp } from '../../lib/fieldHelp.ts';
import { formatDuration } from '../../../domain/tasks/taskLookup.ts';

// Misc card: Mysterious Stranger show/hide + appearance timers. (Casino
// is a normal room, added via the Rooms Map's generic build-room flow; no button here.)

export function MiscCard({
  strangerShown,
  onToggleStranger,
  timeToAppear,
  remainingTime,
  onSetTimers,
}: {
  strangerShown: boolean;
  onToggleStranger: (show: boolean) => void;
  /** Seconds between appearances (MysteriousStranger.timeToAppear). */
  timeToAppear: number;
  /** Live countdown to the next appearance (remainingTimeToAppear). */
  remainingTime: number;
  onSetTimers: (timers: { timeToAppear?: number; remainingTimeToAppear?: number }) => void;
}) {
  return (
    <VaultCard title="杂项" help={fieldHelp.mysteriousStranger} description="神秘陌生人。">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-neutral-300">
          神秘陌生人
          <span className="ml-2 text-xs text-neutral-400">
            {strangerShown ? '会出现' : '已隐藏'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onToggleStranger(!strangerShown)}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          {strangerShown ? '隐藏' : '显示'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <NumberField
            label="间隔（秒）"
            value={Math.round(timeToAppear)}
            min={0}
            max={100000}
            onCommit={(v) => onSetTimers({ timeToAppear: v })}
            className="w-32"
          />
          <span className="mt-0.5 text-[11px] text-neutral-500">
            = {formatDuration(timeToAppear)}
          </span>
        </div>
        <div className="flex flex-col">
          <NumberField
            label="下次出现（秒）"
            value={Math.round(remainingTime)}
            min={0}
            max={100000}
            onCommit={(v) => onSetTimers({ remainingTimeToAppear: v })}
            className="w-32"
          />
          <span className="mt-0.5 text-[11px] text-neutral-500">
            = {formatDuration(remainingTime)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSetTimers({ remainingTimeToAppear: 1 })}
          title="把倒计时设为 1 秒，让神秘陌生人在载入后立即现身"
          className="mb-4 rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          立即出现
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400">
        两个计时器均以秒为单位存入存档。“下次出现”是到他下次到访的实时倒计时，游玩时会持续走动，接近
        0
        的值会让他几乎在载入后立刻现身。“间隔”是游戏在两次到访之间等待的停顿；修改会被保存，但游戏日后会自行重新计算该值，因此把它当作一次推动而非永久性的频率更改。找到并点他可获得瓶盖奖励。
      </p>
    </VaultCard>
  );
}
