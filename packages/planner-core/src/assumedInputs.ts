import type { ItemId } from '@beltwise/game-data';

export interface AssumedInputDefinition {
  readonly itemId: ItemId;
  readonly sourceLabel: string;
  readonly sourceNote: string;
}

export const ASSUMED_NUCLEAR_WASTE_SOURCE_NOTE =
  'Modeled as supplied nuclear waste. Add this item in Inputs to replace the assumed source.';

const ASSUMED_INPUT_DEFINITIONS: readonly AssumedInputDefinition[] = [
  {
    itemId: 'Desc_NuclearWaste_C',
    sourceLabel: 'Assumed nuclear waste',
    sourceNote: ASSUMED_NUCLEAR_WASTE_SOURCE_NOTE,
  },
  {
    itemId: 'Desc_PlutoniumWaste_C',
    sourceLabel: 'Assumed nuclear waste',
    sourceNote: ASSUMED_NUCLEAR_WASTE_SOURCE_NOTE,
  },
];

const ASSUMED_INPUT_DEFINITION_BY_ITEM_ID = new Map<ItemId, AssumedInputDefinition>(
  ASSUMED_INPUT_DEFINITIONS.map((definition) => [definition.itemId, definition]),
);

export function assumedInputDefinitions(): readonly AssumedInputDefinition[] {
  return ASSUMED_INPUT_DEFINITIONS;
}

export function assumedInputDefinitionForItemId(
  itemId: ItemId,
): AssumedInputDefinition | undefined {
  return ASSUMED_INPUT_DEFINITION_BY_ITEM_ID.get(itemId);
}

export function isAssumedInputItemId(itemId: ItemId): boolean {
  return ASSUMED_INPUT_DEFINITION_BY_ITEM_ID.has(itemId);
}
