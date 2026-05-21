import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createPlannerProject,
  type PlannerProject,
  type PlannerUserDefaults,
} from '@beltwise/planner-core';
import { describe, expect, it } from 'vitest';
import {
  PLANNER_DEFAULTS_STORE_PORT,
  PlannerDefaultsStore,
  type PlannerDefaultsStorePort,
} from './planner-defaults.store';

const NOW = '2026-05-12T00:00:00.000Z';

describe('PlannerDefaultsStore', () => {
  it('mutates global defaults without changing the active project', () => {
    const project = createProject();
    const { activeProject, defaults, userDefaults } = createDefaultsHarness({ project });

    defaults.recipeCommands.setEnabled('Recipe_IronPlate_C', false);
    defaults.machineCommands.setEnabled('Build_ConstructorMk1_C', false);
    defaults.resourceCommands.setCap('Desc_OreIron_C', 120);
    defaults.objectiveCommands.setRawResourceMultiplier('Desc_OreCopper_C', 2);
    defaults.displayCommands.setGraphEdgeStyle('curved');

    expect(activeProject()).toEqual(project);
    expect(userDefaults()?.recipeOverrides['Recipe_IronPlate_C']).toEqual({ enabled: false });
    expect(userDefaults()?.machineOverrides['Build_ConstructorMk1_C']).toEqual({ enabled: false });
    expect(userDefaults()?.resourceOverrides['Desc_OreIron_C']).toEqual({ maxPerMinute: 120 });
    expect(userDefaults()?.objectiveProfile).toMatchObject({
      presetId: 'custom',
      rawResourceMultipliers: {
        Desc_OreCopper_C: 2,
      },
    });
    expect(userDefaults()?.graphDisplay.edgeStyle).toBe('curved');
  });

  it('owns default rows and recipe search state from PlannerUserDefaults', () => {
    const { defaults } = createDefaultsHarness({ userDefaults: createCustomUserDefaults() });

    defaults.recipeSearch.set('plate');

    const recipeRows = defaults.recipeRows();
    const standardBaseRows = defaults.standardBaseRecipeRows();
    const converterResourceRows = defaults.converterResourceRecipeRows();
    const alternateRows = defaults.alternateRecipeRows();
    const ironPlateRow = recipeRows.find((row) => row.recipe.id === 'Recipe_IronPlate_C');
    const constructorRow = defaults
      .machineRows()
      .find((row) => row.machine.id === 'Build_ConstructorMk1_C');
    const ironResourceRow = defaults
      .resourceRows()
      .find((row) => row.resource.itemId === 'Desc_OreIron_C');

    expect(recipeRows.length).toBeGreaterThan(0);
    expect(recipeRows.every((row) => row.recipe.displayName.toLowerCase().includes('plate'))).toBe(
      true,
    );
    expect(recipeRows.length).toBe(
      standardBaseRows.length + converterResourceRows.length + alternateRows.length,
    );
    expect(ironPlateRow?.enabled).toBe(false);
    expect(constructorRow?.enabled).toBe(false);
    expect(ironResourceRow).toMatchObject({
      enabled: true,
      isCustom: true,
      capInputValue: 180,
    });

    defaults.objectiveCommands.setRawResourceMultiplier('Desc_OreCopper_C', 2.5);

    const copperMultiplierRow = defaults
      .rawResourceMultiplierRows()
      .find((row) => row.resource.itemId === 'Desc_OreCopper_C');

    expect(copperMultiplierRow).toMatchObject({
      multiplier: 2.5,
      isNeutral: false,
    });
  });

  it('saves only default-eligible active plan settings as user defaults', () => {
    const project: PlannerProject = {
      ...createProject(),
      targets: [
        {
          id: 'target-a',
          itemId: 'Desc_IronPlate_C',
          mode: 'fixed',
          amountPerMinute: 20,
          sortOrder: 0,
        },
      ],
      recipeOverrides: { Recipe_IronWire_C: { enabled: true } },
      machineOverrides: { Build_ConstructorMk1_C: { enabled: false } },
      resourceOverrides: { Desc_OreIron_C: { enabled: false, maxPerMinute: 90 } },
      itemInputs: { Desc_IngotIron_C: { amountPerMinute: 15 } },
      graphLayout: { nodePositions: { node: { x: 1, y: 2 } } },
      graphDisplay: {
        maxBeltTier: 4,
        maxPipeTier: 1,
        rateDecimalPlaces: 2,
        edgeStyle: 'curved',
        showTransportLabels: false,
        animateFlowLines: false,
      },
      buildState: {
        planLocked: true,
        nodeLayoutLocked: true,
        nodeStates: { node: { done: true, note: 'Build next' } },
      },
    };
    const { activeProject, defaults, userDefaults } = createDefaultsHarness({ project });

    defaults.saveActivePlanAsDefaults();

    expect(activeProject()).toEqual(project);
    expect(userDefaults()).toEqual({
      recipeOverrides: project.recipeOverrides,
      machineOverrides: project.machineOverrides,
      resourceOverrides: project.resourceOverrides,
      objectiveProfile: project.objectiveProfile,
      graphDisplay: project.graphDisplay,
    });
  });

  it('resets user defaults to the dataset built-ins', () => {
    const project = createProject();
    const { activeProject, defaults, userDefaults } = createDefaultsHarness({
      project,
      userDefaults: createCustomUserDefaults(),
    });

    defaults.resetUserDefaults();

    expect(activeProject()).toEqual(project);
    expect(userDefaults()).toEqual(createDefaultUserDefaults(tinySatisfactoryDataset));
  });
});

