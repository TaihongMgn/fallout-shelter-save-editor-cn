import { useState } from 'react';
import { SEASON_FILE_NAMES } from '../../../domain/codec/platformTargets.ts';
import { SourcePicker } from '../SourcePicker.tsx';
import { WheresMyFile } from './WheresMyFile.tsx';

// Season Pass onboarding: the user picks a SOURCE for the season
// working model. Upload their real `spd.dat` (+ optional `nvf.dat`) to recover/edit actual
// progress, or build a fresh season pass from the static catalog (nothing claimed). Both land in
// the same workspace and both can be downloaded afterwards. The layout is the shared SourcePicker
// so this stays visually identical to the Import landing. The `.sav` is already loaded (the app
// gates the section behind it), so this is purely the season-file choice.

interface SeasonOnboardingProps {
  /** Load uploaded season files into the working model (store.loadSeasonFromText). */
  onUpload: (spdText: string, nvfText: string | null, fileName: string) => Promise<void>;
  /** Build a fresh editable model from the catalog (store.startSeasonFromCatalog). */
  onContinue: () => void;
  /** False until the static catalog is loaded - gates the "Continue" card. */
  canContinue: boolean;
  /** Set when the catalog failed to load (the "Continue" path is then unavailable). */
  catalogError: string | null;
}

export function SeasonOnboarding({
  onUpload,
  onContinue,
  canContinue,
  catalogError,
}: SeasonOnboardingProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = async (files: FileList): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const list = Array.from(files);
      // Route by name: the season pointer is nvf.dat; everything else is treated as the spd.
      const nvfFile = list.find((f) => f.name.toLowerCase().includes('nvf')) ?? null;
      const spdFile = list.find((f) => f !== nvfFile) ?? null;
      if (!spdFile) {
        setError(`请选择你的 ${SEASON_FILE_NAMES.spd}（可选 ${SEASON_FILE_NAMES.nvf}）。`);
        return;
      }
      const spdText = await spdFile.text();
      const nvfText = nvfFile ? await nvfFile.text() : null;
      await onUpload(spdText, nvfText, spdFile.name);
    } catch (e) {
      setError(
        e instanceof Error
          ? `无法读取该文件。它是有效的 ${SEASON_FILE_NAMES.spd} 吗？（${e.message}）`
          : '读取赛季文件失败。',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SourcePicker
      title="赛季通行证"
      description={
        <>
          把赛季通行证的进度恢复到你的避难所，或者从零生成一份赛季通行证。无论哪种方式，完成后都可以下载更新后的{' '}
          <code className="text-neutral-300">{SEASON_FILE_NAMES.spd}</code> 和{' '}
          <code className="text-neutral-300">{SEASON_FILE_NAMES.nvf}</code>。
        </>
      }
      uploadTitle="使用现有文件"
      uploadDescription={
        <>
          载入你真实的赛季通行证状态：等级、精英轨道，以及已领取的奖励。同时添加{' '}
          <code className="text-neutral-300">{SEASON_FILE_NAMES.nvf}</code> 以保持当前赛季指针同步。
        </>
      }
      uploadHint={
        <>
          也可以把 <code className="text-neutral-400">{SEASON_FILE_NAMES.spd}</code>（和{' '}
          <code className="text-neutral-400">{SEASON_FILE_NAMES.nvf}</code>）拖放到此卡片上。
        </>
      }
      uploadButtonLabel="选择 .dat 文件"
      accept=".dat"
      multiple
      busy={busy}
      onFiles={(files) => void loadFiles(files)}
      prebuiltTitle="没有文件？生成一份"
      prebuiltDescription={
        <>
          生成一份真实的赛季通行证：包含所有赛季，未领取任何奖励，1
          级，未解锁精英。完全可编辑，完成后可作为真实的{' '}
          <code className="text-neutral-300">{SEASON_FILE_NAMES.spd}</code> 下载给游戏使用。
        </>
      }
      prebuiltButtonLabel={canContinue ? '继续' : '目录加载中…'}
      prebuiltDisabled={!canContinue}
      onPrebuilt={onContinue}
      prebuiltError={catalogError ? `目录不可用：${catalogError}` : null}
      error={error}
      help={<WheresMyFile variant="season" />}
    />
  );
}
