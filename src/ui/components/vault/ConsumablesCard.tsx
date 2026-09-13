import { NumberField } from '../forms/NumberField.tsx';
import { CONSUMABLE_CODES } from '../../../domain/ops/vaultOps.ts';
import { VaultCard } from './VaultCard.tsx';
import { InfoTooltip } from '../InfoTooltip.tsx';
import { fieldHelp } from '../../lib/fieldHelp.ts';

// Consumables card: lunchbox / Mr. Handy / pet-carrier counts.
// Editing rebuilds vault.LunchBoxesByType + LunchBoxesCount (vaultOps). The Starter Pack
// controls (offer toggle + unopened-pack count) live here too, directly below the counts:
// unopened packs are just another consumable in the same queue (LunchBoxesByType code 3),
// so they belong with the rest rather than in a separate card.

const CONSUMABLES: ReadonlyArray<{ code: number; label: string }> = [
  { code: CONSUMABLE_CODES.Lunchbox, label: '午餐盒' },
  { code: CONSUMABLE_CODES.MrHandy, label: '巧手先生' },
  { code: CONSUMABLE_CODES.PetCarrier, label: '宠物箱' },
];

const MAX_CONSUMABLES = 999;

export function ConsumablesCard({
  counts,
  onSet,
  starterPackPurchased,
  onToggleStarterPack,
  starterPacksInVault,
  onSetStarterPacks,
}: {
  counts: Record<number, number>;
  onSet: (code: number, count: number) => void;
  starterPackPurchased: boolean;
  onToggleStarterPack: (purchased: boolean) => void;
  starterPacksInVault: number;
  onSetStarterPacks: (count: number) => void;
}) {
  return (
    <VaultCard title="消耗品" help={fieldHelp.consumables} description="午餐盒及其他可打开的礼包。">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CONSUMABLES.map(({ code, label }) => (
          <NumberField
            key={code}
            label={label}
            value={counts[code] ?? 0}
            min={0}
            max={MAX_CONSUMABLES}
            onCommit={(v) => onSet(code, v)}
          />
        ))}
      </div>

      {/* Starter Pack (moved here from its own card). Two distinct actions: hide the paid
          real-money offer, and stock unopened packs in the consumable queue. */}
      <div className="mt-4 border-t border-neutral-800 pt-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
          新手礼包
          <InfoTooltip text={fieldHelp.starterPack} />
        </h4>
        <p className="mt-0.5 text-xs text-neutral-400">
          隐藏付费新手礼包的商店促销，或将未开封礼包囤入你的避难所。
        </p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-sm text-neutral-300">
            商店促销
            <span className="ml-2 text-xs text-neutral-400">
              {starterPackPurchased ? '已隐藏' : '展示中'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onToggleStarterPack(!starterPackPurchased)}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            {starterPackPurchased ? '显示促销' : '隐藏促销'}
          </button>
        </div>

        <div className="mt-3">
          <NumberField
            label="避难所内未开封礼包"
            value={starterPacksInVault}
            min={0}
            max={MAX_CONSUMABLES}
            onCommit={onSetStarterPacks}
            className="w-40"
          />
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          在游戏中打开礼包即可获得内容物（通常是一只宠物和多名特殊居民）。仅切换促销开关只会移除购买提示，不会添加任何东西。
        </p>
      </div>
    </VaultCard>
  );
}
