import type { RecipeRow } from '../../../../domain/items/recipeCatalog.ts';
import { iconColumn, inSelectedSet, rarityLabel } from '../columnKit.tsx';
import type { TableSchema } from '../tableSchema.ts';

// Source-of-truth schema for the RECIPES catalog: icon · name · type
// (Weapon/Outfit/Theme) · collection status. Weapon/outfit recipes reuse the item sprite;
// theme recipes have no item sprite and show a neutral chip. The select column and the
// per-row Build/Apply actions are supplied by RecipesView (they need store callbacks).

/** A catalog row enriched with the current save's per-recipe state. */
export interface RecipeViewRow extends RecipeRow {
  /** Present in `survivalW.recipes`. */
  known: boolean;
  /** Themes only: a fully-crafted themeList entry exists. */
  built: boolean;
  /** Themes only: applied to its room type in `themeByRoomType`. */
  applied: boolean;
}

/** Recipe kind display labels (closed-loop: also the select-filter facets and sort keys). */
const KIND_LABELS: Record<string, string> = {
  Weapon: '武器',
  Outfit: '服装',
  Theme: '主题',
};

/** Coarse, filterable status label (also the sort key) for the status column. */
function recipeStatusLabel(row: RecipeViewRow): string {
  if (row.kind !== 'Theme') return row.known ? '已拥有配方' : '未拥有';
  if (row.applied) return '已应用';
  if (row.built) return '已制作';
  if (row.known) return '已拥有';
  return '未拥有';
}

/** A small on/off state pill (green when set, muted when not). */
const stateChip = (on: boolean, label: string) => (
  <span
    key={label}
    className={`rounded px-1.5 py-0.5 text-[11px] ${
      on ? 'bg-emerald-900/50 text-emerald-300' : 'bg-neutral-800 text-neutral-500'
    }`}
  >
    {label}
  </span>
);

function statusCell(row: RecipeViewRow) {
  if (row.kind === 'Theme') {
    return (
      <span className="flex flex-wrap items-center gap-1">
        {stateChip(row.known, '已拥有')}
        {stateChip(row.built, '已制作')}
        {stateChip(row.applied, '已应用')}
      </span>
    );
  }
  return row.known ? (
    <span className="text-emerald-300">已拥有配方</span>
  ) : (
    <span className="text-neutral-500">未拥有</span>
  );
}

export function recipeSchema(): TableSchema<RecipeViewRow> {
  return {
    name: 'recipe',
    hideable: [
      { id: 'name', label: '名称' },
      { id: 'kind', label: '类型' },
      { id: 'rarity', label: '稀有度' },
      { id: 'status', label: '状态' },
    ],
    columns: [
      iconColumn<RecipeViewRow>(
        (r) =>
          r.kind === 'Weapon'
            ? { type: 'weapons', id: r.id }
            : r.kind === 'Outfit'
              ? { type: 'outfits', id: r.id }
              : null,
        <span
          aria-hidden="true"
          className="inline-block h-[22px] w-[22px] shrink-0 rounded-sm bg-neutral-800"
        />,
      ),
      {
        id: 'name',
        accessorFn: (r) => r.name,
        header: '名称',
        cell: ({ getValue }) => {
          const name = getValue<string>();
          return <span title={name}>{name}</span>;
        },
        size: 240,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '名称' },
      },
      {
        id: 'kind',
        accessorFn: (r) => KIND_LABELS[r.kind] ?? r.kind,
        header: '类型',
        size: 110,
        filterFn: inSelectedSet<RecipeViewRow>(),
        meta: { filterVariant: 'select', headerLabel: '类型' },
      },
      {
        // Weapon/outfit recipes carry the item's rarity; theme recipes have none (muted dot).
        id: 'rarity',
        accessorFn: (r) => (r.rarity ? rarityLabel(r.rarity) : ''),
        header: '稀有度',
        cell: ({ getValue }) => {
          const rarity = getValue<string>();
          return rarity ? rarity : <span className="text-neutral-600">·</span>;
        },
        size: 110,
        filterFn: inSelectedSet<RecipeViewRow>(),
        meta: { filterVariant: 'select', headerLabel: '稀有度' },
      },
      {
        id: 'status',
        accessorFn: (r) => recipeStatusLabel(r),
        header: '状态',
        cell: ({ row }) => statusCell(row.original),
        size: 200,
        filterFn: inSelectedSet<RecipeViewRow>(),
        meta: { filterVariant: 'select', headerLabel: '状态' },
      },
    ],
  };
}
