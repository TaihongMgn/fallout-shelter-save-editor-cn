import { useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { useSaveStore } from '../../state/saveStore.ts';
import { useGameData } from '../hooks/useGameData.ts';
import { pushToast } from '../../state/toastStore.ts';
import { UnifiedTable } from '../components/table/UnifiedTable.tsx';
import { actionsColumn, selectColumn, type RowAction } from '../components/table/columnKit.tsx';
import { buildCollectionRows } from '../../domain/items/collectionCatalog.ts';
import {
  collectionSchema,
  type CollectionViewRow,
} from '../components/table/schemas/collectionSchema.tsx';
import {
  addCollectionEntries,
  collectionCodes,
  removeCollectionEntries,
  setCollectionEntriesNew,
  COLLECTION_KEYS,
  type CollectionKey,
} from '../../domain/ops/collectionOps.ts';
import type { SaveData } from '../../domain/model/saveSchema.ts';

// Survival Guide (achievements catalog) section: a browsable, searchable,
// category/rarity/status-filterable editor over the in-game collection lists
// (`survivalW` weapons/outfits/dwellers/pets/breeds/junk). Follows RecipesView - the
// other survivalW editor - structurally: catalog rows from game data, per-save status
// layered on top, row/selection/bulk actions dispatched through applyEdit. Collecting
// writes "N" entries so the game shows its NEW badge (tap the item in-game to clear it,
// or use "Mark seen" here). jsdom has no layout, so tests pass `virtualized={false}`.
export function SurvivalGuideView({ virtualized = true }: { virtualized?: boolean } = {}) {
  const save = useSaveStore((s) => s.save);
  const applyEdit = useSaveStore((s) => s.applyEdit);
  const { data: gameData, status: gameDataStatus } = useGameData();

  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const rows = useMemo<CollectionViewRow[]>(() => {
    const catalog = buildCollectionRows(gameData ?? undefined);
    const codesByKey = new Map<CollectionKey, ReadonlyMap<string, boolean>>(
      COLLECTION_KEYS.map((key) => [key, save ? collectionCodes(save, key) : new Map()]),
    );
    return catalog.map((r) => {
      const isNew = codesByKey.get(r.category)?.get(r.code);
      return { ...r, status: isNew === undefined ? 'missing' : isNew ? 'new' : 'seen' };
    });
  }, [gameData, save]);

  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const selectedRows = useMemo(
    () =>
      Object.keys(rowSelection)
        .filter((key) => rowSelection[key])
        .map((key) => rowByKey.get(key))
        .filter((r): r is CollectionViewRow => r !== undefined),
    [rowSelection, rowByKey],
  );
  const clearSelection = (): void => setRowSelection({});

  /** Apply one per-category op across a mixed-category row set as a SINGLE undo step. */
  const forEachCategory = (
    target: readonly CollectionViewRow[],
    op: (s: SaveData, key: CollectionKey, codes: string[]) => SaveData,
  ): ((s: SaveData) => SaveData) => {
    const byCategory = new Map<CollectionKey, string[]>();
    for (const r of target) {
      const codes = byCategory.get(r.category) ?? [];
      codes.push(r.code);
      byCategory.set(r.category, codes);
    }
    return (s) => [...byCategory.entries()].reduce((acc, [key, codes]) => op(acc, key, codes), s);
  };

  const onCollect = (target: readonly CollectionViewRow[]): void => {
    if (target.length === 0) return;
    applyEdit(
      forEachCategory(target, (s, key, codes) => addCollectionEntries(s, key, codes)),
      `收集 ${target.length} 条指南条目`,
    );
    pushToast(`已收集 ${target.length} 条指南条目。`);
    clearSelection();
  };

  const onRemove = (target: readonly CollectionViewRow[]): void => {
    if (target.length === 0) return;
    applyEdit(forEachCategory(target, removeCollectionEntries), `移除 ${target.length} 条指南条目`);
    pushToast(`已移除 ${target.length} 条指南条目。`);
    clearSelection();
  };

  const onSetNew = (target: readonly CollectionViewRow[], isNew: boolean): void => {
    if (target.length === 0) return;
    const label = isNew ? '新' : '已读';
    applyEdit(
      forEachCategory(target, (s, key, codes) => setCollectionEntriesNew(s, key, codes, isNew)),
      `将 ${target.length} 条指南条目标记为${label}`,
    );
    pushToast(`已将 ${target.length} 条指南条目标记为${label}。`);
    clearSelection();
  };

  // Header bulk actions (no selection needed), each ONE applyEdit = one undo step.
  const missingRows = useMemo(() => rows.filter((r) => r.status === 'missing'), [rows]);
  const newRows = useMemo(() => rows.filter((r) => r.status === 'new'), [rows]);
  const collectedCount = rows.length - missingRows.length;

  const schema = useMemo(() => collectionSchema(), []);
  const leading = useMemo(() => [selectColumn<CollectionViewRow>((r) => r.name)], []);

  const trailing = useMemo<ColumnDef<CollectionViewRow>[]>(() => {
    const actions: RowAction<CollectionViewRow>[] = [
      {
        text: '收集',
        tone: 'emerald',
        ariaLabel: (r) => `收集 ${r.name}`,
        hidden: (r) => r.status !== 'missing',
        disabled: () => !save,
        onClick: (r) => onCollect([r]),
      },
      {
        text: '标记已读',
        tone: 'sky',
        ariaLabel: (r) => `将 ${r.name} 标记为已读`,
        hidden: (r) => r.status !== 'new',
        disabled: () => !save,
        onClick: (r) => onSetNew([r], false),
      },
      {
        text: '标记为新',
        tone: 'sky',
        ariaLabel: (r) => `将 ${r.name} 标记为新`,
        hidden: (r) => r.status !== 'seen',
        disabled: () => !save,
        onClick: (r) => onSetNew([r], true),
      },
      {
        text: '移除',
        tone: 'red',
        ariaLabel: (r) => `从指南中移除 ${r.name}`,
        hidden: (r) => r.status === 'missing',
        disabled: () => !save,
        onClick: (r) => onRemove([r]),
      },
    ];
    return [actionsColumn(actions, { size: 190 })];
    // The action callbacks close over the current `save`; rebuild when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  const renderToolbar = ({ columnsMenu }: { columnsMenu: ReactNode }): ReactNode => (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="搜索指南…"
        aria-label="搜索生存指南"
        className="w-64 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 placeholder-neutral-500"
      />
      {selectedRows.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCollect(selectedRows.filter((r) => r.status === 'missing'))}
            className="rounded border border-emerald-700 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-900/40"
          >
            收集（{selectedRows.filter((r) => r.status === 'missing').length}）
          </button>
          <button
            type="button"
            onClick={() =>
              onSetNew(
                selectedRows.filter((r) => r.status === 'new'),
                false,
              )
            }
            className="rounded border border-sky-700 px-3 py-1 text-xs text-sky-300 hover:bg-sky-900/40"
          >
            标记已读（{selectedRows.filter((r) => r.status === 'new').length}）
          </button>
          <button
            type="button"
            onClick={() => onRemove(selectedRows.filter((r) => r.status !== 'missing'))}
            className="rounded border border-red-800 px-3 py-1 text-xs text-red-300 hover:bg-red-900/40"
          >
            移除（{selectedRows.filter((r) => r.status !== 'missing').length}）
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded px-2 py-1 text-xs text-neutral-400 hover:text-neutral-100"
          >
            清空
          </button>
        </div>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!save || missingRows.length === 0}
          onClick={() => onCollect(missingRows)}
          title={
            missingRows.length === 0
              ? '所有指南条目均已收集'
              : `收集全部 ${missingRows.length} 个未收集的指南条目`
          }
          className="rounded border border-emerald-700 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          全部收集{missingRows.length > 0 ? `（${missingRows.length}）` : ''}
        </button>
        <button
          type="button"
          disabled={!save || newRows.length === 0}
          onClick={() => onSetNew(newRows, false)}
          title={
            newRows.length === 0
              ? '没有条目带有 NEW 标记'
              : `清除全部 ${newRows.length} 个未见条目的 NEW 标记`
          }
          className="rounded border border-sky-700 px-3 py-1 text-xs text-sky-300 hover:bg-sky-900/40 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          全部标记已读{newRows.length > 0 ? `（${newRows.length}）` : ''}
        </button>
        {columnsMenu}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">生存指南</h2>
        <span className="text-sm text-neutral-400">
          已收集 {collectedCount}/{rows.length}
        </span>
        {gameDataStatus === 'loading' && (
          <span className="text-xs text-neutral-400">游戏数据加载中…</span>
        )}
        {gameDataStatus === 'error' && (
          <span className="text-xs text-amber-500">游戏数据不可用</span>
        )}
      </div>

      <UnifiedTable<CollectionViewRow>
        className="mt-3 min-h-0 flex-1"
        virtualized={virtualized}
        schema={schema}
        persistKey="survival-guide"
        leading={leading}
        trailing={trailing}
        data={rows}
        getRowId={(r) => r.key}
        toolbar={renderToolbar}
        initialSorting={[{ id: 'name', desc: false }]}
        enableGlobalFilter
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        emptyState="没有符合搜索条件的指南条目。"
      />
    </div>
  );
}
