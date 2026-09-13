import type { ReactNode } from 'react';
import type { Outfit, Weapon } from '../../../domain/gamedata/schemas.ts';
import {
  SPECIAL_KEYS,
  formatAvgDamage,
  outfitSpecialTotal,
  weaponAvgDamage,
} from '../../../domain/gamedata/itemStats.ts';
import type { RecipeViewRow } from '../table/schemas/recipeSchema.tsx';
import { ItemIcon } from '../ItemIcon.tsx';

// Selected-recipe detail panel (master-detail in the Recipes tab): shows the joined item's
// reference stats so the user doesn't have to switch tabs just to see what a recipe crafts.
// Every kind ends on the same Type + Rarity meta box (Type is the recipe kind -
// Weapon/Outfit/Theme - matching the table's Type column, NOT the noisy outfit category), so
// the panels read consistently; above it each kind shows its class-specific stats (weapon
// damage, the outfit SPECIAL strip, or the theme's target room). A "View in tab" button jumps
// to the full Weapons/Outfits catalog (weapon/outfit recipes only). Mobile layout (full-screen
// overlay + its own scroll) comes from the parent ResizableSplit, like the Dwellers/Pets sheets.

interface RecipeSidePanelProps {
  row: RecipeViewRow;
  /** The joined catalog item for a Weapon/Outfit recipe (null for theme recipes). */
  weapon?: Weapon | null;
  outfit?: Outfit | null;
  /** Add (when missing) or remove (when known) this recipe from the collection. */
  onToggleCollection: () => void;
  /** Whether a save is loaded - collection edits require one. */
  canEdit: boolean;
  onClose: () => void;
  /** Jump to the item's catalog tab. Present only for weapon/outfit recipes. */
  onViewInTab?: () => void;
}

/** Humanize an enum-style id (e.g. "LivingQuarters" → "Living Quarters"). */
const humanize = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/** Display label for the recipe kind enum (the logic values themselves stay English). */
const KIND_LABEL: Record<string, string> = {
  Weapon: '武器',
  Outfit: '服装',
  Theme: '主题',
};

const BOX = 'rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2';

/** Section wrapper matching the CharacterSheet convention (amber uppercase header). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400/80">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** A label · value definition row. */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium text-neutral-100">{value}</span>
    </div>
  );
}

function WeaponStats({ weapon }: { weapon: Weapon }) {
  return (
    <div className={BOX}>
      <StatRow label="伤害" value={`${weapon.damageMin}–${weapon.damageMax}`} />
      <StatRow label="平均伤害" value={formatAvgDamage(weaponAvgDamage(weapon))} />
    </div>
  );
}

function OutfitStats({ outfit }: { outfit: Outfit }) {
  const total = outfitSpecialTotal(outfit.special);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1">
        {SPECIAL_KEYS.map((k) => {
          const v = outfit.special[k];
          const on = v > 0;
          return (
            <div
              key={k}
              className={`flex flex-col items-center rounded-md border py-1.5 ${
                on
                  ? 'border-emerald-700/50 bg-emerald-900/20'
                  : 'border-neutral-800 bg-neutral-900/40'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {k}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  on ? 'text-emerald-300' : 'text-neutral-600'
                }`}
              >
                {on ? `+${v}` : '0'}
              </span>
            </div>
          );
        })}
      </div>
      <div className={BOX}>
        <StatRow label="SPECIAL 合计" value={total > 0 ? `+${total}` : '0'} />
      </div>
    </div>
  );
}

/** Collection status line, mirroring the Recipes table's status wording. */
function statusText(row: RecipeViewRow): { text: string; owned: boolean } {
  if (row.kind === 'Theme') {
    if (row.applied) return { text: '已应用到对应房间', owned: true };
    if (row.built) return { text: '已建造', owned: true };
    if (row.known) return { text: '已拥有配方', owned: true };
    return { text: '未拥有配方', owned: false };
  }
  return row.known ? { text: '已拥有配方', owned: true } : { text: '未拥有配方', owned: false };
}

export function RecipeSidePanel({
  row,
  weapon,
  outfit,
  onToggleCollection,
  canEdit,
  onClose,
  onViewInTab,
}: RecipeSidePanelProps) {
  const status = statusText(row);
  const iconRef =
    row.kind === 'Weapon'
      ? ({ type: 'weapons', id: row.id } as const)
      : row.kind === 'Outfit'
        ? ({ type: 'outfits', id: row.id } as const)
        : null;

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-900/40 p-4">
      {/* Identity */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {iconRef ? (
            <ItemIcon type={iconRef.type} id={iconRef.id} size={36} />
          ) : (
            <span
              aria-hidden="true"
              className="inline-block h-9 w-9 shrink-0 rounded-sm bg-neutral-800"
            />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-neutral-100" title={row.name}>
              {row.name}
            </h3>
            <p className="text-xs text-neutral-400">{KIND_LABEL[row.kind] ?? row.kind}配方</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭配方面板"
          className="shrink-0 rounded px-2 py-1 text-neutral-400 hover:text-neutral-100"
        >
          ✕
        </button>
      </div>

      {/* Collection status + the add/remove toggle, so the recipe is editable straight from
          the panel without hunting for its row in the table. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
            status.owned ? 'bg-emerald-900/50 text-emerald-300' : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {status.text}
        </span>
        <button
          type="button"
          disabled={!canEdit}
          title={canEdit ? undefined : '载入存档后才能编辑配方'}
          onClick={onToggleCollection}
          className={`shrink-0 rounded border px-3 py-1 text-xs disabled:opacity-40 ${
            row.known
              ? 'border-red-800 text-red-300 hover:bg-red-900/40'
              : 'border-emerald-700 text-emerald-300 hover:bg-emerald-900/40'
          }`}
        >
          {row.known ? '从收藏中移除' : '添加到收藏'}
        </button>
      </div>

      {/* Stats: class-specific rows, then a shared Type + Rarity meta box on every kind. */}
      <Section title="属性">
        <div className="flex flex-col gap-2">
          {weapon && <WeaponStats weapon={weapon} />}
          {outfit && <OutfitStats outfit={outfit} />}
          {row.kind === 'Theme' && row.roomType && (
            <div className={BOX}>
              <StatRow label="房间" value={humanize(row.roomType)} />
            </div>
          )}
          <div className={BOX}>
            <StatRow label="类型" value={KIND_LABEL[row.kind] ?? row.kind} />
            <StatRow label="稀有度" value={row.rarity ?? '无'} />
          </div>
        </div>
      </Section>

      {onViewInTab && (
        <button
          type="button"
          onClick={onViewInTab}
          className="mt-4 w-full rounded border border-sky-700 px-3 py-2 text-sm text-sky-300 hover:bg-sky-900/40"
        >
          前往{KIND_LABEL[row.kind] ?? row.kind}页查看 →
        </button>
      )}
    </aside>
  );
}
