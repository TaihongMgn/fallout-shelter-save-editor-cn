import type { Dweller, Room, SaveData } from '../model/saveSchema.ts';
import { isLosslessInt } from '../codec/losslessJson.ts';
import { COLLECTION_KEYS, collectionCodes } from '../ops/collectionOps.ts';

// Pre-export change summary. A pure
// snapshot diff of the decoded ORIGINAL save against the current working save - no edit
// journal, so it reflects real state rather than intentions and needs nothing threaded
// through the ops or undo/redo. It only knows how to describe the structured edit surface
// (the dweller fields the ops touch + inventory item count); any other top-level key
// that changed is surfaced generically as a safety net.

/** One changed field on a dweller, rendered as a plain "before → after" line. */
export interface FieldChange {
  label: string;
  before: string;
  after: string;
}

/** A dweller that was added or removed (identified for the summary list). */
export interface DwellerRef {
  serializeId: number;
  name: string;
}

/** A dweller present in both saves whose edit-surface fields differ. */
export interface DwellerModification extends DwellerRef {
  fields: FieldChange[];
}

/** A room present in both saves whose tracked fields differ ("Diner #26"). */
export interface RoomModification {
  label: string;
  fields: FieldChange[];
}

/** One Survival Guide collection list that changed (survivalW weapons/outfits/…). */
export interface GuideListChange {
  /** Save list key, e.g. "weapons". */
  list: string;
  added: number;
  removed: number;
  /** Entries whose new/seen ("N"/"O") state flipped without being added or removed. */
  stateFlipped: number;
}

/** A generic leaf-level change anywhere in the save (the granular safety net). */
export interface PathChange {
  /** JSONPath-ish location, e.g. `MysteriousStranger.timeToAppear`. */
  path: string;
  before: string;
  after: string;
}

export interface ChangeSummary {
  dwellersAdded: DwellerRef[];
  dwellersRemoved: DwellerRef[];
  dwellersModified: DwellerModification[];
  /** Room labels built / removed, and per-room field changes (level/power/workers/…). */
  roomsAdded: string[];
  roomsRemoved: string[];
  roomsModified: RoomModification[];
  /** Resource amounts that changed (label = resource key, e.g. "Nuka"). */
  resourcesChanged: FieldChange[];
  /** Per-item stored-count changes (label = item id, e.g. "StimPack ×12 → ×25"). */
  itemsChanged: FieldChange[];
  /** Openable-box count changes by type (Lunchbox / Mr. Handy box / Pet carrier / …). */
  boxesChanged: FieldChange[];
  /** Recipe ids unlocked / removed (survivalW.recipes). */
  recipesAdded: string[];
  recipesRemoved: string[];
  /** Survival Guide collection lists that changed (survivalW weapons/outfits/…). */
  guideChanged: GuideListChange[];
  /** Set when the stored inventory item count changed (e.g. a pet attached/detached). */
  inventoryDelta: { before: number; after: number } | null;
  /**
   * Leaf-level changes in every part of the save NOT covered above (managers, actors,
   * vault name/theme, rocks, …), so no edit ever shows as an unexplained label.
   */
  otherChanges: PathChange[];
  /** How many more `otherChanges` exist beyond the display cap. */
  otherChangesTruncated: number;
  /** Generic labels for any other top-level section whose reference changed. */
  otherSectionsChanged: string[];
  hasChanges: boolean;
}

const GENDER: Record<number, string> = { 1: '女', 2: '男' };
const SPECIAL_NAMES = ['力量', '感知', '耐力', '魅力', '智力', '敏捷', '幸运'];

const num = (n: number | undefined): string => (n === undefined ? '–' : String(Math.round(n)));
const bool = (b: boolean | undefined): string => (b ? '是' : '否');
const hex = (n: number | undefined): string =>
  n === undefined ? '–' : `#${(n >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

/** Display label for an equipped item slot ("none" when absent). */
function itemLabel(item: Dweller['equippedPet']): string {
  if (!item) return '无';
  const unique = item.extraData?.uniqueName;
  return unique ? `${item.id} (${unique})` : item.id;
}

const displayName = (d: Dweller): string =>
  [d.name, d.lastName].filter((s) => s).join(' ') || `#${d.serializeId}`;

