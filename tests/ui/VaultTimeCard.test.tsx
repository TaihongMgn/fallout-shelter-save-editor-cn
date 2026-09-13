import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VaultTimeCard } from '../../src/ui/components/vault/VaultTimeCard.tsx';

function renderCard(overrides: Partial<Parameters<typeof VaultTimeCard>[0]> = {}) {
  const props = {
    canFastForward: true,
    clockAheadSeconds: 0,
    onFastForward: vi.fn(),
    dailyRewards: { total: 1, pending: 1, soonestSeconds: 7_200 },
    onMakeDailyRewardsClaimable: vi.fn(),
    ...overrides,
  };
  render(<VaultTimeCard {...props} />);
  return props;
}

describe('VaultTimeCard', () => {
  it('shows the untouched clock state and updates as fast-forwards accumulate', () => {
    renderCard();
    expect(screen.getByText(/与导入存档一致/)).toBeInTheDocument();
  });

  it('shows the cumulative fast-forward as persistent feedback', () => {
    renderCard({ clockAheadSeconds: 86_400 + 8 * 3_600 });
    expect(screen.getByText(/比导入存档快 1 天 8 小时/)).toBeInTheDocument();
  });

  it('fires one fast-forward per preset click with the right seconds', async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.click(screen.getByRole('button', { name: '+1 小时' }));
    expect(props.onFastForward).toHaveBeenCalledExactlyOnceWith(3_600, expect.any(String));
    await user.click(screen.getByRole('button', { name: '+1 周' }));
    expect(props.onFastForward).toHaveBeenLastCalledWith(7 * 86_400, expect.any(String));
  });

  it('applies the custom hours value', async () => {
    const user = userEvent.setup();
    const props = renderCard();
    const field = screen.getByRole('spinbutton', { name: /自定义（小时）/ });
    await user.clear(field);
    await user.type(field, '36');
    await user.tab(); // NumberField commits on blur
    await user.click(screen.getByRole('button', { name: /^应用$/ }));
    expect(props.onFastForward).toHaveBeenCalledExactlyOnceWith(36 * 3_600, '快进 +36 小时');
  });

  it('disables the fast-forward controls when the save has no readable clock', () => {
    renderCard({ canFastForward: false, clockAheadSeconds: null });
    for (const name of ['+1 小时', '+8 小时', '+1 天', '+1 周', '应用']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByText(/无法从此存档读取/)).toBeInTheDocument();
  });

  it('offers the daily-reward reset with a countdown while one is pending', async () => {
    const user = userEvent.setup();
    const props = renderCard();
    expect(screen.getByText(/下一个奖励 2 小时 0 分/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /立即设为可领取/ }));
    expect(props.onMakeDailyRewardsClaimable).toHaveBeenCalledOnce();
  });

  it('explains an already-claimable timer instead of showing a dead button', () => {
    renderCard({ dailyRewards: { total: 1, pending: 0, soonestSeconds: null } });
    expect(screen.queryByRole('button', { name: /立即设为可领取/ })).not.toBeInTheDocument();
    expect(screen.getByText(/已可领取——下次载入此存档时游戏即会发放/)).toBeInTheDocument();
  });

  it('explains an absent timer (the game creates it claimable on load)', () => {
    renderCard({ dailyRewards: { total: 0, pending: 0, soonestSeconds: null } });
    expect(screen.queryByRole('button', { name: /立即设为可领取/ })).not.toBeInTheDocument();
    expect(screen.getByText(/未记录计时器/)).toBeInTheDocument();
  });
});
