import { useMemo, useState } from 'react';
import type { GameEnums, Outfit, Pet, Weapon } from '../../../domain/gamedata/schemas.ts';
import type { LoadoutRoomType } from '../../../domain/selectors/loadoutSuggest.ts';
import { EquipPickerDialog } from '../dwellers/EquipPickerDialog.tsx';
import { outfitSchema, weaponSchema } from '../table/schemas/itemSchemas.tsx';
import { petCatalogSchema } from '../table/schemas/petCatalogSchema.tsx';

// Location-loadout panel: one row per room type the vault has. Each row shows
// the room's primary SPECIAL and pre-selects the strongest outfit for that stat, the
// best-average-damage weapon, and the pet catered to the room's job (loadoutSuggest),
// overridable via searchable stat pickers (the same EquipPickerDialog
// the dweller sheet uses, so you choose on avg-damage / Σ-SPECIAL / pet ability - not name
// alone, UX-D finding 3). Apply equips those ids onto the dwellers in those rooms (no storage
// consumption). Presentational - the parent turns the chosen ids into one applyEdit.

export interface LoadoutRow extends LoadoutRoomType {
  suggestedOutfitId: string | null;
  suggestedWeaponId: string | null;
  /** Pet catered to the room's job (crafting/training/child boost/…), max-rolled on apply. */
  suggestedPetId: string | null;
}

export interface LoadoutChoice {
  weaponId?: string;
  outfitId?: string;
  petId?: string;
}

interface LoadoutPanelProps {
  rows: LoadoutRow[];
  /** Full catalogs (not name-only) so the pickers can show + sort by stats. */
  outfits: Outfit[];
  weapons: Weapon[];
  pets: Pet[];
  enums?: GameEnums | undefined;
  onApply: (dwellerIds: number[], choice: LoadoutChoice) => void;
  /** Forwarded to the picker dialog; tests pass false since jsdom has no layout. */
  virtualized?: boolean;
}

type PickerKind = 'outfit' | 'weapon' | 'pet';

const PICKER_BTN =
  'w-full max-w-[11rem] truncate rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-left text-xs text-neutral-100 hover:border-neutral-500';