// Each extractor renders one comparable field of a dweller to a display string. A field
// is reported only when its rendered value differs between the two snapshots.
const FIELD_EXTRACTORS: ReadonlyArray<{ label: string; get: (d: Dweller) => string }> = [
  { label: '名', get: (d) => d.name ?? '' },
  { label: '姓', get: (d) => d.lastName ?? '' },
  { label: '性别', get: (d) => GENDER[d.gender ?? 0] ?? '–' },
  { label: '稀有度', get: (d) => d.rarity ?? '–' },
  ...SPECIAL_NAMES.map((name, i) => ({
    label: name,
    get: (d: Dweller) => num(d.stats?.stats?.[i + 1]?.value),
  })),
  { label: '等级', get: (d) => num(d.experience?.currentLevel) },
  { label: '生命值', get: (d) => num(d.health?.healthValue) },
  { label: '最大生命值', get: (d) => num(d.health?.maxHealth) },
  { label: '辐射', get: (d) => num(d.health?.radiationValue) },
  { label: '幸福度', get: (d) => num(d.happiness?.happinessValue) },
  { label: '肤色', get: (d) => hex(d.skinColor) },
  { label: '发色', get: (d) => hex(d.hairColor) },
  { label: '服装颜色', get: (d) => hex(d.outfitColor) },
  { label: '发型', get: (d) => d.hair ?? '–' },
  { label: '胡须', get: (d) => d.faceMask ?? '无' },
  { label: '怀孕中', get: (d) => bool(d.pregnant) },
  { label: '婴儿即将出生', get: (d) => bool(d.babyReady) },
  { label: '武器', get: (d) => d.equipedWeapon?.id ?? '无' },
  { label: '服装', get: (d) => d.equipedOutfit?.id ?? '无' },
  { label: '宠物', get: (d) => itemLabel(d.equippedPet) },
];

function diffDweller(
  before: Dweller,
  after: Dweller,
  roomLabel: (id: number | undefined) => string,
): FieldChange[] {
  const fields: FieldChange[] = [];
  for (const { label, get } of FIELD_EXTRACTORS) {
    const b = get(before);
    const a = get(after);
    if (b !== a) fields.push({ label, before: b, after: a });
  }
  // Location is resolved against the save's rooms (not an extractor - it needs context),
  // so an assignment reads "Vault door → Diner #26" instead of raw ids.
  if (before.savedRoom !== after.savedRoom) {
    fields.push({
      label: '位置',
      before: roomLabel(before.savedRoom),
      after: roomLabel(after.savedRoom),
    });
  }
  return fields;
}

// Per-room comparable fields, rendered like the dweller extractors. Workers resolve to
// dweller names via `nameOf` so an auto-staff step reads as WHO moved WHERE.
const ROOM_EXTRACTORS: ReadonlyArray<{
  label: string;
  get: (r: Room, nameOf: (id: number) => string) => string;
}> = [
  { label: '等级', get: (r) => num(r.level) },
  { label: '供电', get: (r) => bool(r.power) },
  {
    label: '工作人员',
    get: (r, nameOf) => (r.dwellers ?? []).map(nameOf).join(', ') || '无',
  },
  { label: '巧手先生', get: (r) => String((r.mrHandyList ?? []).length) },
  { label: '伤害', get: (r) => num(r.roomHealth?.damageValue) },
  { label: '合并宽度', get: (r) => num(r.mergeLevel) },
  { label: '主题', get: (r) => r.assignedDecoration ?? '无' },
  { label: '状态', get: (r) => r.currentStateName ?? '–' },
  {
    label: '坐标',
    get: (r) => (r.row !== undefined || r.col !== undefined ? `行 ${r.row} 列 ${r.col}` : '–'),
  },
  // Room-side timer fields (timerOps). The timers themselves live in taskMgr.tasks
  // (auto-surfaced by the generic walker); these are the two fields kept in sync on
  // the room: crafting's elapsed-seconds progress and the radio's display countdown.
  { label: '制作进度（秒）', get: (r) => num(r.CompletedTime) },
  { label: '广播倒计时（秒）', get: (r) => num(r.currentState?.remainingTime) },
];

