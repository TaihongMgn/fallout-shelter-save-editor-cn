import { VaultCard } from './VaultCard.tsx';
import { Toggle } from '../forms/Toggle.tsx';
import { InfoTooltip } from '../InfoTooltip.tsx';
import { fieldHelp } from '../../lib/fieldHelp.ts';
import { formatDuration } from '../../../domain/tasks/taskLookup.ts';
import type { DeathclawState } from '../../../domain/ops/timerOps.ts';

// Disaster toggles: deathclaw attacks + Bottle & Cappy visits. Presentational -
// state and callbacks come from VaultView (deathclawState / setDeathclawEnabled /
// isBottleAndCappyEnabled / setBottleAndCappyEnabled in timerOps).

function deathclawStatusLine(state: DeathclawState, remainingSeconds: number | null): string {
  switch (state) {
    case 'enabled':
      return '可能发生袭击';
    case 'cooldown':
      return remainingSeconds !== null
        ? `自然冷却中，剩余 ${formatDuration(remainingSeconds)}`
        : '自然冷却中';
    case 'disabled':
      return '已被本编辑器阻止';
  }
}

export function DisastersCard({
  deathclaw,
  deathclawRemaining,
  canToggleDeathclaw,
  onSetDeathclaw,
  bottleAndCappy,
  onSetBottleAndCappy,
}: {
  deathclaw: DeathclawState;
  deathclawRemaining: number | null;
  /** False when the save has no task list to write the blocker into (rare/corrupt). */
  canToggleDeathclaw: boolean;
  onSetDeathclaw: (enabled: boolean) => void;
  bottleAndCappy: boolean;
  onSetBottleAndCappy: (enabled: boolean) => void;
}) {
  return (
    <VaultCard
      title="灾害"
      description="切换死亡爪袭击以及“瓶子与卡皮”的到访。"
      help="两个开关都会安全地写入存档，且在此处可随时完全还原。"
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <div className="grow">
              <Toggle
                label="死亡爪袭击"
                on={deathclaw === 'enabled' || deathclaw === 'cooldown'}
                onChange={onSetDeathclaw}
                disabled={!canToggleDeathclaw}
              />
            </div>
            <InfoTooltip text={fieldHelp.deathclawToggle} />
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            {deathclawStatusLine(deathclaw, deathclawRemaining)}
            {deathclaw !== 'disabled' &&
              '。关闭会在存档的计时器列表中写入一个阻止项；重新打开即可将其彻底移除。'}
          </p>
        </div>

        <div className="border-t border-neutral-800 pt-3">
          <div className="flex items-center gap-1.5">
            <div className="grow">
              <Toggle label="瓶子与卡皮到访" on={bottleAndCappy} onChange={onSetBottleAndCappy} />
            </div>
            <InfoTooltip text={fieldHelp.bottleAndCappy} />
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            {bottleAndCappy
              ? '允许到访——仍需完成对应的解锁任务，且它们会按自己的日程出现。'
              : '已阻止到访——在重新开启前，这对搭档不会进入避难所。'}
          </p>
        </div>
      </div>
    </VaultCard>
  );
}
