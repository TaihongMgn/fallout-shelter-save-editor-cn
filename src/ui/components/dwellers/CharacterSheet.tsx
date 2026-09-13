import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import type { Dweller, DwellerRarity, Gender } from '../../../domain/model/saveSchema.ts';
import { useSaveStore } from '../../../state/saveStore.ts';
import { useUIStore } from '../../../state/uiStore.ts';
import { pushToast } from '../../../state/toastStore.ts';
import { useGameData } from '../../hooks/useGameData.ts';
import { useVisualAssets } from '../../hooks/useVisualAssets.ts';
import {
  hairLabel,
  isKnownOutfitId,
  isKnownWeaponId,
  outfitEnduranceBonus,
} from '../../../domain/gamedata/gameData.ts';
import {
  autoPickPartner,
  createPet,
  deleteEquippedPet,
  detachPet,
  editEquippedPet,
  equipOutfit,
  equipWeapon,
  removeDwellers,
  setColors,
  setFaceMask,
  setGender,
  setHair,
  setHappiness,
  setHealth,
  setLastName,
  setLevel,
  setMaxHealth,
  maxOutHealth,
  setName,
  setPartner,
  setPregnancy,
  setRadiation,
  setRarity,
  setStat,
  unequipOutfit,
  unequipWeapon,
  type ClampOpts,
  type NewPet,
} from '../../../domain/ops/dwellerOps.ts';
import { NumberField } from '../forms/NumberField.tsx';
import { ColorField } from '../forms/ColorField.tsx';
import { ConfirmDialog } from '../ConfirmDialog.tsx';
import { FamilyBlock } from './FamilyBlock.tsx';
import { HairPicker } from './HairPicker.tsx';
import { AppearanceGridDialog } from './AppearanceGridDialog.tsx';
import { HoverTooltip, InfoTooltip } from '../InfoTooltip.tsx';
import { fieldHelp } from '../../lib/fieldHelp.ts';
import { EquipPickerDialog } from './EquipPickerDialog.tsx';
import { outfitSchema, weaponSchema } from '../table/schemas/itemSchemas.tsx';
import { outfitAllowedForGender } from '../../../domain/gamedata/itemStats.ts';
import { PetAttachDialog, type CurrentPet } from './PetAttachDialog.tsx';
import { selectPetRows, type PetRow } from '../../../domain/selectors/petSelectors.ts';
import { assignPet } from '../../../domain/ops/petOps.ts';
import {
  cancelBabyDelivery,
  deliverBabyNow,
  dwellerTimers,
  fastForwardTeam,
  growUpChildNow,
  pregnancyPendingChildren,
  setPendingChildren,
  wastelandTeams,
} from '../../../domain/ops/timerOps.ts';
import { formatDuration } from '../../../domain/tasks/taskLookup.ts';

// Lazy so the PixiJS renderer (the bulk of the bundle) loads only when a character sheet
// with a preview is first opened - not on the import/landing screens (perf).
const DwellerPreview = lazy(() =>
  import('./DwellerPreview.tsx').then((m) => ({ default: m.DwellerPreview })),
);

// Dense, single-view character sheet (everything visible, no
// accordions). Every control live-applies through a pure dwellerOps op wrapped in
// `applyEdit`, so each deliberate change is one undo step; Export is the only commit
// to disk. The "allow out-of-range" toggle relaxes the SPECIAL/level/
// happiness clamps for power users. Equipment slots open modal pickers - weapon/
// outfit from the catalog table, pets via the two-mode attach/edit dialog. The
// preview + layer-toggle chips render through PixiJS.

interface CharacterSheetProps {
  dweller: Dweller;
  onClose: () => void;
}

const RARITIES: DwellerRarity[] = ['Common', 'Normal', 'Rare', 'Legendary'];

// Rarity display names (option values stay the enum ids the save format uses).
const RARITY_LABELS: Record<DwellerRarity, string> = {
  Common: '常见',
  Normal: '普通',
  Rare: '稀有',
  Legendary: '传说',
};

