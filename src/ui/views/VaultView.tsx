import { useMemo, useState } from 'react';
import { useSaveStore } from '../../state/saveStore.ts';
import { useUIStore } from '../../state/uiStore.ts';
import { useToastStore } from '../../state/toastStore.ts';
import { useGameData } from '../hooks/useGameData.ts';
import { computeResourceCaps } from '../../domain/selectors/vaultSelectors.ts';
import {
  CONSUMABLE_CODES,
  consumableCounts,
  isMysteriousStrangerShown,
  isStarterPackPurchased,
  maxResources,
  resources as readResources,
  setConsumableCount,
  setMysteriousStranger,
  setStrangerTimers,
  setResource,
  setStarterPackPurchased,
  setVaultMode,
  setVaultName,
  setVaultTheme,
  type VaultMode,
} from '../../domain/ops/vaultOps.ts';
import {
  dailyRewardStatus,
  deathclawState,
  fastForwardVault,
  isBottleAndCappyEnabled,
  makeDailyRewardsClaimable,
  setBottleAndCappyEnabled,
  setDeathclawEnabled,
  vaultClockAheadSeconds,
} from '../../domain/ops/timerOps.ts';
import { toTicks } from '../../domain/tasks/taskLookup.ts';
import { ResourcesCard } from '../components/vault/ResourcesCard.tsx';
import { ConsumablesCard } from '../components/vault/ConsumablesCard.tsx';
import { VaultConfigCard } from '../components/vault/VaultConfigCard.tsx';
import { MiscCard } from '../components/vault/MiscCard.tsx';
import { DisastersCard } from '../components/vault/DisastersCard.tsx';
import { VaultTimeCard } from '../components/vault/VaultTimeCard.tsx';
import { SaveOverview } from './SaveOverview.tsx';

// Vault settings: a grid of grouped cards over the
// active save's vault. This view orchestrates - it reads the save + game-data caps and
// passes plain values + edit callbacks down to presentational cards. Every edit is one
// applyEdit = one undo step; quick actions also raise a toast. The save metadata +
// health check (the old "Vault overview") fold in below the settings.

