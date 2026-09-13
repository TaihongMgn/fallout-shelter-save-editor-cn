import { useEffect, useMemo, useRef, useState } from 'react';
import { useSaveStore } from '../../state/saveStore.ts';
import { useUIStore } from '../../state/uiStore.ts';
import { pushToast } from '../../state/toastStore.ts';
import { useGameData } from '../hooks/useGameData.ts';
import type { Dweller, SaveData } from '../../domain/model/saveSchema.ts';
import {
  countAffectedDwellers,
  healAll,
  makeLegendaryAll,
  maxHappinessAll,
  maxHpAll,
  maxSpecialAll,
  reviveAll,
  setBabyReadyAll,
  setLevelAll,
  setPregnantAll,
} from '../../domain/ops/bulkOps.ts';
import { maxEverything } from '../../domain/ops/bulkPresets.ts';
import { repairAllRooms } from '../../domain/ops/roomOps.ts';
import {
  acceptWaiting,
  clearEmergencies,
  removeRocks,
  roomsInEmergency,
  unlockRecipes,
  unlockRooms,
  unlockThemes,
} from '../../domain/ops/vaultOps.ts';
import { applyLoadout, type LoadoutSpec } from '../../domain/ops/loadoutOps.ts';
import { computeResourceCaps } from '../../domain/selectors/vaultSelectors.ts';
import { selectAllDwellerIds } from '../../domain/selectors/dwellerScope.ts';
import {
  suggestOutfitForRoomType,
  suggestPetForRoomType,
  suggestWeapon,
  vaultLoadoutRoomTypes,
  wastelandLoadoutRoomType,
} from '../../domain/selectors/loadoutSuggest.ts';
import { outfitEnduranceBonus, petBonusRange } from '../../domain/gamedata/gameData.ts';
import {
  LoadoutPanel,
  type LoadoutChoice,
  type LoadoutRow,
} from '../components/bulk/LoadoutPanel.tsx';

// Bulk section - vault-wide presets. Dweller presets apply to
// every dweller (per-selection actions live in the Dwellers table action bar). "Max Everything"
// is the headline preset: it maxes every existing entity in one undo step and never
// unlocks/adds/removes. Each preset is one applyEdit = one undo + a toast; the resolved dweller
// count is shown so there's no ambiguity about what's affected.

const BTN =
  'rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent';

const MAX_EVERYTHING_TOOLTIP =
  '资源 → 提升至合法上限 · 所有居民 → 等级 50、SPECIAL 全 10、最大生命值 644、辐射 0、' +
  '幸福度 100、死亡居民复活 · 巧手先生 → 生命值全满 · 所有房间 → 最高等级并修复。' +
  '不会解锁、添加或移除任何内容。';

