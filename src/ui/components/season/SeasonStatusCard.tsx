import { NumberField } from '../forms/NumberField.tsx';
import { Toggle } from '../forms/Toggle.tsx';
import { VaultCard } from '../vault/VaultCard.tsx';

// Season status editors. Split into two groups because the underlying
// fields have different scopes in spd.dat:
//   • Premium / Premium+ / max rank achieved are PER-SEASON (seasonsData[viewed]).
//   • Level / tokens are the single top-level `currentLevel`/`currentTokens` - they belong to
//     the ACTIVE season only. When you're viewing a non-active season, editing level/tokens
//     still targets the active season, so the group is labelled with the active season and a
//     "make this season active" action is offered.
// Every change is one applySeasonEdit = one combined undo step (composed in seasonOps).

interface SeasonStatusCardProps {
  viewedLabel: string;
  activeLabel: string;
  isViewedActive: boolean;
  isPremium: boolean;
  isPremiumPlus: boolean;
  maxRankAchieved: number;
  rankCap: number;
  level: number;
  tokens: number;
  /** Tokens the in-game Premium Plus purchase grants (25 in shipped seasons; 0 = unknown). */
  plusTokens: number;
  /** Rank those tokens level a fresh pass to (5 in shipped seasons; 0 = unknown). */
  plusSkipRank: number;
  allowOutOfRange: boolean;
  onSetPremium: (on: boolean) => void;
  onSetPremiumPlus: (on: boolean) => void;
  onSetMaxRank: (value: number) => void;
  onSetLevel: (value: number) => void;
  onSetTokens: (value: number) => void;
  onMakeActive: () => void;
}

const TOKENS_FALLBACK_MAX = 9_999_999;

export function SeasonStatusCard({
  viewedLabel,
  activeLabel,
  isViewedActive,
  isPremium,
  isPremiumPlus,
  maxRankAchieved,
  rankCap,
  level,
  tokens,
  plusTokens,
  plusSkipRank,
  allowOutOfRange,
  onSetPremium,
  onSetPremiumPlus,
  onSetMaxRank,
  onSetLevel,
  onSetTokens,
  onMakeActive,
}: SeasonStatusCardProps) {
  return (
    <VaultCard
      title="状态"
      description={`${viewedLabel} 的精英轨道、级数与等级。`}
      action={
        !isViewedActive && (
          <button
            type="button"
            onClick={onMakeActive}
            title="将存档的当前赛季（以及 nvf.dat）指向该赛季"
            className="rounded border border-amber-700 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-900/30"
          >
            设为当前
          </button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <Toggle
          label="精英轨道"
          on={isPremium}
          onChange={onSetPremium}
          onLabel="已解锁"
          offLabel="未解锁"
        />
        <Toggle
          label="精英+轨道"
          on={isPremiumPlus}
          onChange={onSetPremiumPlus}
          onLabel="已解锁"
          offLabel="未解锁"
        />

        {/* What each paid tier does, verified against the v2.4.1 game files (ShopWindow /
            SeasonPassTokenManager / Vault.GrantEligibleSeasonalLunchboxes). */}
        <div className="rounded border border-neutral-800 bg-neutral-950/50 px-2.5 py-2 text-[11px] leading-relaxed text-neutral-400">
          <p>
            <span className="font-medium text-neutral-300">精英</span>
            会解锁棋盘上的精英奖励行。在游戏中，该购买还会排队发放本赛季的礼包；游戏会在下次载入时把它送到每个避难所。在此打开该开关，等于在存档中记录这次购买。
          </p>
          <p className="mt-1.5">
            <span className="font-medium text-neutral-300">精英+</span>
            包含精英的全部内容，并追加更大的礼包（额外瓶盖、传说装备与宠物，以及一名独特居民）
            {plusTokens > 0 && plusSkipRank > 1 ? (
              <>
                ，外加 {plusTokens} 个通行证代币，可让新建通行证立即升到 {plusSkipRank}{' '}
                级。打开该开关会把代币加成应用到当前赛季。
              </>
            ) : (
              '。'
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-neutral-800 pt-3">
          <NumberField
            label="已达到的最高级"
            value={maxRankAchieved}
            min={0}
            max={rankCap}
            allowOutOfRange={allowOutOfRange}
            onCommit={onSetMaxRank}
          />
          <div />
        </div>

        <div className="border-t border-neutral-800 pt-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">
            当前赛季 - {activeLabel}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <NumberField
              label="等级"
              value={level}
              min={0}
              max={rankCap}
              allowOutOfRange={allowOutOfRange}
              onCommit={onSetLevel}
            />
            <NumberField
              label="代币"
              value={tokens}
              min={0}
              max={TOKENS_FALLBACK_MAX}
              allowOutOfRange={allowOutOfRange}
              onCommit={onSetTokens}
            />
          </div>
          {!isViewedActive && (
            <p className="mt-1.5 text-[11px] text-neutral-500">
              等级与代币应用于当前赛季（{activeLabel}）。要把它们改作用于 {viewedLabel}
              ，请先将该赛季设为当前赛季。
            </p>
          )}
        </div>
      </div>
    </VaultCard>
  );
}
