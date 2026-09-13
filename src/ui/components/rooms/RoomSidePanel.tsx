import { useState } from 'react';
import type { RoomNode } from '../../../domain/rooms/layout.ts';
import { ELEVATOR_TYPE, FAKE_WASTELAND_TYPE } from '../../../domain/rooms/layout.ts';
import type { ValidationResult } from '../../../domain/rooms/validator.ts';
import type { RoomTheme } from '../../../domain/rooms/themes.ts';
import type { Recommendation } from '../../../domain/selectors/advisorSelectors.ts';
import { InfoTooltip } from '../InfoTooltip.tsx';
import { fieldHelp } from '../../lib/fieldHelp.ts';
import { useHoldRepeat } from '../../hooks/useHoldRepeat.ts';
import { formatDuration } from '../../../domain/tasks/taskLookup.ts';
import type { RoomTimerKind } from '../../../domain/ops/timerOps.ts';

// Selected-room detail panel (master-detail): level (±/max), repair, power,
// theme, occupants (assign/unassign), merge, delete - each gated by the layout
// validator (a blocked action is disabled with its reason as the tooltip). Presentational:
// every mutation is a callback the RoomsView turns into one applyEdit.

export interface RoomOccupant {
  id: number;
  name: string;
}

/** One running timer row, pre-resolved by RoomsView (names / crafted item). */
export interface RoomTimerRow {
  kind: RoomTimerKind;
  remainingSeconds: number | null;
  /** Training only: the dweller in this slot. */
  slotDwellerId?: number;
  slotDwellerName?: string;
  /** Crafting only: display name of the item being crafted. */
  itemName?: string;
}

interface RoomSidePanelProps {
  node: RoomNode;
  label: string;
  maxLevel: number;
  maxDwellers: number;
  occupants: RoomOccupant[];
  canRemove: ValidationResult;
  mergeable: ValidationResult;
  onClose: () => void;
  onSetLevel: (level: number) => void;
  onMaxLevel: () => void;
  onRepair: () => void;
  onSetPower: (powered: boolean) => void;
  /** Theme ("decoration") options for this room TYPE; empty = the type has no themes. */
  themeOptions: RoomTheme[];
  /** The currently-applied theme enum name for this room type ("None" if unset). */
  currentTheme: string;
  /** Apply a theme to this room TYPE (themes every room of the type). */
  onSetTheme: (value: string) => void;
  onMerge: () => void;
  onUnassign: (dwellerId: number) => void;
  onOpenAssign: () => void;
  /** Auto-staff just this room (assign idle, then optionally generate). Absent = nothing to fill. */
  onAutoStaff?: () => void;
  /** Empty work slots this room can be auto-staffed into (drives the button's count). */
  autoStaffFree?: number;
  onDelete: () => void;
  /** UX-G: toggle drag-free "move mode" (highlight legal drop cells). Absent = not movable. */
  onToggleMove?: () => void;
  /** Whether move mode is currently active for this room. */
  moveActive?: boolean;
  /** When move mode finds NO legal target, the reason why (replaces the "pick a cell" hint). */
  moveBlockedReason?: string;
  /** Context action: equip this room's primary-SPECIAL loadout onto its occupants. */
  onApplyLoadout?: () => void;
  /** Label for the loadout action (e.g. "Apply Intelligence loadout"). */
  loadoutLabel?: string;
  /** Plain-language description of exactly what the loadout button equips (tooltip). */
  loadoutHelp?: string;
  /** Jump to the Bulk → Location loadouts panel to configure loadouts per room type. */
  onOpenBulkLoadouts?: () => void;
  /** Advisor recommendations targeting this room (understaffed / broken producer). */
  advisories?: Recommendation[];
  /** The Mr. Handy already on this room's FLOOR (one per floor, the game rule), or null. */
  floorHandy?: { id: number; name: string } | null;
  /** Robots not attached to any room, offered for assignment here. */
  unassignedHandies?: { id: number; name: string }[];
  /** Attach an existing unassigned robot to this room. */
  onAssignHandy?: (actorId: number) => void;
  /** Mint a brand-new robot directly into this room. */
  onCreateHandy?: () => void;
  /** Detach the floor's robot (it goes outside the vault). */
  onUnassignHandy?: (actorId: number) => void;
  /** Running timers in this room (production/crafting/training/radio/rush). */
  timers?: RoomTimerRow[];
  /** Complete the room's timers of the given kinds (one applyEdit). */
  onCompleteTimers?: (kinds: RoomTimerKind[]) => void;
  /** Complete one training slot's cycle by its dweller id. */
  onCompleteTrainingSlot?: (dwellerId: number) => void;
  /** Staffed production room whose output is full: no cycle timer exists in the save. */
  productionAwaitingCollect?: boolean;
  /** Advisory note for a season-only room that won't function in this vault (Ultracite rooms
   *  outside an active Ultracite Fever season). Absent = the room functions normally here. */
  seasonNote?: string;
}

