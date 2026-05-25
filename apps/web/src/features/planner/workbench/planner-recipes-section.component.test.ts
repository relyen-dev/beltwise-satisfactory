import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { type RecipeId } from '@beltwise/game-data';
import { describe, expect, it, vi } from 'vitest';
import { PlannerRecipesSectionComponent } from './planner-recipes-section.component';
import { PlannerPlanConfigStore } from '../state/planner-plan-config.store';
import { type RecipeRow } from '../state/planner-store.selectors';

describe('PlannerRecipesSectionComponent', () => {
  it('bulk toggles the currently selected base recipe subtab rows', () => {
    const standardRows = [recipeRow('Recipe_IronPlate_C', 'Iron Plate', false)];
    const unlockRows = [recipeRow('Recipe_Alternate_UnlockWire_C', 'Unlock Wire', false, 'unlock')];
    const converterRows = [recipeRow('Recipe_ConverterIronOre_C', 'Iron Ore (Copper)', true)];
    const setRecipesEnabled = vi.fn();
    const injector = Injector.create({
      providers: [
        {
          provide: PlannerPlanConfigStore,
          useValue: {
            recipeCommands: {
              setManyEnabled: setRecipesEnabled,
            },
            converterResourceRecipeRows: signal(converterRows),
            standardBaseRecipeRows: signal(standardRows),
            unlockRecipeRows: signal(unlockRows),
          },
        },
      ],
    });
    const component = runInInjectionContext(injector, () => new PlannerRecipesSectionComponent());

    expect(component.activeRecipePanel()).toBe('alternate');
    expect(component.activeBaseRecipeRows()).toEqual(standardRows);

    component.activeBaseRecipePanel.set('converterResources');

    expect(component.activeBaseRecipeRows()).toEqual(converterRows);

    component.setRowsEnabled(component.activeBaseRecipeRows(), false);

    expect(setRecipesEnabled).toHaveBeenCalledWith(['Recipe_ConverterIronOre_C'], false);

    component.activeBaseRecipePanel.set('unlocks');

    expect(component.activeBaseRecipeRows()).toEqual(unlockRows);
  });
});

function recipeRow(
  recipeId: RecipeId,
  displayName: string,
  isConverterResourceRecipe: boolean,
  availabilityCategory: RecipeRow['availabilityCategory'] = 'standard',
): RecipeRow {
  return {
    recipe: {
      id: recipeId,
      className: recipeId,
      displayName,
      durationSeconds: 4,
      ingredients: [],
      isAlternate: false,
      isHandCraftOnly: false,
      producedIn: ['Build_ConstructorMk1_C'],
      products: [],
      tags: [],
    },
    enabled: true,
    availabilityCategory,
    availabilityLabel: availabilityCategory,
    machineName: 'Constructor',
    productIcons: [],
    hiddenProductIconCount: 0,
    isConverterResourceRecipe,
    details: {
      durationLabel: '4s cycle',
      ingredients: [],
      products: [],
    },
    toggleLabel: `${displayName} recipe availability`,
  };
}
