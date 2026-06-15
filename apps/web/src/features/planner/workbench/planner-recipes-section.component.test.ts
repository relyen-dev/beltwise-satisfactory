import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type ElementRef } from '@angular/core';
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
    const component = createComponent({
      converterRows,
      setRecipesEnabled,
      standardRows,
      unlockRows,
    });

    expect(component.activeRecipePanel()).toBe('alternate');
    expect(component.activeBaseRecipeRows()).toEqual(standardRows);

    component.activeBaseRecipePanel.set('converterResources');

    expect(component.activeBaseRecipeRows()).toEqual(converterRows);

    component.setRowsEnabled(component.activeBaseRecipeRows(), false);

    expect(setRecipesEnabled).toHaveBeenCalledWith(['Recipe_ConverterIronOre_C'], false);

    component.activeBaseRecipePanel.set('unlocks');

    expect(component.activeBaseRecipeRows()).toEqual(unlockRows);
  });

  it('resets the row scroller after switching recipe tabs', () => {
    const component = createComponent();
    const recipeList = { scrollLeft: 18, scrollTop: 240 };
    stubRecipeList(component, recipeList);
    vi.useFakeTimers();

    try {
      component.selectRecipePanel('base');

      expect(component.activeRecipePanel()).toBe('base');
      expect(recipeList.scrollTop).toBe(240);

      vi.runOnlyPendingTimers();

      expect(recipeList).toMatchObject({ scrollLeft: 0, scrollTop: 0 });

      recipeList.scrollLeft = 9;
      recipeList.scrollTop = 160;

      component.selectBaseRecipePanel('unlocks');
      vi.runOnlyPendingTimers();

      expect(component.activeBaseRecipePanel()).toBe('unlocks');
      expect(recipeList).toMatchObject({ scrollLeft: 0, scrollTop: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('positions the floating recipe tooltip from the active row', () => {
    const component = createComponent();
    const row = recipeRow('Recipe_IronPlate_C', 'Iron Plate', false);
    const rowElement = {
      ownerDocument: {
        defaultView: {
          innerHeight: 320,
          innerWidth: 700,
        },
      },
      getBoundingClientRect: () =>
        ({
          bottom: 310,
          height: 60,
          left: 80,
          right: 560,
          top: 250,
          width: 480,
          x: 80,
          y: 250,
        }) as DOMRect,
    } as HTMLElement;

    component.showRecipeTooltip(row, rowElement);

    expect(component.activeRecipeTooltip()).toMatchObject({
      leftPx: 128,
      placement: 'above',
      row,
      topPx: 243,
      widthPx: 420,
    });

    component.hideRecipeTooltip();

    expect(component.activeRecipeTooltip()).toBeNull();
  });
});

function createComponent(
  options: {
    converterRows?: readonly RecipeRow[];
    setRecipesEnabled?: ReturnType<typeof vi.fn>;
    standardRows?: readonly RecipeRow[];
    unlockRows?: readonly RecipeRow[];
  } = {},
): PlannerRecipesSectionComponent {
  const injector = Injector.create({
    providers: [
      {
        provide: PlannerPlanConfigStore,
        useValue: {
          recipeCommands: {
            setManyEnabled: options.setRecipesEnabled ?? vi.fn(),
          },
          converterResourceRecipeRows: signal(options.converterRows ?? []),
          standardBaseRecipeRows: signal(options.standardRows ?? []),
          unlockRecipeRows: signal(options.unlockRows ?? []),
        },
      },
    ],
  });
  return runInInjectionContext(injector, () => new PlannerRecipesSectionComponent());
}

function stubRecipeList(
  component: PlannerRecipesSectionComponent,
  nativeElement: { scrollLeft: number; scrollTop: number },
): void {
  const elementRef: ElementRef<HTMLElement> = {
    nativeElement: nativeElement as unknown as HTMLElement,
  };
  Object.defineProperty(component, 'recipeList', {
    configurable: true,
    value: () => elementRef,
  });
}

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
