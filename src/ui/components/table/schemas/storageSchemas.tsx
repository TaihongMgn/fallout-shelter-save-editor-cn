import type { ItemIconType } from '../../../../domain/gamedata/visualSchemas.ts';
import type { StackableType } from '../../../../domain/ops/storageOps.ts';
import { CountCell } from '../../storage/storageCells.tsx';
import { iconColumn, prettyBonus } from '../columnKit.tsx';
import type { TableSchema } from '../tableSchema.ts';

// Source-of-truth schemas for the STORAGE editor tables. Weapons/outfits/junk
// are fungible - grouped by id with an editable count (storageGroupSchema); pets are unique
// instances (storedPetSchema). The destructive Remove action is a trailing column supplied
// by the view (it needs the store op), composed via the unified table's `trailing`.

/** A grouped weapon/outfit/junk storage row (fungible, edited by count). */
export interface StorageGroupRow {
  id: string;
  name: string;
  rarity: string;
  count: number;
}

/** A single stored pet instance (unique), projected for the pets segment. */
export interface StoragePetRow {
  /** Index into `vault.inventory.items` (the remove op target). */
  index: number;
  id: string;
  name: string;
  breed: string;
  rarity: string;
  bonus: string;
  value: number;
}

/** Map a stackable storage type to its item-icon atlas group. */
const ICON_TYPE: Record<StackableType, ItemIconType> = {
  Weapon: 'weapons',
  Outfit: 'outfits',
  Junk: 'junk',
};

export function storageGroupSchema({
  type,
  onSetCount,
}: {
  type: StackableType;
  onSetCount: (id: string, count: number) => void;
}): TableSchema<StorageGroupRow> {
  const iconType = ICON_TYPE[type];
  return {
    name: 'storageGroup',
    hideable: [
      { id: 'name', label: '名称' },
      { id: 'rarity', label: '稀有度' },
      { id: 'count', label: '数量' },
    ],
    columns: [
      iconColumn<StorageGroupRow>((r) => ({ type: iconType, id: r.id })),
      { id: 'name', accessorFn: (r) => r.name, header: '名称', size: 240 },
      { id: 'rarity', accessorFn: (r) => r.rarity, header: '稀有度', size: 120 },
      {
        id: 'count',
        accessorFn: (r) => r.count,
        header: '数量',
        cell: ({ row }) => (
          <CountCell
            value={row.original.count}
            onCommit={(count) => onSetCount(row.original.id, count)}
          />
        ),
        size: 130,
        enableColumnFilter: false,
      },
    ],
  };
}

export function storedPetSchema(): TableSchema<StoragePetRow> {
  return {
    name: 'storedPet',
    hideable: [
      { id: 'name', label: '名称' },
      { id: 'breed', label: '品种' },
      { id: 'rarity', label: '稀有度' },
      { id: 'bonus', label: '加成' },
    ],
    columns: [
      iconColumn<StoragePetRow>((p) => ({ type: 'pets', id: p.id })),
      { id: 'name', accessorFn: (p) => p.name, header: '名称', size: 160 },
      { id: 'breed', accessorFn: (p) => p.breed, header: '品种', size: 140 },
      { id: 'rarity', accessorFn: (p) => p.rarity, header: '稀有度', size: 110 },
      {
        id: 'bonus',
        accessorFn: (p) => p.bonus,
        header: '加成',
        cell: ({ row }) => `${prettyBonus(row.original.bonus)} (${row.original.value})`,
        size: 220,
      },
    ],
  };
}
