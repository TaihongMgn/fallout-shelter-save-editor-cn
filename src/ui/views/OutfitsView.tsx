import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useGameData } from '../hooks/useGameData.ts';
import { useCraftableColumn } from '../hooks/useCraftableColumn.ts';
import { outfitSchema } from '../components/table/schemas/itemSchemas.tsx';
import { ItemCatalogSection } from '../components/items/ItemCatalogSection.tsx';

// Standalone Outfits catalog section: a browsable
// reference over every outfit in game data (icon · name · SPECIAL · type · rarity · craftable),
// with add-to-storage + equip-on-dwellers actions. Mirrors WeaponsView. The Craftable column
// links to the Recipes tab; arriving from a recipe's "View in Outfits tab" jump highlights the
// item via the URL `:detail` param.
export function OutfitsView({ virtualized = true }: { virtualized?: boolean } = {}) {
  const { data: gameData } = useGameData();
  const { detail } = useParams();
  const craft = useCraftableColumn();
  const schema = useMemo(() => outfitSchema(gameData?.enums, craft), [gameData, craft]);
  return (
    <ItemCatalogSection
      title="服装"
      unitNoun="服装"
      storageType="Outfit"
      slot="Outfit"
      data={gameData?.outfits ?? []}
      schema={schema}
      persistKey="catalog.outfits"
      searchLabel="搜索服装"
      searchPlaceholder="搜索服装…"
      focusRowId={detail ?? null}
      virtualized={virtualized}
    />
  );
}