export function BulkView() {
  const save = useSaveStore((s) => s.save);
  const applyEdit = useSaveStore((s) => s.applyEdit);
  const { data: gameData, status: gameDataStatus } = useGameData();
  const bulkFocus = useUIStore((s) => s.bulkFocus);

  const [level, setLevel] = useState(50);

  // HP scaling on Set Level / Max Everything uses base Endurance + equipped-outfit bonus.
  const endBonusFor = gameData
    ? (d: Dweller) => outfitEnduranceBonus(gameData, d.equipedOutfit?.id)
    : undefined;

  // Deep-link from the Rooms side-panel "Customize in Bulk" link: scroll the Location
  // loadouts panel into view, then consume the one-shot flag (a store action, not a
  // useState setter - safe to call from an effect under the React Compiler lint).
  const loadoutsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (bulkFocus === 'loadouts') {
      loadoutsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      useUIStore.getState().setBulkFocus(null);
    }
  }, [bulkFocus]);

  // Dweller presets always apply to every dweller.
  const scopedIds = useMemo(
    () => (save ? selectAllDwellerIds(save, gameData) : []),
    [save, gameData],
  );

  // Location loadouts: one row per staffed room type with a primary SPECIAL or a
  // catered pet (Entrance), plus a synthetic Wasteland row for unrostered dwellers.
  const weaponSuggestionId = gameData ? (suggestWeapon(gameData)?.id ?? null) : null;
  const loadoutRows = useMemo<LoadoutRow[]>(() => {
    if (!save || !gameData) return [];
    const roomTypes = vaultLoadoutRoomTypes(save, gameData);
    const wasteland = wastelandLoadoutRoomType(save);
    if (wasteland) roomTypes.push(wasteland);
    return roomTypes.map((rt) => ({
      ...rt,
      suggestedOutfitId: suggestOutfitForRoomType(gameData, rt.type, rt.statKey)?.id ?? null,
      suggestedWeaponId: weaponSuggestionId,
      suggestedPetId: suggestPetForRoomType(gameData, rt.type)?.id ?? null,
    }));
  }, [save, gameData, weaponSuggestionId]);
  if (!save) return <div className="p-6 text-sm text-neutral-400">未载入存档。</div>;

  const applyRoomLoadout = (dwellerIds: number[], choice: LoadoutChoice): void => {
    const spec: LoadoutSpec = {
      ...(choice.outfitId ? { outfitId: choice.outfitId } : {}),
      ...(choice.weaponId ? { weaponId: choice.weaponId } : {}),
    };
    if (choice.petId && gameData) {
      const range = petBonusRange(gameData, choice.petId);
      const pet = gameData.petById.get(choice.petId);
      if (range && pet) {
        spec.pet = {
          petId: choice.petId,
          uniqueName: pet.name,
          bonus: range.bonus,
          bonusValue: range.max,
        };
      }
    }
    applyEdit((s) => applyLoadout(s, dwellerIds, spec), '应用配置');
    pushToast(`已将配置应用到 ${dwellerIds.length} 名居民`);
  };

  const run =
    (label: string, op: (s: SaveData, ids: readonly number[]) => SaveData) => (): void => {
      let affected = 0;
      applyEdit((s) => {
        const next = op(s, scopedIds);
        affected = countAffectedDwellers(s, next, scopedIds);
        return next;
      }, label);
      pushToast(`${label}：${affected} 名居民`);
    };

  const runMaxEverything = (): void => {
    if (!gameData) return;
    const resourceCaps = computeResourceCaps(save, gameData.roomCapacity);
    const mrHandyHealth = gameData.roomCapacity.base.mrHandyHealth;
    applyEdit(
      (s) =>
        maxEverything(s, {
          resourceCaps,
          mrHandyHealth,
          roomMaxLevel: (type) => gameData.roomMetadataByType.get(type)?.maxLevel ?? 3,
          ...(endBonusFor ? { enduranceBonusFor: endBonusFor } : {}),
        }),
      '一键全满',
    );
    pushToast('已应用一键全满');
  };

  // Vault / room bulk actions consolidated here (also surfaced inline in their own tabs). Each
  // is one undo step + a toast; counts drive the labels + disabled state so nothing's ambiguous.
  const rooms = save.vault?.rooms ?? [];
  const damagedCount = rooms.filter(
    (r) => r.broken === true || (r.roomHealth?.damageValue ?? 0) > 0,
  ).length;
  const rocksCount = save.vault?.rocks?.length ?? 0;
  const emergencyCount = roomsInEmergency(save).length;
  const waitingCount = save.dwellerSpawner?.dwellersWaiting?.length ?? 0;
  const themesTotal = save.survivalW?.collectedThemes?.themeList?.length ?? 0;
  const themesCollected =
    save.survivalW?.collectedThemes?.themeList?.filter(
      (t) => t.extraData?.partsCollectedCount === 9,
    ).length ?? 0;
  const recipesUnlocked = new Set(save.survivalW?.recipes ?? []).size;
  const recipesTotal = gameData?.unlockables.recipes.length ?? 0;
  const roomsUnlocked = save.unlockableMgr?.claimed?.length ?? 0;
  const roomsTotal = gameData?.unlockables.roomUnlocks.length ?? 0;

  const repairAllRooms_ = (): void => {
    applyEdit((s) => repairAllRooms(s), '修复全部房间');
    pushToast(`已修复 ${damagedCount} 个房间`);
  };
  const removeAllRocks = (): void => {
    applyEdit((s) => removeRocks(s), '移除岩石');
    pushToast(`已移除 ${rocksCount} 块岩石`);
  };
  const clearAllEmergencies = (): void => {
    applyEdit((s) => clearEmergencies(s), '解除全部事故');
    pushToast(`已解除 ${emergencyCount} 起事故`);
  };
  const acceptAllWaiting = (): void => {
    applyEdit((s) => acceptWaiting(s), '接收等待中的居民');
    pushToast(`已接收 ${waitingCount} 名等待中的居民`);
  };
  const unlockAllThemes = (): void => {
    applyEdit((s) => unlockThemes(s), '解锁全部主题');
    pushToast('已解锁全部主题');
  };
  const unlockAllRecipes = (): void => {
    if (!gameData) return;
    const ids = gameData.unlockables.recipes;
    applyEdit((s) => unlockRecipes(s, ids), '解锁全部配方');
    pushToast(`已解锁 ${ids.length} 个配方`);
  };
  const unlockAllRooms = (): void => {
    if (!gameData) return;
    const ids = gameData.unlockables.roomUnlocks;
    applyEdit((s) => unlockRooms(s, ids), '解锁全部房间');
    pushToast('已解锁全部房间');
  };

  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="text-lg font-semibold">批量操作</h2>
      <p className="mt-1 text-sm text-neutral-400">
        所有面向整个避难所的操作，按类别分组。针对所选居民的操作位于“居民”表格中；房间操作也会内嵌在“房间”页签中提供。
      </p>

      {/* Max Everything */}
      <section className="mt-5 rounded-lg border border-amber-700/60 bg-amber-950/20 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-amber-300">一键全满</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-400">
              {MAX_EVERYTHING_TOOLTIP}
            </p>
          </div>
          <button
            type="button"
            onClick={runMaxEverything}
            disabled={!gameData}
            title={gameData ? MAX_EVERYTHING_TOOLTIP : '正在加载游戏数据…'}
            className="shrink-0 rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-400 disabled:opacity-40"
          >
            一键全满
          </button>
        </div>
        {gameDataStatus === 'error' && (
          <p className="mt-2 text-xs text-amber-500">
            游戏数据不可用——无法计算资源上限与房间最高等级。
          </p>
        )}
      </section>

      {/* Dweller presets */}
      <section className="mt-6">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">居民预设</h3>
          <span className="text-xs text-neutral-400">作用于全部 {scopedIds.length} 名居民</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={run('SPECIAL 全满', maxSpecialAll)}>
            SPECIAL 全满
          </button>
          <button type="button" className={BTN} onClick={run('幸福度全满', maxHappinessAll)}>
            幸福度全满
          </button>
          <button type="button" className={BTN} onClick={run('已治疗并清除辐射', healAll)}>
            治疗并清除辐射
          </button>
          <button type="button" className={BTN} onClick={run('生命值已拉满', maxHpAll)}>
            生命值全满 (644)
          </button>
          <button type="button" className={BTN} onClick={run('已复活', reviveAll)}>
            复活死亡居民
          </button>
          <button type="button" className={BTN} onClick={run('已变为传说', makeLegendaryAll)}>
            变为传说
          </button>
          <button
            type="button"
            className={BTN}
            onClick={run('已设为怀孕中', (s, ids) => setPregnantAll(s, ids, true))}
          >
            设为怀孕
          </button>
          <button
            type="button"
            className={BTN}
            onClick={run('婴儿已就绪', (s, ids) => setBabyReadyAll(s, ids, true))}
          >
            婴儿即将出生
          </button>
          <button
            type="button"
            className={BTN}
            disabled={waitingCount === 0}
            onClick={acceptAllWaiting}
            title={
              waitingCount === 0 ? '没有居民在大门等待' : `接收 ${waitingCount} 名等待中的居民`
            }
          >
            接收等待居民{waitingCount > 0 ? `（${waitingCount}）` : ''}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-neutral-400">
            等级
            <input
              type="number"
              min={1}
              max={50}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              aria-label="批量设置等级数值"
              className="w-16 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
            />
          </label>
          <button
            type="button"
            className={BTN}
            onClick={() => {
              let affected = 0;
              applyEdit((s) => {
                const next = setLevelAll(s, scopedIds, level, endBonusFor);
                affected = countAffectedDwellers(s, next, scopedIds);
                return next;
              }, `设置等级 ${level}`);
              pushToast(`设置等级 ${level}：${affected} 名居民`);
            }}
          >
            设置等级
          </button>
        </div>
      </section>

      {/* Rooms */}
      <section className="mt-8">
        <h3 className="text-base font-semibold">房间</h3>
        <p className="mt-1 text-xs text-neutral-400">
          面向整个避难所的房间修复——也可在“房间”页签中直接使用。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={BTN}
            disabled={damagedCount === 0}
            onClick={repairAllRooms_}
            title={
              damagedCount === 0
                ? '没有受损的房间'
                : `将全部 ${damagedCount} 个受损房间的累计事故（灼烧）损伤清零。` +
                  `这类损伤在存档游戏中仅为外观问题，不会影响生产；` +
                  `主要用于修复在事故进行中截取的存档。`
            }
          >
            全部修复{damagedCount > 0 ? `（${damagedCount}）` : ''}
          </button>
          <button
            type="button"
            className={BTN}
            disabled={rocksCount === 0}
            onClick={removeAllRocks}
            title={rocksCount === 0 ? '没有可移除的岩石' : `移除 ${rocksCount} 块岩石`}
          >
            移除岩石{rocksCount > 0 ? `（${rocksCount}）` : ''}
          </button>
          <button
            type="button"
            className={BTN}
            disabled={emergencyCount === 0}
            onClick={clearAllEmergencies}
            title={emergencyCount === 0 ? '没有进行中的事故' : `解除 ${emergencyCount} 起事故`}
          >
            解除事故{emergencyCount > 0 ? `（${emergencyCount}）` : ''}
          </button>
        </div>
      </section>

      {/* Unlocks */}
      <section className="mt-8">
        <h3 className="text-base font-semibold">解锁</h3>
        <p className="mt-1 text-xs text-neutral-400">一次编辑领取全部主题、配方和可建造房间。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={BTN}
            disabled={themesTotal === 0 || themesCollected >= themesTotal}
            onClick={unlockAllThemes}
            title={
              themesTotal === 0
                ? '尚未拥有任何主题'
                : `已收集主题 ${themesCollected} / ${themesTotal}`
            }
          >
            解锁全部主题{themesTotal > 0 ? `（${themesCollected} / ${themesTotal}）` : ''}
          </button>
          <button
            type="button"
            className={BTN}
            disabled={recipesTotal === 0 || recipesUnlocked >= recipesTotal}
            onClick={unlockAllRecipes}
            title={
              recipesTotal === 0
                ? '正在加载游戏数据…'
                : `已解锁配方 ${recipesUnlocked} / ${recipesTotal}`
            }
          >
            解锁全部配方{recipesTotal > 0 ? `（${recipesUnlocked} / ${recipesTotal}）` : ''}
          </button>
          <button
            type="button"
            className={BTN}
            disabled={roomsTotal === 0 || roomsUnlocked >= roomsTotal}
            onClick={unlockAllRooms}
            title={
              roomsTotal === 0 ? '正在加载游戏数据…' : `已解锁房间 ${roomsUnlocked} / ${roomsTotal}`
            }
          >
            解锁全部房间{roomsTotal > 0 ? `（${roomsUnlocked} / ${roomsTotal}）` : ''}
          </button>
        </div>
      </section>

      {/* Location loadouts */}
      <section ref={loadoutsRef} id="location-loadouts" className="mt-8 scroll-mt-4">
        <h3 className="text-base font-semibold">场所装备配置</h3>
        <p className="mt-1 text-xs text-neutral-400">
          为每种房间内的居民装备一套默认服装 + 武器（可选宠物）。默认值为该房间 SPECIAL
          对应的最强服装与伤害最高的武器——可在每行单独修改。直接按 ID 装备（不消耗仓库物品）。
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          与“房间”页签中每个房间的 <span className="text-neutral-300">应用配置</span> 按钮是同一功能
          ——那是将推荐默认值应用到单个房间；这里则可按房间类型调整后应用到全部。
        </p>
        <LoadoutPanel
          rows={loadoutRows}
          outfits={gameData?.outfits ?? []}
          weapons={gameData?.weapons ?? []}
          pets={gameData?.pets ?? []}
          enums={gameData?.enums}
          onApply={applyRoomLoadout}
        />
      </section>
    </div>
  );
}
