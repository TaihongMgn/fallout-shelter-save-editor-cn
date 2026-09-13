import type { Dweller, Room, SaveData } from '../model/saveSchema.ts';
import {
  cleanRoomRosters,
  dedupeSerializeIds,
  fixDwellerIdCounter,
  fixInvalidResources,
  fixLunchboxCount,
  sendOrphanedDwellersToDoor,
} from './repairOps.ts';

// Broken-save diagnosis. Beyond the load-time health check
// (healthCheck.ts), this inspects the save for structural inconsistencies that make a
// save malformed, EXPLAINS each one in plain language, and pairs it with a pure repair.
// Each diagnosis is independently fixable; "repair all" folds them in a safe order.
// Detection is read-only; repairs live in repairOps.ts.

export type DiagnosisKind =
  | 'orphanedSavedRoom'
  | 'roomAssignmentDesync'
  | 'lunchboxCountMismatch'
  | 'invalidResource'
  | 'duplicateSerializeId'
  | 'dwellerIdCounterBehind';

/** One plain-language breakdown line, optionally naming dwellers the UI can deep-link. */
export interface DiagnosisDetail {
  text: string;
  /** Dwellers referenced by this line, for deep links to their roster entry. */
  dwellers?: Array<{ id: number; name: string }>;
}

export interface Diagnosis {
  kind: DiagnosisKind;
  severity: 'error' | 'warning';
  /** Short headline. */
  title: string;
  /** Plain-language explanation of why this is malformed + what the fix does. */
  detail: string;
  /** Optional per-entity breakdown lines (e.g. each broken roster entry), surfaced under
   *  the detail so the user can see exactly what the editor disagrees on. */
  details?: DiagnosisDetail[];
  /** How many entities are affected (for the UI count badge). */
  count: number;
  /** Pure repair: `(save) => fixed save`. */
  repair: (save: SaveData) => SaveData;
}

function dwellerList(save: SaveData): Dweller[] {
  const list = save.dwellers?.dwellers;
  return Array.isArray(list) ? list : [];
}

function roomList(save: SaveData): Room[] {
  const list = save.vault?.rooms;
  return Array.isArray(list) ? list : [];
}

