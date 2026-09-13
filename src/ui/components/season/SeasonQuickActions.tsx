import { VaultCard } from '../vault/VaultCard.tsx';

// One-click power actions. Each is a single combined undo step
// (the batch ops in seasonOps already fold their many sub-edits into one workspace
// transition) and raises a toast - composed in the view. Disabled until game data is ready,
// because granting a claimed reward into the `.sav` needs the item catalogs to resolve.

interface SeasonQuickActionsProps {
  viewedLabel: string;
  /** False until game data is ready (claims grant into the `.sav` and need item resolution). */
  ready: boolean;
  /** Each true when the action would change nothing - the button is already "spent". */
  claimUnclaimedSpent: boolean;
  claimAllSpent: boolean;
  maxSeasonSpent: boolean;
  maxAllSeasonsSpent: boolean;
  onClaimUnclaimed: () => void;
  onClaimAll: () => void;
  onMaxSeason: () => void;
  onMaxAllSeasons: () => void;
}

const ACTION =
  'rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent';
const ACTION_PRIMARY =
  'rounded border border-amber-700 px-3 py-1.5 text-sm text-amber-300 transition-colors hover:bg-amber-900/30 disabled:opacity-40 disabled:hover:bg-transparent';

export function SeasonQuickActions({
  viewedLabel,
  ready,
  claimUnclaimedSpent,
  claimAllSpent,
  maxSeasonSpent,
  maxAllSeasonsSpent,
  onClaimUnclaimed,
  onClaimAll,
  onMaxSeason,
  onMaxAllSeasons,
}: SeasonQuickActionsProps) {
  return (
    <VaultCard
      title="快捷操作"
      description={ready ? `为 ${viewedLabel} 批量领取。` : '游戏数据加载中…'}
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={ACTION}
          disabled={!ready || claimUnclaimedSpent}
          title={ready && claimUnclaimedSpent ? '没有可领取的奖励了。' : undefined}
          onClick={onClaimUnclaimed}
        >
          领取未领奖励
        </button>
        <button
          type="button"
          className={ACTION}
          disabled={!ready || claimAllSpent}
          title={ready && claimAllSpent ? '所有奖励均已领取。' : undefined}
          onClick={onClaimAll}
        >
          全部领取
        </button>
        <button
          type="button"
          className={ACTION_PRIMARY}
          disabled={!ready || maxSeasonSpent}
          title={ready && maxSeasonSpent ? '该赛季已达到满级。' : undefined}
          onClick={onMaxSeason}
        >
          本赛季满级
        </button>
        <button
          type="button"
          className={ACTION_PRIMARY}
          disabled={!ready || maxAllSeasonsSpent}
          title={ready && maxAllSeasonsSpent ? '所有赛季均已满级。' : undefined}
          onClick={onMaxAllSeasons}
        >
          全部赛季满级
        </button>
      </div>
    </VaultCard>
  );
}
