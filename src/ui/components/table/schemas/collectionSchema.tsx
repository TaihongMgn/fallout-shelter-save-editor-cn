import {
  COLLECTION_CATEGORY_LABELS,
  type CollectionRow,
} from '../../../../domain/items/collectionCatalog.ts';
import type { CollectionStatus } from '../../../../domain/ops/collectionOps.ts';
import { iconColumn, inSelectedSet, nameCell, rarityLabel } from '../columnKit.tsx';
import type { TableSchema } from '../tableSchema.ts';

// Source-of-truth schema for the SURVIVAL GUIDE catalog: icon · name · asset id · category
// (Weapon/Outfit/Dweller/Pet/Pet Breed/Junk) · rarity · guide status. The asset id column
// disambiguates same-named duplicates the game ships as distinct items (e.g.
// EnclaveSecurityOutfit vs EnclaveSecurityOutfit_Helmetless). Weapon/outfit/
// pet/junk rows reuse the item sprite; legendary dwellers have no item sprite and show
// a neutral chip (same fallback as theme recipes). The select column and the per-row
// Collect/Mark seen/Remove actions are supplied by SurvivalGuideView (store callbacks).

/** A catalog row enriched with the current save's guide state. */
export interface CollectionViewRow extends CollectionRow {
  /** 'missing' (not collected), 'new' (collected, NEW badge), 'seen' (collected). */
  status: CollectionStatus;
}

/** Filterable status label (also the sort key) for the status column. */
const STATUS_LABELS: Record<CollectionStatus, string> = {
  missing: '未收集',
  new: '已收集（新）',
  seen: '已收集',
};

/** Chinese category labels (glossary); falls back to the domain map, never blank. */
const CATEGORY_LABELS: Record<string, string> = {
  weapons: '武器',
  outfits: '服装',
  dwellers: '居民',
  pets: '宠物',
  breeds: '宠物品种',
  junk: '垃圾',
};

function statusCell(status: CollectionStatus) {
  if (status === 'missing') return <span className="text-neutral-500">未收集</span>;
  return (
    <span className="flex items-center gap-1.5 text-emerald-300">
      已收集
      {status === 'new' && (
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
          新
        </span>
      )}
    </span>
  );
}

export function collectionSchema(): TableSchema<CollectionViewRow> {
  return {
    name: 'collection',
    hideable: [
      { id: 'name', label: '名称' },
      { id: 'id', label: '资源 ID' },
      { id: 'category', label: '类别' },
      { id: 'rarity', label: '稀有度' },
      { id: 'status', label: '状态' },
    ],
    columns: [
      iconColumn<CollectionViewRow>(
        (r) => r.icon,
        <span
          aria-hidden="true"
          className="inline-block h-[22px] w-[22px] shrink-0 rounded-sm bg-neutral-800"
        />,
      ),
      {
        id: 'name',
        accessorFn: (r) => r.name,
        header: '名称',
        cell: ({ getValue }) => nameCell(getValue<string>()),
        size: 240,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '名称' },
      },
      {
        id: 'id',
        accessorFn: (r) => r.id,
        header: '资源 ID',
        cell: ({ getValue }) => {
          const id = getValue<string>();
          return (
            <span title={id} className="font-mono text-xs text-neutral-400">
              {id}
            </span>
          );
        },
        size: 220,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '资源 ID' },
      },
      {
        id: 'category',
        accessorFn: (r) => CATEGORY_LABELS[r.category] ?? COLLECTION_CATEGORY_LABELS[r.category],
        header: '类别',
        size: 110,
        filterFn: inSelectedSet<CollectionViewRow>(),
        meta: { filterVariant: 'select', headerLabel: '类别' },
      },
      {
        id: 'rarity',
        accessorFn: (r) => (r.rarity ? rarityLabel(r.rarity) : '–'),
        header: '稀有度',
        size: 110,
        filterFn: inSelectedSet<CollectionViewRow>(),
        meta: { filterVariant: 'select', headerLabel: '稀有度' },
      },
      {
        id: 'status',
        accessorFn: (r) => STATUS_LABELS[r.status],
        header: '状态',
        cell: ({ row }) => statusCell(row.original.status),
        size: 150,
        filterFn: inSelectedSet<CollectionViewRow>(),
        meta: { filterVariant: 'select', headerLabel: '状态' },
      },
    ],
  };
}
