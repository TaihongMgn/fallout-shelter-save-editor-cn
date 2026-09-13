import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeReviewDialog } from '../../src/ui/components/ChangeReviewDialog.tsx';
import type { ChangeSummary } from '../../src/domain/diff/changeSummary.ts';
import type { HealthReport } from '../../src/domain/health/healthCheck.ts';

const emptySummary: ChangeSummary = {
  dwellersAdded: [],
  dwellersRemoved: [],
  dwellersModified: [],
  roomsAdded: [],
  roomsRemoved: [],
  roomsModified: [],
  resourcesChanged: [],
  itemsChanged: [],
  boxesChanged: [],
  recipesAdded: [],
  recipesRemoved: [],
  guideChanged: [],
  inventoryDelta: null,
  otherChanges: [],
  otherChangesTruncated: 0,
  otherSectionsChanged: [],
  hasChanges: false,
};

const health: HealthReport = {
  metadata: { vaultName: '111', dwellerCount: 3, itemCount: 1, appVersion: '1.0' },
  issues: [{ severity: 'warning', message: '1 名居民共用重复的 serializeId。' }],
};

function renderDialog(overrides: Partial<ComponentProps<typeof ChangeReviewDialog>> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    summary: emptySummary,
    health,
    exporting: false,
    error: null,
    fileName: 'Vault1.sav',
    includeSav: true,
    onIncludeSavChange: vi.fn(),
    seasonEdited: false,
    includeSeason: true,
    onIncludeSeasonChange: vi.fn(),
    isSandbox: false,
    hasOriginal: true,
    includeBackup: true,
    onIncludeBackupChange: vi.fn(),
    platform: 'pc' as const,
    onPlatformChange: vi.fn(),
    saveInPlaceSupported: false,
    ...overrides,
  };
  render(<ChangeReviewDialog {...props} />);
  return props;
}

describe('ChangeReviewDialog', () => {
  it('shows a condensed headline and reveals full detail behind "显示全部更改"', async () => {
    const user = userEvent.setup();
    renderDialog({
      summary: {
        dwellersAdded: [{ serializeId: 4, name: 'New Comer' }],
        dwellersRemoved: [{ serializeId: 2, name: 'Bob' }],
        dwellersModified: [
          {
            serializeId: 1,
            name: 'Alice Cox',
            fields: [{ label: '等级', before: '5', after: '50' }],
          },
        ],
        roomsAdded: [],
        roomsRemoved: [],
        roomsModified: [],
        resourcesChanged: [],
        itemsChanged: [],
        boxesChanged: [],
        recipesAdded: [],
        recipesRemoved: [],
        guideChanged: [],
        inventoryDelta: { before: 2, after: 1 },
        otherChanges: [],
        otherChangesTruncated: 0,
        otherSectionsChanged: [],
        hasChanges: true,
      },
    });

    // Condensed by default: counts + storage delta, but no per-field breakdown.
    expect(
      screen.getByText('居民：新增 1 名居民、移除 1 名居民、编辑 1 名居民'),
    ).toBeInTheDocument();
    expect(screen.getByText(/仓库物品：2 → 1/)).toBeInTheDocument();
    expect(screen.queryByText(/等级 5 → 50/)).not.toBeInTheDocument();

    // Expanding reveals the granular change history.
    await user.click(screen.getByRole('button', { name: '显示全部更改' }));
    expect(screen.getByText('新增 1 名居民')).toBeInTheDocument();
    expect(screen.getByText('移除 1 名居民')).toBeInTheDocument();
    expect(screen.getByText('编辑 1 名居民')).toBeInTheDocument();
    expect(screen.getByText(/等级 5 → 50/)).toBeInTheDocument();
  });

  it('shows the no-changes message, the health issue, and the backup option + revert help', () => {
    renderDialog();
    expect(screen.getByText(/导入后没有更改/)).toBeInTheDocument();
    expect(screen.getByText(/共用重复的 serializeId/)).toBeInTheDocument();
    expect(screen.getByText('一份安全备份')).toBeInTheDocument();
    expect(screen.getByText(/如果之后出现问题/)).toBeInTheDocument();
  });

  it('confirm triggers onConfirm; cancel triggers onClose', async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(screen.getByRole('button', { name: '导出' }));
    expect(props.onConfirm).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('disables the export button while exporting', () => {
    renderDialog({ exporting: true });
    expect(screen.getByRole('button', { name: '导出中…' })).toBeDisabled();
  });

  it('hides the native save-dialog hint when save-in-place is unsupported', () => {
    renderDialog({ saveInPlaceSupported: false });
    expect(screen.queryByText(/按下“导出”后/)).not.toBeInTheDocument();
  });

  it('shows the native save-dialog hint when save-in-place is supported', () => {
    renderDialog({ saveInPlaceSupported: true });
    expect(screen.getByText(/按下“导出”后/)).toBeInTheDocument();
  });

  it('offers the season files only when season data was edited', () => {
    renderDialog({ seasonEdited: false });
    expect(screen.queryByText('你的赛季通行证进度')).not.toBeInTheDocument();

    renderDialog({ seasonEdited: true });
    expect(screen.getByText('你的赛季通行证进度')).toBeInTheDocument();
  });

  it('hides the backup for a sandbox save and explains why', () => {
    renderDialog({ isSandbox: true });
    expect(screen.queryByText('一份安全备份')).not.toBeInTheDocument();
    expect(screen.getByText(/没有可供备份的原始文件/)).toBeInTheDocument();
  });

  it('hides the backup when there is no original to protect', () => {
    renderDialog({ hasOriginal: false });
    expect(screen.queryByText('一份安全备份')).not.toBeInTheDocument();
  });

  it('offers a Save everything toggle that flips every available file at once', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ seasonEdited: true });
    await user.click(screen.getByRole('checkbox', { name: /保存全部文件/ }));
    // All three available files are currently on, so the master toggle turns them all off.
    expect(props.onIncludeSavChange).toHaveBeenCalledWith(false);
    expect(props.onIncludeSeasonChange).toHaveBeenCalledWith(false);
    expect(props.onIncludeBackupChange).toHaveBeenCalledWith(false);
  });

  it('hides the Save everything toggle when only the vault save is on offer', () => {
    renderDialog({ seasonEdited: false, hasOriginal: false });
    expect(screen.queryByRole('checkbox', { name: /保存全部文件/ })).not.toBeInTheDocument();
  });

  it('disables export when nothing is selected', () => {
    renderDialog({
      includeSav: false,
      seasonEdited: false,
      includeBackup: false,
    });
    expect(screen.getByRole('button', { name: '导出' })).toBeDisabled();
  });

  it('toggling a file checkbox calls its change handler', async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(screen.getByRole('checkbox', { name: /你的避难所存档/ }));
    expect(props.onIncludeSavChange).toHaveBeenCalledWith(false);
  });
});