const roomKey = (r: Room): string => `${r.type} #${r.deserializeID}`;

function roomMap(save: SaveData): Map<number, Room> {
  const list = save.vault?.rooms;
  const map = new Map<number, Room>();
  if (Array.isArray(list)) for (const r of list) map.set(r.deserializeID, r);
  return map;
}

function dwellerMap(save: SaveData): Map<number, Dweller> {
  const list = save.dwellers?.dwellers;
  const map = new Map<number, Dweller>();
  if (Array.isArray(list)) for (const d of list) map.set(d.serializeId, d);
  return map;
}

const inventoryCount = (save: SaveData): number => save.vault?.inventory?.items?.length ?? 0;

/** Stored-inventory counts by item id. */
function itemCountsById(save: SaveData): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of save.vault?.inventory?.items ?? []) {
    if (typeof item.id === 'string') map.set(item.id, (map.get(item.id) ?? 0) + 1);
  }
  return map;
}

/** ELunchBoxType code → display name (vault.LunchBoxesByType entries). */
const BOX_NAMES: Record<number, string> = {
  0: '午餐盒',
  1: '巧手先生午餐盒',
  2: '宠物箱',
  3: '新手礼包',
  4: '量子核子可乐',
  5: '预设礼包',
  6: '维克托',
  7: '居里',
};

/** Openable-box counts by type code (vault.LunchBoxesByType is an array of codes). */
function boxCounts(save: SaveData): Map<number, number> {
  const raw = (save.vault as Record<string, unknown> | undefined)?.['LunchBoxesByType'];
  const map = new Map<number, number>();
  if (Array.isArray(raw)) {
    for (const code of raw) {
      if (typeof code === 'number') map.set(code, (map.get(code) ?? 0) + 1);
    }
  }
  return map;
}

/** The unlocked-recipe id list (survivalW.recipes). */
function recipeSet(save: SaveData): Set<string> {
  const raw = (save as Record<string, unknown>)['survivalW'];
  const list =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>)['recipes'] : undefined;
  return new Set(Array.isArray(list) ? list.filter((r): r is string => typeof r === 'string') : []);
}

// Top-level keys whose changes are described specifically elsewhere (so they are not
// double-reported by the generic safety net).
const HANDLED_TOP_KEYS = new Set(['dwellers', 'vault']);

// Save paths already described by a dedicated section above - the generic leaf walker
// skips them so nothing is double-reported.
const WALKER_EXCLUDED = new Set([
  'dwellers.dwellers',
  'vault.rooms',
  'vault.storage.resources',
  'vault.inventory.items',
  'vault.LunchBoxesByType',
  'vault.LunchBoxesCount',
  'survivalW.recipes',
  ...COLLECTION_KEYS.map((key) => `survivalW.${key}`),
]);

/** Display cap for the generic leaf changes (the walker stops collecting past 3×). */
const MAX_OTHER_CHANGES = 60;

const leafPreview = (v: unknown): string => {
  if (v === undefined) return '–';
  if (isLosslessInt(v)) return v.literal;
  const s = JSON.stringify(v);
  if (s === undefined) return String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
};

/**
 * Generic leaf-level walker for everything without a dedicated section: managers,
 * actors, vault name/theme/rocks, season state, … Reports scalar before→after pairs
 * ("MysteriousStranger.timeToAppear: 300 → 60") so no edit is an unexplained label.
 */
function walkOther(a: unknown, b: unknown, path: string, out: PathChange[]): void {
  if (out.length > MAX_OTHER_CHANGES * 3) return; // hard stop - enough to show the cap
  if (Object.is(a, b) || WALKER_EXCLUDED.has(path)) return;
  if (isLosslessInt(a) || isLosslessInt(b)) {
    const av = leafPreview(a);
    const bv = leafPreview(b);
    if (av !== bv) out.push({ path, before: av, after: bv });
    return;
  }
  const aIsObj = typeof a === 'object' && a !== null && !Array.isArray(a);
  const bIsObj = typeof b === 'object' && b !== null && !Array.isArray(b);
  if (aIsObj && bIsObj) {
    const ar = a as Record<string, unknown>;
    const br = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ar), ...Object.keys(br)])) {
      walkOther(ar[k], br[k], path ? `${path}.${k}` : k, out);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) walkOther(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path: path || '(root)', before: leafPreview(a), after: leafPreview(b) });
  }
}

