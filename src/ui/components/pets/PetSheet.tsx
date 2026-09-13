import { useState } from 'react';
import type { Item } from '../../../domain/model/saveSchema.ts';
import type { GameData } from '../../../domain/gamedata/gameData.ts';
import { petBonusRange } from '../../../domain/gamedata/gameData.ts';
import type { PetEdit } from '../../../domain/ops/petOps.ts';
import type { PetLocation } from '../../../domain/selectors/petSelectors.ts';
import type { DwellerRow } from '../../../domain/selectors/dwellerSelectors.ts';
import { ItemIcon } from '../ItemIcon.tsx';
import { NumberField } from '../forms/NumberField.tsx';
import { ConfirmDialog } from '../ConfirmDialog.tsx';
import { AssignPetDialog } from './AssignPetDialog.tsx';

// Pet detail sheet, the right-hand panel of the Pets master-detail
// screen - the pet analog of the dweller CharacterSheet. Reads the LIVE instance
// resolved by PetsView (selectPetByLocation), so each edit re-renders with fresh
// values. The bonus EFFECT is locked (shown read-only); only the rolled VALUE (within
// the breed/rarity legal range, out-of-range override) and the unique NAME are editable. Footer
// actions reassign the instance (equip to a dweller / send to storage) or delete it;
// PetsView owns the applyEdit + post-op selection update.

// Chinese display labels (glossary) for data-driven pet enum values; unmapped ids fall back
// to the raw value so unknown catalog entries never blank out.
const PET_TYPE_LABEL: Record<string, string> = {
  Dog: '狗',
  Cat: '猫',
  Macaw: '金刚鹦鹉',
  FloatingDrone: '悬浮无人机',
  Store: '商店',
};

const RARITY_LABEL: Record<string, string> = {
  None: '无',
  Common: '常见',
  Normal: '普通',
  Rare: '稀有',
  Legendary: '传说',
};

const BONUS_LABEL: Record<string, string> = {
  AttractChildren: '吸引居民',
  CapsBoost: '瓶盖加成',
  ChildSpecialBoost: '儿童 SPECIAL 加成',
  DamageBoost: '伤害强化',
  FasterAndCheaperCrafting: '制作更快更省',
  HealingBoost: '治疗强化',
  Production: '产量加成',
  Rollerbrain: '滚滚智多星',
  TrainingBoost: '训练强化',
  TrainingNonStopBoost: '不间断训练强化',
  XPBoost: '经验值加成',
};

/** Lightly humanize an EBonusEffect id for display (e.g. "DamageBoost" → "Damage Boost"). */
const prettyBonus = (bonus: string): string =>
  BONUS_LABEL[bonus] ?? bonus.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

interface PetSheetProps {
  location: PetLocation;
  /** The live pet instance at `location`. */
  item: Item;
  /** Owner's display name when equipped, undefined when in storage. */
  ownerName?: string;
  gameData: GameData | null;
  allowOutOfRange: boolean;
  /** Dwellers for the "equip to dweller" picker. */
  dwellers: DwellerRow[];
  onClose: () => void;
  onEdit: (changes: PetEdit) => void;
  onAssign: (dwellerId: number) => void;
  onSendToStorage: () => void;
  onDelete: () => void;
}

export function PetSheet({
  location,
  item,
  ownerName,
  gameData,
  allowOutOfRange,
  dwellers,
  onClose,
  onEdit,
  onAssign,
  onSendToStorage,
  onDelete,
}: PetSheetProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const catalog = gameData?.petById.get(item.id);
  const extra = item.extraData ?? {};
  const uniqueName = extra.uniqueName ?? '';
  const bonus = extra.bonus ?? catalog?.bonus ?? '–';
  const bonusValue = extra.bonusValue ?? 0;
  const range = gameData ? petBonusRange(gameData, item.id) : null;

  const isEquipped = location.kind === 'equipped';
  const ownerId = isEquipped ? location.dwellerId : null;

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-neutral-800 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">
          {uniqueName || catalog?.name || item.id}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭详情面板"
          className="rounded px-2 py-1 text-neutral-400 hover:text-neutral-100"
        >
          ✕
        </button>
      </div>

      {/* Sprite + identity ------------------------------------------------------- */}
      <div className="mt-3 flex items-center gap-3">
        <div className="rounded border border-neutral-800 bg-neutral-900/40 p-2">
          <ItemIcon type="petBodies" id={item.id} size={88} />
        </div>
        <dl className="min-w-0 flex-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-400">品种</dt>
            <dd className="truncate text-neutral-200">{catalog?.name ?? item.id}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-2">
            <dt className="text-neutral-400">类型</dt>
            <dd className="text-neutral-200">
              {PET_TYPE_LABEL[catalog?.type ?? ''] ?? catalog?.type ?? '–'}
            </dd>
          </div>
          <div className="mt-1 flex justify-between gap-2">
            <dt className="text-neutral-400">稀有度</dt>
            <dd className="text-neutral-200">
              {RARITY_LABEL[catalog?.rarity ?? ''] ?? catalog?.rarity ?? '–'}
            </dd>
          </div>
          <div className="mt-1 flex justify-between gap-2">
            <dt className="text-neutral-400">ID</dt>
            <dd className="truncate font-mono text-xs text-neutral-400">{item.id}</dd>
          </div>
        </dl>
      </div>

      {/* Bonus (locked) + editable value ----------------------------------------- */}
      <div className="mt-4 text-sm text-neutral-300">
        <span className="text-neutral-400">加成（锁定）：</span>
        {prettyBonus(bonus)}
        {range && (
          <span className="text-neutral-400">
            ，合法范围 {range.min}–{range.max}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <NumberField
          label="加成数值"
          value={bonusValue}
          onCommit={(v) => onEdit({ bonusValue: v })}
          min={range?.min ?? 0}
          max={range?.max ?? 9999}
          allowOutOfRange={allowOutOfRange}
        />
        <label className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">专属名称</span>
          <input
            type="text"
            aria-label="专属名称"
            defaultValue={uniqueName}
            key={`petname-${item.id}-${uniqueName}`}
            onBlur={(e) => onEdit({ uniqueName: e.target.value })}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
          />
        </label>
      </div>

      {/* Assignment -------------------------------------------------------------- */}
      <div className="mt-5 border-t border-neutral-800 pt-4">
        <div className="text-sm">
          <span className="text-neutral-400">派驻至：</span>
          <span className="text-neutral-200">
            {isEquipped ? (ownerName ?? '一名居民') : '仓库'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            装备给居民…
          </button>
          {isEquipped && (
            <button
              type="button"
              onClick={onSendToStorage}
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              放回仓库
            </button>
          )}
        </div>
      </div>

      {/* Delete ------------------------------------------------------------------ */}
      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="rounded border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/30"
        >
          删除宠物
        </button>
      </div>

      {assignOpen && (
        <AssignPetDialog
          open
          onClose={() => setAssignOpen(false)}
          dwellers={dwellers}
          currentOwnerId={ownerId}
          onAssign={onAssign}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="删除宠物"
        message={`永久删除“${uniqueName || catalog?.name || item.id}”？此操作无法恢复（撤销除外）。`}
        confirmLabel="删除"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </aside>
  );
}
