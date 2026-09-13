import type { FamilyStats, StatGroupKey } from '../../../domain/selectors/familyGraphSelectors.ts';
import { InfoTooltip } from '../InfoTooltip.tsx';

// "Vault Genetics" stat block for the Family Tree tab - a row of stat chips plus a
// tongue-in-cheek overall status (Pristine Bloodlines … One Cursed Bloodline) driven by how
// many children have parents that share an ancestor. Chips backed by a concrete set of
// dwellers are clickable: selecting one highlights exactly those dwellers in the tree.

// Status colour by severity level (0 pristine → 5 cursed).
const STATUS_CLASS: Record<number, string> = {
  0: 'border-emerald-600/60 bg-emerald-500/10 text-emerald-300',
  1: 'border-lime-600/60 bg-lime-500/10 text-lime-300',
  2: 'border-amber-600/60 bg-amber-500/10 text-amber-300',
  3: 'border-orange-600/60 bg-orange-500/10 text-orange-300',
  4: 'border-red-600/60 bg-red-500/10 text-red-300',
  5: 'border-red-500 bg-red-600/20 text-red-200',
};

// Chip order. `key` present → the chip is clickable and highlights stats.groups[key].
// `help` is a plain-language explanation shown as a hover tooltip (some stats are unclear).
const CHIPS: ReadonlyArray<{
  label: string;
  field: keyof FamilyStats;
  key?: StatGroupKey;
  help: string;
}> = [
  {
    label: '居民',
    field: 'dwellers',
    help: '家族树中的居民总数（含特殊角色）。',
  },
  {
    label: '家庭',
    field: 'familyGroups',
    key: 'familyGroups',
    help: '由两名及以上有亲属关系的居民组成的群体（通过父母、子女或伴侣关系相连）。',
  },
  {
    label: '独行侠',
    field: 'loneWolves',
    key: 'loneWolves',
    help: '没有任何亲属记录的居民——无父母、伴侣或子女。',
  },
  {
    label: '最大家族',
    field: 'largestFamily',
    key: 'largestFamily',
    help: '单个最大家族中的居民数量。',
  },
  {
    label: '世代',
    field: 'generations',
    help: '最深血脉延续的世代数（祖父母 → 父母 → 子女 = 3 代）。',
  },
  {
    label: '伴侣',
    field: 'couples',
    key: 'couples',
    help: '互为伴侣或至少育有一名子女的配对。',
  },
  {
    label: '始祖',
    field: 'founders',
    key: 'founders',
    help: '没有父母记录的居民——各血脉的起点。',
  },
  {
    label: '特殊角色',
    field: 'specials',
    key: 'specials',
    help: '当前避难所中的特殊/有名有姓的角色（如传说居民或任务居民）。',
  },
  {
    label: '近亲结合',
    field: 'inbredUnions',
    key: 'inbredUnions',
    help: '父母双方拥有共同祖先的子女（基因状态即由此统计）。',
  },
];

function StatChip({
  label,
  value,
  help,
  active,
  onClick,
}: {
  label: string;
  value: number;
  help: string;
  active: boolean;
  onClick?: () => void;
}) {
  const base = 'flex flex-col items-center rounded border px-2.5 py-1';
  const inner = (
    <>
      <span className="text-sm font-semibold tabular-nums text-neutral-100">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
    </>
  );
  if (!onClick) {
    return (
      <div className={`${base} cursor-help border-neutral-800 bg-neutral-900/60`} title={help}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={`${help}\n\n点击可高亮这些居民。`}
      className={`${base} ${
        active
          ? 'border-amber-500 bg-amber-500/15'
          : 'border-neutral-800 bg-neutral-900/60 hover:border-amber-600/60'
      }`}
    >
      {inner}
    </button>
  );
}

export function FamilyStatsBar({
  stats,
  activeStat,
  onToggleStat,
}: {
  stats: FamilyStats;
  activeStat: StatGroupKey | null;
  onToggleStat: (key: StatGroupKey) => void;
}) {
  const { status } = stats;
  const pct = stats.twoParentChildren
    ? Math.round((stats.inbredUnions / stats.twoParentChildren) * 100)
    : 0;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950/60 px-3 py-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${
          STATUS_CLASS[status.level]
        }`}
      >
        <span aria-hidden="true">{status.emoji}</span>
        {status.label}
        <InfoTooltip label="避难所基因状态" text={status.blurb} />
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {CHIPS.map((c) => (
          <StatChip
            key={c.label}
            label={c.label}
            value={stats[c.field] as number}
            help={c.help}
            active={!!c.key && activeStat === c.key}
            {...(c.key ? { onClick: () => onToggleStat(c.key as StatGroupKey) } : {})}
          />
        ))}
      </div>
      <span
        className="cursor-help text-[11px] text-neutral-500"
        title="在父母已知的子女中，父母双方拥有共同祖先的比例。"
      >
        {pct}% 的出生属于近亲结合
      </span>
    </div>
  );
}
