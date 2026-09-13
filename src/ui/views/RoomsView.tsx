import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSaveStore } from '../../state/saveStore.ts';
import { useUIStore } from '../../state/uiStore.ts';
import { useSectionNavigate } from '../routing/useSectionNavigate.ts';
import { pushToast } from '../../state/toastStore.ts';
import { useGameData } from '../hooks/useGameData.ts';
import { useDismissOnOutsidePress } from '../hooks/useDismissOnOutsidePress.ts';
import {
  buildLayout,
  displayFloor,
  roomCellWidth,
  CELLS_PER_ROOM,
  ELEVATOR_TYPE,
  ENTRANCE_TYPE,
  FAKE_WASTELAND_TYPE,
  type RoomNode,
} from '../../domain/rooms/layout.ts';
import {
  canMergeRoom,
  canMoveRoom,
  canRemoveRoom,
  strandedIfRemoved,
} from '../../domain/rooms/validator.ts';
import {
  baseMergeLevel,
  validBuildOrigins,
  validMoveTargets,
} from '../../domain/rooms/placement.ts';
import { NO_THEME, themeOptionsFor } from '../../domain/rooms/themes.ts';
import {
  claimRoomUnlock,
  isRoomTypeUnlocked,
  unlockIdForRoomType,
} from '../../domain/rooms/roomUnlocks.ts';
import { applyLoadout } from '../../domain/ops/loadoutOps.ts';
import {
  statKeyForSpecial,
  suggestOutfitForStat,
  suggestWeapon,
} from '../../domain/selectors/loadoutSuggest.ts';
import {
  addRoom,
  assignDweller,
  maxRoomLevel,
  mergeRoomWith,
  moveMrHandyToFloor,
  moveRoom,
  mrHandiesByFloor,
  nextRoomId,
  removeRoom,
  repairAllRooms,
  repairRoom,
  residentHandiesOnFloor,
  setRoomLevel,
  setRoomPower,
  setRoomTheme,
  unassignDweller,
} from '../../domain/ops/roomOps.ts';
import { VAULT_HELPER_CHARACTER_TYPES } from '../../domain/model/saveSchema.ts';
import { isUltraciteSeasonActive } from '../../domain/ops/seasonOps.ts';
import {
  assignMrHandyToRoom,
  createMrHandy,
  selectMrHandyRows,
  unassignMrHandy,
  DEFAULT_MR_HANDY_HEALTH,
} from '../../domain/ops/mrHandyOps.ts';
import {
  addRockAt,
  addUltraciteAt,
  clearEmergencies,
  isRoomInEmergency,
  removeRockAt,
  removeRocks,
  removeUltraciteAt,
  roomsInEmergency,
  unlockRooms,
} from '../../domain/ops/vaultOps.ts';
import type { GameData } from '../../domain/gamedata/gameData.ts';
import { computeAdvisor, type Recommendation } from '../../domain/selectors/advisorSelectors.ts';
import { autoStaff, autoStaffPlan, type StaffMode } from '../../domain/ops/autoStaffOps.ts';
import {
  completeRoomTimersNow,
  completeTrainingSlotNow,
  roomTimers,
  isProductionAwaitingCollect,
} from '../../domain/ops/timerOps.ts';
import { diagnose } from '../../domain/health/diagnostics.ts';
import { RoomGrid } from '../components/rooms/RoomGrid.tsx';
import { cellFromClient } from '../components/rooms/roomVisuals.ts';
import { ResourceEconomyPanel } from '../components/rooms/ResourceEconomyPanel.tsx';
import { RoomSidePanel, type RoomTimerRow } from '../components/rooms/RoomSidePanel.tsx';
import { ResizableSplit } from '../components/ResizableSplit.tsx';
import { BuildPalette, type BuildableRoom } from '../components/rooms/BuildPalette.tsx';
import { SectionToggle } from '../components/rooms/SectionToggle.tsx';
import { AssignRoomDialog } from '../components/rooms/AssignRoomDialog.tsx';
import { selectDwellerRows, type DwellerRow } from '../../domain/selectors/dwellerSelectors.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

// Vault Rooms Map - the visual pillar. Master-detail: the
// floor grid on the left, the selected-room side panel on the right, a Build palette on
// top. Every structural edit is gated by the layout validator; the grid only
// surfaces validator-approved drop cells and the panel disables blocked actions. The Casino
// is just another Build-palette entry. Geometry renders without game data;
// names / capacities / build costs enrich once it loads.

// What an auto-staff run targets: a MODE (every stat room, or only producers) or a single
// ROOM by deserializeID (the per-room side-panel button). Drives the shared confirm dialog.
type StaffTarget = { mode: StaffMode } | { roomId: number };

// Shared style for the Rooms-header bulk buttons (Repair all, Remove rocks, …) - small,
// outlined, count-bearing, and dimmed when there's nothing to do.
const HEADER_BTN =
  'rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent';

/** A room "needs repair" when it's hard-broken or has accumulated any damage
 *  (roomHealth.damageValue > 0). Matches the repair ops + the Repair-all count, and is
 *  confirmed against the real Vault1.sav (24/87 rooms carry damageValue > 0; none set broken). */
function roomNeedsRepair(room: RoomNode['room']): boolean {
  return room.broken === true || (room.roomHealth?.damageValue ?? 0) > 0;
}

/** Max dwellers for a room at its (mergeLevel, level) from the capacity catalog. */
function maxDwellersOf(gameData: GameData | null, node: RoomNode): number {
  if (!gameData || node.type === ELEVATOR_TYPE) return 0;
  const perMerge = gameData.roomCapacity.rooms[node.type]?.[String(node.mergeLevel)];
  return perMerge?.[String(node.level)]?.maxDwellers ?? 0;
}

/**
 * Buildable room types for the palette: real player-built rooms only. Excludes the pre-placed
 * Entrance and every quest/special room (class "Quest" covers the Overseer's office; class
 * "None" covers the quest dungeon rooms). Elevators (class Utility) and the legitimate
 * power/water variants stay.
 */
/** Core resources surfaced as a room's "produces" facts (Nuka is a per-cycle caps reward,
 *  not a stored-resource output, so it's excluded). */
const PRODUCED_RESOURCES = ['Food', 'Water', 'Energy'] as const;

/** Advisory severity → sort rank (higher = more urgent), for picking a room's top badge. */
const SEVERITY_RANK: Record<Recommendation['severity'], number> = { high: 3, medium: 2, low: 1 };

/** SPECIAL stat display names (same mapping as the Build palette). */
const STAT_LABEL: Record<string, string> = {
  Strength: '力量',
  Perception: '感知',
  Endurance: '耐力',
  Charisma: '魅力',
  Intelligence: '智力',
  Agility: '敏捷',
  Luck: '幸运',
};
const statLabel = (stat: string | undefined): string =>
  (stat !== undefined ? STAT_LABEL[stat] : undefined) ?? stat ?? '';

/** Timer kind display names for undo labels (keys are the RoomTimerKind ids). */
const TIMER_KIND_LABEL: Record<string, string> = {
  production: '生产',
  crafting: '制作',
  training: '训练',
  radio: '广播',
  rush: '加速',
};

