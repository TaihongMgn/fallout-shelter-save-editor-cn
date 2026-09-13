import type { ColumnDef, Row } from '@tanstack/react-table';
import type { DwellerRow, SpecialValues } from '../../../../domain/selectors/dwellerSelectors.ts';
import type { Special } from '../../../../domain/gamedata/schemas.ts';
import { weaponAvgDamage } from '../../../../domain/gamedata/itemStats.ts';
import { StatBadge } from '../../dwellers/StatBadge.tsx';
import { DwellerThumbnailCell, HealthCell } from '../../dwellers/dwellerCells.tsx';
import { ItemIcon } from '../../ItemIcon.tsx';
import { inSelectedSet, prettyBonus, rarityLabel } from '../columnKit.tsx';
import type { TableSchema } from '../tableSchema.ts';

// Source-of-truth schema for the DWELLER roster. The full data column set;
// every dweller table (the roster, the equip-on-dwellers chooser, the pet-assign picker)
// renders this schema and picks a preset. The leading select checkbox + any picker-specific
// columns (a "current slot" column) are supplied per location. `onRevive` is optional: the
// roster wires the inline Revive button into the Health cell; pickers omit it (plain hp).

export interface DwellerSchemaHandlers {
  onRevive?: (serializeId: number) => void;
}

const SPECIAL_KEYS = ['S', 'P', 'E', 'C', 'I', 'A', 'L'] as const;

/** Hideable/reorderable columns (everything except picker-supplied select/current). */
const HIDEABLE_DWELLER_COLUMNS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'thumbnail', label: '头像' },
  { id: 'name', label: '名称' },
  { id: 'weapon', label: '武器' },
  { id: 'outfit', label: '服装' },
  { id: 'pet', label: '宠物' },
  { id: 'level', label: '等级' },
  { id: 's', label: '力量' },
  { id: 'p', label: '感知' },
  { id: 'e', label: '耐力' },
  { id: 'c', label: '魅力' },
  { id: 'i', label: '智力' },
  { id: 'a', label: '敏捷' },
  { id: 'l', label: '幸运' },
  { id: 'happiness', label: '幸福度' },
  { id: 'health', label: '生命值' },
  { id: 'rarity', label: '稀有度' },
  { id: 'gender', label: '性别' },
  { id: 'pregnant', label: '怀孕中' },
  { id: 'babyReady', label: '婴儿即将出生' },
  { id: 'assignment', label: '岗位' },
];

const GENDER_LABEL: Record<number, string> = { 1: '女', 2: '男' };

/** ERoomType → display name, mirroring the already-localized gamedata room-metadata names
 *  (vault rooms only; unmapped labels pass through). */
const ROOM_TYPE_LABELS: Record<string, string> = {
  Armory: '军械库',
  Bar: '休息室',
  BarberShop: '理发店',
  Cafeteria: '餐厅',
  Casino: '游戏室',
  Classroom: '教室',
  DecorationFactory: '装饰工坊',
  DesignFactory: '主题工坊',
  Dojo: '运动室',
  Elevator: '电梯',
  Energy2: '核反应堆',
  Entrance: '入口',
  Geothermal: '发电机组',
  Gym: '举重室',
  Hydroponic: '水培园',
  LivingQuarters: '居住舱',
  MedBay: '医务室',
  NukaCola: '核子可乐装瓶厂',
  OutfitFactory: '服装工坊',
  Overseer: '监管人办公室',
  Radio: '广播室',
  ScienceLab: '科学实验室',
  Storage: '仓库',
  SuperRoom2: '健身房',
  UltraciteMining: '超镭矿场',
  UltraciteWeaponFactory: '超镭武器工坊',
  Water2: '净水厂',
  WaterPlant: '净水站',
  WeaponFactory: '武器工坊',
};

/** Roster weapon avg damage for sorting; missing/unknown sorts lowest. */
function rowWeaponAvg(row: Row<DwellerRow>): number {
  const w = row.original.weapon;
  if (!w || w.damageMin == null || w.damageMax == null) return -1;
  return weaponAvgDamage({ damageMin: w.damageMin, damageMax: w.damageMax });
}

function summarizeOutfitSpecial(special: Special | null): string {
  if (!special) return '';
  return SPECIAL_KEYS.filter((k) => special[k] > 0)
    .map((k) => `+${special[k]} ${k}`)
    .join(' ');
}