/** Row label + tooltip + action label per timer kind. */
const TIMER_COPY: Record<RoomTimerKind, { label: string; help: string; action: string }> = {
  production: { label: '生产周期', help: fieldHelp.roomTimers, action: '立即完成' },
  crafting: { label: '制作', help: fieldHelp.craftingTimer, action: '立即完成' },
  radio: { label: '广播周期', help: fieldHelp.roomTimers, action: '立即完成' },
  training: { label: '训练', help: fieldHelp.trainingTimer, action: '立即完成' },
  rush: { label: '加速冷却', help: fieldHelp.rushTimer, action: '立即重置' },
};

/** Display labels for save room-class enum values (the logic values themselves stay English). */
const CLASS_LABEL: Record<string, string> = {
  Production: '生产',
  Training: '训练',
  Crafting: '制作',
  Consumable: '消耗品',
  Facility: '设施',
  Quest: '任务',
  Utility: '功能',
  None: '无',
};

const SECTION = 'border-t border-neutral-800 pt-3 mt-3';
const BTN =
  'rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:px-3 pointer-coarse:py-1.5';

const ADVISORY_STYLE: Record<Recommendation['severity'], string> = {
  high: 'border-red-500/40 bg-red-500/10',
  medium: 'border-amber-500/40 bg-amber-500/10',
  low: 'border-neutral-700 bg-neutral-800/40',
};
const ADVISORY_ICON: Record<Recommendation['severity'], string> = {
  high: 'text-red-400',
  medium: 'text-amber-400',
  low: 'text-neutral-400',
};

