import { useCallback, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import type { GameData } from '../../../domain/gamedata/gameData.ts';
import type { Junk, Outfit, Weapon } from '../../../domain/gamedata/schemas.ts';
import type { NewPet } from '../../../domain/ops/dwellerOps.ts';
import type { StackableType } from '../../../domain/ops/storageOps.ts';
import { UnifiedTable } from '../table/UnifiedTable.tsx';
import { actionsColumn, selectColumn } from '../table/columnKit.tsx';
import type { TableSchema } from '../table/tableSchema.ts';
import { junkSchema, outfitSchema, weaponSchema } from '../table/schemas/itemSchemas.tsx';
import { CatalogCountCell, type CatalogAddItem } from '../items/CatalogTableView.tsx';
import { CreatePetForm } from './CreatePetForm.tsx';
import { useStorageCapacityGuard } from './StorageCapacityNotice.tsx';
import { useUIStore } from '../../../state/uiStore.ts';
import { pushToast } from '../../../state/toastStore.ts';
import { MODAL_LARGE } from '../../lib/modalClasses.ts';

// Add items into storage. ONE dialog for every
// grant: the full catalog of the active segment in the standardized item table with
// MULTI-select checkboxes, a per-row quantity stepper, a per-row Add button (single
// type, one click - mirrors the catalog tabs), and a rarity quick-filter (so "grant
// legendary" is just a filter, not a separate button). Adds do NOT close the dialog:
// the user grants as much as they like (per-row or bulk, with toast feedback like the
// catalog tabs) and closes manually. The capacity notice renders at the TOP, above the
// table (the standard position on every add-to-storage surface); an add that would
// exceed the vault's item capacity is blocked unless the remembered bypass is ticked.
// Pets are unique instances, so their "grant" stays the create-pet form. Mounted only
// while open, so state inits fresh each time.

/** The active segment the dialog grants into. */
export type AddSegment = StackableType | 'Pet';

interface AddItemsDialogProps {
  onClose: () => void;
  segment: AddSegment;
  gameData: GameData | null;
  allowOutOfRange: boolean;
  /** Free item slots left in storage (capacity − stored), or null while game data loads. */
  slotsFree: number | null;
  /** Grant the picked catalog items (one undoable edit at the call site). */
  onGrant: (items: CatalogAddItem[]) => void;
  onAddPet: (pet: NewPet) => void;
  virtualized?: boolean;
}

const SEGMENT_LABEL: Record<AddSegment, string> = {
  Weapon: '武器',
  Outfit: '服装',
  Junk: '垃圾',
  Pet: '宠物',
};

const RARITY_OPTIONS = ['All', 'Normal', 'Rare', 'Legendary'] as const;
type RarityFilter = (typeof RARITY_OPTIONS)[number];

/** Display labels for the rarity filter values (the logic values themselves stay English). */
const RARITY_LABELS: Record<string, string> = {
  All: '全部',
  Normal: '普通',
  Rare: '稀有',
  Legendary: '传说',
};

// Tooltip on disabled per-row Add buttons (same wording as the catalog tabs).
const ROW_ADD_BLOCKED_REASON = '仓库已达上限。勾选上方提示中的绕过复选框即可继续添加。';

interface PickerProps<T extends { id: string; name: string }> {
  data: T[];
  schema: TableSchema<T>;
  persistKey: string;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (
    updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) => void;
  countsRef: { current: Record<string, number> };
  /** Report a row's quantity change (mirrors the ref into state for footer totals). */
  onCountChange: (id: string, count: number) => void;
  /** Grant this one row (at its chosen quantity) without touching the selection. */
  onAddRow: (id: string) => void;
  /** Disable the per-row Add buttons (storage full and no bypass). */
  addDisabled: boolean;
  addDisabledReason: string;
  virtualized: boolean;
}

/** Catalog picker: standardized table + select checkboxes + qty steppers + per-row Add. */
function GrantPicker<T extends { id: string; name: string }>({
  data,
  schema,
  persistKey,
  rowSelection,
  onRowSelectionChange,
  countsRef,
  onCountChange,
  onAddRow,
  addDisabled,
  addDisabledReason,
  virtualized,
}: PickerProps<T>) {
  const leading = useMemo<ColumnDef<T>[]>(() => [selectColumn<T>((r) => r.name)], []);
  const trailing = useMemo<ColumnDef<T>[]>(
    () => [
      {
        id: 'addCount',
        header: '数量',
        cell: ({ row }) => (
          <CatalogCountCell
            initial={countsRef.current[row.original.id] ?? 1}
            onChange={(c) => onCountChange(row.original.id, c)}
          />
        ),
        size: 130,
        enableSorting: false,
        enableColumnFilter: false,
      },
      actionsColumn<T>(
        [
          {
            text: '添加',
            tone: 'emerald',
            ariaLabel: (r) => `将 ${r.name} 添加到仓库`,
            disabled: () => addDisabled,
            title: () => (addDisabled ? addDisabledReason : undefined),
            onClick: (r) => onAddRow(r.id),
          },
        ],
        { size: 80 },
      ),
    ],
    [countsRef, onCountChange, onAddRow, addDisabled, addDisabledReason],
  );

  return (
    <UnifiedTable<T>
      className="mt-3 min-h-0 flex-1"
      virtualized={virtualized}
      schema={schema}
      persistKey={persistKey}
      leading={leading}
      trailing={trailing}
      data={data}
      getRowId={(r) => r.id}
      enableGlobalFilter
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      initialSorting={[{ id: 'name', desc: false }]}
      emptyState="没有匹配的物品。"
    />
  );
}

export function AddItemsDialog({
  onClose,
  segment,
  gameData,
  allowOutOfRange,
  slotsFree,
  onGrant,
  onAddPet,
  virtualized = true,
}: AddItemsDialogProps) {
  const [rarity, setRarity] = useState<RarityFilter>('All');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // Per-row quantity to add (default 1). The REF feeds the table cells (stable identity,
  // so stepping never rebuilds the column model - see CatalogCountCell); the STATE mirror
  // drives the footer totals + capacity math during render (refs must not be read there).
  const countsRef = useRef<Record<string, number>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const onCountChange = useCallback((id: string, count: number) => {
    countsRef.current[id] = count;
    setCounts((m) => (m[id] === count ? m : { ...m, [id]: count }));
  }, []);
  const enums = gameData?.enums;

  const byRarity = <T extends { rarity: string }>(list: T[]): T[] =>
    rarity === 'All' ? list : list.filter((x) => x.rarity === rarity);

  const weapons = useMemo<Weapon[]>(
    () => byRarity(gameData?.weapons ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameData, rarity],
  );
  const outfits = useMemo<Outfit[]>(
    () => byRarity(gameData?.outfits ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameData, rarity],
  );
  const junk = useMemo<Junk[]>(
    () => byRarity(gameData?.junk ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameData, rarity],
  );

  const weaponTable = useMemo(() => weaponSchema(enums), [enums]);
  const outfitTable = useMemo(() => outfitSchema(enums), [enums]);
  const junkTable = useMemo(() => junkSchema(), []);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );
  const totalToAdd = selectedIds.reduce((n, id) => n + (counts[id] ?? 1), 0);

  // Shared capacity guardrail: the table always populates; the add is blocked past
  // capacity unless the remembered bypass checkbox is ticked (see StorageCapacityNotice).
  // Pets add exactly one instance per create; an empty item selection guards against 0.
  const wouldAdd = segment === 'Pet' ? 1 : Math.max(1, totalToAdd);
  const { blocked, notice } = useStorageCapacityGuard(slotsFree, wouldAdd);
  // Per-row Add ignores the SELECTION total (a single row can fit even when the bulk
  // selection would not), so it only hard-blocks when the vault is FULL - the same
  // guard the catalog tabs use. Partial overflow is caught at click time below.
  const bypass = useUIStore((s) => s.storageBypassCapacity);
  const rowAddBlocked = slotsFree !== null && slotsFree <= 0 && !bypass;

  // Grants do NOT close the dialog - the user keeps adding and closes manually, so
  // toasts confirm each add (same feedback as the catalog tabs' add-to-storage).
  const grantRows = useCallback(
    (rows: CatalogAddItem[]): void => {
      const total = rows.reduce((n, it) => n + it.count, 0);
      if (total === 0) return;
      if (slotsFree !== null && !bypass && total > Math.max(0, slotsFree)) {
        // Full is handled by the disabled buttons; this catches a partial overflow.
        pushToast(`仓库空间不足（剩余 ${Math.max(0, slotsFree)}）。`);
        return;
      }
      onGrant(rows);
      pushToast(`已将 ${total} 件物品添加到仓库。`);
    },
    [onGrant, slotsFree, bypass],
  );

  const grantSelected = (): void => {
    if (segment === 'Pet' || selectedIds.length === 0 || blocked) return;
    grantRows(selectedIds.map((id) => ({ id, count: counts[id] ?? 1 })));
    setRowSelection({});
  };

  const grantSingle = useCallback(
    (id: string): void => grantRows([{ id, count: countsRef.current[id] ?? 1 }]),
    [grantRows],
  );

  const slotsNote =
    slotsFree !== null && !notice ? (
      <span className="text-xs text-neutral-400">{Math.max(0, slotsFree)} 个空闲槽位</span>
    ) : null;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className={`${MODAL_LARGE} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-base font-semibold">
              添加{SEGMENT_LABEL[segment]}
            </Dialog.Title>
            <div className="flex items-center gap-3">
              {segment !== 'Pet' && (
                <label className="flex items-center gap-2 text-xs text-neutral-400">
                  稀有度
                  <select
                    value={rarity}
                    onChange={(e) => setRarity(e.target.value as RarityFilter)}
                    className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
                  >
                    {RARITY_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {RARITY_LABELS[r] ?? r}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Dialog.Close
                aria-label="关闭"
                className="rounded px-2 py-1 text-neutral-400 hover:text-neutral-100"
              >
                ✕
              </Dialog.Close>
            </div>
          </div>
          <Dialog.Description className="sr-only">
            选择要添加到仓库的物品和数量。
          </Dialog.Description>

          {notice && <div className="mt-3">{notice}</div>}

          {segment === 'Pet' ? (
            <div className="mt-4 flex flex-col gap-3">
              <CreatePetForm
                gameData={gameData}
                allowOutOfRange={allowOutOfRange}
                submitLabel="添加宠物 → 仓库"
                submitDisabled={blocked}
                onCreate={(pet) => {
                  onAddPet(pet);
                  pushToast('宠物已添加到仓库。');
                }}
              />
            </div>
          ) : (
            <>
              {segment === 'Weapon' && (
                <GrantPicker<Weapon>
                  data={weapons}
                  schema={weaponTable}
                  persistKey="addItems.weapon"
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                  countsRef={countsRef}
                  onCountChange={onCountChange}
                  onAddRow={grantSingle}
                  addDisabled={rowAddBlocked}
                  addDisabledReason={ROW_ADD_BLOCKED_REASON}
                  virtualized={virtualized}
                />
              )}
              {segment === 'Outfit' && (
                <GrantPicker<Outfit>
                  data={outfits}
                  schema={outfitTable}
                  persistKey="addItems.outfit"
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                  countsRef={countsRef}
                  onCountChange={onCountChange}
                  onAddRow={grantSingle}
                  addDisabled={rowAddBlocked}
                  addDisabledReason={ROW_ADD_BLOCKED_REASON}
                  virtualized={virtualized}
                />
              )}
              {segment === 'Junk' && (
                <GrantPicker<Junk>
                  data={junk}
                  schema={junkTable}
                  persistKey="addItems.junk"
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                  countsRef={countsRef}
                  onCountChange={onCountChange}
                  onAddRow={grantSingle}
                  addDisabled={rowAddBlocked}
                  addDisabledReason={ROW_ADD_BLOCKED_REASON}
                  virtualized={virtualized}
                />
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="text-sm text-neutral-400">
                  {selectedIds.length === 0
                    ? '请先在上方勾选物品，并在每行设置数量。'
                    : `已选择 ${totalToAdd} 件物品，共 ${selectedIds.length} 种类型`}
                </span>
                <div className="flex items-center gap-3">
                  {slotsNote}
                  <button
                    type="button"
                    disabled={selectedIds.length === 0 || blocked}
                    onClick={grantSelected}
                    className="rounded border border-emerald-700 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-40"
                  >
                    添加 {totalToAdd > 0 ? totalToAdd : ''} → 仓库
                  </button>
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
