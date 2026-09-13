import type { Section } from '../../state/uiStore.ts';

// Canonical section registry. Single source of truth for BOTH the sidebar nav order/labels
// and the hash-router section routes (see router.tsx). The `id` values double as the URL
// path segments - e.g. the Dwellers section lives at `#/dwellers`.
export type { Section };

export const SECTION_NAV: ReadonlyArray<{ id: Section; label: string }> = [
  { id: 'vault', label: '避难所' },
  { id: 'dwellers', label: '居民' },
  { id: 'family', label: '家谱' },
  { id: 'rooms', label: '房间' },
  { id: 'weapons', label: '武器' },
  { id: 'outfits', label: '服装' },
  { id: 'recipes', label: '配方' },
  { id: 'survival-guide', label: '生存指南' },
  { id: 'pets', label: '宠物' },
  { id: 'handies', label: '巧手先生' },
  { id: 'junk', label: '垃圾' },
  { id: 'storage', label: '仓库' },
  { id: 'quests', label: '任务' },
  { id: 'bulk', label: '批量' },
  { id: 'season-pass', label: '赛季通行证' },
  { id: 'advanced', label: '高级' },
];

/** Section shown when no valid section is in the URL (and the default last-section). */
const DEFAULT_SECTION: Section = 'dwellers';

const SECTION_IDS = new Set<string>(SECTION_NAV.map((s) => s.id));

/** Type guard: is the (untrusted) URL path segment a known section? */
export function isSection(value: string | undefined): value is Section {
  return value !== undefined && SECTION_IDS.has(value);
}

// Last-visited section persistence. The hash URL already preserves the section across a
// reload; this covers the bare-root visit (no hash - e.g. a bookmark to the app root) so
// the editor still reopens on the section the user left, matching the old localStorage
// behaviour now that the router (not the store) owns the active section.
const LAST_SECTION_KEY = 'fsse:last-section';

// Pre-router builds persisted the active section inside the uiStore payload (`fsse:ui`).
// Read it once for continuity so existing users still reopen on their last section after the
// upgrade; the uiStore migrate() then strips the field from that payload.
const LEGACY_UI_KEY = 'fsse:ui';

function readLegacyActiveSection(): Section | null {
  try {
    const raw = localStorage.getItem(LEGACY_UI_KEY);
    if (!raw) return null;
    const section = (JSON.parse(raw) as { state?: { activeSection?: unknown } })?.state
      ?.activeSection;
    return typeof section === 'string' && isSection(section) ? section : null;
  } catch {
    return null;
  }
}

export function getLastSection(): Section {
  try {
    const stored = localStorage.getItem(LAST_SECTION_KEY);
    if (isSection(stored ?? undefined)) return stored as Section;
    const legacy = readLegacyActiveSection();
    if (legacy) {
      rememberSection(legacy);
      return legacy;
    }
  } catch {
    // Fall through to the default below.
  }
  return DEFAULT_SECTION;
}

export function rememberSection(section: Section): void {
  try {
    localStorage.setItem(LAST_SECTION_KEY, section);
  } catch {
    // Ignore storage being unavailable/full - last-section restore is a convenience only.
  }
}