/** Diff the decoded original save against the current working save. */
export function summarizeChanges(original: SaveData, current: SaveData): ChangeSummary {
  const before = dwellerMap(original);
  const after = dwellerMap(current);
  const roomsBefore = roomMap(original);
  const roomsAfter = roomMap(current);

  // Resolvers shared by the dweller/room diffs: a savedRoom id → "Diner #26" (falling back
  // to the pre-edit rooms for ids that no longer exist), and a worker id → dweller name.
  const roomLabel = (id: number | undefined): string => {
    if (id === undefined) return '–';
    if (id === -1) return '避难所大门（未分配）';
    const room = roomsAfter.get(id) ?? roomsBefore.get(id);
    return room ? roomKey(room) : `房间 #${id}`;
  };
  const nameOf = (id: number): string => {
    const d = after.get(id) ?? before.get(id);
    return d ? displayName(d) : `#${id}`;
  };

  const dwellersAdded: DwellerRef[] = [];
  const dwellersRemoved: DwellerRef[] = [];
  const dwellersModified: DwellerModification[] = [];

  for (const [id, dweller] of after) {
    if (!before.has(id)) dwellersAdded.push({ serializeId: id, name: displayName(dweller) });
  }
  for (const [id, dweller] of before) {
    if (!after.has(id)) dwellersRemoved.push({ serializeId: id, name: displayName(dweller) });
  }
  for (const [id, beforeDweller] of before) {
    const afterDweller = after.get(id);
    // Unchanged dwellers share a reference (structural sharing) - skip the field diff.
    if (!afterDweller || afterDweller === beforeDweller) continue;
    const fields = diffDweller(beforeDweller, afterDweller, roomLabel);
    if (fields.length > 0) {
      dwellersModified.push({ serializeId: id, name: displayName(afterDweller), fields });
    }
  }

  // Rooms: built / removed / field-level changes (level, power, workers, …).
  const roomsAdded: string[] = [];
  const roomsRemoved: string[] = [];
  const roomsModified: RoomModification[] = [];
  for (const [id, room] of roomsAfter) {
    if (!roomsBefore.has(id)) roomsAdded.push(roomKey(room));
  }
  for (const [id, room] of roomsBefore) {
    if (!roomsAfter.has(id)) roomsRemoved.push(roomKey(room));
  }
  for (const [id, beforeRoom] of roomsBefore) {
    const afterRoom = roomsAfter.get(id);
    if (!afterRoom || afterRoom === beforeRoom) continue;
    const fields: FieldChange[] = [];
    for (const { label, get } of ROOM_EXTRACTORS) {
      const b = get(beforeRoom, nameOf);
      const a = get(afterRoom, nameOf);
      if (b !== a) fields.push({ label, before: b, after: a });
    }
    if (fields.length > 0) roomsModified.push({ label: roomKey(afterRoom), fields });
  }

  // Resource amounts (caps, food, water, …) that changed.
  const resourcesChanged: FieldChange[] = [];
  const resBefore = original.vault?.storage?.resources ?? {};
  const resAfter = current.vault?.storage?.resources ?? {};
  if (resBefore !== resAfter) {
    const resKeys = new Set([...Object.keys(resBefore), ...Object.keys(resAfter)]);
    for (const key of resKeys) {
      const b = resBefore[key];
      const a = resAfter[key];
      if (b !== a) resourcesChanged.push({ label: key, before: num(b), after: num(a) });
    }
  }

  const beforeCount = inventoryCount(original);
  const afterCount = inventoryCount(current);
  const inventoryDelta =
    beforeCount !== afterCount ? { before: beforeCount, after: afterCount } : null;

  // Per-item stored counts ("what consumables?" - the count of each item id that moved).
  const itemsChanged: FieldChange[] = [];
  if (original.vault?.inventory?.items !== current.vault?.inventory?.items) {
    const ib = itemCountsById(original);
    const ia = itemCountsById(current);
    for (const id of new Set([...ib.keys(), ...ia.keys()])) {
      const b = ib.get(id) ?? 0;
      const a = ia.get(id) ?? 0;
      if (b !== a) itemsChanged.push({ label: id, before: `×${b}`, after: `×${a}` });
    }
  }

  // Openable-box counts by type (the "Set consumables" card writes these).
  const boxesChanged: FieldChange[] = [];
  {
    const bb = boxCounts(original);
    const ba = boxCounts(current);
    for (const code of new Set([...bb.keys(), ...ba.keys()])) {
      const b = bb.get(code) ?? 0;
      const a = ba.get(code) ?? 0;
      if (b !== a) {
        boxesChanged.push({
          label: BOX_NAMES[code] ?? `礼盒类型 ${code}`,
          before: `×${b}`,
          after: `×${a}`,
        });
      }
    }
  }

  // Recipes unlocked/removed (survivalW.recipes), listed by id.
  const recipesAdded: string[] = [];
  const recipesRemoved: string[] = [];
  {
    const rb = recipeSet(original);
    const ra = recipeSet(current);
    for (const id of ra) if (!rb.has(id)) recipesAdded.push(id);
    for (const id of rb) if (!ra.has(id)) recipesRemoved.push(id);
  }

  // Survival Guide collection lists (survivalW weapons/outfits/dwellers/pets/breeds/junk):
  // per-list added/removed code counts, plus entries whose N/O (new/seen) prefix flipped.
  const guideChanged: GuideListChange[] = [];
  for (const key of COLLECTION_KEYS) {
    const before = collectionCodes(original, key);
    const after = collectionCodes(current, key);
    let added = 0;
    let removed = 0;
    let stateFlipped = 0;
    for (const [code, isNew] of after) {
      const wasNew = before.get(code);
      if (wasNew === undefined) added++;
      else if (wasNew !== isNew) stateFlipped++;
    }
    for (const code of before.keys()) if (!after.has(code)) removed++;
    if (added > 0 || removed > 0 || stateFlipped > 0) {
      guideChanged.push({ list: key, added, removed, stateFlipped });
    }
  }

  // Generic leaf changes for everything else (managers, actors, vault name/theme, …).
  const allOther: PathChange[] = [];
  walkOther(original, current, '', allOther);
  const otherChanges = allOther.slice(0, MAX_OTHER_CHANGES);
  const otherChangesTruncated = allOther.length - otherChanges.length;

  const otherSectionsChanged: string[] = [];
  const keys = new Set([...Object.keys(original), ...Object.keys(current)]);
  for (const key of keys) {
    if (HANDLED_TOP_KEYS.has(key)) continue;
    if ((original as Record<string, unknown>)[key] !== (current as Record<string, unknown>)[key]) {
      otherSectionsChanged.push(key);
    }
  }

  const hasChanges =
    dwellersAdded.length > 0 ||
    dwellersRemoved.length > 0 ||
    dwellersModified.length > 0 ||
    roomsAdded.length > 0 ||
    roomsRemoved.length > 0 ||
    roomsModified.length > 0 ||
    resourcesChanged.length > 0 ||
    itemsChanged.length > 0 ||
    boxesChanged.length > 0 ||
    recipesAdded.length > 0 ||
    recipesRemoved.length > 0 ||
    guideChanged.length > 0 ||
    inventoryDelta !== null ||
    otherChanges.length > 0 ||
    otherSectionsChanged.length > 0;

  return {
    dwellersAdded,
    dwellersRemoved,
    dwellersModified,
    roomsAdded,
    roomsRemoved,
    roomsModified,
    resourcesChanged,
    itemsChanged,
    boxesChanged,
    recipesAdded,
    recipesRemoved,
    guideChanged,
    inventoryDelta,
    otherChanges,
    otherChangesTruncated,
    otherSectionsChanged,
    hasChanges,
  };
}
