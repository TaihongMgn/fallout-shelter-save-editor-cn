import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { MODAL_LARGE } from '../lib/modalClasses.ts';
import type { ChangeSummary } from '../../domain/diff/changeSummary.ts';
import type { HealthReport } from '../../domain/health/healthCheck.ts';
import {
  PLATFORM_TARGETS,
  platformTarget,
  type PlatformId,
} from '../../domain/codec/platformTargets.ts';

// Pre-export change-review dialog + multi-file export chooser. Shown when the user
// hits Export: a plain-language summary of every
// change vs the imported original, plus the health report, plus an independent checkbox
// per output file - the vault `.sav`, the season pair (`spd.dat` + `nvf.dat`, only when
// season data was edited), and the safety backup of the untouched original (opt-out-able,
// but default on) - under one "Select everything" master toggle. The copy assumes a
// non-technical user: files are named by what they ARE and why they matter, with concrete,
// step-by-step guidance on where they go and how to undo a bad edit. Confirm runs the actual
// backup + export (owned by the caller, ExportDialog).

interface ChangeReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  summary: ChangeSummary | null;
  health: HealthReport | null;
  exporting: boolean;
  error: string | null;
  /** The working `.sav` file name, e.g. "Vault1.sav" - used in placement/revert copy. */
  fileName: string;

  // --- File chooser (each output is an independent, defaulted-on-but-optional file) ---
  includeSav: boolean;
  onIncludeSavChange: (value: boolean) => void;
  /** True when season data was edited - gates whether the `spd.dat`/`nvf.dat` row is offered. */
  seasonEdited: boolean;
  includeSeason: boolean;
  onIncludeSeasonChange: (value: boolean) => void;
  /** True for the bundled sandbox save - there is no user original, so backup is hidden. */
  isSandbox: boolean;
  /** True when an untouched original `.sav` exists to back up. */
  hasOriginal: boolean;
  includeBackup: boolean;
  onIncludeBackupChange: (value: boolean) => void;

  // --- Platform target ---
  /** Cross-platform target - informational; the exported bytes are identical. */
  platform: PlatformId;
  onPlatformChange: (id: PlatformId) => void;
  /** True when the browser supports "save in place" - the `.sav` opens a native save dialog. */
  saveInPlaceSupported: boolean;
}

