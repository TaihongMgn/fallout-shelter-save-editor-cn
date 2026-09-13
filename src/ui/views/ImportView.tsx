import { useSaveStore } from '../../state/saveStore.ts';
import { SourcePicker } from '../components/SourcePicker.tsx';
import { WheresMyFile } from '../components/season/WheresMyFile.tsx';

// Import landing: pick an existing `.sav` (drag-drop or picker) or start from a
// prebuilt sandbox vault. Both land in the same editable workspace and both download as a real
// `.sav`. Uses the shared SourcePicker so it stays visually identical to the Season onboarding.
export function ImportView() {
  const importFromText = useSaveStore((s) => s.importFromText);
  const importBaseline = useSaveStore((s) => s.importBaseline);
  const status = useSaveStore((s) => s.status);
  const error = useSaveStore((s) => s.error);

  const loadFiles = async (files: FileList) => {
    const file = files[0];
    if (file) await importFromText(await file.text(), file.name);
  };

  return (
    <SourcePicker
      title="打开存档"
      description="编辑现有的《辐射：避难所》存档，或从预置的沙盒避难所开始。无论哪种方式，都会生成真实、可下载的 .sav 文件，且全程仅本地处理，绝不上传。"
      uploadTitle="使用现有文件"
      uploadDescription={
        <>
          通常是 <code className="text-neutral-300">Vault1.sav</code>。游戏的{' '}
          <code className="text-neutral-300">.sav.bkp</code> 备份以及本编辑器自带的{' '}
          <code className="text-neutral-300">.backup-*.sav</code> 文件也可以载入。
        </>
      }
      uploadHint={
        <>
          也可以将 <code className="text-neutral-400">.sav</code> 文件拖放到此卡片上。
        </>
      }
      uploadButtonLabel="选择 .sav 文件"
      accept=".sav,.bkp"
      busy={status === 'loading'}
      onFiles={(files) => void loadFiles(files)}
      prebuiltTitle="没有存档？现场生成一个"
      prebuiltDescription="生成一个真实且完全可编辑的新档避难所，编辑并下载后即可用于真实游戏。在赛季通行证页面也用得上。"
      prebuiltButtonLabel="从零开始 / 沙盒"
      prebuiltDisabled={status === 'loading'}
      onPrebuilt={() => void importBaseline()}
      error={status === 'error' ? error : null}
      help={<WheresMyFile variant="save" />}
    />
  );
}
