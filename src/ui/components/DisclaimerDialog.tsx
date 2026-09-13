import * as Dialog from '@radix-ui/react-dialog';
import { MODAL_SMALL } from '../lib/modalClasses.ts';

interface DisclaimerDialogProps {
  open: boolean;
  onAccept: () => void;
}

// One-time disclaimer gate. Acceptance is persisted by
// the caller; the dialog has no dismiss path other than "I understand".
export function DisclaimerDialog({ open, onAccept }: DisclaimerDialogProps) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className={`${MODAL_SMALL} p-6`}>
          <Dialog.Title className="text-lg font-semibold">编辑须知</Dialog.Title>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-300">
            <Dialog.Description>
              本工具完全在你的浏览器内读取并编辑《辐射：避难所》存档文件。任何数据都绝不会被上传；没有服务器，也没有遥测数据收集。
            </Dialog.Description>
            <p>
              编辑存档可能使其永久损坏。修改存档还可能违反游戏或平台的服务条款，并可能使你失去账号、成就或游戏进度。首次导出前会自动下载一份带时间戳的原始文件备份，但也请自行保留一份副本。
            </p>
            <p>
              这是一个非官方的粉丝项目，按&ldquo;原样&rdquo;提供，不附带任何形式的保证。本项目与
              Bethesda Softworks、ZeniMax Media、Microsoft
              或其关联公司不存在任何隶属、认可或赞助关系。《辐射》和《辐射：避难所》是其各自所有者的商标。使用本工具的风险完全由你自行承担。
            </p>
          </div>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={onAccept}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-amber-400"
            >
              我已了解并接受风险
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
