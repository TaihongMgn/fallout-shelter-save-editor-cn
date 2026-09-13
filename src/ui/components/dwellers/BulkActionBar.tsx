import { useState } from 'react';
import type { Dweller, SaveData } from '../../../domain/model/saveSchema.ts';
import { useSaveStore } from '../../../state/saveStore.ts';
import { pushToast } from '../../../state/toastStore.ts';
import { useGameData } from '../../hooks/useGameData.ts';
import { outfitEnduranceBonus } from '../../../domain/gamedata/gameData.ts';
import { removeDwellers } from '../../../domain/ops/dwellerOps.ts';
import { fieldHelp } from '../../lib/fieldHelp.ts';
import { ConfirmDialog } from '../ConfirmDialog.tsx';
import { HoverTooltip } from '../InfoTooltip.tsx';
import {
  makeLegendaryAll,
  maxHappinessAll,
  maxHpAll,
  maxSpecialAll,
  reviveAll,
  setBabyReadyAll,
  setLevelAll,
  setMaxHealthAll,
  setPregnantAll,
  setRadiationAll,
} from '../../../domain/ops/bulkOps.ts';

// Contextual bulk action bar for multi-selected dwellers. Each
// action is ONE applyEdit over the selected `serializeId`s, so the whole batch is a
// single undo step. Scope = the current selection; "select all" selects the
// currently filtered rows, which covers the all/filtered scopes.
// Pregnancy ops are female-gated inside bulkOps.

const BTN =
  'rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800';

export function BulkActionBar({
  selectedIds,
  onClear,
}: {
  selectedIds: number[];
  onClear: () => void;
}) {
  const applyEdit = useSaveStore((s) => s.applyEdit);
  const { data: gameData } = useGameData();
  const [level, setLevel] = useState(50);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Destructive, so it confirms first. One applyEdit = one undo step; the op scrubs
  // room rosters, training slots, partner/child entries and wasteland teams with the ids.
  const removeSelected = (): void => {
    const count = selectedIds.length;
    applyEdit((s) => removeDwellers(s, selectedIds), `移除 ${count} 名居民`);
    setConfirmRemove(false);
    onClear();
    pushToast(`已移除 ${count} 名居民。`, 'success');
  };

  const run = (op: (save: SaveData, ids: readonly number[]) => SaveData, label: string) => () =>
    applyEdit((s) => op(s, selectedIds), label);

  // HP scaling on Set Level uses each dweller's base Endurance + equipped-outfit bonus.
  const endBonusFor = gameData
    ? (d: Dweller) => outfitEnduranceBonus(gameData, d.equipedOutfit?.id)
    : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900/70 px-3 py-2">
      <span className="text-sm font-medium text-amber-400">已选择 {selectedIds.length} 名</span>
      <span className="mx-1 h-4 w-px bg-neutral-700" />

      <button type="button" className={BTN} onClick={run(reviveAll, '复活（所选）')}>
        复活
      </button>
      <button type="button" className={BTN} onClick={run(setMaxHealthAll, '治疗（所选）')}>
        治疗
      </button>
      <button type="button" className={BTN} onClick={run(maxHpAll, '最大生命值（所选）')}>
        最大生命值
      </button>
      <button type="button" className={BTN} onClick={run(setRadiationAll, '治疗辐射（所选）')}>
        治辐射
      </button>
      <button type="button" className={BTN} onClick={run(maxSpecialAll, 'SPECIAL 全满（所选）')}>
        SPECIAL 全满
      </button>
      <button type="button" className={BTN} onClick={run(maxHappinessAll, '幸福度全满（所选）')}>
        幸福度全满
      </button>
      <button type="button" className={BTN} onClick={run(makeLegendaryAll, '升为传说（所选）')}>
        升为传说
      </button>

      <span className="mx-1 h-4 w-px bg-neutral-700" />
      <label className="flex items-center gap-1 text-xs text-neutral-400">
        等级
        <input
          type="number"
          min={1}
          max={50}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
          aria-label="批量等级值"
          className="w-14 rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-neutral-100"
        />
      </label>
      <button
        type="button"
        className={BTN}
        onClick={() =>
          applyEdit(
            (s) => setLevelAll(s, selectedIds, level, endBonusFor),
            `设置等级为 ${level}（所选）`,
          )
        }
      >
        设置等级
      </button>

      <span className="mx-1 h-4 w-px bg-neutral-700" />
      <button
        type="button"
        className={BTN}
        onClick={() => applyEdit((s) => setPregnantAll(s, selectedIds, true), '设为怀孕（所选）')}
      >
        怀孕
      </button>
      <button
        type="button"
        className={BTN}
        onClick={() =>
          applyEdit((s) => setBabyReadyAll(s, selectedIds, true), '设为婴儿即将出生（所选）')
        }
      >
        婴儿即将出生
      </button>

      <span className="mx-1 h-4 w-px bg-neutral-700" />
      <HoverTooltip text={fieldHelp.removeDweller}>
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          className="rounded border border-red-700 px-2 py-1 text-xs text-red-300 hover:bg-red-900/40"
        >
          移除（{selectedIds.length}）
        </button>
      </HoverTooltip>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto rounded px-2 py-1 text-xs text-neutral-400 hover:text-neutral-100"
      >
        取消选择
      </button>

      <ConfirmDialog
        open={confirmRemove}
        title="移除所选居民"
        message={
          <>
            确定从存档中移除 {selectedIds.length}{' '}
            名居民？他们携带的装备将一并移除，并会从所在房间和探索队伍中离开。编辑器打开期间你可以撤销此操作。
          </>
        }
        confirmLabel={`移除 ${selectedIds.length} 名居民`}
        destructive
        onConfirm={removeSelected}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