function createDefaultsHarness(
  options: {
    project?: PlannerProject | null;
    dataset?: GameDataset | null;
    userDefaults?: PlannerUserDefaults | null;
  } = {},
): {
  activeProject: WritableSignal<PlannerProject | null>;
  defaults: PlannerDefaultsStore;
  userDefaults: WritableSignal<PlannerUserDefaults | null>;
} {
  const dataset = signal<GameDataset | null>(options.dataset ?? tinySatisfactoryDataset);
  const activeProject = signal<PlannerProject | null>(options.project ?? createProject());
  const userDefaults = signal<PlannerUserDefaults | null>(
    options.userDefaults ?? createDefaultUserDefaults(tinySatisfactoryDataset),
  );
  const port: PlannerDefaultsStorePort = {
    dataset,
    userDefaults,
    activeProject,
    updateUserDefaults: (mapper) => {
      const loadedDataset = dataset();
      if (!loadedDataset) {
        return;
      }
      userDefaults.update((currentDefaults) =>
        mapper(currentDefaults ?? createDefaultUserDefaults(loadedDataset), loadedDataset),
      );
    },
  };
  const injector = Injector.create({
    providers: [{ provide: PLANNER_DEFAULTS_STORE_PORT, useValue: port }],
  });
  const defaults = runInInjectionContext(injector, () => new PlannerDefaultsStore());

  return { activeProject, defaults, userDefaults };
}

function createProject(): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [
      {
        id: 'target-a',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: 0,
      },
    ],
  });
}

function createCustomUserDefaults(): PlannerUserDefaults {
  return {
    ...createDefaultUserDefaults(tinySatisfactoryDataset),
    recipeOverrides: {
      Recipe_IronPlate_C: { enabled: false },
      Recipe_IronWire_C: { enabled: true },
    },
    machineOverrides: {
      Build_ConstructorMk1_C: { enabled: false },
    },
    resourceOverrides: {
      Desc_OreIron_C: { maxPerMinute: 180 },
    },
    graphDisplay: {
      maxBeltTier: 5,
      maxPipeTier: 2,
      rateDecimalPlaces: 2,
      edgeStyle: 'curved',
      showTransportLabels: false,
      animateFlowLines: true,
    },
  };
}