// The change summary is collapsed to a few headline lines by default - the full per-dweller
// field-by-field detail is information overload in an export confirm. A "Show all changes"
// toggle reveals the granular history (added/removed names + every edited field) on demand.
function SummaryBody({ summary }: { summary: ChangeSummary | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!summary || !summary.hasChanges) {
    return <p className="text-sm text-neutral-400">导入后没有更改——将导出一份全新副本。</p>;
  }

  const {
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
  } = summary;

  // "weapons +122 −1 · 3 seen" per changed Survival Guide list.
  const guideLine = (g: (typeof guideChanged)[number]): string =>
    [
      g.list,
      g.added > 0 ? `+${g.added}` : null,
      g.removed > 0 ? `−${g.removed}` : null,
      g.stateFlipped > 0 ? `${g.stateFlipped} 个新收录` : null,
    ]
      .filter((s): s is string => s !== null)
      .join(' ');

  // Condensed headline: dweller/room counts, resources, storage delta, other sections.
  const dwellerCounts = [
    dwellersAdded.length > 0 ? `新增 ${dwellersAdded.length} 名居民` : null,
    dwellersRemoved.length > 0 ? `移除 ${dwellersRemoved.length} 名居民` : null,
    dwellersModified.length > 0 ? `编辑 ${dwellersModified.length} 名居民` : null,
  ].filter((s): s is string => s !== null);
  const roomCounts = [
    roomsAdded.length > 0 ? `新建 ${roomsAdded.length} 个房间` : null,
    roomsRemoved.length > 0 ? `移除 ${roomsRemoved.length} 个房间` : null,
    roomsModified.length > 0 ? `编辑 ${roomsModified.length} 个房间` : null,
  ].filter((s): s is string => s !== null);

  // Only the names + field changes are worth expanding for; counts already cover the headline.
  const hasDetail =
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
    otherChanges.length > 0;

  const CAP = 25;
  const capped = (ids: string[]): string =>
    ids.length <= CAP
      ? ids.join('、')
      : `${ids.slice(0, CAP).join('、')} …以及另外 ${ids.length - CAP} 个`;

  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          {dwellerCounts.length > 0 && (
            <p className="text-neutral-300">居民：{dwellerCounts.join('、')}</p>
          )}
          {roomCounts.length > 0 && (
            <p className="text-neutral-300">房间：{roomCounts.join('、')}</p>
          )}
          {resourcesChanged.length > 0 && (
            <p className="text-neutral-300">
              资源： {resourcesChanged.map((f) => `${f.label} ${f.before} → ${f.after}`).join('、')}
            </p>
          )}
          {(itemsChanged.length > 0 || boxesChanged.length > 0) && (
            <p className="text-neutral-300">
              物品：{' '}
              {[...itemsChanged, ...boxesChanged]
                .slice(0, 6)
                .map((f) => `${f.label} ${f.before} → ${f.after}`)
                .join('、')}
              {itemsChanged.length + boxesChanged.length > 6 &&
                ` …以及另外 ${itemsChanged.length + boxesChanged.length - 6} 个`}
            </p>
          )}
          {recipesAdded.length > 0 && (
            <p className="text-neutral-300">解锁配方：{recipesAdded.length}</p>
          )}
          {recipesRemoved.length > 0 && (
            <p className="text-neutral-300">移除配方：{recipesRemoved.length}</p>
          )}
          {guideChanged.length > 0 && (
            <p className="text-neutral-300">生存指南：{guideChanged.map(guideLine).join('、')}</p>
          )}
          {inventoryDelta && (
            <p className="text-neutral-300">
              仓库物品：{inventoryDelta.before} → {inventoryDelta.after}
            </p>
          )}
          {otherChanges.length > 0 && (
            <p className="text-neutral-400">
              其他数据更改：{otherSectionsChanged.join('、')}（{otherChanges.length}
              {otherChangesTruncated > 0 ? '+' : ''} 处字段）
            </p>
          )}
        </div>
        {hasDetail && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-amber-300 hover:bg-neutral-800"
          >
            {expanded ? '收起更改' : '显示全部更改'}
          </button>
        )}
      </div>

      {hasDetail && expanded && (
        <div className="mt-2 flex flex-col gap-2 border-t border-neutral-800 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            你所做的更改
          </p>
          {dwellersAdded.length > 0 && (
            <div>
              <p className="font-medium text-emerald-300">新增 {dwellersAdded.length} 名居民</p>
              <p className="text-xs text-neutral-400">
                {dwellersAdded.map((d) => d.name).join('、')}
              </p>
            </div>
          )}
          {dwellersRemoved.length > 0 && (
            <div>
              <p className="font-medium text-red-300">移除 {dwellersRemoved.length} 名居民</p>
              <p className="text-xs text-neutral-400">
                {dwellersRemoved.map((d) => d.name).join('、')}
              </p>
            </div>
          )}
          {dwellersModified.length > 0 && (
            <div>
              <p className="font-medium text-amber-300">编辑 {dwellersModified.length} 名居民</p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {dwellersModified.map((d) => (
                  <li key={d.serializeId} className="rounded bg-neutral-950/60 px-2 py-1">
                    <span className="text-neutral-200">{d.name}</span>
                    <span className="text-neutral-400">：</span>
                    <span className="text-xs text-neutral-400">
                      {d.fields.map((f) => `${f.label} ${f.before} → ${f.after}`).join('；')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {roomsAdded.length > 0 && (
            <div>
              <p className="font-medium text-emerald-300">新建 {roomsAdded.length} 个房间</p>
              <p className="text-xs text-neutral-400">{roomsAdded.join('、')}</p>
            </div>
          )}
          {roomsRemoved.length > 0 && (
            <div>
              <p className="font-medium text-red-300">移除 {roomsRemoved.length} 个房间</p>
              <p className="text-xs text-neutral-400">{roomsRemoved.join('、')}</p>
            </div>
          )}
          {roomsModified.length > 0 && (
            <div>
              <p className="font-medium text-amber-300">编辑 {roomsModified.length} 个房间</p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {roomsModified.map((r) => (
                  <li key={r.label} className="rounded bg-neutral-950/60 px-2 py-1">
                    <span className="text-neutral-200">{r.label}</span>
                    <span className="text-neutral-400">：</span>
                    <span className="text-xs text-neutral-400">
                      {r.fields.map((f) => `${f.label} ${f.before} → ${f.after}`).join('；')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(itemsChanged.length > 0 || boxesChanged.length > 0) && (
            <div>
              <p className="font-medium text-amber-300">物品数量变化</p>
              <p className="text-xs text-neutral-400">
                {[...itemsChanged, ...boxesChanged]
                  .map((f) => `${f.label} ${f.before} → ${f.after}`)
                  .join('、')}
              </p>
            </div>
          )}
          {recipesAdded.length > 0 && (
            <div>
              <p className="font-medium text-emerald-300">解锁 {recipesAdded.length} 个配方</p>
              <p className="text-xs text-neutral-400">{capped(recipesAdded)}</p>
            </div>
          )}
          {recipesRemoved.length > 0 && (
            <div>
              <p className="font-medium text-red-300">移除 {recipesRemoved.length} 个配方</p>
              <p className="text-xs text-neutral-400">{capped(recipesRemoved)}</p>
            </div>
          )}
          {guideChanged.length > 0 && (
            <div>
              <p className="font-medium text-amber-300">生存指南收藏变化</p>
              <p className="text-xs text-neutral-400">{guideChanged.map(guideLine).join('、')}</p>
            </div>
          )}
          {otherChanges.length > 0 && (
            <div>
              <p className="font-medium text-amber-300">其他字段更改</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-400">
                {otherChanges.map((c) => (
                  <li key={c.path}>
                    <span className="font-mono text-neutral-300">{c.path}</span>：{c.before} →{' '}
                    {c.after}
                  </li>
                ))}
                {otherChangesTruncated > 0 && (
                  <li className="text-neutral-500">…另外 {otherChangesTruncated} 处</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const FILE_ROW = 'flex gap-2 rounded bg-neutral-950/40 px-3 py-2';
const FILE_CHECKBOX = 'mt-0.5 accent-amber-500';

export function ChangeReviewDialog({
  open,
  onClose,
  onConfirm,
  summary,
  health,
  exporting,
  error,
  fileName,
  includeSav,
  onIncludeSavChange,
  seasonEdited,
  includeSeason,
  onIncludeSeasonChange,
  isSandbox,
  hasOriginal,
  includeBackup,
  onIncludeBackupChange,
  platform,
  onPlatformChange,
  saveInPlaceSupported,
}: ChangeReviewDialogProps) {
  const issues = health?.issues ?? [];
  const target = platformTarget(platform);
  const base = fileName.replace(/\.sav$/i, '');
  // A sandbox baseline has no user original to protect, so the backup is neither shown nor counted.
  const canBackup = hasOriginal && !isSandbox;

  // "Select everything" master toggle. It spans only the files actually on offer (the season
  // pair appears only after a season edit; the backup only when there's an original to copy),
  // and shows the indeterminate (mixed) state when some - but not all - are ticked.
  const availableCount = 1 + (seasonEdited ? 1 : 0) + (canBackup ? 1 : 0);
  const selectedCount =
    (includeSav ? 1 : 0) +
    (seasonEdited && includeSeason ? 1 : 0) +
    (canBackup && includeBackup ? 1 : 0);
  const allSelected = selectedCount === availableCount;
  const nothingSelected = selectedCount === 0;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected;
    }
  }, [selectedCount, allSelected]);

  const setAll = (value: boolean): void => {
    onIncludeSavChange(value);
    if (seasonEdited) onIncludeSeasonChange(value);
    if (canBackup) onIncludeBackupChange(value);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className={`${MODAL_LARGE} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">保存你的更改</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-neutral-400">
                以下是更改内容以及将要保存的文件。默认选项是安全的——大多数人直接按“导出”即可。
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="关闭"
              className="rounded px-2 py-1 text-neutral-400 hover:text-neutral-100"
            >
              ✕
            </Dialog.Close>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <SummaryBody summary={summary} />

            {issues.length > 0 && (
              <div className="mt-4 border-t border-neutral-800 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  存档健康状态
                </p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {issues.map((issue, i) => (
                    <li
                      key={i}
                      className={issue.severity === 'error' ? 'text-red-300' : 'text-amber-300'}
                    >
                      {issue.severity === 'error' ? '⛔ ' : '⚠ '}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 border-t border-neutral-800 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                要保存的文件
              </p>

              {availableCount > 1 && (
                <label className="mt-2 flex items-center gap-2 px-3 text-sm">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setAll(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span className="text-neutral-200">保存全部文件</span>
                  <span className="text-xs text-neutral-500">（推荐）</span>
                </label>
              )}

              <div className="mt-2 flex flex-col gap-2">
                <label className={FILE_ROW}>
                  <input
                    type="checkbox"
                    checked={includeSav}
                    onChange={(e) => onIncludeSavChange(e.target.checked)}
                    className={FILE_CHECKBOX}
                  />
                  <span className="text-sm">
                    <span className="text-neutral-200">你的避难所存档</span>{' '}
                    <code className="text-neutral-400">{fileName}</code>
                    <span className="mt-0.5 block text-xs text-neutral-400">
                      避难所的全部内容——居民、房间、瓶盖和物品——已应用你的修改。
                      {saveInPlaceSupported && ' 将打开一个“保存”窗口，可直接写回并覆盖原文件。'}
                    </span>
                  </span>
                </label>

                {seasonEdited && (
                  <label className={FILE_ROW}>
                    <input
                      type="checkbox"
                      checked={includeSeason}
                      onChange={(e) => onIncludeSeasonChange(e.target.checked)}
                      className={FILE_CHECKBOX}
                    />
                    <span className="text-sm">
                      <span className="text-neutral-200">你的赛季通行证进度</span>{' '}
                      <code className="text-neutral-400">spd.dat</code>
                      <span className="text-neutral-500"> + </span>
                      <code className="text-neutral-400">nvf.dat</code>
                      <span className="mt-0.5 block text-xs text-neutral-400">
                        包含你的赛季等级、已领取的奖励和精英轨道状态。这两个文件成对使用，会一起保存以保持同步。
                      </span>
                    </span>
                  </label>
                )}

                {canBackup && (
                  <label className={FILE_ROW}>
                    <input
                      type="checkbox"
                      checked={includeBackup}
                      onChange={(e) => onIncludeBackupChange(e.target.checked)}
                      className={FILE_CHECKBOX}
                    />
                    <span className="text-sm">
                      <span className="text-neutral-200">一份安全备份</span>{' '}
                      <code className="text-neutral-400">{base}.backup-…sav</code>
                      <span className="mt-0.5 block text-xs text-neutral-400">
                        编辑之前存档的原始副本，未做任何改动。请保留它——如果游戏里有什么不对劲，可以用它恢复原状。强烈建议保留。
                      </span>
                    </span>
                  </label>
                )}

                {isSandbox && (
                  <p className="px-3 text-xs text-neutral-500">
                    这是你在本编辑器中创建的练习存档——没有可供备份的原始文件。
                  </p>
                )}
              </div>

              {canBackup && includeBackup && (
                <div className="mt-2 rounded border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-400">
                  <p className="font-medium text-neutral-300">如果之后出现问题</p>
                  <p className="mt-0.5">
                    在存档文件夹中，删除已修改的{' '}
                    <code className="text-neutral-300">{fileName}</code>
                    ，然后重命名备份文件：去掉文件名中的{' '}
                    <code className="text-neutral-300">.backup-&lt;date&gt;</code>{' '}
                    部分，使其重新叫作 <code className="text-neutral-300">{fileName}</code>
                    。游戏会照常载入它，就像这些修改从未发生过一样。
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-neutral-800 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                文件放置位置
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                保存后，将文件复制到《辐射：避难所》的存档文件夹中，替换其中已有的文件。选择你的设备以查看文件夹——避难所存档和两个赛季文件都放在同一个文件夹里：
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLATFORM_TARGETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={platform === p.id}
                    onClick={() => onPlatformChange(p.id)}
                    className={`rounded border px-2.5 py-1 text-xs ${
                      platform === p.id
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                        : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 rounded bg-neutral-950/60 px-3 py-2 text-xs">
                <code className="break-all text-neutral-300">{target.basePath}</code>
                <span className="mt-1 block text-neutral-500">
                  此文件夹中包含 <code className="text-neutral-400">{fileName}</code>、
                  <code className="text-neutral-400">spd.dat</code> 和{' '}
                  <code className="text-neutral-400">nvf.dat</code>。
                </span>
                {!target.verified && (
                  <span className="mt-1 block text-amber-400">
                    来自社区报告的位置——请在你的设备上再次确认。{target.note}
                  </span>
                )}
              </div>
              {(target.id === 'pc' || target.id === 'steamdeck') && (
                <p className="mt-2 text-xs text-amber-400">
                  注意：Steam
                  云存档可能会悄悄把旧存档还原。替换文件前，请先关闭游戏，并为《辐射：避难所》关闭
                  Steam 云同步。
                </p>
              )}
            </div>
          </div>

          {saveInPlaceSupported && includeSav && (
            <p className="mt-3 text-xs text-neutral-400">
              按下“导出”后，会为你的 <code className="text-neutral-300">.sav</code>{' '}
              打开一个“保存”窗口——请前往上述文件夹，选择现有的{' '}
              <code className="text-neutral-300">Vault&lt;N&gt;.sav</code> 进行覆盖。
              {(seasonEdited || canBackup) &&
                ' 其余文件会存到“下载”文件夹中，请将它们移动到同一个存档文件夹内。'}
            </p>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={exporting || nothingSelected}
              className="rounded bg-amber-500 px-4 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {exporting ? '导出中…' : '导出'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