function LoadoutRowItem({
  row,
  outfits,
  weapons,
  pets,
  outfitTable,
  weaponTable,
  petTable,
  outfitName,
  weaponName,
  petName,
  onApply,
  virtualized,
}: {
  row: LoadoutRow;
  outfits: Outfit[];
  weapons: Weapon[];
  pets: Pet[];
  outfitTable: ReturnType<typeof outfitSchema>;
  weaponTable: ReturnType<typeof weaponSchema>;
  petTable: ReturnType<typeof petCatalogSchema>;
  outfitName: (id: string) => string;
  weaponName: (id: string) => string;
  petName: (id: string) => string;
  onApply: LoadoutPanelProps['onApply'];
  virtualized: boolean;
}) {
  const [outfitId, setOutfitId] = useState(row.suggestedOutfitId ?? '');
  const [weaponId, setWeaponId] = useState(row.suggestedWeaponId ?? '');
  const [petId, setPetId] = useState(row.suggestedPetId ?? '');
  const [openPicker, setOpenPicker] = useState<PickerKind | null>(null);

  const count = row.dwellerIds.length;

  return (
    <tr className="border-t border-neutral-800">
      <td className="py-2 pr-3">
        <div className="text-sm text-neutral-100">{row.name}</div>
        <div className="text-[11px] text-neutral-400">{row.primaryStat}</div>
      </td>
      <td className="py-2 pr-3">
        <button
          type="button"
          aria-label={`${row.name} 服装`}
          className={PICKER_BTN}
          title={outfitId ? outfitName(outfitId) : '选择服装'}
          onClick={() => setOpenPicker('outfit')}
        >
          {outfitId ? outfitName(outfitId) : '（无服装）'}
        </button>
      </td>
      <td className="py-2 pr-3">
        <button
          type="button"
          aria-label={`${row.name} 武器`}
          className={PICKER_BTN}
          title={weaponId ? weaponName(weaponId) : '选择武器'}
          onClick={() => setOpenPicker('weapon')}
        >
          {weaponId ? weaponName(weaponId) : '（无武器）'}
        </button>
      </td>
      <td className="py-2 pr-3">
        <button
          type="button"
          aria-label={`${row.name} 宠物`}
          className={PICKER_BTN}
          title={petId ? petName(petId) : '选择宠物'}
          onClick={() => setOpenPicker('pet')}
        >
          {petId ? petName(petId) : '（无宠物）'}
        </button>
      </td>
      <td className="py-2 text-right">
        <button
          type="button"
          disabled={count === 0}
          onClick={() =>
            onApply(row.dwellerIds, {
              ...(outfitId ? { outfitId } : {}),
              ...(weaponId ? { weaponId } : {}),
              ...(petId ? { petId } : {}),
            })
          }
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          应用 · {count}
        </button>
      </td>

      {openPicker === 'outfit' && (
        <EquipPickerDialog<Outfit>
          open
          onClose={() => setOpenPicker(null)}
          title={`${row.name}：选择服装`}
          currentSummary={outfitId ? outfitName(outfitId) : '（无服装）'}
          data={outfits}
          schema={outfitTable}
          persistKey="loadout.outfit"
          getRowId={(o) => o.id}
          equippedId={outfitId || null}
          onEquip={(id) => setOutfitId(id)}
          onReset={() => setOutfitId('')}
          resetLabel="清空服装"
          virtualized={virtualized}
        />
      )}
      {openPicker === 'weapon' && (
        <EquipPickerDialog<Weapon>
          open
          onClose={() => setOpenPicker(null)}
          title={`${row.name}：选择武器`}
          currentSummary={weaponId ? weaponName(weaponId) : '（无武器）'}
          data={weapons}
          schema={weaponTable}
          persistKey="loadout.weapon"
          getRowId={(w) => w.id}
          equippedId={weaponId || null}
          onEquip={(id) => setWeaponId(id)}
          onReset={() => setWeaponId('')}
          resetLabel="清空武器"
          virtualized={virtualized}
        />
      )}
      {openPicker === 'pet' && (
        <EquipPickerDialog<Pet>
          open
          onClose={() => setOpenPicker(null)}
          title={`${row.name}：选择宠物`}
          currentSummary={petId ? petName(petId) : '（无宠物）'}
          data={pets}
          schema={petTable}
          persistKey="loadout.pet"
          getRowId={(p) => p.id}
          equippedId={petId || null}
          onEquip={(id) => setPetId(id)}
          onReset={() => setPetId('')}
          resetLabel="无宠物"
          virtualized={virtualized}
        />
      )}
    </tr>
  );
}

export function LoadoutPanel({
  rows,
  outfits,
  weapons,
  pets,
  enums,
  onApply,
  virtualized = true,
}: LoadoutPanelProps) {
  const outfitTable = useMemo(() => outfitSchema(enums), [enums]);
  const weaponTable = useMemo(() => weaponSchema(enums), [enums]);
  const petTable = useMemo(() => petCatalogSchema(), []);

  const outfitName = useMemo(() => {
    const m = new Map(outfits.map((o) => [o.id, o.name]));
    return (id: string) => m.get(id) ?? id;
  }, [outfits]);
  const weaponName = useMemo(() => {
    const m = new Map(weapons.map((w) => [w.id, w.name]));
    return (id: string) => m.get(id) ?? id;
  }, [weapons]);
  const petName = useMemo(() => {
    const m = new Map(pets.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? id;
  }, [pets]);

  if (rows.length === 0) {
    return (
      <p className="mt-3 text-sm text-neutral-400">没有已派驻居民且具备主 SPECIAL 属性的房间。</p>
    );
  }
  return (
    <table className="mt-3 w-full max-w-3xl border-collapse text-left">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-neutral-400">
          <th className="pb-1 font-medium">房间</th>
          <th className="pb-1 font-medium">服装</th>
          <th className="pb-1 font-medium">武器</th>
          <th className="pb-1 font-medium">宠物</th>
          <th className="pb-1 text-right font-medium">居民</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <LoadoutRowItem
            key={row.type}
            row={row}
            outfits={outfits}
            weapons={weapons}
            pets={pets}
            outfitTable={outfitTable}
            weaponTable={weaponTable}
            petTable={petTable}
            outfitName={outfitName}
            weaponName={weaponName}
            petName={petName}
            onApply={onApply}
            virtualized={virtualized}
          />
        ))}
      </tbody>
    </table>
  );
}
