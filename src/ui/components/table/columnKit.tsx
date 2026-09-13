import type { ColumnDef, FilterFn, Table } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import type { ItemIconType } from '../../../domain/gamedata/visualSchemas.ts';
import { ItemIcon } from '../ItemIcon.tsx';
import { IndeterminateCheckbox, RowSelectCheckbox } from '../dwellers/dwellerCells.tsx';
import { TableActionButton } from './tableCells.tsx';

// Shared, type-agnostic column primitives for the unified table system. Every table's
// column registry (and every location that wraps one) composes from these instead of
// re-declaring a select checkbox, a leading sprite, a status badge, or an actions cell -
// the duplication that let the per-type tables drift apart. Pure factories: each returns a
// plain `ColumnDef`; the only stateful cells (the selection checkboxes) are imported
// components. Exports are all non-components, so this file stays Fast-Refresh clean.

/** Select filter: keep rows whose (stringified) cell value is in the chosen set. */
export function inSelectedSet<T>(): FilterFn<T> {
  return (row, columnId, filterValue) => {
    if (!Array.isArray(filterValue) || filterValue.length === 0) return true;
    return (filterValue as string[]).includes(String(row.getValue(columnId)));
  };
}

/** Pet bonus-effect display names (glossary + game data EBonusEffect ids); unknown ids fall back to the humanized id. */
const BONUS_LABELS: Record<string, string> = {
  None: '无',
  AddMaxHP: '增加最大生命值',
  AttractChildren: '吸引居民',
  CapsBoost: '瓶盖加成',
  CheaperCrafting: '制作更省',
  ChildMultiplier: '儿童属性加成',
  ChildSpecialBoost: '儿童 SPECIAL 加成',
  DamageBoost: '伤害强化',
  DelayInvader: '延缓掠夺者',
  DelayPest: '延缓害虫',
  FasterAndCheaperCrafting: '制作更快更省',
  FasterCrafting: '制作更快',
  FasterPregnancy: '加快怀孕',
  FasterWastelandReturnSpeed: '加快废土返程',
  HappinessBoost: '幸福度加成',
  HealingBoost: '治疗强化',
  MysteriousMagnet: '神秘磁铁',
  ObjectiveMultiplier: '目标加成',
  Production: '产量加成',
  RadHealingBoost: '辐射治疗加成',
  Resistance: '抗性',
  Rollerbrain: '滚滚智多星',
  RushInvader: '阻止加速掠夺者',
  Save_Food: '节省食物',
  Save_Power: '节省电力',
  Save_Water: '节省水',
  Special_A: '敏捷加成',
  Special_C: '魅力加成',
  Special_E: '耐力加成',
  Special_I: '智力加成',
  Special_L: '幸运加成',
  Special_P: '感知加成',
  Special_S: '力量加成',
  TrainingBoost: '训练强化',
  TrainingNonStopBoost: '不间断训练强化',
  WastelandCapsBoost: '废土瓶盖加成',
  WastelandItemBoost: '废土物品加成',
  WastelandJunkBoost: '废土垃圾加成',
  XPBoost: '经验值加成',
};

/** Rarity display names (glossary); unmapped values pass through unchanged. */
export const RARITY_LABELS: Record<string, string> = {
  None: '无',
  Common: '常见',
  Normal: '普通',
  Rare: '稀有',
  Legendary: '传说',
};

/** Display label for a rarity enum value (Common/Normal/Rare/Legendary → 常见/普通/稀有/传说). */
export const rarityLabel = (rarity: string): string => RARITY_LABELS[rarity] ?? rarity;

/** Lightly humanize an EBonusEffect id for display (e.g. "DamageBoost" → 伤害强化). */
export const prettyBonus = (bonus: string): string =>
  BONUS_LABELS[bonus] ?? bonus.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/** A truncating text cell with the full value shown on hover. */
export function nameCell(value: string): ReactNode {
  return <span title={value}>{value}</span>;
}

/**
 * Leading multi-select checkbox column (header = select-all, cells = per-row checkbox with
 * shift-click range select). Pinned + non-hideable. `getLabel` builds each row's aria-label.
 */
