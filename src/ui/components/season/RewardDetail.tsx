import type { SeasonReward } from '../../../domain/model/seasonSchema.ts';
import type { GameData } from '../../../domain/gamedata/gameData.ts';
import { isRewardClaimed, type SeasonTrack } from '../../../domain/ops/seasonOps.ts';
import { ItemIcon } from '../ItemIcon.tsx';
import { rewardIcon, rewardTitle, rewardTypeLabel } from './seasonText.ts';

// Read-only per-reward detail panel. Shows the
// inspected board cell's full reward data; the only mutation is the explicit Claim / Unclaim
// button (the same one-undo-step claim the cell click performs). Identity fields
// (id/type/item) are shown but never edited - they're authored by the game and must round-trip
// verbatim.

interface RewardDetailProps {
  reward: SeasonReward | null;
  track: SeasonTrack | null;
  /** Vault-slot claim index the panel reads claim state for (Vault1 → 0 … Vault4 → 3). */
  claimIndex: number;
  gameData: GameData | null;
  /** Premium track is locked - premium rewards can't be claimed until it's unlocked. */
  premiumLocked: boolean;
  onToggle: () => void;
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-200">{value}</dd>
    </div>
  );
}

const QUANTITY_TYPES = new Set(['caps', 'stimpack', 'lunchbox']);

export function RewardDetail({
  reward,
  track,
  claimIndex,
  gameData,
  premiumLocked,
  onToggle,
}: RewardDetailProps) {
  // Both variants share a min height so hovering board cells never resizes the
  // card. A hover-driven height change shifts the page under the cursor, which
  // flips the hovered cell and flickers the panel in an endless loop.
  if (!reward || !track) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-500">
        悬停或聚焦棋盘上的奖励即可查看详情。
      </div>
    );
  }

  const claimed = isRewardClaimed(reward, claimIndex);
  const icon = rewardIcon(reward);
  const claimBlocked = track === 'premium' && premiumLocked && !claimed;

  return (
    <div className="min-h-44 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-start gap-3">
        {icon ? (
          <ItemIcon
            type={icon.type}
            id={icon.id}
            {...(icon.fallback ? { fallback: icon.fallback } : {})}
            size={40}
            className="mt-0.5"
          />
        ) : (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-800 text-[10px] text-neutral-300">
            {rewardTypeLabel(reward.rewardType)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-neutral-100">
              {rewardTitle(reward, gameData)}
            </h3>
            {reward.isPrestige && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                尊享
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                claimed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {claimed ? '已领取' : '未领取'}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Field label="轨道" value={track === 'premium' ? '精英' : '免费'} />
            <Field label="类型" value={rewardTypeLabel(reward.rewardType)} />
            <Field label="级" value={reward.levelRequired} />
            {QUANTITY_TYPES.has(reward.rewardType) && (
              <Field label="数量" value={Math.trunc(reward.dataValInt).toLocaleString()} />
            )}
            {reward.dataValString && <Field label="物品代码" value={reward.dataValString} />}
            <Field label="奖励 ID" value={reward.id} />
          </dl>
        </div>

        <button
          type="button"
          onClick={onToggle}
          disabled={claimBlocked}
          title={claimBlocked ? '解锁精英轨道后才能领取该奖励' : undefined}
          className={`shrink-0 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
            claimed
              ? 'border border-neutral-700 text-neutral-200 hover:bg-neutral-800'
              : 'bg-amber-500 text-neutral-900 hover:bg-amber-400'
          }`}
        >
          {claimed ? '取消领取' : '领取'}
        </button>
      </div>

      {/* Constant-height footnote: the slot is always rendered and only the text
          swaps, so premium-locked and free cells produce identical card heights. */}
      <p className="mt-2 min-h-8 text-xs text-neutral-500">
        {claimBlocked
          ? '精英奖励需要先解锁精英轨道（在「状态」中开启精英轨道，或使用「全部领取」）。'
          : '「领取 / 取消领取」编辑的是已领取列表；游戏会在下次载入存档时发放奖励。'}
      </p>
    </div>
  );
}
