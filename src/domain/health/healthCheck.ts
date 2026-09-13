import type { SaveData } from '../model/saveSchema.ts';

// Import validation + health check. On load we surface basic
// save metadata and flag anomalies (missing/mismatched structure, duplicate ids,
// non-finite resource values) without mutating anything. This is a read-only
// sanity pass - deeper "broken-save diagnosis" with explanations and repairs lives
// in diagnostics.ts (+ repairOps.ts).

export interface SaveMetadata {
  vaultName: string | null;
  dwellerCount: number | null;
  itemCount: number | null;
  appVersion: string | null;
}

export interface HealthIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface HealthReport {
  metadata: SaveMetadata;
  issues: HealthIssue[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function checkSaveHealth(save: SaveData): HealthReport {
  const issues: HealthIssue[] = [];
  const metadata: SaveMetadata = {
    vaultName: null,
    dwellerCount: null,
    itemCount: null,
    appVersion: null,
  };

  const root = asRecord(save);
  if (!root) {
    issues.push({ severity: 'error', message: '存档根节点不是 JSON 对象。' });
    return { metadata, issues };
  }

  if (typeof root.appVersion === 'string') metadata.appVersion = root.appVersion;

  // Dwellers
  const dwellersBlock = asRecord(root.dwellers);
  const dwellerList = dwellersBlock?.dwellers;
  if (!Array.isArray(dwellerList)) {
    issues.push({ severity: 'error', message: '缺少居民数组（save.dwellers.dwellers）。' });
  } else {
    metadata.dwellerCount = dwellerList.length;
    const seen = new Set<unknown>();
    let duplicates = 0;
    for (const entry of dwellerList) {
      const id = asRecord(entry)?.serializeId;
      if (id === undefined) continue;
      if (seen.has(id)) duplicates++;
      else seen.add(id);
    }
    if (duplicates > 0) {
      issues.push({
        severity: 'warning',
        message: `${duplicates} 名居民共用重复的 serializeId。`,
      });
    }
  }

  // Vault + resources
  const vault = asRecord(root.vault);
  if (!vault) {
    issues.push({ severity: 'error', message: '缺少 vault 对象（save.vault）。' });
  } else {
    if (typeof vault.VaultName === 'string') metadata.vaultName = vault.VaultName;

    const items = asRecord(vault.inventory)?.items;
    if (Array.isArray(items)) metadata.itemCount = items.length;

    const resources = asRecord(asRecord(vault.storage)?.resources);
    if (resources) {
      for (const [key, value] of Object.entries(resources)) {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          issues.push({
            severity: 'warning',
            message: `资源“${key}”的数值不是有限数（${String(value)}）。`,
          });
        }
      }
    }
  }

  return { metadata, issues };
}
