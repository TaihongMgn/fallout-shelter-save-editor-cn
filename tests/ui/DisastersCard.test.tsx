import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DisastersCard } from '../../src/ui/components/vault/DisastersCard.tsx';

function renderCard(overrides: Partial<Parameters<typeof DisastersCard>[0]> = {}) {
  const props = {
    deathclaw: 'enabled' as const,
    deathclawRemaining: null,
    canToggleDeathclaw: true,
    onSetDeathclaw: vi.fn(),
    bottleAndCappy: true,
    onSetBottleAndCappy: vi.fn(),
    ...overrides,
  };
  render(<DisastersCard {...props} />);
  return props;
}

describe('DisastersCard', () => {
  it('shows the three deathclaw states', () => {
    renderCard();
    expect(screen.getByText(/可能发生袭击/)).toBeInTheDocument();
  });

  it('shows a natural cooldown with remaining time', () => {
    renderCard({ deathclaw: 'cooldown', deathclawRemaining: 900 });
    expect(screen.getByText(/自然冷却中，剩余 15 分 0 秒/)).toBeInTheDocument();
    // Still reads as ON: the cooldown is the game's own state, not our block.
    expect(screen.getByRole('switch', { name: /死亡爪袭击/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows the editor block distinctly', () => {
    renderCard({ deathclaw: 'disabled', deathclawRemaining: 4_000_000_000 });
    expect(screen.getByText(/已被本编辑器阻止/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /死亡爪袭击/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('toggling deathclaws flips the current state', async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.click(screen.getByRole('switch', { name: /死亡爪袭击/ }));
    expect(props.onSetDeathclaw).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('disables the deathclaw switch when the save has no task list', () => {
    renderCard({ canToggleDeathclaw: false });
    expect(screen.getByRole('switch', { name: /死亡爪袭击/ })).toBeDisabled();
  });

  it('toggles Bottle & Cappy and explains the off state', async () => {
    const user = userEvent.setup();
    const props = renderCard({ bottleAndCappy: false });
    expect(screen.getByText(/已阻止到访/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /瓶子与卡皮/ }));
    expect(props.onSetBottleAndCappy).toHaveBeenCalledExactlyOnceWith(true);
  });
});
