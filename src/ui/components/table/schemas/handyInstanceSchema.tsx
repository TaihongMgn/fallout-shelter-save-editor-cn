import type { MrHandyRow } from '../../../../domain/ops/mrHandyOps.ts';
import { displayFloor } from '../../../../domain/rooms/layout.ts';
import { iconColumn, inSelectedSet } from '../columnKit.tsx';
import type { TableSchema } from '../tableSchema.ts';

// Source-of-truth schema for the OWNED Mr. Handy roster - robot INSTANCES in
// dwellers.actors[], distinct from the four-variant catalog (handyCatalogSchema).
// Mirrors petInstanceSchema: pinned sprite, then toggleable columns.

/** MrHandyRow enriched with catalog lookups the pure selector can't do. */
export interface HandyTableRow extends MrHandyRow {
  /** Catalog id for the icon ('mrhandy' | 'snipsnip' | 'victor' | 'curie'), or null. */
  catalogId: string | null;
  /** Display name of the variant ("Mr. Handy", "Snip Snip", …), falls back to the raw id. */
  variantName: string;
}

const HIDEABLE_HANDY_COLUMNS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'name', label: '名称' },
  { id: 'variant', label: '型号' },
  { id: 'health', label: '生命值' },
  { id: 'status', label: '状态' },
  { id: 'location', label: '位置' },
];

export function handyInstanceSchema(fullHealth: number): TableSchema<HandyTableRow> {
  return {
    name: 'handyInstance',
    hideable: HIDEABLE_HANDY_COLUMNS,
    columns: [
      iconColumn<HandyTableRow>((h) => ({ type: 'handies', id: h.catalogId ?? 'mrhandy' })),
      {
        id: 'name',
        accessorFn: (h) => h.name,
        header: '名称',
        cell: ({ getValue }) => {
          const name = getValue<string>();
          return <span title={name}>{name}</span>;
        },
        size: 160,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '名称' },
      },
      {
        id: 'variant',
        accessorFn: (h) => h.variantName,
        header: '型号',
        size: 130,
        filterFn: inSelectedSet<HandyTableRow>(),
        meta: { filterVariant: 'select', headerLabel: '型号' },
      },
      {
        id: 'health',
        accessorFn: (h) => h.health ?? 0,
        header: '生命值',
        cell: ({ row }) => {
          const h = row.original;
          if (h.dead) return <span className="text-red-400">已损毁</span>;
          if (h.health === null) return '–';
          const hurt = h.health < fullHealth;
          return (
            <span className={`tabular-nums ${hurt ? 'text-amber-300' : 'text-neutral-300'}`}>
              {Math.round(h.health)} / {fullHealth}
            </span>
          );
        },
        size: 110,
        filterFn: 'inNumberRange',
        meta: { filterVariant: 'range', headerLabel: '生命值' },
      },
      {
        id: 'status',
        accessorFn: (h) =>
          h.dead
            ? '已损毁'
            : h.inWasteland
              ? '废土探索中'
              : h.floor === null
                ? '在大门等待'
                : '已部署',
        header: '状态',
        size: 110,
        filterFn: inSelectedSet<HandyTableRow>(),
        meta: { filterVariant: 'select', headerLabel: '状态' },
      },
      {
        id: 'location',
        accessorFn: (h) =>
          h.inWasteland ? '废土' : h.floor === null ? '在大门' : `${displayFloor(h.floor)} 层`,
        header: '位置',
        cell: ({ row }) => {
          const h = row.original;
          // Both unplaced states are NORMAL (collecting out in the wasteland, or waiting
          // at the door until placed), so they render neutrally - no warning glyph.
          if (h.inWasteland) {
            return <span title="正在废土外出收集">废土</span>;
          }
          return h.floor === null ? (
            <span title="在避难所大门等待，直到你将它部署到某层">在大门</span>
          ) : (
            <span title={h.roomLabel ?? undefined}>{displayFloor(h.floor)} 层</span>
          );
        },
        size: 200,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '位置' },
      },
    ],
  };
}
