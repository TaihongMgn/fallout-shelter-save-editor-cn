import type { ObjectiveDef } from '../../../../domain/gamedata/schemas.ts';
import {
  formatObjectiveDescription,
  objectiveGoal,
  objectiveModeLabel,
  REWARD_LABEL,
} from '../../../../domain/quests/objectiveDisplay.ts';
import { inSelectedSet, nameCell } from '../columnKit.tsx';
import type { TableSchema } from '../tableSchema.ts';

// Source-of-truth schema for the daily-OBJECTIVE catalog (the 530 definitions from
// objectives.json). Rendered by the objective replace picker; any future objective browser
// reuses this schema and picks a preset. Objectives have no item sprite, so there is no
// pinned icon column - every column is hideable.

export function objectiveCatalogSchema(): TableSchema<ObjectiveDef> {
  return {
    name: 'objectiveCatalog',
    hideable: [
      { id: 'objective', label: '目标' },
      { id: 'tier', label: '等级' },
      { id: 'goal', label: '目标数' },
      { id: 'reward', label: '奖励' },
      { id: 'rewardAmount', label: '奖励数量' },
      { id: 'perLevel', label: '每级奖励' },
      { id: 'mode', label: '模式' },
      { id: 'id', label: '目标 ID' },
    ],
    columns: [
      {
        id: 'objective',
        accessorFn: (o) => formatObjectiveDescription(o),
        header: '目标',
        cell: ({ getValue }) => nameCell(getValue<string>()),
        size: 280,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '目标' },
      },
      {
        id: 'tier',
        accessorFn: (o) => o.m_level ?? 0,
        header: '等级',
        cell: ({ getValue }) => {
          const tier = getValue<number>();
          return tier > 0 ? tier : '-';
        },
        size: 80,
        filterFn: inSelectedSet<ObjectiveDef>(),
        meta: { filterVariant: 'select', headerLabel: '等级' },
      },
      {
        // Base (level-0) goal amount, e.g. the 200 in "Collect 200 Food". A few purely
        // descriptive objectives have none; they sort as 0 and render "-".
        id: 'goal',
        accessorFn: (o) => objectiveGoal(o) ?? 0,
        header: '目标数',
        cell: ({ row }) => objectiveGoal(row.original) ?? '-',
        size: 90,
        filterFn: 'inNumberRange',
        meta: { filterVariant: 'range', headerLabel: '目标数' },
      },
      {
        id: 'reward',
        accessorFn: (o) => REWARD_LABEL[o.m_baseRewardType ?? 0] ?? '其他',
        header: '奖励',
        size: 130,
        filterFn: inSelectedSet<ObjectiveDef>(),
        meta: { filterVariant: 'select', headerLabel: '奖励' },
      },
      {
        id: 'rewardAmount',
        accessorFn: (o) => o.m_baseRewardAmount ?? 0,
        header: '数量',
        size: 90,
        filterFn: 'inNumberRange',
        meta: { filterVariant: 'range', headerLabel: '奖励数量' },
      },
      {
        // Extra reward per slot incLevel (`m_rewardIncrement`).
        id: 'perLevel',
        accessorFn: (o) => o.m_rewardIncrement ?? 0,
        header: '每级',
        size: 90,
        filterFn: 'inNumberRange',
        meta: { filterVariant: 'range', headerLabel: '每级奖励' },
      },
      {
        id: 'mode',
        accessorFn: (o) => objectiveModeLabel(o),
        header: '模式',
        size: 100,
        filterFn: inSelectedSet<ObjectiveDef>(),
        meta: { filterVariant: 'select', headerLabel: '模式' },
      },
      {
        id: 'id',
        accessorFn: (o) => o.m_objectiveID,
        header: 'ID',
        cell: ({ getValue }) => nameCell(getValue<string>()),
        size: 150,
        filterFn: 'includesString',
        meta: { filterVariant: 'text', headerLabel: '目标 ID' },
      },
    ],
  };
}

/** Hideable columns shown by default in the replace picker (increment + raw id stay a toggle away). */
export const OBJECTIVE_PICKER_PRESET = [
  'objective',
  'tier',
  'goal',
  'reward',
  'rewardAmount',
  'mode',
] as const;