export function dwellerSchema({ onRevive }: DwellerSchemaHandlers = {}): TableSchema<DwellerRow> {
  const statColumn = (
    id: (typeof SPECIAL_KEYS)[number],
    header: string,
  ): ColumnDef<DwellerRow> => ({
    id: id.toLowerCase(),
    accessorFn: (d) => d.special[id as keyof SpecialValues],
    header,
    cell: ({ getValue }) => <StatBadge value={getValue<number>()} />,
    size: 44,
    filterFn: 'inNumberRange',
    meta: { filterVariant: 'range' },
  });

  // Yes/No flag column: the accessor yields the literal "Yes"/"No" so the select filter
  // facets cleanly (like Gender), while the cell shows "Yes" or a muted dash.
  const boolColumn = (
    id: string,
    get: (d: DwellerRow) => boolean,
    header: string,
  ): ColumnDef<DwellerRow> => ({
    id,
    accessorFn: (d) => (get(d) ? '是' : '否'),
    header,
    cell: ({ getValue }) =>
      getValue<string>() === '是' ? (
        <span className="text-amber-300">是</span>
      ) : (
        <span className="text-neutral-400">–</span>
      ),
    size: 96,
    filterFn: inSelectedSet<DwellerRow>(),
    meta: { filterVariant: 'select', headerLabel: header },
  });

  return {
    name: 'dweller',
    hideable: HIDEABLE_DWELLER_COLUMNS,
    columns: [
      {
        id: 'thumbnail',
        header: '',
        cell: ({ row }) => <DwellerThumbnailCell serializeId={row.original.serializeId} />,
        size: 56,
        enableSorting: false,
        enableColumnFilter: false,
      },
      {
        id: 'name',
        accessorFn: (d) => (d.lastName ? `${d.name} ${d.lastName}` : d.name),
        header: '名称',
        // Full name on hover (finding 4): the column truncates in compact/narrow layouts.
        cell: ({ getValue }) => {
          const name = getValue<string>();
          return <span title={name}>{name}</span>;
        },
        size: 160,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '名称' },
      },
      {
        id: 'weapon',
        accessorFn: (d) => d.weapon?.name ?? '',
        header: '武器',
        // Display + text-filter by name, but SORT by avg damage so the column ranks weapons
        // by strength (shared weaponAvgDamage).
        sortingFn: (a, b) => rowWeaponAvg(a) - rowWeaponAvg(b),
        cell: ({ row }) => {
          const w = row.original.weapon;
          if (!w) return <span className="text-neutral-400">–</span>;
          const dmg =
            w.damageMin != null && w.damageMax != null ? ` (${w.damageMin}–${w.damageMax})` : '';
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <ItemIcon type="weapons" id={w.id} />
              <span className="truncate" title={`${w.name}${dmg}`}>
                {w.name}
                <span className="text-neutral-400">{dmg}</span>
              </span>
            </span>
          );
        },
        size: 168,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '武器' },
      },
      {
        id: 'outfit',
        accessorFn: (d) => d.outfit?.name ?? '',
        header: '服装',
        cell: ({ row }) => {
          const o = row.original.outfit;
          if (!o) return <span className="text-neutral-400">–</span>;
          const bonus = summarizeOutfitSpecial(o.special);
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <ItemIcon type="outfits" id={o.id} />
              <span className="truncate" title={bonus ? `${o.name} ${bonus}` : o.name}>
                {o.name}
                {bonus && <span className="text-neutral-400"> {bonus}</span>}
              </span>
            </span>
          );
        },
        size: 176,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '服装' },
      },
      {
        id: 'pet',
        accessorFn: (d) => d.pet?.breed ?? '',
        header: '宠物',
        cell: ({ row }) => {
          const p = row.original.pet;
          if (!p) return <span className="text-neutral-400">–</span>;
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <ItemIcon type="pets" id={p.id} />
              <span
                className="truncate"
                title={
                  p.bonus
                    ? `${p.uniqueName ?? p.breed} · ${prettyBonus(p.bonus)}`
                    : (p.uniqueName ?? p.breed)
                }
              >
                {p.uniqueName ?? p.breed}
                {p.bonus && <span className="text-neutral-400"> · {prettyBonus(p.bonus)}</span>}
              </span>
            </span>
          );
        },
        size: 150,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '宠物' },
      },
      {
        id: 'level',
        accessorFn: (d) => d.level,
        header: '等级',
        cell: ({ getValue }) => getValue<number | null>() ?? '–',
        size: 72,
        filterFn: 'inNumberRange',
        meta: { filterVariant: 'range', headerLabel: '等级' },
      },
      statColumn('S', 'S'),
      statColumn('P', 'P'),
      statColumn('E', 'E'),
      statColumn('C', 'C'),
      statColumn('I', 'I'),
      statColumn('A', 'A'),
      statColumn('L', 'L'),
      {
        id: 'happiness',
        accessorFn: (d) => d.happiness,
        header: '幸福',
        cell: ({ getValue }) => getValue<number | null>() ?? '–',
        size: 90,
        filterFn: 'inNumberRange',
        meta: { filterVariant: 'range', headerLabel: '幸福度' },
      },
      {
        id: 'health',
        accessorFn: (d) => d.health,
        header: '生命值',
        cell: ({ row }) =>
          onRevive ? (
            <HealthCell row={row} onRevive={onRevive} />
          ) : (
            <span className="tabular-nums">
              {row.original.health ?? '–'}
              {row.original.maxHealth != null ? ` / ${row.original.maxHealth}` : ''}
            </span>
          ),
        size: 132,
        filterFn: 'inNumberRange',
        meta: { filterVariant: 'range', headerLabel: '生命值' },
      },
      {
        id: 'rarity',
        accessorFn: (d) => (d.rarity ? rarityLabel(d.rarity) : ''),
        header: '稀有度',
        cell: ({ getValue }) => getValue<string>() || '–',
        size: 104,
        filterFn: inSelectedSet<DwellerRow>(),
        meta: { filterVariant: 'select', headerLabel: '稀有度' },
      },
      {
        id: 'gender',
        accessorFn: (d) => (d.gender != null ? (GENDER_LABEL[d.gender] ?? String(d.gender)) : '–'),
        header: '性别',
        size: 90,
        filterFn: inSelectedSet<DwellerRow>(),
        meta: { filterVariant: 'select', headerLabel: '性别' },
      },
      boolColumn('pregnant', (d) => d.pregnant, '怀孕中'),
      boolColumn('babyReady', (d) => d.babyReady, '婴儿即将出生'),
      {
        id: 'assignment',
        accessorFn: (d) => ROOM_TYPE_LABELS[d.location.label] ?? d.location.label,
        header: '岗位',
        size: 140,
        filterFn: inSelectedSet<DwellerRow>(),
        meta: { filterVariant: 'select', headerLabel: '岗位' },
      },
    ],
  };
}
