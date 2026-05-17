import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createPlannerProject,
  createUserDefaultsFromProject,
  hydratePlannerProject,
  hydratePlannerUserDefaults,
} from '@beltwise/planner-core';

describe('createPlannerProject', () => {
  it('starts new projects with no product targets by default', () => {
    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    expect(project.targets).toEqual([]);
    expect(project.buildState).toEqual({
      planLocked: false,
      nodeLayoutLocked: false,
      nodeStates: {},
    });
    expect(project.graphDisplay.rateDecimalPlaces).toBe(3);
    expect(project.graphDisplay.edgeStyle).toBe('straight');
  });

  it('enables base recipes and disables alternates for new projects', () => {
    const baseRecipe = Object.values(tinySatisfactoryDataset.recipes).find(
      (recipe) => !recipe.isAlternate,
    );
    const alternateRecipe = Object.values(tinySatisfactoryDataset.recipes).find(
      (recipe) => recipe.isAlternate,
    );

    if (!baseRecipe || !alternateRecipe) {
      throw new Error('Tiny dataset must contain base and alternate recipes');
    }

    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    expect(project.recipeOverrides[baseRecipe.id]).toBeUndefined();
    expect(project.recipeOverrides[alternateRecipe.id]).toEqual({ enabled: false });
  });

  it('disables converter resource recipes in built-in defaults for new projects', () => {
    const dataset = datasetWithConverterResourceRecipe();

    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset,
      now: '2026-05-12T00:00:00.000Z',
    });

    expect(project.recipeOverrides['Recipe_ConverterIronOre_C']).toEqual({
      enabled: false,
    });
    expect(project.recipeOverrides['Recipe_ConverterIronPlate_C']).toBeUndefined();
  });

  it('lets user defaults enable converter resource recipes for new projects', () => {
    const dataset = datasetWithConverterResourceRecipe();
    const userDefaults = createDefaultUserDefaults(dataset);
    userDefaults.recipeOverrides['Recipe_ConverterIronOre_C'] = { enabled: true };

    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset,
      now: '2026-05-12T00:00:00.000Z',
      userDefaults,
    });

    expect(project.recipeOverrides['Recipe_ConverterIronOre_C']).toEqual({
      enabled: true,
    });
  });

  it('does not apply new built-in converter defaults while hydrating existing projects', () => {
    const project = hydratePlannerProject(
      {
        id: 'project-test',
        name: 'Test',
        recipeOverrides: {},
      },
      datasetWithConverterResourceRecipe(),
    );

    expect(project?.recipeOverrides['Recipe_ConverterIronOre_C']).toBeUndefined();
  });

  it('merges user defaults over built-in defaults for new projects', () => {
    const userDefaults = createDefaultUserDefaults(tinySatisfactoryDataset);
    userDefaults.recipeOverrides = {
      Recipe_IronPlate_C: { enabled: false },
      Recipe_IronWire_C: { enabled: true },
    };
    userDefaults.machineOverrides = {
      Build_ConstructorMk1_C: { enabled: false },
    };
    userDefaults.resourceOverrides = {
      Desc_OreIron_C: { enabled: false, maxPerMinute: 120 },
    };
    userDefaults.graphDisplay = {
      ...userDefaults.graphDisplay,
      maxBeltTier: 4,
      edgeStyle: 'curved',
    };

    const project = createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
      userDefaults,
    });

    expect(project.recipeOverrides['Recipe_IronPlate_C']).toEqual({ enabled: false });
    expect(project.recipeOverrides['Recipe_IronWire_C']).toEqual({ enabled: true });
    expect(project.recipeOverrides['Recipe_CopperIngot_C']).toBeUndefined();
    expect(project.machineOverrides['Build_ConstructorMk1_C']).toEqual({ enabled: false });
    expect(project.resourceOverrides['Desc_OreIron_C']).toEqual({
      enabled: false,
      maxPerMinute: 120,
    });
    expect(project.graphDisplay.maxBeltTier).toBe(4);
    expect(project.graphDisplay.edgeStyle).toBe('curved');
    expect(project.targets).toEqual([]);
    expect(project.itemInputs).toEqual({});
    expect(project.graphLayout).toEqual({ nodePositions: {} });
    expect(project.buildState).toEqual({
      planLocked: false,
      nodeLayoutLocked: false,
      nodeStates: {},
    });
  });

  it('hydrates malformed user defaults back to built-in behavior', () => {
    const defaults = hydratePlannerUserDefaults(
      {
        recipeOverrides: {
          Recipe_IronWire_C: { enabled: true },
          Recipe_IronPlate_C: { enabled: 'nope' },
        },
        machineOverrides: 'bad',
        resourceOverrides: {
          Desc_OreIron_C: { maxPerMinute: -25 },
        },
        graphDisplay: {
          maxBeltTier: 99,
          edgeStyle: 'curved',
        },
      },
      tinySatisfactoryDataset,
    );

    expect(defaults.recipeOverrides['Recipe_IronWire_C']).toEqual({ enabled: true });
    expect(defaults.recipeOverrides['Recipe_IronPlate_C']).toBeUndefined();
    expect(defaults.machineOverrides).toEqual({});
    expect(defaults.resourceOverrides['Desc_OreIron_C']).toEqual({ maxPerMinute: 0 });
    expect(defaults.graphDisplay).toEqual({
      maxBeltTier: 6,
      maxPipeTier: 2,
      rateDecimalPlaces: 3,
      edgeStyle: 'curved',
      showTransportLabels: true,
      animateFlowLines: true,
    });
  });

  it('copies only default-eligible project settings into a defaults profile', () => {
    const project = {
      ...createPlannerProject({
        id: 'project-test',
        name: 'Test',
        dataset: tinySatisfactoryDataset,
        now: '2026-05-12T00:00:00.000Z',
        targets: [
          {
            id: 'target-a',
            itemId: 'Desc_IronPlate_C',
            mode: 'fixed' as const,
            amountPerMinute: 20,
            sortOrder: 0,
          },
        ],
      }),
      recipeOverrides: { Recipe_IronWire_C: { enabled: true } },
      machineOverrides: { Build_ConstructorMk1_C: { enabled: false } },
      resourceOverrides: { Desc_OreIron_C: { maxPerMinute: 120 } },
      itemInputs: { Desc_IngotIron_C: { amountPerMinute: 15 } },
      graphLayout: { nodePositions: { node: { x: 1, y: 2 } } },
      buildState: {
        planLocked: true,
        nodeLayoutLocked: true,
        nodeStates: { node: { done: true, note: 'Build next' } },
      },
    };

    const defaults = createUserDefaultsFromProject(project);

    expect(defaults.recipeOverrides).toEqual(project.recipeOverrides);
    expect(defaults.machineOverrides).toEqual(project.machineOverrides);
    expect(defaults.resourceOverrides).toEqual(project.resourceOverrides);
    expect(defaults.graphDisplay).toEqual(project.graphDisplay);
    expect('targets' in defaults).toBe(false);
    expect('itemInputs' in defaults).toBe(false);
    expect('graphLayout' in defaults).toBe(false);
    expect('buildState' in defaults).toBe(false);
  });

  it('preserves draft product targets without a selected item when hydrating', () => {
    const project = hydratePlannerProject(
      {
        id: 'project-test',
        name: 'Test',
        targets: [
          {
            id: 'target-draft',
            itemId: '',
            mode: 'fixed',
            amountPerMinute: 10,
            sortOrder: 0,
          },
        ],
      },
      tinySatisfactoryDataset,
    );

    expect(project?.targets).toEqual([
      {
        id: 'target-draft',
        itemId: '',
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: 0,
      },
    ]);
  });
});

