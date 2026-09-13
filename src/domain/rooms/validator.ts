import {
  ELEVATOR_TYPE,
  ENTRANCE_TYPE,
  FAKE_WASTELAND_TYPE,
  MAX_MERGE_LEVEL,
  allReachEntrance,
  findOverlap,
  occupancy,
  reachesEntrance,
  roomCellWidth,
  type CellBox,
  type Layout,
  type RoomNode,
} from './layout.ts';

// The vault-layout VALIDATOR. This is the
// product's highest save-corruption risk: an invalid room layout is an unrecoverable
// broken save, so every structural edit is checked HERE and BLOCKED with a plain reason
// rather than written. The rules mirror the game's own construction logic (Assembly-CSharp
// ConstructionGrid / ConstructionMgr.GenerateBuildZones / Room.CalculateRoomNeighbors /
// BaseConstructionMgr.CanReachEntrance / CanMergeRoom) and are tested against the real
// Vault1.sav layout.
//
// The game's placement rule is exactly: in-bounds on the fixed 26×25 grid, no overlap, no
// rock/ultracite cells, and flush adjacency to connected structure. Build zones only spawn
// left/right of rooms and 4-around elevators (ConstructionMgr.GenerateBuildZones), and the
// neighbour graph counts horizontal touching (any types) + vertical elevator to elevator,
// so requiring the candidate to reach the Entrance through that graph reproduces the game's
// build-zone offers exactly. There is NO global column-alignment rule: alignment emerges
// per contiguous run from flush adjacency, and floors may be offset from each other.

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const OK: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });

/** Sentinel id for a hypothetical room not yet in the save (won't collide with real ids). */
const CANDIDATE_ID = -1;

/** A proposed room placement (build or move target). */
export interface PlacementSpec {
  type: string;
  row: number;
  col: number;
  mergeLevel: number;
}

/** Reduce a placement spec to the geometry box the graph reasons about. */
function candidateBox(spec: PlacementSpec): CellBox {
  const isElevator = spec.type === ELEVATOR_TYPE;
  const width = roomCellWidth(spec.type, isElevator ? 1 : spec.mergeLevel);
  return {
    deserializeID: CANDIDATE_ID,
    type: spec.type,
    isElevator,
    row: spec.row,
    col: spec.col,
    colEnd: spec.col + width,
  };
}

/** Geometry checks shared by build + move (no connectivity). */
function checkPlacement(
  layout: Layout,
  box: CellBox,
  others: readonly CellBox[],
): ValidationResult {
  if (box.row < 0 || box.row >= layout.rows) {
    return fail(`楼层 ${box.row} 超出避难所范围（0–${layout.rows - 1}）。`);
  }
  if (box.col < 0 || box.colEnd > layout.cols) {
    return fail(`该位置超出避难所边缘（列 0–${layout.cols - 1}）。`);
  }
  if (findOverlap([...others, box])) {
    return fail('该位置已被其他房间占用。');
  }
  // A room cannot occupy an unexcavated rock or ultracite cell - the game requires clear
  // dirt before construction (ConstructionGrid.CanGetSpace). Without this, once elevators
  // reach the lower undug floors a room could be built/moved straight onto rock, corrupting
  // the layout. (The game lets an UltraciteMining room cover deposits; the editor stays
  // conservative and blocks all types.)
  for (let c = box.col; c < box.colEnd; c++) {
    if (layout.rocks.has(`${box.row},${c}`)) {
      return fail('该位置有岩石，请先挖掘。');
    }
    if (layout.ultracite.has(`${box.row},${c}`)) {
      return fail('该位置有超镭矿床。');
    }
  }
  return OK;
}

/** Whether a brand-new room of `spec` can be built. */
export function canBuildRoom(layout: Layout, spec: PlacementSpec): ValidationResult {
  const merge = spec.type === ELEVATOR_TYPE ? 1 : spec.mergeLevel;
  if (merge < 1 || merge > MAX_MERGE_LEVEL) {
    return fail(`合并宽度必须为 1–${MAX_MERGE_LEVEL}。`);
  }
  const box = candidateBox(spec);
  const placement = checkPlacement(layout, box, layout.nodes);
  if (!placement.ok) return placement;

  // The new room must reach the Entrance through the resulting layout (no floaters).
  const all = [...layout.nodes, box];
  if (box.type !== ENTRANCE_TYPE && !reachesEntrance(all, box)) {
    return fail('新房间必须连接到电梯，或连接到可通往入口的现有房间。');
  }
  return OK;
}