// SPECIAL: stats.stats index → letter + full name (index 0 is a placeholder).
const SPECIAL: ReadonlyArray<{ index: number; letter: string; name: string }> = [
  { index: 1, letter: 'S', name: '力量' },
  { index: 2, letter: 'P', name: '感知' },
  { index: 3, letter: 'E', name: '耐力' },
  { index: 4, letter: 'C', name: '魅力' },
  { index: 5, letter: 'I', name: '智力' },
  { index: 6, letter: 'A', name: '敏捷' },
  { index: 7, letter: 'L', name: '幸运' },
];

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400/80">
        {title}
        {help && <InfoTooltip text={help} />}
      </h4>
      {children}
    </section>
  );
}

export function CharacterSheet({ dweller, onClose }: CharacterSheetProps) {
  const save = useSaveStore((s) => s.save);
  const originalSave = useSaveStore((s) => s.originalSave);
  const applyEdit = useSaveStore((s) => s.applyEdit);
  const { data: gameData } = useGameData();
  const { assets: visualAssets } = useVisualAssets();
  const allowOutOfRange = useUIStore((s) => s.allowOutOfRange);
  const setAllowOutOfRange = useUIStore((s) => s.setAllowOutOfRange);

  // Which equip picker is open (null = none); the pet flow has its own dialog.
  const [equipPicker, setEquipPicker] = useState<'weapon' | 'outfit' | null>(null);
  // Which appearance grid picker is open (hair / face + facial hair).
  const [appearancePicker, setAppearancePicker] = useState<'hair' | 'face' | null>(null);
  const [petDialogOpen, setPetDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Live appearance preview while dragging a color picker (ColorField.onPreview).
  // Holds the would-be ARGB so the Pixi canvas recolors instantly without routing each
  // pointer move through applyEdit (whole-save clone + health check + undo + every store
  // subscriber re-rendering). Cleared once the committed color catches up on blur - via
  // render-sync, since the project bans setState-in-useEffect.
  const [colorPreview, setColorPreview] = useState<{ skin?: number; hair?: number }>({});
  const [lastColors, setLastColors] = useState({
    skin: dweller.skinColor,
    hair: dweller.hairColor,
  });
  if (dweller.skinColor !== lastColors.skin || dweller.hairColor !== lastColors.hair) {
    setLastColors({ skin: dweller.skinColor, hair: dweller.hairColor });
    setColorPreview({});
  }

  // Overlay any active draft colors onto the dweller passed to the preview canvas; the
  // form fields keep reading the committed `dweller`.
  const previewDweller: Dweller =
    colorPreview.skin === undefined && colorPreview.hair === undefined
      ? dweller
      : {
          ...dweller,
          ...(colorPreview.skin !== undefined ? { skinColor: colorPreview.skin } : {}),
          ...(colorPreview.hair !== undefined ? { hairColor: colorPreview.hair } : {}),
        };

  const id = dweller.serializeId;
  const rangeOpts: ClampOpts | undefined = allowOutOfRange ? { clamp: false } : undefined;

  const statValue = (index: number): number => dweller.stats?.stats?.[index]?.value ?? 0;
  const isFemale = dweller.gender === 1;
  const maxHealth = dweller.health?.maxHealth ?? 1000;

  // Partner choices for the pregnancy section: OPPOSITE-gender dwellers only (two men or
  // two women cannot have a child in this game), name-sorted. The recorded partner stays
  // listed even if same-gender (a broken save link) so the select never shows a blank.
  // Living-Quarters timers attached to this dweller (pregnancy due / child grow-up)
  // and the wasteland team they are travelling with, if any.
  const timers = useMemo(
    () => (save ? dwellerTimers(save, id) : { pregnancy: null, childGrowUp: null }),
    [save, id],
  );
  const team = useMemo(
    () => (save ? (wastelandTeams(save).find((t) => t.dwellers.includes(id)) ?? null) : null),
    [save, id],
  );
  // Babies the current pregnancy delivers (partnership `pendingChildren`); null hides
  // the selector when there is no RaisingBaby entry to write to.
  const pendingChildren = useMemo(
    () => (save ? pregnancyPendingChildren(save, id) : null),
    [save, id],
  );

  const partnerOptions = useMemo(
    () =>
      (save?.dwellers?.dwellers ?? [])
        .filter(
          (d) =>
            d.serializeId !== id &&
            (d.gender !== dweller.gender || d.serializeId === dweller.relations?.partner),
        )
        .map((d) => ({
          id: d.serializeId,
          name: `${d.name ?? ''} ${d.lastName ?? ''}`.trim() || `居民 ${d.serializeId}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [save, id, dweller.gender, dweller.relations?.partner],
  );

  // The equipped outfit's Endurance bonus feeds HP scaling: the game adds it to base
  // Endurance when recomputing max HP on level change (dwellerHealth.ts).
  const endBonus = gameData ? outfitEnduranceBonus(gameData, dweller.equipedOutfit?.id) : 0;

  const weaponId = dweller.equipedWeapon?.id ?? null;
  const outfitId = dweller.equipedOutfit?.id ?? null;
  const petId = dweller.equippedPet?.id ?? null;
  const weaponName = weaponId ? (gameData?.weaponById.get(weaponId)?.name ?? weaponId) : null;
  const outfitName = outfitId ? (gameData?.outfitById.get(outfitId)?.name ?? outfitId) : null;
  const petName = petId
    ? dweller.equippedPet?.extraData?.uniqueName || gameData?.petById.get(petId)?.name || petId
    : null;

  // Outfit picker options: some outfits are gender-locked art (dresses are `F_*`, male-cut
  // suits are `M_*`), so only offer what this dweller can actually wear. The currently-equipped
  // outfit is always kept in the list so an existing (even mismatched) outfit never vanishes.
  const outfitOptions = useMemo(
    () =>
      (gameData?.outfits ?? []).filter(
        (o) => o.id === outfitId || outfitAllowedForGender(o, dweller.gender),
      ),
    [gameData, dweller.gender, outfitId],
  );

  // Picker tables draw from the game-data catalog (equipping writes ids directly).
  const weaponTable = useMemo(() => weaponSchema(gameData?.enums), [gameData]);
  const outfitTable = useMemo(() => outfitSchema(gameData?.enums), [gameData]);

  // Every owned pet instance for the picker's "Owned" tab, projected by the same selector
  // the Pets tab uses so the table shares its columns/shape. This dweller's OWN equipped
  // pet is excluded - it lives in the Edit tab and reassigning it to itself is a no-op.
  const ownedPets = useMemo<PetRow[]>(
    () =>
      save
        ? selectPetRows(save, gameData ?? undefined).filter(
            (r) => !(r.location.kind === 'equipped' && r.location.dwellerId === id),
          )
        : [],
    [save, gameData, id],
  );

  const currentPet: CurrentPet | null = dweller.equippedPet
    ? {
        id: dweller.equippedPet.id,
        uniqueName: dweller.equippedPet.extraData?.uniqueName ?? '',
        bonus: dweller.equippedPet.extraData?.bonus ?? '',
        bonusValue: dweller.equippedPet.extraData?.bonusValue ?? 0,
      }
    : null;

  // Id-existence guard: only write ids the game knows (the picker can only surface valid catalog
  // rows, so this just guards the impossible case rather than corrupting the save).
  // Equip applies instantly and closes the picker; a success toast confirms it
  // landed so a quick click doesn't feel like nothing happened.
  const onEquipWeapon = (wid: string): void => {
    if (gameData && !isKnownWeaponId(gameData, wid)) return;
    applyEdit((s) => equipWeapon(s, id, wid), '装备武器');
    pushToast(`已装备 ${gameData?.weaponById.get(wid)?.name ?? wid}。`, 'success');
  };
  const onEquipOutfit = (oid: string): void => {
    if (gameData && !isKnownOutfitId(gameData, oid)) return;
    applyEdit((s) => equipOutfit(s, id, oid), '装备服装');
    pushToast(`已装备 ${gameData?.outfitById.get(oid)?.name ?? oid}。`, 'success');
  };
  const onCreatePet = (pet: NewPet): void => {
    applyEdit((s) => createPet(s, id, pet), '创建宠物');
    pushToast(
      `已装备宠物：${pet.uniqueName || gameData?.petById.get(pet.petId)?.name || '宠物'}。`,
      'success',
    );
  };

  const maxAllSpecial = (): void =>
    applyEdit(
      (s) => SPECIAL.reduce((acc, { index }) => setStat(acc, id, index, 10, rangeOpts), s),
      'SPECIAL 全满',
    );

  const equipChipClass =
    'rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-left text-sm text-neutral-300 hover:border-amber-600/60 hover:text-neutral-100';

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-neutral-800 p-4">
      {/* Identity ---------------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide text-neutral-400">名字</span>
            <input
              type="text"
              aria-label="名字"
              defaultValue={dweller.name ?? ''}
              key={`name-${id}-${dweller.name ?? ''}`}
              onBlur={(e) => applyEdit((s) => setName(s, id, e.target.value), '设置名字')}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide text-neutral-400">姓氏</span>
            <input
              type="text"
              aria-label="姓氏"
              defaultValue={dweller.lastName ?? ''}
              key={`last-${id}-${dweller.lastName ?? ''}`}
              onBlur={(e) => applyEdit((s) => setLastName(s, id, e.target.value), '设置姓氏')}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭详情面板"
          className="rounded px-2 py-1 text-neutral-400 hover:text-neutral-100"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">性别</span>
          <div className="flex overflow-hidden rounded border border-neutral-700">
            {([1, 2] as Gender[]).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={dweller.gender === g}
                onClick={() => applyEdit((s) => setGender(s, id, g), '设置性别')}
                className={`px-3 py-1 text-sm ${
                  dweller.gender === g
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {g === 1 ? '女' : '男'}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">稀有度</span>
          <select
            aria-label="稀有度"
            value={(dweller.rarity as DwellerRarity) ?? 'Normal'}
            onChange={(e) =>
              applyEdit((s) => setRarity(s, id, e.target.value as DwellerRarity), '设置稀有度')
            }
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {RARITY_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Character preview + layer toggles (PixiJS) --------------------------- */}
      {visualAssets ? (
        <Suspense
          fallback={
            <div className="mt-3 rounded border border-dashed border-neutral-700 px-3 py-4 text-center text-xs text-neutral-400">
              加载预览…
            </div>
          }
        >
          <DwellerPreview dweller={previewDweller} assets={visualAssets} />
        </Suspense>
      ) : (
        <div className="mt-3 rounded border border-dashed border-neutral-700 px-3 py-4 text-center text-xs text-neutral-400">
          加载预览…
        </div>
      )}

      {/* Power-user toggle -------------------------------------------------- */}
      <label className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
        <input
          type="checkbox"
          checked={allowOutOfRange}
          onChange={(e) => setAllowOutOfRange(e.target.checked)}
        />
        允许超出范围的数值（作弊）
      </label>

      {/* SPECIAL ---------------------------------------------------------------- */}
      <Section title="SPECIAL" help={fieldHelp.special}>
        <div className="grid grid-cols-4 gap-2">
          {SPECIAL.map(({ index, letter }) => (
            <NumberField
              key={index}
              label={letter}
              value={statValue(index)}
              onCommit={(v) =>
                applyEdit((s) => setStat(s, id, index, v, rangeOpts), '设置 SPECIAL')
              }
              min={1}
              max={10}
              allowOutOfRange={allowOutOfRange}
              className="[&_span]:text-center"
            />
          ))}
          <button
            type="button"
            onClick={maxAllSpecial}
            className="self-end rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/40"
          >
            全部拉满
          </button>
        </div>
        <span className="sr-only">{SPECIAL.map((s) => s.name).join(' ')}</span>
      </Section>

      {/* Level + vitals --------------------------------------------------------- */}
      <Section title="等级与生命值" help={fieldHelp.health}>
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="等级"
            value={dweller.experience?.currentLevel ?? 1}
            onCommit={(v) => applyEdit((s) => setLevel(s, id, v, rangeOpts, endBonus), '设置等级')}
            min={1}
            max={50}
            allowOutOfRange={allowOutOfRange}
          />
          <NumberField
            label="幸福度"
            value={dweller.happiness?.happinessValue ?? 0}
            onCommit={(v) => applyEdit((s) => setHappiness(s, id, v, rangeOpts), '设置幸福度')}
            min={0}
            max={100}
            allowOutOfRange={allowOutOfRange}
          />
          <NumberField
            label="辐射"
            value={dweller.health?.radiationValue ?? 0}
            onCommit={(v) => applyEdit((s) => setRadiation(s, id, v), '设置辐射')}
            min={0}
            max={maxHealth}
            allowOutOfRange={allowOutOfRange}
          />
          <NumberField
            label="生命值"
            value={dweller.health?.healthValue ?? 0}
            onCommit={(v) => applyEdit((s) => setHealth(s, id, v), '设置生命值')}
            min={0}
            max={maxHealth}
            allowOutOfRange={allowOutOfRange}
          />
          <NumberField
            label="最大生命值"
            value={dweller.health?.maxHealth ?? 0}
            onCommit={(v) => applyEdit((s) => setMaxHealth(s, id, v), '设置最大生命值')}
            min={0}
            max={9999}
            allowOutOfRange={allowOutOfRange}
          />
          <button
            type="button"
            onClick={() => applyEdit((s) => maxOutHealth(s, id), '生命值全满')}
            className="self-end rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/40"
          >
            生命值全满 (644)
          </button>
        </div>
        <p className="mt-1 text-[11px] text-neutral-400">
          设置等级时会依据耐力（+ 服装加成）重新计算最大生命值，并回满生命值。
        </p>
      </Section>

      {/* Appearance | Equipment -------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4">
        <Section title="外观" help={fieldHelp.colors}>
          <div className="flex flex-col gap-3">
            <ColorField
              label="肤色"
              value={dweller.skinColor ?? 0xffffffff}
              onCommit={(v) => applyEdit((s) => setColors(s, id, { skin: v }), '设置肤色')}
              onPreview={(v) => setColorPreview((p) => ({ ...p, skin: v }))}
            />
            <ColorField
              label="发色"
              value={dweller.hairColor ?? 0xffffffff}
              onCommit={(v) => applyEdit((s) => setColors(s, id, { hair: v }), '设置发色')}
              onPreview={(v) => setColorPreview((p) => ({ ...p, hair: v }))}
            />
            {gameData ? (
              <>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-wide text-neutral-400">发型</span>
                  <button
                    type="button"
                    aria-label="选择发型"
                    className={equipChipClass}
                    onClick={() => setAppearancePicker('hair')}
                  >
                    {dweller.hair ? hairLabel(gameData, dweller.hair) : '无'}
                  </button>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                    面部装饰
                  </span>
                  <button
                    type="button"
                    aria-label="选择面部装饰"
                    className={equipChipClass}
                    onClick={() => setAppearancePicker('face')}
                  >
                    {dweller.faceMask ? hairLabel(gameData, dweller.faceMask) : '无'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <HairPicker
                  label="发型"
                  kind="hair"
                  value={dweller.hair ?? null}
                  gender={dweller.gender}
                  gameData={gameData}
                  onCommit={(v) => applyEdit((s) => setHair(s, id, v ?? ''), '设置发型')}
                />
                <HairPicker
                  label="面部装饰"
                  kind="face"
                  value={dweller.faceMask ?? null}
                  gender={dweller.gender}
                  gameData={gameData}
                  allowNone
                  onCommit={(v) => applyEdit((s) => setFaceMask(s, id, v), '设置面部装饰')}
                />
              </>
            )}
          </div>
        </Section>

        <Section title="装备" help={fieldHelp.outfit}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] uppercase tracking-wide text-neutral-400">武器</span>
              <button
                type="button"
                className={equipChipClass}
                onClick={() => setEquipPicker('weapon')}
              >
                {weaponName ?? '–'}
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] uppercase tracking-wide text-neutral-400">服装</span>
              <button
                type="button"
                className={equipChipClass}
                onClick={() => setEquipPicker('outfit')}
              >
                {outfitName ?? '–'}
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] uppercase tracking-wide text-neutral-400">宠物</span>
              <button
                type="button"
                className={equipChipClass}
                onClick={() => setPetDialogOpen(true)}
              >
                {petName ?? '装备宠物…'}
              </button>
            </div>
          </div>
        </Section>
      </div>

      {/* Pregnancy (female only) ------------------------------------------------- */}
      {isFemale && (
        <Section title="怀孕" help={fieldHelp.pregnancy}>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={dweller.pregnant === true}
                onChange={(e) =>
                  applyEdit(
                    // Forcing a pregnancy also auto-picks a partner when none is recorded
                    // (random compatible dweller, non-relatives preferred, relatives only
                    // as a last resort); the "Having a child with" select can override it.
                    (s) => {
                      const next = setPregnancy(s, id, { pregnant: e.target.checked });
                      return e.target.checked ? autoPickPartner(next, id) : next;
                    },
                    '设置怀孕',
                  )
                }
              />
              怀孕中
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={dweller.babyReady === true}
                onChange={(e) =>
                  // Flag and due timer travel as a pair, both directions: ticking
                  // delivers (flag + timer complete, what the game writes itself);
                  // unticking cancels AND restores the timer from the imported save
                  // instead of leaving it stranded at 0s.
                  applyEdit(
                    (s) =>
                      e.target.checked
                        ? deliverBabyNow(s, id)
                        : originalSave
                          ? cancelBabyDelivery(s, originalSave, id)
                          : setPregnancy(s, id, { babyReady: false }),
                    e.target.checked ? '立即分娩' : '取消分娩',
                  )
                }
              />
              婴儿即将出生
            </label>
          </div>
          {/* The other parent (`relations.partner`) - shown while pregnant so it's clear who
              the child is with, and editable for fixing up a broken/missing link. */}
          {dweller.pregnant === true && (
            <label className="mt-2 flex items-center gap-2 text-sm text-neutral-300">
              <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                孩子的另一方
              </span>
              <select
                value={dweller.relations?.partner ?? -1}
                onChange={(e) =>
                  applyEdit((s) => setPartner(s, id, Number(e.target.value)), '设置伴侣')
                }
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
              >
                <option value={-1}>未知 / 未记录</option>
                {partnerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* Baby count (`partners[].pendingChildren`): the game only rolls twins/triplets
              when this is 0, so a stored 2/3 forces the multi-birth - no breeding pet
              needed. Shown for every pregnancy: editor-forced ones (flag only, no
              partnership recorded) get the entry created on the first 2/3 pick. */}
          {(pendingChildren !== null || dweller.pregnant === true) && (
            <label className="mt-2 flex items-center gap-2 text-sm text-neutral-300">
              <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                预期婴儿数
              </span>
              <select
                value={pendingChildren === 2 || pendingChildren === 3 ? pendingChildren : 0}
                onChange={(e) =>
                  applyEdit(
                    (s) => setPendingChildren(s, id, Number(e.target.value)),
                    '设置预期婴儿数',
                  )
                }
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
              >
                <option value={0}>1（默认随机）</option>
                <option value={2}>2（双胞胎）</option>
                <option value={3}>3（三胞胎）</option>
              </select>
              <InfoTooltip text={fieldHelp.pendingChildren} />
            </label>
          )}
          {dweller.babyReady === true ? (
            <p className="mt-2 text-[11px] text-neutral-500">
              婴儿已到产期（即上方的"婴儿即将出生"）——在游戏中点击母亲即可分娩；分娩需要避难所内有空闲的居住空间。
            </p>
          ) : timers.pregnancy ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-300">
              <span>
                {(timers.pregnancy.remainingSeconds ?? 0) > 0 ? (
                  <>
                    距分娩还有{' '}
                    <span className="text-neutral-100">
                      {formatDuration(timers.pregnancy.remainingSeconds ?? 0)}
                    </span>
                  </>
                ) : (
                  '已到产期'
                )}
              </span>
              <InfoTooltip text={fieldHelp.pregnancyTimer} />
              <button
                type="button"
                onClick={() => {
                  // Completes the due timer AND ticks "Baby ready" - the same pair
                  // the game writes when the pregnancy finishes on its own.
                  applyEdit((s) => deliverBabyNow(s, id), '立即分娩');
                  pushToast('已标记婴儿即将出生——下次进入游戏时出生');
                }}
                className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                立即分娩
              </button>
            </div>
          ) : (
            dweller.pregnant === true && (
              <p className="mt-2 text-[11px] text-neutral-500">
                暂无预产倒计时——母亲在居住舱内时该倒计时才会推进。
              </p>
            )
          )}
        </Section>
      )}

      {/* Growing up (only when this dweller IS a child with a grow-up timer). A due
          timer (0s) shows its state instead of a button that would change nothing. */}
      {timers.childGrowUp && (
        <Section title="成长" help={fieldHelp.childGrowUp}>
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
            {(timers.childGrowUp.remainingSeconds ?? 0) > 0 ? (
              <>
                <span>
                  距成年还有{' '}
                  <span className="text-neutral-100">
                    {formatDuration(timers.childGrowUp.remainingSeconds ?? 0)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    applyEdit((s) => growUpChildNow(s, id), '立即长大');
                    pushToast('儿童将在下次进入游戏时长大');
                  }}
                  className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  立即长大
                </button>
              </>
            ) : (
              <span className="text-emerald-300/90">下次进入游戏时将成为成年人</span>
            )}
          </div>
        </Section>
      )}

      {/* Exploring (only when this dweller is on a travelling wasteland team) ------- */}
      {team && (
        <Section title="探索中" help={fieldHelp.exploringTimer}>
          <p className="text-sm text-neutral-300">
            {team.phase === 'exploring' ? (
              <>
                废土探索已持续{' '}
                <span className="text-neutral-100">{formatDuration(team.elapsedSeconds)}</span>
                {team.dwellers.length > 1 && `（${team.dwellers.length} 人小队）`}
              </>
            ) : (
              <>
                返回途中，还剩{' '}
                <span className="text-neutral-100">
                  {formatDuration(
                    Math.max(0, (team.returnTripDuration ?? 0) - team.elapsedSeconds),
                  )}
                </span>
                {team.dwellers.length > 1 && `（${team.dwellers.length} 人小队）`}
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {team.phase === 'exploring' ? (
              <>
                {[
                  { label: '+1 小时', seconds: 3_600 },
                  { label: '+8 小时', seconds: 8 * 3_600 },
                  { label: '+1 天', seconds: 86_400 },
                ].map(({ label, seconds }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      applyEdit(
                        (s) => fastForwardTeam(s, team.index, seconds),
                        `延长探索 ${label}`,
                      );
                      pushToast(`探索时间已推进 ${label}`);
                    }}
                    className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
                  >
                    {label}
                  </button>
                ))}
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  applyEdit(
                    (s) => fastForwardTeam(s, team.index, team.returnTripDuration ?? 0),
                    '立即返回避难所',
                  );
                  pushToast('队伍将在下次进入游戏时抵达避难所');
                }}
                className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                立即返回
              </button>
            )}
          </div>
        </Section>
      )}

      {/* Family / relationship viewer - read-only, click to walk. */}
      <FamilyBlock serializeId={id} />

      {/* Delete (confirm; undoable). Same scrubbing op as the bulk Remove - a plain
          list splice would leave dangling references (see removeDwellers). */}
      <div className="mt-6 border-t border-neutral-800 pt-3">
        <HoverTooltip text={fieldHelp.removeDweller} className="block">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full rounded border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/30"
          >
            删除居民
          </button>
        </HoverTooltip>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="删除居民"
        message={
          <>
            确定删除{' '}
            <span className="text-neutral-100">
              {[dweller.name, dweller.lastName].filter(Boolean).join(' ') || `#${id}`}
            </span>
            ？其携带的装备将一并移除，并会从所在房间和探索队伍中离开。编辑器打开期间你可以撤销此操作。
          </>
        }
        confirmLabel="删除"
        destructive
        onConfirm={() => {
          applyEdit((s) => removeDwellers(s, [id]), '删除居民');
          setConfirmDelete(false);
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Equip pickers - mounted only while open so state resets each time. */}
      {equipPicker === 'weapon' && (
        <EquipPickerDialog
          open
          onClose={() => setEquipPicker(null)}
          title="装备武器"
          currentSummary={weaponName ?? '–'}
          data={gameData?.weapons ?? []}
          schema={weaponTable}
          persistKey="equip.weapon"
          getRowId={(w) => w.id}
          equippedId={weaponId}
          onEquip={onEquipWeapon}
          onReset={() => applyEdit((s) => unequipWeapon(s, id), '卸下武器')}
          resetLabel="重置为拳头"
        />
      )}
      {equipPicker === 'outfit' && (
        <EquipPickerDialog
          open
          onClose={() => setEquipPicker(null)}
          title="装备服装"
          currentSummary={outfitName ?? '–'}
          data={outfitOptions}
          schema={outfitTable}
          persistKey="equip.outfit"
          getRowId={(o) => o.id}
          equippedId={outfitId}
          onEquip={onEquipOutfit}
          onReset={() => applyEdit((s) => unequipOutfit(s, id), '卸下服装')}
          resetLabel="重置为初始服装"
        />
      )}
      {appearancePicker && gameData && (
        <AppearanceGridDialog
          title={appearancePicker === 'hair' ? '选择发型' : '选择面部装饰'}
          kind={appearancePicker}
          gender={dweller.gender}
          current={(appearancePicker === 'hair' ? dweller.hair : dweller.faceMask) ?? null}
          gameData={gameData}
          assets={visualAssets}
          allowNone={appearancePicker === 'face'}
          onPick={(v) =>
            appearancePicker === 'hair'
              ? applyEdit((s) => setHair(s, id, v ?? ''), '设置发型')
              : applyEdit((s) => setFaceMask(s, id, v), '设置面部装饰')
          }
          onClose={() => setAppearancePicker(null)}
        />
      )}
      {petDialogOpen && (
        <PetAttachDialog
          onClose={() => setPetDialogOpen(false)}
          gameData={gameData}
          ownedPets={ownedPets}
          current={currentPet}
          allowOutOfRange={allowOutOfRange}
          onAssign={(pet) => {
            applyEdit((s) => assignPet(s, pet.location, id), '装备宠物');
            pushToast(`已装备宠物：${pet.uniqueName || pet.breed || '宠物'}。`, 'success');
          }}
          onCreate={onCreatePet}
          onEdit={(changes) => applyEdit((s) => editEquippedPet(s, id, changes), '编辑宠物')}
          onDetach={() => {
            applyEdit((s) => detachPet(s, id), '卸下宠物');
            pushToast('宠物已卸下并存入仓库。', 'success');
          }}
          onDelete={() => {
            applyEdit((s) => deleteEquippedPet(s, id), '删除宠物');
            pushToast('宠物已删除。', 'success');
          }}
        />
      )}
    </aside>
  );
}
