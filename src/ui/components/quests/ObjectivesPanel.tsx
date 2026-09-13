import { useState } from 'react';
import { useSaveStore } from '../../../state/saveStore.ts';
import { pushToast } from '../../../state/toastStore.ts';
import { useQuestCatalog } from '../../hooks/useQuestCatalog.ts';
import {
  objectiveSlots,
  replaceObjectiveSlot,
  setObjectiveCompleted,
  setObjectiveIncLevel,
  setObjectiveLottery,
  setObjectiveProgress,
  slotEscalation,
} from '../../../domain/quests/objectiveOps.ts';
import {
  formatObjectiveDescription,
  scaledObjectiveGoal,
} from '../../../domain/quests/objectiveDisplay.ts';
import { ObjectiveSlotCard } from './ObjectiveSlotCard.tsx';
import { ObjectivePickerDialog } from './ObjectivePickerDialog.tsx';

// The Objectives sub-tab of the Quests view: the 3 rotating daily objectives (`objectiveMgr`),
// each an editable slot card. Replace-not-remove (the game assumes exactly 3 slots); lottery /
// incLevel / completed are per-save edits. The objective catalog rides in the same lazy
// useQuestCatalog as the quests, so nothing extra is fetched here.

export function ObjectivesPanel() {
  const save = useSaveStore((s) => s.save);
  const applyEdit = useSaveStore((s) => s.applyEdit);
  const { data: catalog, status, error } = useQuestCatalog();
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  const slots = save ? objectiveSlots(save) : [];
  const canEdit = !!save;

  if (!save) {
    return <p className="p-4 text-sm text-neutral-500">载入存档后即可查看和编辑目标。</p>;
  }
  if (status === 'loading') {
    return <p className="p-4 text-sm text-neutral-500">目标目录加载中…</p>;
  }
  if (status === 'error' || !catalog) {
    return <p className="p-4 text-sm text-amber-500">{error ?? '无法加载目标目录。'}</p>;
  }
  if (slots.length === 0) {
    return (
      <p className="p-4 text-sm text-neutral-500">此存档没有每日目标（`objectiveMgr` 为空）。</p>
    );
  }

  const pickerSlot = pickerFor != null ? slots[pickerFor] : undefined;

  // The slot's scaled goal - the same number the card displays. The Completed toggle, the
  // progress editors, and the escalation editor all pass it so counters and the completed flag
  // stay consistent. `level` overrides the slot's current escalation (the escalation editor
  // needs the goal AT the level being set, not the old one).
  const goalFor = (slot: (typeof slots)[number], level?: number): number | null => {
    const def = slot.objective?.objectiveID
      ? catalog.objectiveById.get(slot.objective.objectiveID)
      : undefined;
    return def ? scaledObjectiveGoal(def, level ?? slotEscalation(slot)) : null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">每日目标</h2>
        <span className="text-sm text-neutral-400">{slots.length} 个生效中</span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">游戏始终保持 3 个目标生效——请用替换而非移除。</p>

      <div className="mt-4 grid min-h-0 flex-1 auto-rows-min gap-4 overflow-y-auto lg:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot, index) => (
          <ObjectiveSlotCard
            key={index}
            index={index}
            slot={slot}
            def={
              slot.objective?.objectiveID
                ? catalog.objectiveById.get(slot.objective.objectiveID)
                : undefined
            }
            canEdit={canEdit}
            onReplace={() => setPickerFor(index)}
            onToggleCompleted={(completed) => {
              applyEdit(
                (s) => setObjectiveCompleted(s, index, completed, goalFor(slot)),
                '编辑目标',
              );
              pushToast(`目标槽位 ${index + 1} 已标记为${completed ? '完成' : '未完成'}。`);
            }}
            onLotteryChange={(lottery) =>
              applyEdit((s) => setObjectiveLottery(s, index, lottery), '编辑目标难度池')
            }
            onIncLevelChange={(incLevel) =>
              applyEdit(
                (s) => setObjectiveIncLevel(s, index, incLevel, goalFor(slot, incLevel)),
                '编辑目标等级',
              )
            }
            onProgressChange={(reqIndex, key, value) =>
              applyEdit(
                (s) => setObjectiveProgress(s, index, reqIndex, key, value, goalFor(slot)),
                '编辑目标进度',
              )
            }
          />
        ))}
      </div>

      {pickerFor != null && (
        <ObjectivePickerDialog
          objectives={catalog.objectives}
          currentId={pickerSlot?.objective?.objectiveID ?? null}
          onClose={() => setPickerFor(null)}
          onPick={(objectiveID) => {
            const def = catalog.objectiveById.get(objectiveID);
            applyEdit((s) => replaceObjectiveSlot(s, pickerFor, objectiveID), '替换目标');
            pushToast(
              `槽位 ${pickerFor + 1} 已设为：${def ? formatObjectiveDescription(def) : objectiveID}。`,
            );
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}
