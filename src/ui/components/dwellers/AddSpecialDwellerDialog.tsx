import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import type { GameData } from '../../../domain/gamedata/gameData.ts';
import type { Special, UniqueDweller } from '../../../domain/gamedata/schemas.ts';
import { UnifiedTable } from '../table/UnifiedTable.tsx';
import { selectColumn } from '../table/columnKit.tsx';
import { specialDwellerSchema, type SpecialRow } from '../table/schemas/specialDwellerSchema.tsx';
import { MODAL_LARGE } from '../../lib/modalClasses.ts';

// Add special/legendary NAMED dwellers. The full catalog of unique characters in a
// searchable/sortable modal table with multi-select: tick any number of rows (row click
// toggles too), then "Add N selected" adds them all in one undo step. Mirrors the
// EquipOnDwellersDialog selection layout. Mounted only while open, so the selection
// resets each time. `virtualized` defaults true; tests pass false since jsdom has no layout.

interface AddSpecialDwellerDialogProps {
  open: boolean;
  onClose: () => void;
  catalog: Record<string, UniqueDweller>;
  gameData: GameData | null;
  onAdd: (uniqueIds: string[]) => void;
  virtualized?: boolean;
  /** Total addable: free vault slots + free door-queue places. Selecting more disables Add. */
  maxAdd?: number;
  /** Free in-vault slots; picks beyond this wait at the door. */
  vaultFree?: number;
}

const SPECIAL_LABELS = ['S', 'P', 'E', 'C', 'I', 'A', 'L'] as const;

/** Outfit SPECIAL bonus → "+3 S +2 P" (matches the roster's outfit column). */
function summarizeOutfitSpecial(special: Special | null | undefined): string {
  if (!special) return '';
  return SPECIAL_LABELS.filter((k) => special[k] > 0)
    .map((k) => `+${special[k]} ${k}`)
    .join(' ');
}

function buildRows(
  catalog: Record<string, UniqueDweller>,
  gameData: GameData | null,
): SpecialRow[] {
  const outfitName = (id: string): string => gameData?.outfitById.get(id)?.name ?? id;
  const weaponName = (id: string): string =>
    id ? (gameData?.weaponById.get(id)?.name ?? id) : '拳头';
  const weaponDamage = (id: string): string => {
    const w = id ? gameData?.weaponById.get(id) : undefined;
    return w ? `${w.damageMin}–${w.damageMax}` : '';
  };
  return Object.entries(catalog)
    .map(([uniqueId, e]) => ({
      uniqueId,
      fullName: `${e.name} ${e.lastName}`.trim() || uniqueId,
      genderLabel: e.gender === 1 ? '女' : '男',
      stats: e.stats,
      outfitId: e.outfitId,
      outfit: outfitName(e.outfitId),
      outfitBonus: summarizeOutfitSpecial(gameData?.outfitById.get(e.outfitId)?.special),
      weaponId: e.weaponId,
      weapon: weaponName(e.weaponId),
      weaponDamage: weaponDamage(e.weaponId),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function AddSpecialDwellerDialog({
  open,
  onClose,
  catalog,
  gameData,
  onAdd,
  virtualized = true,
  maxAdd,
  vaultFree,
}: AddSpecialDwellerDialogProps) {
  const rows = useMemo(() => buildRows(catalog, gameData), [catalog, gameData]);
  const schema = useMemo(() => specialDwellerSchema(), []);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const leading = useMemo<ColumnDef<SpecialRow>[]>(
    () => [selectColumn<SpecialRow>((r) => r.fullName)],
    [],
  );

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );
  const overCap = maxAdd !== undefined && selectedIds.length > maxAdd;
  const toDoorCount = vaultFree !== undefined ? Math.max(0, selectedIds.length - vaultFree) : 0;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className={`${MODAL_LARGE} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">添加特殊 / 传说居民</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-neutral-400">
                共 {rows.length}{' '}
                名具名角色。可选择任意数量（点击行或其复选框），然后一次性全部添加——每位角色都自带服装、武器、SPECIAL
                属性和外观。其余可在居民详情页中编辑。
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="关闭"
              className="rounded px-2 py-1 text-neutral-400 hover:text-neutral-100"
            >
              ✕
            </Dialog.Close>
          </div>

          <UnifiedTable<SpecialRow>
            className="mt-3 min-h-0 flex-1"
            virtualized={virtualized}
            schema={schema}
            persistKey="addSpecialDweller"
            leading={leading}
            data={rows}
            getRowId={(r) => r.uniqueId}
            enableGlobalFilter
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            initialSorting={[{ id: 'fullName', desc: false }]}
            onRowClick={(r) =>
              setRowSelection((prev) => ({ ...prev, [r.uniqueId]: !prev[r.uniqueId] }))
            }
            emptyState="名录中没有特殊角色。"
          />

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              已选 {selectedIds.length} 项
              {overCap && (
                <span className="ml-2 text-amber-400">
                  仅剩 {maxAdd} 个空位（避难所 + 大门队列）
                </span>
              )}
              {!overCap && toDoorCount > 0 && (
                <span className="ml-2 text-amber-400">
                  避难所已满——
                  {toDoorCount === selectedIds.length ? '全部居民' : `${toDoorCount} 名居民`}{' '}
                  将在大门等待
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={selectedIds.length === 0 || overCap}
                title={overCap ? `最多只能添加 ${maxAdd} 名——请先取消部分选择` : undefined}
                onClick={() => {
                  onAdd(selectedIds);
                  onClose();
                }}
                className="rounded border border-emerald-700 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                添加 {selectedIds.length} 名居民
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