function datasetWithConverterResourceRecipe(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    machines: {
      ...tinySatisfactoryDataset.machines,
      Build_Converter_C: {
        id: 'Build_Converter_C',
        className: 'Build_Converter_C',
        displayName: 'Converter',
        type: 'manufacturer',
        powerMw: 100,
        manufacturingSpeed: 1,
      },
    },
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_ConverterIronOre_C: {
        id: 'Recipe_ConverterIronOre_C',
        className: 'Recipe_ConverterIronOre_C',
        displayName: 'Converter: Iron Ore',
        ingredients: [{ itemId: 'Desc_OreCopper_C', amount: 1 }],
        products: [{ itemId: 'Desc_OreIron_C', amount: 1 }],
        durationSeconds: 6,
        producedIn: ['Build_Converter_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
      },
      Recipe_ConverterIronPlate_C: {
        id: 'Recipe_ConverterIronPlate_C',
        className: 'Recipe_ConverterIronPlate_C',
        displayName: 'Converter: Iron Plate',
        ingredients: [{ itemId: 'Desc_OreIron_C', amount: 1 }],
        products: [{ itemId: 'Desc_IronPlate_C', amount: 1 }],
        durationSeconds: 6,
        producedIn: ['Build_Converter_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
      },
    },
  };
}
