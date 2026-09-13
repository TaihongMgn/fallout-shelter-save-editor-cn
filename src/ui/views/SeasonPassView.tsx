import { useMemo, useState } from 'react';
import { useSaveStore } from '../../state/saveStore.ts';
import { useUIStore } from '../../state/uiStore.ts';
import { useToastStore } from '../../state/toastStore.ts';
import { useGameData } from '../hooks/useGameData.ts';
import { useSeasonCatalog } from '../hooks/useSeasonCatalog.ts';
import type { SeasonReward } from '../../domain/model/seasonSchema.ts';
import {
  advanceSeasonClock,
  areAllSeasonsMaxed,
  claimAll,
  claimUnclaimed,
  grantPassTokens,
  isEntitledClaimed,
  isSeasonFullyClaimed,
  isSeasonMaxed,
  maxAllSeasons,
  maxSeason,
  resetSeasonClock,
  seasonClockOffsetDays,
  setLevel,
  setMaxRank,
  setPremium,
  setPremiumPlus,
  setTokens,
  skipToSeasonEnd,
  switchSeason,
  toggleReward,
  type SeasonTrack,
} from '../../domain/ops/seasonOps.ts';
import { ticksFromUnixMs } from '../../domain/tasks/taskLookup.ts';
import { SeasonOnboarding } from '../components/season/SeasonOnboarding.tsx';
import { SeasonSwitcher } from '../components/season/SeasonSwitcher.tsx';
import { SeasonStatusCard } from '../components/season/SeasonStatusCard.tsx';
import { SeasonQuickActions } from '../components/season/SeasonQuickActions.tsx';
import { SeasonClockCard } from '../components/season/SeasonClockCard.tsx';
import { SeasonBoard } from '../components/season/SeasonBoard.tsx';
import { RewardDetail } from '../components/season/RewardDetail.tsx';
import { SeasonExportBar } from '../components/season/SeasonExportBar.tsx';
import { cellKey, seasonLabel } from '../components/season/seasonText.ts';

// Season Pass tab. Orchestrates the season working model + game data
// through the store's combined `applySeasonEdit` (one claim = one undo step spanning the
// `.sav` and `spd.dat`). Before a season source is chosen it shows onboarding; afterwards
// the workspace (switcher, status, quick actions, board, read-only reward detail, export).

/** A board reward the user is inspecting (read-only detail), tagged with its season. */
interface Inspected {
  season: string;
  track: SeasonTrack;
  rewardId: number;
}

function rankCapOf(rewards: SeasonReward[]): number {
  return rewards.reduce((max, r) => Math.max(max, r.levelRequired), 0);
}