export function VaultView() {
  const save = useSaveStore((s) => s.save);
  const originalSave = useSaveStore((s) => s.originalSave);
  const applyEdit = useSaveStore((s) => s.applyEdit);
  const allowOutOfRange = useUIStore((s) => s.allowOutOfRange);
  const pushToast = useToastStore((s) => s.push);
  const { data: gameData, status: gameDataStatus } = useGameData();
  // Wall-clock "now" for the daily-reward countdown, captured once on mount (render
  // purity); the countdown is a coarse day-scale estimate, no live ticking needed.
  const [nowMs] = useState(() => Date.now());

  const caps = useMemo(
    () => (save && gameData ? computeResourceCaps(save, gameData.roomCapacity) : null),
    [save, gameData],
  );

  const view = useMemo(() => {
    if (!save) return null;
    return {
      resources: readResources(save),
      counts: consumableCounts(save),
      name: save.vault?.VaultName ?? '000',
      mode: save.vault?.VaultMode ?? 'Normal',
      theme: save.vault?.VaultTheme ?? 0,
      strangerShown: isMysteriousStrangerShown(save),
      strangerTimeToAppear: save.MysteriousStranger?.timeToAppear ?? 180,
      strangerRemaining: save.MysteriousStranger?.remainingTimeToAppear ?? 0,
      starterPackPurchased: isStarterPackPurchased(save),
      deathclaw: deathclawState(save),
      canToggleDeathclaw: Array.isArray(save.taskMgr?.tasks),
      bottleAndCappy: isBottleAndCappyEnabled(save),
      canFastForward: toTicks(save.timeMgr?.timeSaveDate) !== null,
      // Cumulative fast-forward vs the imported file - the card's persistent feedback.
      clockAheadSeconds: originalSave ? vaultClockAheadSeconds(originalSave, save) : null,
      dailyRewards: dailyRewardStatus(save, nowMs),
    };
  }, [save, originalSave, nowMs]);

  if (!save || !view) {
    return <div className="p-8 text-sm text-neutral-400">未载入存档。</div>;
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">避难所设置</h2>
          {gameDataStatus === 'loading' && (
            <span className="text-xs text-neutral-400">游戏数据加载中…</span>
          )}
          {gameDataStatus === 'error' && (
            <span className="text-xs text-amber-500">游戏数据不可用 - 上限校验已禁用</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ResourcesCard
            resources={view.resources}
            caps={caps}
            allowOutOfRange={allowOutOfRange}
            onSet={(key, value) => applyEdit((s) => setResource(s, key, value), `设置 ${key}`)}
            onMaxAll={() => {
              if (!caps) return;
              applyEdit((s) => maxResources(s, caps), '资源拉满');
              pushToast('资源已加满至合法上限');
            }}
          />

          <ConsumablesCard
            counts={view.counts}
            onSet={(code, count) =>
              applyEdit((s) => setConsumableCount(s, code, count), '设置消耗品')
            }
            starterPackPurchased={view.starterPackPurchased}
            onToggleStarterPack={(purchased) => {
              applyEdit((s) => setStarterPackPurchased(s, purchased), '新手礼包');
              pushToast(`新手礼包优惠已${purchased ? '隐藏' : '恢复'}`);
            }}
            starterPacksInVault={view.counts[CONSUMABLE_CODES.StarterPack] ?? 0}
            onSetStarterPacks={(count) =>
              applyEdit(
                (s) => setConsumableCount(s, CONSUMABLE_CODES.StarterPack, count),
                '设置新手礼包',
              )
            }
          />

          <VaultConfigCard
            name={view.name}
            mode={view.mode}
            theme={view.theme}
            onName={(value) => applyEdit((s) => setVaultName(s, value), '设置避难所名称')}
            onMode={(mode: VaultMode) => applyEdit((s) => setVaultMode(s, mode), '设置避难所模式')}
            onTheme={(theme) => applyEdit((s) => setVaultTheme(s, theme), '设置避难所主题')}
          />

          <MiscCard
            strangerShown={view.strangerShown}
            onToggleStranger={(show) => {
              applyEdit((s) => setMysteriousStranger(s, show), '神秘陌生人');
              pushToast(`神秘陌生人已${show ? '设为出现' : '隐藏'}`);
            }}
            timeToAppear={view.strangerTimeToAppear}
            remainingTime={view.strangerRemaining}
            onSetTimers={(timers) =>
              applyEdit((s) => setStrangerTimers(s, timers), '神秘陌生人计时')
            }
          />

          <DisastersCard
            deathclaw={view.deathclaw.state}
            deathclawRemaining={view.deathclaw.remainingSeconds}
            canToggleDeathclaw={view.canToggleDeathclaw}
            onSetDeathclaw={(enabled) => {
              applyEdit((s) => setDeathclawEnabled(s, enabled), '死亡爪袭击');
              pushToast(`死亡爪袭击已${enabled ? '启用' : '阻止'}`);
            }}
            bottleAndCappy={view.bottleAndCappy}
            onSetBottleAndCappy={(enabled) => {
              applyEdit((s) => setBottleAndCappyEnabled(s, enabled), '瓶子 & 卡皮');
              pushToast(`瓶子 & 卡皮的来访已${enabled ? '允许' : '阻止'}`);
            }}
          />

          <VaultTimeCard
            canFastForward={view.canFastForward}
            clockAheadSeconds={view.clockAheadSeconds}
            onFastForward={(seconds, label) => {
              applyEdit((s) => fastForwardVault(s, seconds), label);
              pushToast(`${label} - 将在游戏载入存档时生效`);
            }}
            dailyRewards={view.dailyRewards}
            onMakeDailyRewardsClaimable={() => {
              applyEdit((s) => makeDailyRewardsClaimable(s), '每日奖励可领取');
              pushToast('每日奖励将在下次载入时可领取');
            }}
          />
        </div>

        <div className="mt-6 border-t border-neutral-800 pt-2">
          <SaveOverview />
        </div>
      </div>
    </div>
  );
}