export function diagnose(save: SaveData): Diagnosis[] {
  const out: Diagnosis[] = [];
  const dwellers = dwellerList(save);
  const rooms = roomList(save);
  const roomIds = new Set(rooms.map((r) => r.deserializeID));

  // 1. Orphaned savedRoom → a dweller assigned to a room that no longer exists.
  const orphans = dwellers.filter(
    (d) => typeof d.savedRoom === 'number' && d.savedRoom !== -1 && !roomIds.has(d.savedRoom),
  );
  if (orphans.length > 0) {
    out.push({
      kind: 'orphanedSavedRoom',
      severity: 'error',
      title: '居民被分配到不存在的房间',
      detail:
        `${orphans.length} 名居民的 savedRoom 指向一个不存在的房间，游戏无法安置他们。` +
        `修复方式：将他们送回避难所大门（savedRoom = -1）。`,
      count: orphans.length,
      repair: sendOrphanedDwellersToDoor,
    });
  }

  // 2. Broken room worker lists. A room's `dwellers[]` is its work ROSTER, while a
  // dweller's `savedRoom` is where they physically are right now; the two legitimately
  // disagree in saves straight from the game (dwellers exploring, on quests, idling, or
  // visiting other rooms stay on their room's roster with savedRoom = -1 or elsewhere) -
  // verified against genuine game saves - so a plain mismatch is deliberately NOT flagged.
  // What CAN'T be right: a roster entry pointing at a dweller that doesn't exist, or one
  // dweller sitting on two rooms' rosters at once.
  const dwellerById = new Map<number, Dweller>();
  for (const d of dwellers) {
    if (typeof d.serializeId === 'number' && !dwellerById.has(d.serializeId)) {
      dwellerById.set(d.serializeId, d);
    }
  }
  const displayName = (id: number): string => {
    const d = dwellerById.get(id);
    const name = d ? `${d.name ?? ''} ${d.lastName ?? ''}`.trim() : '';
    return name || `居民 ${id}`;
  };
  const roomLabel = (r: Room): string => `${r.type ?? '房间'} #${r.deserializeID}`;
  const rosterRoomsByDweller = new Map<number, Room[]>();
  const ghostLines: DiagnosisDetail[] = [];
  for (const r of rooms) {
    for (const id of r.dwellers ?? []) {
      if (!dwellerById.has(id)) {
        ghostLines.push({
          text: `${roomLabel(r)} 有一条居民 id ${id} 的工作人员记录，但此存档中不存在该 id 的居民。`,
        });
        continue;
      }
      const arr = rosterRoomsByDweller.get(id) ?? [];
      arr.push(r);
      rosterRoomsByDweller.set(id, arr);
    }
  }
  const doubleLines: DiagnosisDetail[] = [];
  for (const [id, list] of rosterRoomsByDweller) {
    if (list.length <= 1) continue;
    const uniqueRooms = [...new Set(list)];
    const name = displayName(id);
    doubleLines.push({
      text:
        uniqueRooms.length === 1
          ? `${name} 在 ${roomLabel(uniqueRooms[0]!)} 的工作人员名单中被列出了两次。`
          : `${name} 同时出现在 ${uniqueRooms.map(roomLabel).join(' 和 ')} 的工作人员名单中，但一名居民只能在一个房间工作。`,
      dwellers: [{ id, name }],
    });
  }
  const rosterIssues = [...ghostLines, ...doubleLines];
  if (rosterIssues.length > 0) {
    out.push({
      kind: 'roomAssignmentDesync',
      severity: 'warning',
      title: '房间工作人员名单异常',
      detail:
        `${rosterIssues.length} 条房间工作人员记录无法成立：它们指向不存在的居民，或将同一名居民同时排入两个房间。` +
        `（居民只是暂离所分配的房间——探索中、执行任务或空闲——属于正常情况，不会标记。）` +
        `修复方式：移除这些无法成立的记录；被重复排班的居民保留其实际所在的房间。`,
      details: rosterIssues,
      count: rosterIssues.length,
      repair: cleanRoomRosters,
    });
  }

  // 3. LunchBox count mismatch.
  const byType = save.vault?.LunchBoxesByType;
  if (Array.isArray(byType) && save.vault?.LunchBoxesCount !== byType.length) {
    out.push({
      kind: 'lunchboxCountMismatch',
      severity: 'warning',
      title: '午餐盒数量不匹配',
      detail:
        `LunchBoxesCount（${String(save.vault?.LunchBoxesCount)}）与 LunchBoxesByType 中的 ` +
        `${byType.length} 条记录不一致。修复方式：将该数量设为数组长度。`,
      count: 1,
      repair: fixLunchboxCount,
    });
  }

  // 4. Invalid (non-finite or negative) resource amounts.
  const resources = save.vault?.storage?.resources ?? {};
  const badResources = Object.entries(resources).filter(
    ([, v]) => typeof v === 'number' && (!Number.isFinite(v) || v < 0),
  );
  if (badResources.length > 0) {
    out.push({
      kind: 'invalidResource',
      severity: 'error',
      title: '资源数值无效',
      detail:
        `${badResources.length} 项资源的数值为负数或非有限数 ` +
        `（${badResources.map(([k]) => k).join(', ')}）。修复方式：将其归零。`,
      count: badResources.length,
      repair: fixInvalidResources,
    });
  }

  // 5. Duplicate serializeIds.
  const seen = new Set<number>();
  let dupes = 0;
  for (const d of dwellers) {
    const id = d.serializeId;
    if (typeof id !== 'number') continue;
    if (seen.has(id)) dupes++;
    else seen.add(id);
  }
  if (dupes > 0) {
    out.push({
      kind: 'duplicateSerializeId',
      severity: 'error',
      title: '居民 id 重复',
      detail:
        `${dupes} 名居民与其他居民共用同一个 serializeId。重复的 id 会干扰家庭/房间关联和保存。` +
        `修复方式：为重复的居民重新分配全新的唯一 id。`,
      count: dupes,
      repair: dedupeSerializeIds,
    });
  }

  // 6. dwellers.id counter behind the highest serializeId.
  const maxId = dwellers.reduce((m, d) => Math.max(m, d.serializeId ?? 0), 0);
  const counter = typeof save.dwellers?.id === 'number' ? save.dwellers.id : 0;
  if (dwellers.length > 0 && counter < maxId) {
    out.push({
      kind: 'dwellerIdCounterBehind',
      severity: 'warning',
      title: '居民 id 计数器落后',
      detail:
        `dwellers.id 计数器（${counter}）低于最大的居民 id（${maxId}），下一个新增的居民会复用已占用的 id。` +
        `修复方式：将计数器推进到 ${maxId}。`,
      count: 1,
      repair: fixDwellerIdCounter,
    });
  }

  // NOTE: a Mr. Handy referenced by NO room's mrHandyList is deliberately NOT flagged.
  // It is a valid state, not a malformation: the robot simply waits outside the vault
  // (user-verified in-game - it sits at the door indefinitely until placed on a floor).

  return out;
}

/**
 * Apply every diagnosed repair in a safe order (orphans before the roster clean so reset
 * dwellers resolve first; dedupe before the counter fix so the counter ends past the new
 * ids). Re-diagnosing afterwards should return no fixable structural issues.
 */
export function repairAll(save: SaveData): SaveData {
  const order: DiagnosisKind[] = [
    'orphanedSavedRoom',
    'roomAssignmentDesync',
    'lunchboxCountMismatch',
    'invalidResource',
    'duplicateSerializeId',
    'dwellerIdCounterBehind',
  ];
  const found = new Map(diagnose(save).map((d) => [d.kind, d.repair] as const));
  return order.reduce((acc, kind) => {
    const repair = found.get(kind);
    return repair ? repair(acc) : acc;
  }, save);
}
