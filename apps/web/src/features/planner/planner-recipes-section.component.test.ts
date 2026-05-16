import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { type RecipeId } from '@beltwise/game-data';
import { describe, expect, it, vi } from 'vitest';
import { PlannerRecipesSectionComponent } from './planner-recipes-section.component';
import { PlannerStoreService } from './planner-store.service';
import { type RecipeRow } from './planner-store.selectors';

describe('PlannerRecipesSectionComponent', () => {
  it('bulk toggles the currently selected base recipe subtab rows', () => {
    const standardRows = [recipeRow('Recipe_IronPlate_C', 'Iron Plate', false)];
    const converterRows = [recipeRow('Recipe_ConverterIronOre_C', 'Iron Ore (Copper)', true)];
    const setRecipesEnabled = vi.fn();
    const injector = Injector.create({
      providers: [
        {
          provide: PlannerStoreService,
          useValue: {
            converterResourceRecipeRows: signal(converterRows),
            setRecipesEnabled,
            standardBaseRecipeRows: signal(standardRows),
          },
        },
      ],
    });
    const component = runInInjectionContext(
      injector,
      () => new PlannerRecipesSectionComponent(),
    );

    expect(component.activeBaseRecipeRows()).toEqual(standardRows);

    component.activeBaseRecipePanel.set('converterResources');

    expect(component.activeBaseRecipeRows()).toEqual(converterRows);

    component.setRowsEnabled(component.activeBaseRecipeRows(), false);

    expect(setRecipesEnabled).toHaveBeenCalledWith(['Recipe_ConverterIronOre_C'], false);
  });
});

function recipeRow(
  recipeId: RecipeId,
  displayName: string,
  isConverterResourceRecipe: boolean,
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