export function selectColumn<T>(getLabel: (row: T) => string): ColumnDef<T> {
  return {
    id: 'select',
    header: ({ table }: { table: Table<T> }) => (
      <IndeterminateCheckbox
        label="全选"
        checked={table.getIsAllRowsSelected()}
        indeterminate={table.getIsSomeRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row, table }) => (
      <RowSelectCheckbox row={row} table={table} label={`选择 ${getLabel(row.original)}`} />
    ),
    size: 44,
    enableSorting: false,
    enableHiding: false,
    enableColumnFilter: false,
    // The row is a CSS grid, so the cell is a grid item: `m-auto` on the cell itself
    // centers the checkbox both horizontally and vertically within its grid track. (A
    // bare `m-auto` on the inline checkbox does nothing in the default block cell.)
    meta: { cellClassName: 'm-auto' },
  };
}

/**
 * Leading item-sprite column. `resolve` maps a row to its atlas group + id (or null to show
 * `fallback`, e.g. a neutral chip for theme recipes that have no item sprite).
 */
export function iconColumn<T>(
  resolve: (row: T) => { type: ItemIconType; id: string } | null,
  fallback: ReactNode = null,
): ColumnDef<T> {
  return {
    id: 'icon',
    header: '',
    cell: ({ row }) => {
      const ref = resolve(row.original);
      return ref ? <ItemIcon type={ref.type} id={ref.id} /> : fallback;
    },
    size: 44,
    enableSorting: false,
    enableColumnFilter: false,
    // Icon-only cell: drop the default `truncate` so a sprite slightly wider than its padded
    // cell doesn't paint a stray ellipsis after it.
    meta: { cellClassName: '' },
  };
}

/**
 * A leading non-interactive status badge (e.g. "Equipped" / "Selected" / "Wearing"): a
 * small pill on rows matching `predicate`, blank otherwise. Pinned + non-hideable.
 */
export function badgeColumn<T>({
  id,
  label,
  predicate,
  tone = 'amber',
  size = 96,
}: {
  id: string;
  label: string;
  predicate: (row: T) => boolean;
  tone?: 'amber' | 'emerald';
  size?: number;
}): ColumnDef<T> {
  const toneClass =
    tone === 'emerald' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300';
  return {
    id,
    header: '',
    cell: ({ row }) =>
      predicate(row.original) ? (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${toneClass}`}
        >
          {label}
        </span>
      ) : null,
    size,
    enableSorting: false,
    enableColumnFilter: false,
  };
}

/** A single per-row action descriptor consumed by {@link actionsColumn}. */
export interface RowAction<T> {
  /** Visible button text. */
  text: ReactNode;
  /** Accessible label, built per row (omit to fall back to the visible text). */
  ariaLabel?: (row: T) => string;
  tone?: 'emerald' | 'sky' | 'red' | 'neutral';
  onClick: (row: T) => void;
  /** Hide this action on a given row (e.g. junk has no "Equip…"). */
  hidden?: (row: T) => boolean;
  /** Disable this action on a given row (e.g. the storage-capacity guardrail). */
  disabled?: (row: T) => boolean;
  /** Hover tooltip, e.g. to explain a disabled action. */
  title?: (row: T) => string | undefined;
}

/**
 * Trailing actions column: a right-aligned row of {@link TableActionButton}s built from
 * `actions`. Replaces the bespoke Add/Equip…/Remove cells that each table hand-rolled.
 */
export function actionsColumn<T>(
  actions: ReadonlyArray<RowAction<T>>,
  { id = 'actions', size = 120 }: { id?: string; size?: number } = {},
): ColumnDef<T> {
  return {
    id,
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end gap-1.5">
        {actions
          .filter((a) => !a.hidden?.(row.original))
          .map((a, i) => (
            <TableActionButton
              key={i}
              {...(a.tone ? { tone: a.tone } : {})}
              {...(a.ariaLabel ? { label: a.ariaLabel(row.original) } : {})}
              {...(() => {
                const t = a.title?.(row.original);
                return t ? { title: t } : {};
              })()}
              disabled={a.disabled?.(row.original) ?? false}
              onClick={() => a.onClick(row.original)}
            >
              {a.text}
            </TableActionButton>
          ))}
      </div>
    ),
    size,
    enableSorting: false,
    enableColumnFilter: false,
  };
}
