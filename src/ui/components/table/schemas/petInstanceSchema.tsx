import type { PetRow } from '../../../../domain/selectors/petSelectors.ts';
import { iconColumn, inSelectedSet, prettyBonus, rarityLabel } from '../columnKit.tsx';
import type { TableSchema } from '../tableSchema.ts';

// Source-of-truth schema for the OWNED PET roster - pet INSTANCES (equipped
// on dwellers + loose in storage), distinct from the breed×rarity catalog (petCatalogSchema).
// Rendered by the Pets screen and the pet-attach "Owned" tab; the leading sprite is pinned
// and non-hideable, everything else is toggleable via the Columns button.

/** Hideable/reorderable columns (everything except the fixed sprite). */
const HIDEABLE_PET_COLUMNS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'name', label: '名称' },
  { id: 'breed', label: '品种' },
  { id: 'type', label: '类型' },
  { id: 'rarity', label: '稀有度' },
  { id: 'bonus', label: '加成值' },
  { id: 'value', label: '数值' },
  { id: 'assignedTo', label: '派驻给' },
];

export function petInstanceSchema(): TableSchema<PetRow> {
  return {
    name: 'petInstance',
    hideable: HIDEABLE_PET_COLUMNS,
    columns: [
      iconColumn<PetRow>((p) => ({ type: 'pets', id: p.id })),
      {
        id: 'name',
        accessorFn: (p) => p.uniqueName || p.breed,
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
        id: 'breed',
        accessorFn: (p) => p.breed,
        header: '品种',
        size: 140,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '品种' },
      },
      {
        id: 'type',
        accessorFn: (p) => p.type,
        header: '类型',
        size: 120,
        filterFn: inSelectedSet<PetRow>(),
        meta: { filterVariant: 'select', headerLabel: '类型' },
      },
      {
        id: 'rarity',
        accessorFn: (p) => rarityLabel(p.rarity),
        header: '稀有度',
        size: 110,
        filterFn: inSelectedSet<PetRow>(),
        meta: { filterVariant: 'select', headerLabel: '稀有度' },
      },
      {
        id: 'bonus',
        accessorFn: (p) => p.bonus,
        header: '加成值',
        cell: ({ row }) => prettyBonus(row.original.bonus),
        size: 180,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '加成值' },
      },
      {
        // Sort/filter on the rolled value; the cell also shows the legal max ("X / Y") so the
        // ceiling is obvious without opening each pet (mirrors the catalog's Bonus range).
        id: 'value',
        accessorFn: (p) => p.bonusValue,
        header: '数值',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.bonusValue}
            {row.original.bonusMax != null && (
              <span className="text-neutral-400"> / {row.original.bonusMax}</span>
            )}
          </span>
        ),
        size: 90,
        filterFn: 'inNumberRange',
        meta: { filterVariant: 'range', headerLabel: '数值' },
      },
      {
        id: 'assignedTo',
        accessorFn: (p) => p.assignedTo,
        header: '派驻给',
        size: 170,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '派驻给' },
      },
    ],
  };
}