// Ultracite rooms are Ultracite Fever season rooms: they can be built, staffed, levelled and
// rushed in any vault, but the Mine yields no ultracite and the Workshop won't craft unless
// Ultracite Fever is the ACTIVE season (isUltraciteSeasonActive). The note is surfaced on the
// Build tile (tooltip + ⚠) and in the selected-room side panel, but only when it doesn't apply.
const ULTRACITE_ROOM_NOTE: Record<string, string> = {
  UltraciteMining:
    '超镭狂热赛季房间。即使赛季未开启，派驻的居民照常训练，也可以加速生产周期，但在超镭狂热赛季之外不会产出超镭。',
  UltraciteWeaponFactory: '超镭狂热赛季房间。可以派驻居民，但在超镭狂热赛季之外不会进行制作。',
};

function buildableRooms(
  gameData: GameData | null,
  claimed: ReadonlySet<string>,
  ultraciteActive: boolean,
): BuildableRoom[] {
  if (!gameData) return [];
  const out: BuildableRoom[] = [];
  for (const [type, meta] of gameData.roomMetadataByType) {
    if (type === 'Entrance' || meta.class === 'Quest' || meta.class === 'None') continue;
    // Facts at the base (un-merged, level 1) size - what a freshly-built room starts as.
    const base = gameData.roomCapacity.rooms[type]?.['1']?.['1'];
    const produced = gameData.roomProduction.rooms[type]?.['1']?.['1']?.produced ?? {};
    // Locked = the type has an unlock objective not yet in unlockableMgr.claimed. Starter
    // rooms (no objective) are never locked. Locked rooms stay buildable: placing one claims
    // its unlock in the same edit (see onPlace).
    const unlockId = unlockIdForRoomType(type);
    const note = ultraciteActive ? undefined : ULTRACITE_ROOM_NOTE[type];
    out.push({
      type,
      name: meta.name,
      cost: meta.buildCost.Nuka ?? 0,
      capacity: base?.maxDwellers ?? 0,
      primaryStat: meta.primaryStat,
      size: Math.max(1, Math.round(meta.width / CELLS_PER_ROOM)),
      produces: PRODUCED_RESOURCES.filter((r) => (produced[r] ?? 0) > 0),
      locked: unlockId !== null && !claimed.has(unlockId),
      roomClass: meta.class,
      ...(note ? { note } : {}),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function RoomsView() {
  const save = useSaveStore((s) => s.save);
  const seasonSave = useSaveStore((s) => s.seasonSave);
  const applyEdit = useSaveStore((s) => s.applyEdit);
  const goToSection = useSectionNavigate();
  // Selected room lives in the URL (#/rooms/:deserializeID) - deep-linkable + back-forward.
  const { detail } = useParams();
  const selectedId = detail != null && /^\d+$/.test(detail) ? Number(detail) : null;
  const setSelectedId = useCallback((id: number | null) => goToSection('rooms', id), [goToSection]);
  const setBulkFocus = useUIStore((s) => s.setBulkFocus);
  const panelWidth = useUIStore((s) => s.roomPanelWidth);
  const setPanelWidth = useUIStore((s) => s.setRoomPanelWidth);
  // Collapsible header sections (persisted): default open; minimizing either frees
  // vertical space for the room grid while building.
  const advisorsCollapsed = useUIStore((s) => s.roomsAdvisorsCollapsed);
  const setAdvisorsCollapsed = useUIStore((s) => s.setRoomsAdvisorsCollapsed);
  const economyCollapsed = useUIStore((s) => s.roomsEconomyCollapsed);
  const setEconomyCollapsed = useUIStore((s) => s.setRoomsEconomyCollapsed);
  const buildCollapsed = useUIStore((s) => s.roomsBuildCollapsed);
  const setBuildCollapsed = useUIStore((s) => s.setRoomsBuildCollapsed);
  const { data: gameData, status: gameDataStatus } = useGameData();

  const [buildType, setBuildType] = useState<string | null>(null);
  // Terrain-edit mode: clicking an empty underground cell places a rock or an ultracite
  // deposit. Mutually exclusive with build mode and move mode.
  const [terrainMode, setTerrainMode] = useState<'rock' | 'ultracite' | null>(null);
  // The picked-up Mr. Handy (rail): click its slot to arm, then an eligible floor to move.
  const [armedHandy, setArmedHandy] = useState<number | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  // Auto-staff confirm: holds the pending run's target while the confirm dialog is open. The
  // target is either a MODE (the banner's "all"/"output" buttons, filling every matching room)
  // or a single ROOM by deserializeID (the side panel's "Auto-staff this room"). The dialog
  // offers the same assign-vs-generate choice for both.
  const [staffConfirm, setStaffConfirm] = useState<StaffTarget | null>(null);
  // The room pending deletion (side-panel Delete button OR a drag onto the trash zone). The
  // confirm dialog targets this id, which may differ from the selected room.
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  // UX-G drag-to-rearrange: the room whose legal drop cells are shown for the keyboard/
  // non-drag "move mode" (the side-panel "Move" toggle). Pointer-drag works independently.
  const [movingId, setMovingId] = useState<number | null>(null);
  // UX-G drag-to-build: the live snap-ghost while a Build-palette box is dragged over the
  // grid. The grid shares its container rect via gridRef so we can map cursor → cell here.
  const gridRef = useRef<HTMLDivElement>(null);
  const [buildGhost, setBuildGhost] = useState<{
    row: number;
    col: number;
    legal: boolean;
  } | null>(null);

  const layout = useMemo(() => (save ? buildLayout(save) : null), [save]);

  // Mr. Handy rail: one slot per floor beside the grid. Only rendered when the vault owns
  // robots. A floor is an eligible move target while a robot is armed, has at least one
  // real room, and has NO robot yet (one per floor, the game rule).
  const handyRail = useMemo(() => {
    if (!save || !layout) return [];
    const actors = (save.dwellers?.actors ?? []).filter(
      (a) =>
        typeof a.characterType === 'number' && VAULT_HELPER_CHARACTER_TYPES.has(a.characterType),
    );
    if (actors.length === 0) return [];
    const byFloor = mrHandiesByFloor(save);
    const nameOf = (id: number): string =>
      actors.find((a) => a.serializeId === id)?.name ?? `巧手先生 #${id}`;
    const floorsWithRooms = new Set(
      layout.nodes
        .filter((n) => n.type !== FAKE_WASTELAND_TYPE && n.type !== ELEVATOR_TYPE)
        .map((n) => n.row),
    );
    return Array.from({ length: layout.rows }, (_, row) => {
      const ids = byFloor.get(row) ?? [];
      const first = ids[0];
      return {
        row,
        ...(first !== undefined ? { handy: { id: first, name: nameOf(first) } } : {}),
        eligible: armedHandy !== null && ids.length === 0 && floorsWithRooms.has(row),
      };
    });
  }, [save, layout, armedHandy]);

  const onHandySlotClick = (row: number): void => {
    const slot = handyRail[row];
    if (!slot) return;
    if (slot.handy) {
      setArmedHandy((cur) => (cur === slot.handy!.id ? null : slot.handy!.id));
      return;
    }
    if (slot.eligible && armedHandy !== null) {
      const id = armedHandy;
      applyEdit((s) => moveMrHandyToFloor(s, id, row), '移动巧手先生');
      pushToast(`巧手先生已移动到第 ${displayFloor(row)} 层`);
      setArmedHandy(null);
    }
  };

  // Mr. Handy roster for the side panel's per-room assign flow: the selected floor's robot
  // (one per floor, the game rule) and the pool of unassigned robots ("outside the vault").
  const handyRows = useMemo(() => (save ? selectMrHandyRows(save) : []), [save]);
  const unassignedHandies = useMemo(
    () =>
      handyRows.filter((h) => h.floor === null).map((h) => ({ id: h.serializeId, name: h.name })),
    [handyRows],
  );

  // Drag-and-drop counterpart of the click-to-arm flow: the grid validates the drop
  // target (an eligible floor slot / the outside zone) before reporting it here.
  const onHandyDrop = (
    id: number,
    target: { type: 'floor'; row: number } | { type: 'outside' } | { type: 'none' },
  ): void => {
    setArmedHandy(null);
    if (target.type === 'floor') {
      applyEdit((s) => moveMrHandyToFloor(s, id, target.row), '移动巧手先生');
      pushToast(`巧手先生已移动到第 ${displayFloor(target.row)} 层`);
    } else if (target.type === 'outside') {
      const placed = (handyRows.find((h) => h.serializeId === id)?.floor ?? null) !== null;
      if (placed) {
        applyEdit((s) => unassignMrHandy(s, id), '取消派驻巧手先生');
        pushToast('巧手先生已送出避难所（在大门等待）。');
      }
    }
  };

  // Advisor report (moved onto this screen): the resource-economy strip above the build
  // palette, plus per-room recommendations surfaced as a grid alert triangle + side-panel
  // detail. Cheap O(rooms×dwellers) recompute, memoized on save + game data.
  const advisorReport = useMemo(
    () => (save && gameData ? computeAdvisor(save, gameData) : null),
    [save, gameData],
  );
  // Auto-staff plans: empty work slots (by authoritative savedRoom) and the assign-vs-generate
  // split, computed for both targets - every stat room ("all") and resource producers only
  // ("output"). Drive the two banner buttons + the confirm dialog. Cheap, memoized.
  const staffPlanAll = useMemo(
    () => (save && gameData ? autoStaffPlan(save, gameData, 'all') : null),
    [save, gameData],
  );
  const staffPlanOutput = useMemo(
    () => (save && gameData ? autoStaffPlan(save, gameData, 'output') : null),
    [save, gameData],
  );
  const planForMode = (mode: StaffMode): typeof staffPlanAll =>
    mode === 'all' ? staffPlanAll : staffPlanOutput;
  // The selected room's own staff plan (mode 'all' so non-producer stat rooms still count),
  // scoped to its deserializeID. Drives the side-panel "Auto-staff this room" button + its
  // confirm dialog. Null for non-stat rooms / no selection (freeSlots 0 hides the button).
  const selectedRoomStaffPlan = useMemo(
    () =>
      save && gameData && selectedId !== null
        ? autoStaffPlan(save, gameData, 'all', selectedId)
        : null,
    [save, gameData, selectedId],
  );
  const planForTarget = (target: StaffTarget): typeof staffPlanAll =>
    'mode' in target ? planForMode(target.mode) : selectedRoomStaffPlan;
  // Broken worker-list entries (ghost dweller ids / double bookings): when present the
  // grid's occupant counts include impossible entries. Surface it with a one-click fix
  // (the diagnosis carries its own repair).
  const desync = useMemo(
    () => (save ? (diagnose(save).find((d) => d.kind === 'roomAssignmentDesync') ?? null) : null),
    [save],
  );
  // The plan for the run the confirm dialog is currently asking about (null when closed).
  const pendingPlan = staffConfirm ? planForTarget(staffConfirm) : null;
  // Recommendations grouped by the room they target (deficit/idle/happiness recs have no
  // roomId, so they only feed the resource strip - not a per-room badge).
  const advisoriesByRoom = useMemo(() => {
    const map = new Map<number, Recommendation[]>();
    for (const rec of advisorReport?.recommendations ?? []) {
      if (rec.link.roomId === undefined) continue;
      const list = map.get(rec.link.roomId);
      if (list) list.push(rec);
      else map.set(rec.link.roomId, [rec]);
    }
    return map;
  }, [advisorReport]);
  // Highest severity wins the room's single alert triangle (SEVERITY_RANK is module-scoped).
  const roomAdvisory = useCallback(
    (id: number): { severity: Recommendation['severity']; title: string } | null => {
      const recs = advisoriesByRoom.get(id);
      if (!recs || recs.length === 0) return null;
      const top = recs.reduce((a, b) =>
        SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a,
      );
      return {
        severity: top.severity,
        title: recs.length > 1 ? `${recs.length} 条建议` : top.title,
      };
    },
    [advisoriesByRoom],
  );

  // Every sticky mode exits the same way (shared hook): a pointer-down anywhere the mode's
  // own targets don't claim dismisses it - blank space, the side panel, the nav, a built
  // room. Each mode's toggle control also deselects on a second click (palette tile, the
  // +Rock/+Ultracite header buttons, a robot chip).
  //
  // Build mode is sticky only on LEGAL drop cells (place the same room repeatedly); clicks
  // on a Build palette tile are left to the palette (switch type / toggle the active off).
  const allowBuildPress = useCallback(
    (target: HTMLElement): boolean =>
      (!!gridRef.current?.contains(target) && !!target.closest('[data-drop-cell]')) ||
      !!target.closest('[data-build-tile]'),
    [],
  );
  const dismissBuild = useCallback(() => setBuildType(null), []);
  useDismissOnOutsidePress(buildType !== null, allowBuildPress, dismissBuild);

  // Terrain paint stays active over its own surfaces: placement cells and existing rock /
  // ultracite cells (so excavating a misplaced one doesn't exit); the header toggles
  // handle themselves (second click exits, the other button switches kind).
  const allowTerrainPress = useCallback(
    (target: HTMLElement): boolean =>
      !!target.closest('[data-terrain-cell]') || !!target.closest('[data-terrain-toggle]'),
    [],
  );
  const dismissTerrain = useCallback(() => setTerrainMode(null), []);
  useDismissOnOutsidePress(terrainMode !== null, allowTerrainPress, dismissTerrain);

  // An armed Mr. Handy disarms on presses outside the floor rail / outside zone (its own
  // chips already toggle off on a second click, and eligible slots place it).
  const allowHandyPress = useCallback(
    (target: HTMLElement): boolean =>
      !!target.closest('[data-handy-floor]') || !!target.closest('[data-handy-outside]'),
    [],
  );
  const disarmHandy = useCallback(() => setArmedHandy(null), []);
  useDismissOnOutsidePress(armedHandy !== null, allowHandyPress, disarmHandy);

  // Validator-approved drop origins for a room id - computed on demand (drag start / move
  // mode), not per render, so the O(cells × validator) sweep stays off the hot path.
  const moveTargetsFor = useCallback(
    (id: number): ReadonlySet<string> => (layout ? validMoveTargets(layout, id) : new Set()),
    [layout],
  );

  // The validator's reason a live drag drop is illegal - feeds the grid's drag feedback banner.
  const moveBlockReason = useCallback(
    (id: number, row: number, col: number): string | null => {
      if (!layout) return null;
      const res = canMoveRoom(layout, id, row, col);
      return res.ok ? null : res.reason;
    },
    [layout],
  );

  const labelOf = (type: string): string => gameData?.roomMetadataByType.get(type)?.name ?? type;

  // When the room in move mode has NO legal destination, explain why for the side panel: a
  // load-bearing room (a neighbour reaches the entrance only through it) names the rooms that
  // must move first; otherwise the block is geometric (no free aligned zone fits it).
  const moveBlockedReason = useMemo((): string | undefined => {
    if (movingId === null || !layout) return undefined;
    const moving = layout.byId.get(movingId);
    if (!moving) return undefined;
    const targets = validMoveTargets(layout, movingId);
    const hasReal = [...targets].some((k) => k !== `${moving.row},${moving.col}`);
    if (hasReal) return undefined;
    const stranded = strandedIfRemoved(layout, movingId);
    if (stranded.length === 0) {
      return '其他位置没有能容纳该房间的连续空位——请先拆除或移开一些房间，腾出空间。';
    }
    const names = [...new Set(stranded.map((id) => labelOf(layout.byId.get(id)?.type ?? '')))];
    const list = names.slice(0, 3).join('、') + (names.length > 3 ? '…' : '');
    const plural = names.length > 1;
    return `无法移动：${list} 只能经由该房间通往入口——请先移动${plural ? '这些房间' : '该房间'}。`;
    // labelOf is derived from gameData.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movingId, layout, gameData]);

  // Dweller name + current-location lookups (for the side panel + assign dialog).
  const dwellers = useMemo(() => save?.dwellers?.dwellers ?? [], [save]);
  // Full DwellerRow projection (shared schema shape) for the standardized assign-room table.
  const allDwellerRows = useMemo(
    () => (save ? selectDwellerRows(save, gameData ?? undefined) : []),
    [save, gameData],
  );
  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of dwellers) {
      const name = `${d.name ?? ''} ${d.lastName ?? ''}`.trim() || `#${d.serializeId}`;
      map.set(d.serializeId, name);
    }
    return map;
  }, [dwellers]);
  // `claimed` only changes when a room is unlocked (structural sharing), so the palette's
  // locked flags refresh on build without recomputing on unrelated save edits.
  const claimed = save?.unlockableMgr?.claimed;
  // Ultracite rooms only function while Ultracite Fever is the active season; otherwise the
  // Build tiles + side panel carry a "won't function here" note (see ULTRACITE_ROOM_NOTE).
  const ultraciteActive = isUltraciteSeasonActive(seasonSave);
  const palette = useMemo(
    () => buildableRooms(gameData, new Set(claimed ?? []), ultraciteActive),
    [gameData, claimed, ultraciteActive],
  );

  const buildMerge = buildType
    ? baseMergeLevel(buildType, gameData?.roomMetadataByType.get(buildType)?.width)
    : 1;
  const buildOrigins = useMemo(
    () => (layout && buildType ? validBuildOrigins(layout, buildType, buildMerge) : null),
    [layout, buildType, buildMerge],
  );
  const buildWidth = buildType ? roomCellWidth(buildType, buildMerge) : 3;

  // Running timers in the selected room, resolved for display (trainee names, the
  // crafted item's catalog name). Each side-panel action completes the timer(s) so
  // they finish during the game's on-load catch-up (timerOps). Computed before the
  // no-save early return (hooks must run unconditionally); re-derives the node itself.
  const nodeTimers = useMemo((): RoomTimerRow[] => {
    const timerNode = layout && selectedId !== null ? (layout.byId.get(selectedId) ?? null) : null;
    if (!save || !timerNode) return [];
    return roomTimers(save, timerNode.deserializeID).map((t) => {
      const craftedId = t.kind === 'crafting' ? timerNode.room.CraftingItemId : undefined;
      const itemName =
        craftedId !== undefined && craftedId !== ''
          ? (gameData?.weapons.find((w) => w.id === craftedId)?.name ??
            gameData?.outfits.find((o) => o.id === craftedId)?.name ??
            craftedId)
          : undefined;
      return {
        kind: t.kind,
        remainingSeconds: t.remainingSeconds,
        ...(t.slotDwellerId !== undefined
          ? {
              slotDwellerId: t.slotDwellerId,
              slotDwellerName: nameById.get(t.slotDwellerId) ?? `#${t.slotDwellerId}`,
            }
          : {}),
        ...(itemName !== undefined ? { itemName } : {}),
      };
    });
  }, [save, layout, selectedId, gameData, nameById]);

  if (!save || !layout) {
    return <div className="p-6 text-sm text-neutral-400">未载入存档。</div>;
  }

  const node = selectedId !== null ? (layout.byId.get(selectedId) ?? null) : null;
  const deleteTarget = deleteTargetId !== null ? (layout.byId.get(deleteTargetId) ?? null) : null;
  const meta = node ? gameData?.roomMetadataByType.get(node.type) : undefined;
  const maxLevel = meta?.maxLevel ?? 3;
  const nodeMaxDwellers = node ? maxDwellersOf(gameData, node) : 0;
  // Themes ("decoration") are stored per room TYPE in save.specialTheme.themeByRoomType.
  const themeOptions = node ? themeOptionsFor(node.type) : [];
  const currentTheme = node
    ? (save.specialTheme?.themeByRoomType?.[node.type] ?? NO_THEME)
    : NO_THEME;

  const onPlace = (row: number, col: number): void => {
    if (!buildType) return;
    const meta2 = gameData?.roomMetadataByType.get(buildType);
    const newId = nextRoomId(save);
    // Building a locked room claims its unlock in the SAME edit (one undo step).
    const wasLocked = !isRoomTypeUnlocked(save, buildType);
    applyEdit(
      (s) =>
        claimRoomUnlock(
          addRoom(s, {
            type: buildType,
            class: meta2?.class ?? '',
            row,
            col,
            mergeLevel: buildMerge,
          }),
          buildType,
        ),
      '建造房间',
    );
    // Build mode stays ACTIVE (sticky) so the same room type can be placed repeatedly without
    // re-picking it from the palette. The new room is selected for quick editing; exit build
    // mode via the palette's Cancel button or by clicking the active tile again.
    setSelectedId(newId);
    pushToast(
      wasLocked ? `已建造 ${labelOf(buildType)} · 房间已解锁` : `已建造 ${labelOf(buildType)}`,
    );
  };

  const onExcavateRock = (row: number, col: number): void => {
    applyEdit((s) => removeRockAt(s, row, col), '清除岩石');
    pushToast('已清除岩石');
  };

  const onRemoveUltracite = (row: number, col: number): void => {
    applyEdit((s) => removeUltraciteAt(s, row, col), '移除超镭');
    pushToast('已移除超镭矿床');
  };

  // Terrain placement (one undo step per cell). Mode is sticky so several cells can be
  // painted in a row; toggle the header button again, click anywhere outside the terrain
  // cells (useDismissOnOutsidePress above), or enter build mode to exit.
  const onPlaceTerrain = (row: number, col: number): void => {
    if (terrainMode === 'rock') {
      applyEdit((s) => addRockAt(s, row, col), '添加岩石');
      pushToast('已放置岩石');
    } else if (terrainMode === 'ultracite') {
      applyEdit((s) => addUltraciteAt(s, row, col), '添加超镭');
      pushToast('已放置超镭矿床');
    }
  };

  const toggleTerrain = (mode: 'rock' | 'ultracite'): void => {
    setBuildType(null);
    setMovingId(null);
    setTerrainMode((m) => (m === mode ? null : mode));
  };

  // Selecting a room (or opening the Build palette) cancels any in-progress move mode.
  // Clicking the already-selected room toggles it back off (deselect + close the side panel).
  const selectRoom = (id: number): void => {
    setMovingId(null);
    setSelectedId(id === selectedId ? null : id);
  };
  // Clicking empty (non-room) grid space deselects and closes the side panel.
  const deselectRoom = (): void => {
    setMovingId(null);
    setSelectedId(null);
  };
  const pickBuild = (type: string | null): void => {
    setMovingId(null);
    setTerrainMode(null);
    setBuildType(type);
  };

  // UX-G drag-to-build: starting a palette drag enters build mode (green cells appear); the
  // cursor is then snapped to a clamped grid origin for the ghost, and a release on a legal
  // origin builds via the same validator-gated onPlace as the click flow.
  const beginBuildDrag = (type: string): void => {
    setMovingId(null);
    setTerrainMode(null);
    setBuildType(type);
  };
  const buildGhostAt = (
    clientX: number,
    clientY: number,
  ): { row: number; col: number; legal: boolean } | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || !buildOrigins) return null;
    const { row, col } = cellFromClient(rect, clientX, clientY);
    const r = Math.min(layout.rows - 1, Math.max(0, row));
    const c = Math.min(Math.max(0, layout.cols - buildWidth), Math.max(0, col));
    return { row: r, col: c, legal: buildOrigins.has(`${r},${c}`) };
  };
  const onBuildDragMove = (x: number, y: number): void => setBuildGhost(buildGhostAt(x, y));
  const onBuildDragEnd = (x: number, y: number): void => {
    const ghost = buildGhostAt(x, y);
    setBuildGhost(null);
    // A legal drop places the room; an illegal/blank drop is a no-op that KEEPS build mode
    // active (sticky building) rather than cancelling - only the palette Cancel/toggle exits.
    if (ghost?.legal) onPlace(ghost.row, ghost.col);
  };

  // UX-G: commit a drag-drop or move-mode placement as one validator-gated edit + toast. The
  // room keeps its deserializeID, so its occupants travel with it (savedRoom stays in sync).
  // moveRoom also enforces the HARD one-Mr.-Handy-per-floor rule: if this room carries a
  // robot onto a floor that already has one, the resident robot is evicted (sent outside
  // the vault) - named in the toast so the eviction isn't silent.
  const onMoveRoom = (id: number, row: number, col: number): void => {
    const movedHasHandy = (layout.byId.get(id)?.room.mrHandyList ?? []).length > 0;
    const evicted = movedHasHandy ? residentHandiesOnFloor(save, id, row) : [];
    const evictedName =
      evicted.length > 0
        ? (handyRows.find((h) => h.serializeId === evicted[0])?.name ?? '巧手先生')
        : null;
    applyEdit((s) => moveRoom(s, id, row, col), '移动房间');
    setMovingId(null);
    pushToast(
      `已移动 ${labelOf(layout.byId.get(id)?.type ?? '')}${
        evictedName ? ` · ${evictedName} 已送出避难所（每层限一台机器人）` : ''
      }`,
    );
  };

  // Drag-to-move for rocks / ultracite deposits (the grid validates the target cell is
  // empty): one undoable edit = remove from the old cell + add at the new one.
  const onMoveTerrain = (
    kind: 'rock' | 'ultracite',
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
  ): void => {
    if (kind === 'rock') {
      applyEdit((s) => addRockAt(removeRockAt(s, fromRow, fromCol), toRow, toCol), '移动岩石');
      pushToast('岩石已移动');
    } else {
      applyEdit(
        (s) => addUltraciteAt(removeUltraciteAt(s, fromRow, fromCol), toRow, toCol),
        '移动超镭',
      );
      pushToast('超镭矿床已移动');
    }
  };

  // Rooms-screen "Repair all" (finding 5): the only bulk repair was buried in Bulk → Max
  // Everything. Disabled when nothing is damaged; one undo step + toast.
  const damagedCount = (save.vault?.rooms ?? []).filter(roomNeedsRepair).length;
  const repairAll = (): void => {
    applyEdit((s) => repairAllRooms(s), '修复所有房间');
    pushToast(`已修复 ${damagedCount} 个房间`);
  };

  // Room-scoped bulk actions surfaced inline in the header (also available in Bulk). Each is
  // one undo step + a toast, disabled when there's nothing to do.
  const rocksCount = save.vault?.rocks?.length ?? 0;
  const emergencyCount = roomsInEmergency(save).length;
  const roomsUnlocked = save.unlockableMgr?.claimed?.length ?? 0;
  const roomsTotal = gameData?.unlockables.roomUnlocks.length ?? 0;
  const removeAllRocks = (): void => {
    applyEdit((s) => removeRocks(s), '移除岩石');
    pushToast(`已移除 ${rocksCount} 块岩石`);
  };
  const clearAllEmergencies = (): void => {
    applyEdit((s) => clearEmergencies(s), '清除事故');
    pushToast(`已清除 ${emergencyCount} 起事故`);
  };
  const unlockAllRooms = (): void => {
    if (!gameData) return;
    const ids = gameData.unlockables.roomUnlocks;
    applyEdit((s) => unlockRooms(s, ids), '解锁所有房间');
    pushToast('已解锁所有房间');
  };

  // Auto-staff: fill the targeted rooms' empty slots in one undoable edit + a toast. The
  // confirm dialog offers two paths: assign idle dwellers first (generating only the
  // shortfall), or generate fresh recruits for every slot and leave idle dwellers alone.
  const runAutoStaff = (target: StaffTarget, assignExisting: boolean): void => {
    const plan = planForTarget(target);
    if (!gameData || !plan || plan.freeSlots === 0) return;
    // A room target staffs only that room (mode 'all' so non-producer stat rooms qualify too);
    // a mode target sweeps every matching room.
    const opts =
      'roomId' in target
        ? { mode: 'all' as StaffMode, generate: true, assignExisting, onlyRoomId: target.roomId }
        : { mode: target.mode, generate: true, assignExisting };
    const label =
      'roomId' in target
        ? '自动派驻该房间'
        : target.mode === 'all'
          ? '自动派驻所有房间'
          : '自动派驻生产房间';
    applyEdit((s) => autoStaff(s, gameData, opts), label);
    const assigned = assignExisting ? plan.toAssign : 0;
    const generated = assignExisting ? plan.toGenerate : plan.freeSlots;
    const parts: string[] = [];
    if (assigned > 0) parts.push(`派驻 ${assigned} 名空闲居民`);
    if (generated > 0) parts.push(`生成 ${generated} 名新居民`);
    pushToast(parts.length ? parts.join('，') : '无变更');
    setStaffConfirm(null);
  };
  const onAutoStaffClick = (target: StaffTarget): void => {
    const plan = planForTarget(target);
    if (!plan || plan.freeSlots === 0) return;
    setStaffConfirm(target);
  };
  const fixDesync = (): void => {
    if (!desync) return;
    applyEdit(desync.repair, '清理房间工作列表');
    pushToast(`已移除 ${desync.count} 条无效的工作条目`);
  };

  const occupants = (node?.room.dwellers ?? []).map((id) => ({
    id,
    name: nameById.get(id) ?? `#${id}`,
  }));

  // Per-room loadout context action: equip the room's primary-SPECIAL default outfit +
  // best weapon onto its occupants. Available only for staffed rooms with a primary stat.
  // The exact picks are resolved up-front so the side panel can name them (finding 4 - the
  // button used to be opaque about what it equips).
  const statKey = node && gameData ? statKeyForSpecial(meta?.primaryStat) : null;
  const suggestedOutfit = gameData && statKey ? suggestOutfitForStat(gameData, statKey) : null;
  const suggestedWeapon = gameData && statKey ? suggestWeapon(gameData) : null;
  const applyRoomLoadout =
    node && gameData && statKey
      ? () => {
          const outfitId = suggestedOutfit?.id;
          const weaponId = suggestedWeapon?.id;
          const ids = node.room.dwellers ?? [];
          applyEdit(
            (s) =>
              applyLoadout(s, ids, {
                ...(outfitId ? { outfitId } : {}),
                ...(weaponId ? { weaponId } : {}),
              }),
            '应用房间配装',
          );
          pushToast(`已为 ${ids.length} 名在住居民应用配装`);
        }
      : undefined;
  const loadoutHelp =
    node && statKey
      ? `为全部 ${occupants.length} 名在住居民装备 ${suggestedOutfit?.name ?? '最佳服装'}（最强的 ${statLabel(meta?.primaryStat)} 服装）与 ` +
        `${suggestedWeapon?.name ?? '最佳武器'}（伤害最高），并覆盖其现有装备。` +
        `可在「批量 → 场所装备配置」中按房间类型配置精确配装。`
      : undefined;
  const openBulkLoadouts = (): void => {
    setBulkFocus('loadouts');
    goToSection('bulk');
  };

  // Dwellers assignable to the selected room = everyone not already in it (filtered from the
  // shared DwellerRow projection below), so the assign dialog renders the standardized dweller
  // table (full column schema behind the Columns button), like every other dweller picker.
  const assignable: DwellerRow[] = node
    ? allDwellerRows.filter((r) => !(node.room.dwellers ?? []).includes(r.serializeId))
    : [];

  // Below md the header buttons/banners/palette stack tall enough to push the grid off
  // screen, so the PANE scrolls on phones. On md+ the grid keeps its own internal scroll,
  // but the pane stays `overflow-y-auto` (not `visible`) so that on SHORT desktop viewports
  // - laptops, or a browser bloated by bookmark/translate bars - the pre-grid content
  // (header, advisor + economy banners, build palette) can still be scrolled into view
  // instead of being clipped behind the bottom edge with no scrollbar.
  const gridPane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">房间</h2>
        <span className="text-sm text-neutral-400">{layout.nodes.length} 个房间</span>
        {gameDataStatus === 'loading' && (
          <span className="text-xs text-neutral-400">游戏数据加载中…</span>
        )}
        {gameDataStatus === 'error' && (
          <span className="text-xs text-amber-500">游戏数据不可用——名称/造价已隐藏</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={damagedCount === 0}
            onClick={repairAll}
            title={
              damagedCount === 0
                ? '没有受损的房间'
                : `将全部 ${damagedCount} 个受损房间累积的事故（烧灼）损伤清零。` +
                  `这种损伤只影响外观，不影响生产；主要用于修复在事故中途保存的存档。`
            }
            className={HEADER_BTN}
          >
            全部修复{damagedCount > 0 ? ` (${damagedCount})` : ''}
          </button>
          <button
            type="button"
            disabled={rocksCount === 0}
            onClick={removeAllRocks}
            title={rocksCount === 0 ? '没有可移除的岩石' : `移除 ${rocksCount} 块岩石`}
            className={HEADER_BTN}
          >
            移除岩石{rocksCount > 0 ? ` (${rocksCount})` : ''}
          </button>
          <button
            type="button"
            data-terrain-toggle=""
            onClick={() => toggleTerrain('rock')}
            aria-pressed={terrainMode === 'rock'}
            title="在空的地下单元格放置岩石（再次点击退出）"
            className={`${HEADER_BTN} ${terrainMode === 'rock' ? 'border-amber-500 text-amber-300' : ''}`}
          >
            + 岩石
          </button>
          <button
            type="button"
            data-terrain-toggle=""
            onClick={() => toggleTerrain('ultracite')}
            aria-pressed={terrainMode === 'ultracite'}
            title="在空的地下单元格放置超镭矿床（再次点击退出）。超镭采矿场是超镭狂热赛季的功能房间。"
            className={`${HEADER_BTN} ${terrainMode === 'ultracite' ? 'border-fuchsia-500 text-fuchsia-300' : ''}`}
          >
            + 超镭
          </button>
          <button
            type="button"
            disabled={emergencyCount === 0}
            onClick={clearAllEmergencies}
            title={emergencyCount === 0 ? '没有进行中的事故' : `清除 ${emergencyCount}`}
            className={HEADER_BTN}
          >
            清除事故{emergencyCount > 0 ? ` (${emergencyCount})` : ''}
          </button>
          <button
            type="button"
            disabled={roomsTotal === 0 || roomsUnlocked >= roomsTotal}
            onClick={unlockAllRooms}
            title={
              roomsTotal === 0
                ? '游戏数据加载中…'
                : `解锁所有房间（已解锁 ${roomsUnlocked} / ${roomsTotal}）`
            }
            className={HEADER_BTN}
          >
            解锁所有房间
          </button>
        </div>
      </div>

      {desync && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="min-w-0 text-neutral-200">
              <span className="font-medium text-red-300">房间工作列表已损坏。</span> 有{' '}
              {desync.count}{' '}
              条工作条目指向不存在的居民，或将同一名居民同时排进两个房间，因而下方的在住人数可能显示有误。可在避难所标签页的健康检查中查看逐条明细。
            </p>
            <button
              type="button"
              onClick={fixDesync}
              className="shrink-0 rounded bg-red-500 px-3 py-1.5 text-sm font-medium text-neutral-50 transition-colors hover:bg-red-400"
            >
              修复工作列表 ({desync.count})
            </button>
          </div>
        </div>
      )}

      {/* Advisors section (the recommendations banner), collapsible to just its header
          line so the grid gets the vertical space back (persisted preference). */}
      {advisorReport && (advisorReport.issueCount > 0 || (staffPlanAll?.freeSlots ?? 0) > 0) && (
        <section>
          <SectionToggle
            label="优化建议"
            collapsed={advisorsCollapsed}
            onToggle={() => setAdvisorsCollapsed(!advisorsCollapsed)}
            {...(advisorsCollapsed && advisorReport.issueCount > 0
              ? {
                  hint: `${advisorReport.issueCount} 条建议`,
                }
              : {})}
          />
          {!advisorsCollapsed && (
            <div className="mt-1.5">
              <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                <p className="text-neutral-300">
                  {advisorReport.issueCount > 0 && (
                    <span className="font-medium text-amber-300">
                      共 {advisorReport.issueCount} 条优化建议。{' '}
                    </span>
                  )}
                  这里是优化提示（人手不足的房间、资源短缺、空闲居民），并非存档错误。{' '}
                  <span aria-hidden className="text-amber-400">
                    ⚠️
                  </span>{' '}
                  标记的是需要关注的 <span className="text-neutral-200">资源生产房间</span>（食物 /
                  水 /
                  电力）——点击房间可查看详情。其他属性房间（健身房、广播室、休息室等）不会标记，但仍可在下方派驻居民。
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {staffPlanOutput && staffPlanOutput.freeSlots > 0 && (
                    <button
                      type="button"
                      onClick={() => onAutoStaffClick({ mode: 'output' })}
                      title={`填充生产房间的 ${staffPlanOutput.freeSlots} 个空位（派驻 ${staffPlanOutput.toAssign} 名空闲居民${staffPlanOutput.toGenerate > 0 ? `，生成 ${staffPlanOutput.toGenerate} 名` : ''}）`}
                      className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-amber-400"
                    >
                      自动派驻生产房间 ({staffPlanOutput.freeSlots})
                    </button>
                  )}
                  {staffPlanAll && staffPlanAll.freeSlots > 0 && (
                    <button
                      type="button"
                      onClick={() => onAutoStaffClick({ mode: 'all' })}
                      title={`填充所有属性房间的 ${staffPlanAll.freeSlots} 个空位（派驻 ${staffPlanAll.toAssign} 名空闲居民${staffPlanAll.toGenerate > 0 ? `，生成 ${staffPlanAll.toGenerate} 名` : ''}）`}
                      className="rounded border border-amber-500/60 px-3 py-1.5 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/10"
                    >
                      自动派驻所有房间 ({staffPlanAll.freeSlots})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Resource economy - its own collapsible section, independent of Advisors. */}
      {advisorReport && (
        <ResourceEconomyPanel
          resources={advisorReport.resources}
          collapsed={economyCollapsed}
          onToggleCollapsed={() => setEconomyCollapsed(!economyCollapsed)}
        />
      )}

      <BuildPalette
        rooms={palette}
        activeType={buildType}
        onPick={pickBuild}
        onBuildDragStart={beginBuildDrag}
        onBuildDragMove={onBuildDragMove}
        onBuildDragEnd={onBuildDragEnd}
        collapsed={buildCollapsed}
        onToggleCollapsed={() => setBuildCollapsed(!buildCollapsed)}
      />

      {/* Guarantee the grid a real height on EVERY viewport. flex-1 lets it grow to fill on
          tall screens; the min-height floor stops it collapsing on short ones - without it the
          palette + banners eat the whole pane and the flex-1 wrapper shrinks to ~0, leaving the
          vault map as an unusable sliver (the map's own scroll then hides all the rooms). With
          the floor the map stays usable and the pane scrolls to bring it into view. */}
      <div className="flex min-h-[65vh] flex-1 flex-col">
        <RoomGrid
          layout={layout}
          selectedId={selectedId}
          onSelect={selectRoom}
          onDeselect={deselectRoom}
          labelOf={labelOf}
          maxDwellersOf={(n) => maxDwellersOf(gameData, n)}
          needsRepair={(n) => roomNeedsRepair(n.room)}
          inEmergency={(n) => isRoomInEmergency(n.room)}
          roomAdvisory={(n) => roomAdvisory(n.deserializeID)}
          buildOrigins={buildOrigins}
          buildWidth={buildWidth}
          onPlace={onPlace}
          onExcavateRock={onExcavateRock}
          onRemoveUltracite={onRemoveUltracite}
          terrainMode={terrainMode}
          onPlaceTerrain={onPlaceTerrain}
          canMove={(n) => n.type !== ENTRANCE_TYPE && n.type !== FAKE_WASTELAND_TYPE}
          moveTargetsFor={moveTargetsFor}
          onMoveRoom={onMoveRoom}
          moveBlockReason={moveBlockReason}
          canRemove={(n) => canRemoveRoom(layout, n.deserializeID).ok}
          onDeleteRoom={(id) => setDeleteTargetId(id)}
          moveModeId={movingId}
          gridRef={gridRef}
          buildGhost={buildGhost}
          handyRail={handyRail}
          armedHandyId={armedHandy}
          onHandySlotClick={onHandySlotClick}
          outsideHandies={unassignedHandies}
          outsideRow={layout.nodes.find((n) => n.type === FAKE_WASTELAND_TYPE)?.row ?? 0}
          onOutsideHandyClick={(id) => setArmedHandy((cur) => (cur === id ? null : id))}
          armedHandyIsPlaced={
            armedHandy !== null &&
            (handyRows.find((h) => h.serializeId === armedHandy)?.floor ?? null) !== null
          }
          onSendArmedOutside={() => {
            if (armedHandy === null) return;
            const id = armedHandy;
            applyEdit((s) => unassignMrHandy(s, id), '取消派驻巧手先生');
            pushToast('巧手先生已送出避难所（在大门等待）。');
            setArmedHandy(null);
          }}
          onHandyDragStart={(id) => setArmedHandy(id)}
          onHandyDrop={onHandyDrop}
          onMoveTerrain={onMoveTerrain}
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <ResizableSplit
        ariaLabel="调整房间详情面板宽度"
        width={panelWidth}
        onWidthChange={setPanelWidth}
        min={240}
        left={gridPane}
        right={
          node ? (
            <RoomSidePanel
              node={node}
              label={labelOf(node.type)}
              maxLevel={maxLevel}
              maxDwellers={nodeMaxDwellers}
              occupants={occupants}
              advisories={advisoriesByRoom.get(node.deserializeID) ?? []}
              canRemove={canRemoveRoom(layout, node.deserializeID)}
              mergeable={canMergeRoom(layout, node.deserializeID)}
              onClose={() => {
                setMovingId(null);
                setSelectedId(null);
              }}
              {...(node.type !== ENTRANCE_TYPE && node.type !== FAKE_WASTELAND_TYPE
                ? {
                    onToggleMove: () =>
                      setMovingId((m) => (m === node.deserializeID ? null : node.deserializeID)),
                    moveActive: movingId === node.deserializeID,
                    ...(moveBlockedReason ? { moveBlockedReason } : {}),
                  }
                : {})}
              onSetLevel={(level) =>
                applyEdit(
                  (s) => setRoomLevel(s, node.deserializeID, level, maxLevel),
                  '设置房间等级',
                )
              }
              onMaxLevel={() =>
                applyEdit((s) => maxRoomLevel(s, node.deserializeID, maxLevel), '房间等级拉满')
              }
              onRepair={() => applyEdit((s) => repairRoom(s, node.deserializeID), '修复房间')}
              onSetPower={(p) =>
                applyEdit((s) => setRoomPower(s, node.deserializeID, p), '切换房间供电')
              }
              themeOptions={themeOptions}
              currentTheme={currentTheme}
              onSetTheme={(value) =>
                applyEdit((s) => setRoomTheme(s, node.type, value), '设置房间主题')
              }
              onMerge={() => {
                const m = canMergeRoom(layout, node.deserializeID);
                if (m.ok && m.neighbourId !== undefined) {
                  applyEdit(
                    (s) => mergeRoomWith(s, node.deserializeID, m.neighbourId!),
                    '合并房间',
                  );
                  pushToast(`已合并 ${labelOf(node.type)}`);
                }
              }}
              onUnassign={(dwellerId) =>
                applyEdit((s) => unassignDweller(s, dwellerId), '取消派驻居民')
              }
              onOpenAssign={() => setAssignOpen(true)}
              floorHandy={(() => {
                const h = handyRows.find((x) => x.floor === node.row);
                return h ? { id: h.serializeId, name: h.name } : null;
              })()}
              unassignedHandies={unassignedHandies}
              onAssignHandy={(actorId) => {
                applyEdit(
                  (s) => assignMrHandyToRoom(s, actorId, node.deserializeID),
                  '派驻巧手先生',
                );
                pushToast('巧手先生已派驻到该房间。');
              }}
              onCreateHandy={() => {
                applyEdit(
                  (s) =>
                    createMrHandy(s, {
                      roomId: node.deserializeID,
                      health: gameData?.roomCapacity.base.mrHandyHealth ?? DEFAULT_MR_HANDY_HEALTH,
                    }),
                  '创建巧手先生',
                );
                pushToast('已在该房间创建新的巧手先生。');
              }}
              onUnassignHandy={(actorId) => {
                applyEdit((s) => unassignMrHandy(s, actorId), '取消派驻巧手先生');
                pushToast('巧手先生已送出避难所（在大门等待）。');
              }}
              timers={nodeTimers}
              productionAwaitingCollect={isProductionAwaitingCollect(save, node.deserializeID)}
              {...(!ultraciteActive && ULTRACITE_ROOM_NOTE[node.type]
                ? { seasonNote: ULTRACITE_ROOM_NOTE[node.type] }
                : {})}
              onCompleteTimers={(kinds) => {
                applyEdit(
                  (s) => completeRoomTimersNow(s, node.deserializeID, kinds),
                  kinds.length === 1
                    ? `完成${TIMER_KIND_LABEL[kinds[0]] ?? kinds[0]}计时`
                    : '完成房间计时',
                );
                pushToast('计时器将在下次于游戏中载入存档时完成');
              }}
              onCompleteTrainingSlot={(dwellerId) => {
                applyEdit(
                  (s) => completeTrainingSlotNow(s, node.deserializeID, dwellerId),
                  '完成训练周期',
                );
                pushToast('训练周期将在下次载入游戏时完成');
              }}
              onDelete={() => setDeleteTargetId(node.deserializeID)}
              {...(applyRoomLoadout
                ? {
                    onApplyLoadout: applyRoomLoadout,
                    loadoutLabel: `应用${statLabel(meta?.primaryStat)}配装`,
                    onOpenBulkLoadouts: openBulkLoadouts,
                    ...(loadoutHelp ? { loadoutHelp } : {}),
                  }
                : {})}
              {...((selectedRoomStaffPlan?.freeSlots ?? 0) > 0
                ? {
                    autoStaffFree: selectedRoomStaffPlan!.freeSlots,
                    onAutoStaff: () => onAutoStaffClick({ roomId: node.deserializeID }),
                  }
                : {})}
            />
          ) : null
        }
      />

      {node && (
        <AssignRoomDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          roomLabel={labelOf(node.type)}
          dwellers={assignable}
          remaining={nodeMaxDwellers > 0 ? Math.max(0, nodeMaxDwellers - occupants.length) : 0}
          onAssign={(ids) => {
            applyEdit(
              (s) => ids.reduce((acc, id) => assignDweller(acc, node.deserializeID, id), s),
              '派驻居民',
            );
            pushToast(`已派驻 ${ids.length} 名居民`);
          }}
        />
      )}

      {staffConfirm && pendingPlan && (
        <ConfirmDialog
          open
          title={
            'roomId' in staffConfirm
              ? `自动派驻 ${labelOf(layout.byId.get(staffConfirm.roomId)?.type ?? '')}`
              : staffConfirm.mode === 'all'
                ? '自动派驻所有房间'
                : '自动派驻生产房间'
          }
          message={
            <>
              有 {pendingPlan.freeSlots} 个空位需要填充。请选择填充方式（始终有两个选项）：
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <span className="text-neutral-100">派驻空闲 + 生成</span>——先派驻{' '}
                  {pendingPlan.toAssign} 名空闲居民
                  {pendingPlan.toGenerate > 0
                    ? `，再生成 ${pendingPlan.toGenerate} 名新居民补足其余`
                    : ''}
                  。
                </li>
                <li>
                  <span className="text-neutral-100">全部生成</span>——为每个空位生成{' '}
                  {pendingPlan.freeSlots} 名新居民，现有居民保持原位。
                </li>
              </ul>
              <span className="mt-2 block text-xs text-neutral-400">
                新居民会自动命名，属性按避难所平均水平生成，并为其房间配好装备。整个操作只需一步，可撤销。
              </span>
            </>
          }
          confirmLabel={
            pendingPlan.toGenerate > 0
              ? `派驻 ${pendingPlan.toAssign} 名空闲 + 生成 ${pendingPlan.toGenerate}`
              : `派驻 ${pendingPlan.toAssign} 名空闲`
          }
          onConfirm={() => runAutoStaff(staffConfirm, true)}
          secondaryLabel={`全部生成 ${pendingPlan.freeSlots}`}
          onSecondary={() => runAutoStaff(staffConfirm, false)}
          onCancel={() => setStaffConfirm(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="删除房间"
          message={`移除第 ${displayFloor(deleteTarget.row)} 层的${labelOf(deleteTarget.type)}？已派驻的居民将返回避难所大门。`}
          confirmLabel="删除"
          destructive
          onCancel={() => setDeleteTargetId(null)}
          onConfirm={() => {
            const id = deleteTarget.deserializeID;
            const label = labelOf(deleteTarget.type);
            applyEdit((s) => removeRoom(s, id), '删除房间');
            setDeleteTargetId(null);
            if (selectedId === id) setSelectedId(null);
            pushToast(`已删除 ${label}`);
          }}
        />
      )}
    </div>
  );
}