/** Whether `id` can be removed without stranding any remaining room from the entrance. */
export function canRemoveRoom(layout: Layout, id: number): ValidationResult {
  const node = layout.byId.get(id);
  if (!node) return fail('未找到该房间。');
  if (node.type === ENTRANCE_TYPE) return fail('避难所入口无法移除。');
  if (node.type === FAKE_WASTELAND_TYPE) return fail('废土地块无法移除。');

  const remaining = layout.nodes.filter((n) => n.deserializeID !== id);
  const cells = occupancy(remaining);
  const stranded = remaining.find((n) => !reachesEntrance(remaining, n, cells));
  if (stranded) {
    return fail('移除此房间会导致其他房间与入口断开连接。');
  }
  return OK;
}

/** Whether `id` can be moved to (`row`,`col`) keeping the whole layout valid. */
export function canMoveRoom(
  layout: Layout,
  id: number,
  row: number,
  col: number,
): ValidationResult {
  const node = layout.byId.get(id);
  if (!node) return fail('未找到该房间。');
  if (node.type === FAKE_WASTELAND_TYPE) return fail('废土地块无法移动。');

  const others = layout.nodes.filter((n) => n.deserializeID !== id);
  const box = candidateBox({ type: node.type, row, col, mergeLevel: node.mergeLevel });
  const placement = checkPlacement(layout, box, others);
  if (!placement.ok) return placement;

  // The moved room AND every other room must still reach the entrance afterwards. One
  // flood-fill from the Entrance (O(n)) rather than a per-room sweep (O(n²)) - this runs once
  // per candidate cell across the whole grid, so the quadratic version froze drag start.
  const all = [...others, box];
  if (!allReachEntrance(all)) {
    return fail('该移动会导致某个房间与入口断开连接。');
  }
  return OK;
}

/**
 * The rooms that would lose their path to the Entrance if `id` were lifted out of the layout
 * (its cells left empty). Powers the "why can't this move?" feedback: a room with NO legal
 * move target is usually load-bearing - a neighbour reaches the Entrance only through it, so
 * lifting it strands that neighbour wherever the dragged room lands. Returns their
 * deserializeIDs (empty when removing `id` strands nothing - then the block is geometric).
 */
export function strandedIfRemoved(layout: Layout, id: number): number[] {
  const node = layout.byId.get(id);
  if (!node) return [];
  const remaining = layout.nodes.filter((n) => n.deserializeID !== id);
  const cells = occupancy(remaining);
  return remaining
    .filter(
      (n) =>
        n.type !== ENTRANCE_TYPE &&
        n.type !== FAKE_WASTELAND_TYPE &&
        !reachesEntrance(remaining, n, cells),
    )
    .map((n) => n.deserializeID);
}

/**
 * Whether `id` can merge with a same-type neighbour (BaseConstructionMgr.CanMergeRoom):
 * a left/right room of the same type + same level, total merge ≤ 3. Returns the absorbable
 * neighbour id on success.
 */
export function canMergeRoom(
  layout: Layout,
  id: number,
): ValidationResult & { neighbourId?: number } {
  const node = layout.byId.get(id);
  if (!node) return fail('未找到该房间。');
  if (node.isElevator) return fail('电梯无法合并。');
  if (node.mergeLevel >= MAX_MERGE_LEVEL) return fail('该房间已达到最大合并宽度。');

  const cells = occupancy(layout.nodes);
  const left = cells.get(`${node.row},${node.col - 1}`);
  const right = cells.get(`${node.row},${node.colEnd}`);
  for (const nb of [left, right]) {
    if (
      nb &&
      nb.deserializeID !== node.deserializeID &&
      nb.type === node.type &&
      nb.level === node.level &&
      node.mergeLevel + nb.mergeLevel <= MAX_MERGE_LEVEL
    ) {
      return { ok: true, neighbourId: nb.deserializeID };
    }
  }
  return fail('没有可合并的同类型同级相邻房间。');
}

/** Whether a room level is within the type's legal range (1..maxLevel from room metadata). */
export function canSetRoomLevel(maxLevel: number, level: number): ValidationResult {
  if (level < 1 || level > maxLevel) return fail(`等级必须为 1–${maxLevel}。`);
  return OK;
}

/**
 * Full-layout integrity check: no overlaps, every room reaches the entrance, all in bounds.
 * Used as a safety net (and to assert real saves are self-consistent in tests).
 */
export function validateLayout(layout: Layout): ValidationResult {
  const overlap = findOverlap(layout.nodes);
  if (overlap) {
    return fail(
      `房间在楼层 ${overlap.a.row} 重叠（#${overlap.a.deserializeID}/#${overlap.b.deserializeID}）。`,
    );
  }
  const cells = occupancy(layout.nodes);
  for (const n of layout.nodes) {
    if (n.row < 0 || n.row >= layout.rows || n.col < 0 || n.colEnd > layout.cols) {
      return fail(`房间 #${n.deserializeID} 超出边界。`);
    }
    if (n.type !== ENTRANCE_TYPE && !reachesEntrance(layout.nodes, n, cells)) {
      return fail(`房间 #${n.deserializeID}（${n.type}）无法到达入口。`);
    }
  }
  return OK;
}

export type { RoomNode };
