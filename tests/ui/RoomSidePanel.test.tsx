import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomSidePanel } from '../../src/ui/components/rooms/RoomSidePanel.tsx';
import { buildLayout } from '../../src/domain/rooms/layout.ts';
import type { SaveData } from '../../src/domain/model/saveSchema.ts';

// A staffed Diner so the loadout action renders (UX-A finding 4 - the button must explain
// what it equips and link to the Bulk loadout panel).
const save = {
  vault: {
    rooms: [
      {
        type: 'Cafeteria',
        class: 'Production',
        deserializeID: 5,
        row: 1,
        col: 0,
        level: 1,
        mergeLevel: 1,
        dwellers: [10],
      },
    ],
  },
} as unknown as SaveData;

const node = buildLayout(save).byId.get(5)!;

function renderPanel(overrides: Partial<Parameters<typeof RoomSidePanel>[0]> = {}) {
  const props = {
    node,
    label: 'Diner',
    maxLevel: 3,
    maxDwellers: 2,
    occupants: [{ id: 10, name: 'Bob' }],
    canRemove: { ok: true } as const,
    mergeable: { ok: false, reason: 'no neighbour' } as const,
    onClose: vi.fn(),
    onSetLevel: vi.fn(),
    onMaxLevel: vi.fn(),
    onRepair: vi.fn(),
    onSetPower: vi.fn(),
    themeOptions: [],
    currentTheme: 'None',
    onSetTheme: vi.fn(),
    onMerge: vi.fn(),
    onUnassign: vi.fn(),
    onOpenAssign: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<RoomSidePanel {...props} />);
  return props;
}

describe('RoomSidePanel loadout clarity (finding 4)', () => {
  it('shows a help tooltip describing exactly what the loadout equips', async () => {
    const user = userEvent.setup();
    renderPanel({
      onApplyLoadout: vi.fn(),
      loadoutLabel: '应用敏捷配装',
      loadoutHelp: '为全部 1 名在住居民装备 精壮摔跤手（最强的 敏捷 服装）与 胖子核弹。',
      onOpenBulkLoadouts: vi.fn(),
    });
    await user.hover(screen.getByRole('button', { name: '此配置装备的内容' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('最强的 敏捷 服装');
  });

  it('the Bulk loadouts link invokes onOpenBulkLoadouts', async () => {
    const user = userEvent.setup();
    const onOpenBulkLoadouts = vi.fn();
    renderPanel({
      onApplyLoadout: vi.fn(),
      loadoutLabel: '应用敏捷配装',
      onOpenBulkLoadouts,
    });
    await user.click(screen.getByRole('button', { name: '在「批量 → 场所装备配置」中自定义' }));
    expect(onOpenBulkLoadouts).toHaveBeenCalledOnce();
  });

  it('the loadout button invokes onApplyLoadout', async () => {
    const user = userEvent.setup();
    const onApplyLoadout = vi.fn();
    renderPanel({ onApplyLoadout, loadoutLabel: '应用敏捷配装' });
    await user.click(screen.getByRole('button', { name: '应用敏捷配装' }));
    expect(onApplyLoadout).toHaveBeenCalledOnce();
  });
});

describe('RoomSidePanel timers', () => {
  it('renders nothing without timers', () => {
    renderPanel();
    expect(screen.queryByText('计时器')).not.toBeInTheDocument();
  });

  it('lists timer rows and fires the per-kind completion', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      timers: [
        { kind: 'production', remainingSeconds: 120 },
        { kind: 'crafting', remainingSeconds: 3_700, itemName: '胖子核弹' },
        { kind: 'rush', remainingSeconds: 60 },
      ],
      onCompleteTimers: vi.fn(),
      onCompleteTrainingSlot: vi.fn(),
    });
    expect(screen.getByText('计时器')).toBeInTheDocument();
    expect(screen.getByText('生产周期')).toBeInTheDocument();
    expect(screen.getByText(/正在制作 胖子核弹/)).toBeInTheDocument();
    expect(screen.getByText('加速冷却')).toBeInTheDocument();
    const finishButtons = screen.getAllByRole('button', { name: '立即完成' });
    await user.click(finishButtons[1]!);
    expect(props.onCompleteTimers).toHaveBeenCalledExactlyOnceWith(['crafting']);
    await user.click(screen.getByRole('button', { name: '立即重置' }));
    expect(props.onCompleteTimers).toHaveBeenLastCalledWith(['rush']);
  });

  it('routes training rows through the per-slot callback and offers finish-all', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      timers: [
        { kind: 'training', remainingSeconds: 900, slotDwellerId: 10, slotDwellerName: 'Bob' },
        { kind: 'training', remainingSeconds: 1_800, slotDwellerId: 11, slotDwellerName: 'Ann' },
      ],
      onCompleteTimers: vi.fn(),
      onCompleteTrainingSlot: vi.fn(),
    });
    expect(screen.getByText(/Bob 训练中/)).toBeInTheDocument();
    const finishButtons = screen.getAllByRole('button', { name: /^立即完成$/ });
    await user.click(finishButtons[0]!);
    expect(props.onCompleteTrainingSlot).toHaveBeenCalledExactlyOnceWith(10);
    await user.click(screen.getByRole('button', { name: '完成全部训练' }));
    expect(props.onCompleteTimers).toHaveBeenCalledExactlyOnceWith(['training']);
  });
});

describe('RoomSidePanel timers - finished and awaiting-collect states', () => {
  it('a finished timer shows its state instead of a dead button', () => {
    renderPanel({
      timers: [{ kind: 'crafting', remainingSeconds: 0, itemName: '胖子核弹' }],
      onCompleteTimers: vi.fn(),
    });
    expect(screen.getByText(/下次载入时完成/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即完成' })).not.toBeInTheDocument();
  });

  it('a full production room explains why no timer is stored', () => {
    renderPanel({ productionAwaitingCollect: true });
    expect(screen.getByText('计时器')).toBeInTheDocument();
    expect(screen.getByText('产出已满，请在游戏中收取')).toBeInTheDocument();
    expect(screen.getByText(/没有存储生产周期/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即完成' })).not.toBeInTheDocument();
  });
});
