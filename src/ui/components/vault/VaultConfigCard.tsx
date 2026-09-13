import { NumberField } from '../forms/NumberField.tsx';
import type { VaultMode } from '../../../domain/ops/vaultOps.ts';
import { VaultCard } from './VaultCard.tsx';
import { fieldHelp } from '../../lib/fieldHelp.ts';

// Vault config card: name (000–999), mode (Normal/Survival), and
// holiday theme. Edits apply live.

const MODES: readonly VaultMode[] = ['Normal', 'Survival'];

/** Display-only labels for the persisted VaultMode values (never written to the save). */
const MODE_LABELS: Record<VaultMode, string> = {
  Normal: '普通',
  Survival: '生存',
};

const THEMES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '普通' },
  { value: 1, label: '圣诞主题' },
  { value: 2, label: '万圣节主题' },
  { value: 3, label: '感恩节主题' },
];

export function VaultConfigCard({
  name,
  mode,
  theme,
  onName,
  onMode,
  onTheme,
}: {
  name: string;
  mode: string;
  theme: number;
  onName: (value: number) => void;
  onMode: (mode: VaultMode) => void;
  onTheme: (theme: number) => void;
}) {
  return (
    <VaultCard
      title="避难所设置"
      help={fieldHelp.vaultMode}
      description="名称、游戏模式与节日主题。"
    >
      <div className="flex flex-wrap items-end gap-4">
        <NumberField
          label="避难所编号"
          value={Number(name) || 0}
          min={0}
          max={999}
          onCommit={onName}
          className="w-28"
        />

        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">模式</span>
          <div className="flex overflow-hidden rounded border border-neutral-700">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onMode(m)}
                className={`px-3 py-1 text-sm ${
                  mode === m
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">主题</span>
          <select
            value={theme}
            onChange={(e) => onTheme(Number(e.target.value))}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
          >
            {THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </VaultCard>
  );
}
