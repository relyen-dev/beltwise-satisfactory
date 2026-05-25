import { describe, expect, it } from 'vitest';
import {
  recipeAvailabilityCategoryForDataset,
  type GameDataset,
  type Recipe,
} from '@beltwise/game-data';

describe('recipeAvailabilityCategoryForDataset', () => {
  it('classifies deterministic unlock ids from legacy recipes without availabilityCategory', () => {
    const dataset = { resources: {} } satisfies Pick<GameDataset, 'resources'>;

    expect(
      recipeAvailabilityCategoryForDataset(
        dataset,
        legacyAlternateRecipe('Recipe_Alternate_EnrichedCoal_C'),
      ),
    ).toBe('unlock');
    expect(
      recipeAvailabilityCategoryForDataset(
        dataset,
        legacyAlternateRecipe('Recipe_Alternate_Turbofuel_C'),
      ),
    ).toBe('unlock');
    expect(
      recipeAvailabilityCategoryForDataset(
        dataset,
        legacyAlternateRecipe('Recipe_Alternate_IronWire_C'),
      ),
    ).toBe('alternate');
  });
});

function legacyAlternateRecipe(recipeId: string): Recipe {
  return {
    id: recipeId,
    className: recipeId,
    displayName: recipeId,
    ingredients: [],
    products: [{ itemId: 'Desc_Test_C', amount: 1 }],
    durationSeconds: 4,
    producedIn: ['Build_ConstructorMk1_C'],
    isAlternate: true,
    isHandCraftOnly: false,
    tags: [],
  };
}