export function RoomSidePanel({
  node,
  label,
  maxLevel,
  maxDwellers,
  occupants,
  canRemove,
  mergeable,
  onClose,
  onSetLevel,
  onMaxLevel,
  onRepair,
  onSetPower,
  themeOptions,
  currentTheme,
  onSetTheme,
  onMerge,
  onUnassign,
  onOpenAssign,
  onAutoStaff,
  autoStaffFree = 0,
  onDelete,
  onToggleMove,
  moveActive = false,
  moveBlockedReason,
  onApplyLoadout,
  loadoutLabel,
  loadoutHelp,
  onOpenBulkLoadouts,
  advisories = [],
  floorHandy = null,
  unassignedHandies = [],
  onAssignHandy,
  onCreateHandy,
  onUnassignHandy,
  timers = [],
  onCompleteTimers,
  onCompleteTrainingSlot,
  productionAwaitingCollect = false,
  seasonNote,
}: RoomSidePanelProps) {
  // Which unassigned robot the "Assign Mr. Handy" select currently points at.
  const [handyPick, setHandyPick] = useState<string>('');
  const isElevator = node.type === ELEVATOR_TYPE;
  // Structural tiles (elevator shafts, the FakeWasteland scenery tile) are not real rooms:
  // they have no level/health/occupants/merge/decoration controls.
  const isStructural = isElevator || node.type === FAKE_WASTELAND_TYPE;
  const damaged = node.room.broken === true || (node.room.roomHealth?.damageValue ?? 0) > 0;

  // Hold-to-repeat for the level steppers (matches every other ± counter). Each tick reads
  // the freshly re-rendered node.level, and the button's own `disabled` stops it at bounds.
  const levelDownHold = useHoldRepeat(() => onSetLevel(node.level - 1), {
    disabled: node.level <= 1,
  });
  const levelUpHold = useHoldRepeat(() => onSetLevel(node.level + 1), {
    disabled: node.level >= maxLevel,
  });

  return (
    <aside className="flex h-full w-full flex-col overflow-auto border-l border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-neutral-100">{label}</h3>
          <p className="text-xs text-neutral-400">
            {node.row} 层 · {CLASS_LABEL[node.room.class ?? ''] ?? node.room.class ?? node.type}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭房间面板"
          className="rounded px-2 text-neutral-400 hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      {seasonNote && (
        <div className={`${SECTION}`}>
          <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
            <span aria-hidden="true" className="mt-px text-sm leading-none text-amber-400">
              ⚠
            </span>
            <p className="min-w-0 flex-1 text-[11px] text-neutral-300">{seasonNote}</p>
          </div>
        </div>
      )}

      {advisories.length > 0 && (
        <div className={SECTION}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            建议
          </h4>
          <ul className="space-y-2">
            {advisories.map((rec) => (
              <li
                key={rec.id}
                className={`flex items-start gap-2 rounded border px-2.5 py-2 ${ADVISORY_STYLE[rec.severity]}`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-px text-sm leading-none ${ADVISORY_ICON[rec.severity]}`}
                >
                  ⚠
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-neutral-100">{rec.title}</div>
                  <div className="text-[11px] text-neutral-400">{rec.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onToggleMove && (
        <div className={SECTION}>
          <button
            type="button"
            className={`${BTN} w-full ${moveActive ? 'border-sky-600 bg-sky-900/40 text-sky-200' : ''}`}
            aria-pressed={moveActive}
            onClick={onToggleMove}
          >
            {moveActive ? '取消移动' : '移动房间'}
          </button>
          {moveActive &&
            (moveBlockedReason ? (
              <p className="mt-1 text-[11px] text-amber-400">{moveBlockedReason}</p>
            ) : (
              <p className="mt-1 text-[11px] text-sky-400">
                在网格上选择一个高亮的格子，也可以直接拖动房间块。
              </p>
            ))}
        </div>
      )}

      {themeOptions.length > 0 && (
        <div className={SECTION}>
          <label className="block text-xs text-neutral-400">
            主题
            <select
              value={currentTheme}
              onChange={(e) => onSetTheme(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
            >
              {themeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-[11px] text-neutral-500">将应用于所有 {label} 房间。</p>
        </div>
      )}

      {!isStructural && (
        <>
          <div className={SECTION}>
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5">
                等级 <InfoTooltip text={fieldHelp.roomLevel} />
              </span>
              <span className="text-neutral-300">
                {node.level} / {maxLevel}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" className={BTN} disabled={node.level <= 1} {...levelDownHold}>
                −
              </button>
              <button
                type="button"
                className={BTN}
                disabled={node.level >= maxLevel}
                {...levelUpHold}
              >
                +
              </button>
              <button
                type="button"
                className={BTN}
                disabled={node.level >= maxLevel}
                onClick={onMaxLevel}
              >
                最大
              </button>
            </div>
          </div>

          <div className={SECTION}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-neutral-400">
                生命值：{damaged ? <span className="text-amber-400">受损</span> : '完好'}
                <InfoTooltip text={fieldHelp.roomRepair} />
              </span>
              <button
                type="button"
                className={BTN}
                disabled={!damaged}
                title={fieldHelp.roomRepair}
                onClick={onRepair}
              >
                修复
              </button>
            </div>
            <label className="mt-2 flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5">
                供电 <InfoTooltip text={fieldHelp.roomPower} />
              </span>
              <input
                type="checkbox"
                checked={node.room.power !== false}
                onChange={(e) => onSetPower(e.target.checked)}
              />
            </label>
            <button
              type="button"
              className={`${BTN} mt-2 w-full`}
              disabled={!mergeable.ok}
              title={mergeable.ok ? undefined : mergeable.reason}
              onClick={onMerge}
            >
              与相邻房间合并
            </button>
          </div>

          {/* Running timers (production / crafting / training / radio / rush). Rows are
              pre-resolved by RoomsView; each action completes the timer so it finishes
              during the game's on-load catch-up. A finished row (0s) shows its state
              instead of a dead button. Staffed production rooms with NO stored cycle
              are full and waiting to be collected in game - explained, not hidden. */}
          {(timers.length > 0 || productionAwaitingCollect) && (
            <div className={SECTION}>
              <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-400">
                <span>计时器</span>
                <InfoTooltip text={fieldHelp.roomTimers} />
              </div>
              <ul className="flex flex-col gap-1.5">
                {timers.map((timer, i) => {
                  const copy = TIMER_COPY[timer.kind];
                  const done = timer.remainingSeconds !== null && timer.remainingSeconds <= 0;
                  const what =
                    timer.kind === 'training'
                      ? `${timer.slotDwellerName ?? '居民'} 训练中`
                      : timer.kind === 'crafting' && timer.itemName
                        ? `正在制作 ${timer.itemName}`
                        : copy.label;
                  return (
                    <li
                      key={`${timer.kind}-${timer.slotDwellerId ?? i}`}
                      className="flex items-center justify-between gap-2 text-xs text-neutral-300"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">
                          {what}
                          {timer.remainingSeconds !== null && !done && (
                            <span className="text-neutral-500">
                              {' '}
                              - 剩余 {formatDuration(timer.remainingSeconds)}
                            </span>
                          )}
                        </span>
                        <InfoTooltip text={copy.help} />
                      </span>
                      {done ? (
                        <span className="shrink-0 text-[11px] text-emerald-300/90">
                          下次载入时完成
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={BTN}
                          onClick={() =>
                            timer.kind === 'training' && timer.slotDwellerId !== undefined
                              ? onCompleteTrainingSlot?.(timer.slotDwellerId)
                              : onCompleteTimers?.([timer.kind])
                          }
                        >
                          {copy.action}
                        </button>
                      )}
                    </li>
                  );
                })}
                {productionAwaitingCollect && (
                  <li className="flex items-center justify-between gap-2 text-xs text-neutral-300">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">生产周期</span>
                      <InfoTooltip text={fieldHelp.roomTimers} />
                    </span>
                    <span className="shrink-0 text-[11px] text-emerald-300/90">
                      产出已满，请在游戏中收取
                    </span>
                  </li>
                )}
              </ul>
              {productionAwaitingCollect && (
                <p className="mt-1.5 text-[11px] text-neutral-500">
                  该房间存有已完成的产出，因此存档中没有存储生产周期。在游戏中收取资源后，才会开始新的生产周期。
                </p>
              )}
              {timers.filter((t) => t.kind === 'training' && (t.remainingSeconds ?? 1) > 0).length >
                1 && (
                <button
                  type="button"
                  className={`${BTN} mt-2 w-full`}
                  onClick={() => onCompleteTimers?.(['training'])}
                >
                  完成全部训练
                </button>
              )}
            </div>
          )}

          <div className={SECTION}>
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
              <span>居民</span>
              <span className="text-neutral-300">
                {occupants.length}
                {maxDwellers > 0 ? ` / ${maxDwellers}` : ''}
              </span>
            </div>
            <ul className="space-y-1">
              {occupants.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between rounded bg-neutral-800/60 px-2 py-1 text-xs"
                >
                  <span className="truncate text-neutral-200">{o.name}</span>
                  <button
                    type="button"
                    aria-label={`取消派驻 ${o.name}`}
                    onClick={() => onUnassign(o.id)}
                    className="text-neutral-400 hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {occupants.length === 0 && <li className="text-xs text-neutral-400">空</li>}
            </ul>
            <button
              type="button"
              className={`${BTN} mt-2 w-full`}
              disabled={maxDwellers > 0 && occupants.length >= maxDwellers}
              onClick={onOpenAssign}
            >
              派驻居民
            </button>
            {onAutoStaff && autoStaffFree > 0 && (
              <button
                type="button"
                className={`${BTN} mt-2 w-full`}
                onClick={onAutoStaff}
                title={`为该房间填满 ${autoStaffFree} 个空位：先派驻空闲居民，其余自动生成`}
              >
                自动派驻该房间（{autoStaffFree}）
              </button>
            )}
            {onApplyLoadout && (
              <div className="mt-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className={`${BTN} flex-1`}
                    disabled={occupants.length === 0}
                    onClick={onApplyLoadout}
                  >
                    {loadoutLabel ?? '应用配置'}
                  </button>
                  {loadoutHelp && <InfoTooltip text={loadoutHelp} label="此配置装备的内容" />}
                </div>
                {onOpenBulkLoadouts && (
                  <button
                    type="button"
                    onClick={onOpenBulkLoadouts}
                    className="mt-1 text-[11px] text-sky-400 hover:text-sky-300 hover:underline"
                  >
                    在「批量 → 场所装备配置」中自定义
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mr. Handy: one robot per FLOOR (the game rule). Shows the floor's robot with a
              detach action, or - when the floor is free - assigns an existing unassigned
              robot / mints a brand-new one straight into this room. */}
          {(onAssignHandy || onCreateHandy || floorHandy) && (
            <div className={SECTION}>
              <div className="mb-1 text-xs text-neutral-400">巧手先生（本层）</div>
              {floorHandy ? (
                <div className="flex items-center justify-between rounded bg-neutral-800/60 px-2 py-1 text-xs">
                  <span className="truncate text-neutral-200">{floorHandy.name}</span>
                  {onUnassignHandy && (
                    <button
                      type="button"
                      aria-label={`将 ${floorHandy.name} 送出避难所`}
                      title="从本层移除（机器人将离开避难所，在大门等待，直到再次放置）"
                      onClick={() => onUnassignHandy(floorHandy.id)}
                      className="text-neutral-400 hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {onAssignHandy && unassignedHandies.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={handyPick}
                        onChange={(e) => setHandyPick(e.target.value)}
                        aria-label="选择要放置到此处的空闲巧手先生"
                        className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                      >
                        <option value="">选择一台未分配的机器人…</option>
                        {unassignedHandies.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} (#{h.id})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={BTN}
                        disabled={handyPick === ''}
                        onClick={() => {
                          onAssignHandy(Number(handyPick));
                          setHandyPick('');
                        }}
                      >
                        派驻
                      </button>
                    </div>
                  )}
                  {onCreateHandy && (
                    <button
                      type="button"
                      className={`${BTN} mt-2 w-full`}
                      onClick={onCreateHandy}
                      title="在该房间直接生成一台全新的巧手先生"
                    >
                      在此创建巧手先生
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      <div className={`${SECTION} mt-auto`}>
        <button
          type="button"
          className="w-full rounded border border-red-800 px-2 py-1.5 text-xs text-red-300 hover:bg-red-900/40 disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={!canRemove.ok}
          title={canRemove.ok ? undefined : canRemove.reason}
          onClick={onDelete}
        >
          删除房间
        </button>
      </div>
    </aside>
  );
}