export function SeasonPassView() {
  const seasonSave = useSaveStore((s) => s.seasonSave);
  const seasonSource = useSaveStore((s) => s.seasonSource);
  const seasonClaimIndex = useSaveStore((s) => s.seasonClaimIndex);
  const setSeasonClaimIndex = useSaveStore((s) => s.setSeasonClaimIndex);
  const applySeasonEdit = useSaveStore((s) => s.applySeasonEdit);
  const startSeasonFromCatalog = useSaveStore((s) => s.startSeasonFromCatalog);
  const loadSeasonFromText = useSaveStore((s) => s.loadSeasonFromText);
  const allowOutOfRange = useUIStore((s) => s.allowOutOfRange);
  const pushToast = useToastStore((s) => s.push);
  const { data: gameData, status: gameDataStatus } = useGameData();
  const { data: catalog, status: catalogStatus, error: catalogError } = useSeasonCatalog();

  const [viewed, setViewed] = useState<string | null>(null);
  const [inspected, setInspected] = useState<Inspected | null>(null);

  // Season ids actually present in the working model, ordered by catalog order when known.
  const seasonIds = useMemo(() => {
    const keys = Object.keys(seasonSave?.seasonsData ?? {});
    const order = catalog?.seasonIds ?? [];
    const rank = (id: string): number => {
      const i = order.indexOf(id);
      return i < 0 ? order.length + keys.indexOf(id) : i;
    };
    return [...keys].sort((a, b) => rank(a) - rank(b));
  }, [seasonSave, catalog]);

  const gameDataReady = gameDataStatus === 'ready' && gameData !== null;

  // --- Onboarding (no season source yet) ----------------------------------------
  if (seasonSource === 'none' || !seasonSave) {
    return (
      <div className="h-full overflow-auto">
        <SeasonOnboarding
          onUpload={loadSeasonFromText}
          onContinue={() => {
            if (catalog) startSeasonFromCatalog(catalog);
          }}
          canContinue={catalogStatus === 'ready' && catalog !== null}
          catalogError={catalogStatus === 'error' ? catalogError : null}
        />
      </div>
    );
  }

  const activeSeason = seasonSave.currentSeason ?? '';
  const effectiveViewed =
    viewed && seasonIds.includes(viewed)
      ? viewed
      : seasonIds.includes(activeSeason)
        ? activeSeason
        : (seasonIds[0] ?? '');
  const record = seasonSave.seasonsData?.[effectiveViewed];

  if (!record) {
    return <div className="p-8 text-sm text-neutral-400">该赛季没有数据。</div>;
  }

  const isViewedActive = effectiveViewed === activeSeason;
  const viewedLabel = seasonLabel(effectiveViewed);
  const activeLabel = seasonLabel(activeSeason);
  const rankCap =
    catalog?.seasonById.get(effectiveViewed)?.maxRank ||
    rankCapOf([...(record.freeRewardsList ?? []), ...(record.premiumRewardsList ?? [])]) ||
    25;

  const inspectedReward: SeasonReward | null =
    inspected && inspected.season === effectiveViewed
      ? ((inspected.track === 'premium' ? record.premiumRewardsList : record.freeRewardsList)?.find(
          (r) => r.id === inspected.rewardId,
        ) ?? null)
      : null;

  // In-game pass-purchase economics for the viewed season (verified against the v2.4.1
  // game files): Premium Plus grants `premiumPassTokens` (25), which against the season's
  // token requirements levels a fresh pass straight to `plusSkipRank` (5). The base pass
  // grants 0 tokens and its goodie box; the game delivers goodie boxes to each vault on
  // load from the purchase record the toggles now write.
  const catalogSeason = catalog?.seasonById.get(effectiveViewed);
  const plusTokens = catalogSeason?.premiumPassTokens ?? 0;
  const plusSkipRank = (() => {
    const reqs = catalogSeason?.tokenRequirements ?? [];
    if (reqs.length === 0 || plusTokens <= 0) return 0;
    let level = 1;
    let tokens = plusTokens;
    while (level < reqs.length && (reqs[level] ?? 0) > 0 && tokens >= (reqs[level] ?? 0)) {
      tokens -= reqs[level] ?? 0;
      level++;
    }
    return level;
  })();

  // --- Edit helpers (each = one combined undo step) -----------------------------
  const needGameData = (): boolean => {
    if (gameDataReady) return true;
    pushToast('游戏数据仍在加载，请稍后重试。', 'info');
    return false;
  };

  const onToggle = (track: SeasonTrack, rewardId: number): void => {
    setInspected({ season: effectiveViewed, track, rewardId });
    if (!needGameData() || !gameData) return;
    applySeasonEdit(
      (ws) => toggleReward(ws, gameData, effectiveViewed, track, rewardId, seasonClaimIndex),
      `切换奖励 - ${viewedLabel}`,
    );
  };

  const onClaimUnclaimed = (): void => {
    if (!needGameData() || !gameData) return;
    applySeasonEdit(
      (ws) => claimUnclaimed(ws, gameData, effectiveViewed, seasonClaimIndex),
      `领取未领取奖励 - ${viewedLabel}`,
    );
    pushToast(`已领取未领取的奖励 - ${viewedLabel}`);
  };

  const onClaimAll = (): void => {
    if (!needGameData() || !gameData) return;
    applySeasonEdit(
      (ws) => claimAll(ws, gameData, effectiveViewed, seasonClaimIndex),
      `领取全部奖励 - ${viewedLabel}`,
    );
    pushToast(`已领取全部奖励 - ${viewedLabel}`);
  };

  const onMaxSeason = (): void => {
    if (!needGameData() || !gameData) return;
    applySeasonEdit(
      (ws) => maxSeason(ws, gameData, effectiveViewed, seasonClaimIndex),
      `赛季满级 - ${viewedLabel}`,
    );
    pushToast(`${viewedLabel} 已满级`);
  };

  const onMaxAllSeasons = (): void => {
    if (!needGameData() || !gameData) return;
    applySeasonEdit((ws) => maxAllSeasons(ws, gameData, seasonClaimIndex), '全部赛季满级');
    pushToast('所有赛季已满级');
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">赛季通行证</h2>
          {gameDataStatus === 'loading' && (
            <span className="text-xs text-neutral-400">游戏数据加载中…</span>
          )}
          {gameDataStatus === 'error' && (
            <span className="text-xs text-amber-500">游戏数据不可用 - 领取物品功能已禁用</span>
          )}
        </div>

        <div className="mt-4">
          <SeasonExportBar />
        </div>

        <div className="mt-4">
          <SeasonSwitcher
            seasonIds={seasonIds}
            viewed={effectiveViewed}
            active={activeSeason}
            onSelect={(id) => {
              setViewed(id);
              setInspected(null);
            }}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SeasonStatusCard
            viewedLabel={viewedLabel}
            activeLabel={activeLabel}
            isViewedActive={isViewedActive}
            isPremium={record.isPremium === true}
            isPremiumPlus={record.isPremiumPlus === true}
            maxRankAchieved={record.maxRankAchieved ?? 0}
            rankCap={rankCap}
            level={seasonSave.currentLevel ?? 0}
            tokens={seasonSave.currentTokens ?? 0}
            plusTokens={plusTokens}
            plusSkipRank={plusSkipRank}
            allowOutOfRange={allowOutOfRange}
            onSetPremium={(on) =>
              applySeasonEdit(
                (ws) => setPremium(ws, effectiveViewed, on),
                `精英轨道已${on ? '解锁' : '锁定'} - ${viewedLabel}`,
              )
            }
            onSetPremiumPlus={(on) => {
              // Replicate the real Premium Plus purchase (v2.4.1): flags + purchase
              // record (setPremiumPlus), plus the token grant that levels the ACTIVE
              // season's pass to rank 5. Skipped when it was already unlocked.
              const wasPlus = record.isPremiumPlus === true;
              applySeasonEdit(
                (ws) => {
                  let next = setPremiumPlus(ws, effectiveViewed, on);
                  if (on && !wasPlus && plusTokens > 0) {
                    next = grantPassTokens(
                      next,
                      effectiveViewed,
                      plusTokens,
                      catalogSeason?.tokenRequirements ?? [],
                    );
                  }
                  return next;
                },
                `尊享通行证已${on ? '解锁' : '锁定'} - ${viewedLabel}`,
              );
              if (on && !wasPlus && plusTokens > 0 && isViewedActive) {
                pushToast(
                  `已应用尊享通行证购买：+${plusTokens} 代币（通行证直升至 ${plusSkipRank} 级）。`,
                );
              }
            }}
            onSetMaxRank={(v) =>
              applySeasonEdit(
                (ws) => setMaxRank(ws, effectiveViewed, v),
                `设置最高等级 - ${viewedLabel}`,
              )
            }
            onSetLevel={(v) =>
              applySeasonEdit((ws) => setLevel(ws, v), `设置等级 - ${activeLabel}`)
            }
            onSetTokens={(v) =>
              applySeasonEdit((ws) => setTokens(ws, v), `设置代币 - ${activeLabel}`)
            }
            onMakeActive={() =>
              applySeasonEdit(
                (ws) => switchSeason(ws, effectiveViewed),
                `激活赛季 → ${viewedLabel}`,
              )
            }
          />

          {/* Right column: the two short cards stack beside the tall Status card
              instead of wasting a grid row each (single column on small screens). */}
          <div className="flex flex-col gap-4">
            <SeasonQuickActions
              viewedLabel={viewedLabel}
              ready={gameDataReady}
              claimUnclaimedSpent={isEntitledClaimed(seasonSave, effectiveViewed, seasonClaimIndex)}
              claimAllSpent={isSeasonFullyClaimed(seasonSave, effectiveViewed, seasonClaimIndex)}
              maxSeasonSpent={isSeasonMaxed(seasonSave, effectiveViewed, seasonClaimIndex)}
              maxAllSeasonsSpent={areAllSeasonsMaxed(seasonSave, seasonClaimIndex)}
              onClaimUnclaimed={onClaimUnclaimed}
              onClaimAll={onClaimAll}
              onMaxSeason={onMaxSeason}
              onMaxAllSeasons={onMaxAllSeasons}
            />

            <SeasonClockCard
              offsetDays={seasonClockOffsetDays(seasonSave)}
              activeLabel={activeLabel}
              endDate={catalog?.seasonById.get(activeSeason)?.endDate ?? null}
              onAdvanceDays={(days) => {
                applySeasonEdit((ws) => advanceSeasonClock(ws, days), `赛季时钟 +${days} 天`);
                pushToast(`赛季时钟已快进 ${days} 天`);
              }}
              onSkipToEnd={() => {
                const end = catalog?.seasonById.get(activeSeason)?.endDate;
                if (!end) return;
                // The game compares local DateTime.Now, so local midnight AFTER the end
                // date (+1 day) guarantees we land past the boundary.
                const endMs = new Date(`${end}T00:00:00`).getTime() + 86_400_000;
                applySeasonEdit(
                  (ws) => skipToSeasonEnd(ws, ticksFromUnixMs(endMs), ticksFromUnixMs(Date.now())),
                  '跳过赛季结束时间',
                );
                pushToast('赛季时钟已跳过赛季结束时间');
              }}
              onReset={() => {
                applySeasonEdit((ws) => resetSeasonClock(ws), '重置赛季时钟');
                pushToast('赛季时钟已恢复为真实时间');
              }}
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-300">奖励 - {viewedLabel}</h3>
            {/* Claim state is PER VAULT SLOT (v2.5.0 rerun seasons arrive pre-seeded with
                the original seasons' Vault1 claims, while a seasonal vault claims as its
                own slot). Auto-set from the loaded .sav name; overridable here. */}
            <label
              className="flex items-center gap-2 text-xs text-neutral-400"
              title="游戏按避难所分别记录领取状态（claimedList 中保存的是避难所槽位号）。请选择此赛季通行证对应的避难所 - 会根据已载入的 .sav 文件名自动设置。"
            >
              领取归属
              <select
                value={seasonClaimIndex}
                onChange={(e) => setSeasonClaimIndex(Number(e.target.value))}
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              >
                {[...new Set([0, 1, 2, 3, seasonClaimIndex])]
                  .sort((a, b) => a - b)
                  .map((slot) => (
                    <option key={slot} value={slot}>
                      避难所 {slot + 1}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <SeasonBoard
            record={record}
            rankCap={rankCap}
            currentRank={isViewedActive ? (seasonSave.currentLevel ?? null) : null}
            claimIndex={seasonClaimIndex}
            gameData={gameData}
            inspectedKey={
              inspectedReward && inspected ? cellKey(inspected.track, inspectedReward.id) : null
            }
            onInspect={(track, rewardId) =>
              setInspected({ season: effectiveViewed, track, rewardId })
            }
            onToggle={onToggle}
            onLockedPremium={() => pushToast('请先解锁精英轨道，才能领取精英奖励。', 'info')}
          />
        </div>

        <div className="mt-4">
          <RewardDetail
            reward={inspectedReward}
            track={inspectedReward ? (inspected?.track ?? null) : null}
            claimIndex={seasonClaimIndex}
            gameData={gameData}
            premiumLocked={record.isPremium !== true}
            onToggle={() => {
              if (inspectedReward && inspected) onToggle(inspected.track, inspected.rewardId);
            }}
          />
        </div>
      </div>
    </div>
  );
}
