import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  OBJECTIVE_PRESET_DEFINITIONS,
  createObjectiveProfileFromPreset,
  createPlannerProject,
  type ObjectiveWeightKey,
  type PlannerProject,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { describe, expect, it } from 'vitest';
import {
  PLANNER_PLAN_CONFIG_STORE_PORT,
  PlannerPlanConfigStore,
  type PlannerPlanConfigStorePort,
} from './planner-plan-config.store';

const NOW = '2026-05-12T00:00:00.000Z';

describe('PlannerPlanConfigStore', () => {
  it('exposes active-plan intent read models and edits targets, inputs, and notes', () => {
    const { activeProject, planConfig } = createPlanConfigHarness();
    const target = requiredProject(activeProject).targets[0];
    if (!target) {
      throw new Error('Expected a target');
    }

    expect(planConfig.activePlanId()).toBe('project-a');
    expect(planConfig.hasActivePlan()).toBe(true);
    expect(planConfig.targetRows()).toEqual([target]);

    planConfig.targetCommands.updateAmount(target.id, 25);
    planConfig.inputCommands.set('Desc_IngotIron_C', 15);
    planConfig.noteCommands.set('Bring power shards');

    expect(requiredProject(activeProject).targets[0]?.amountPerMinute).toBe(25);
    expect(planConfig.externalInputRows()).toMatchObject([
      {
        item: { id: 'Desc_IngotIron_C' },
        amountPerMinute: 15,
      },
    ]);
    expect(planConfig.planNotes()).toBe('Bring power shards');
  });

  it('blocks solve-relevant edits while locked but still allows notes and display settings', () => {
    const project = createProject();
    const { activeProject, planConfig } = createPlanConfigHarness({
      project: {
        ...project,
        objectiveProfile: {
          ...project.objectiveProfile,
          rawResourceMultipliers: {
            Desc_OreIron_C: 2,
          },
        },
        buildState: {
          planLocked: true,
          nodeLayoutLocked: false,
          nodeStates: {},
        },
      },
    });
    const lockedProject = requiredProject(activeProject);
    const target = lockedProject.targets[0];
    if (!target) {
      throw new Error('Expected a target');
    }

    planConfig.targetCommands.add();
    planConfig.targetCommands.updateAmount(target.id, 999);
    planConfig.recipeCommands.setEnabled('Recipe_IronPlate_C', false);
    planConfig.inputCommands.set('Desc_IngotIron_C', 25);
    planConfig.resourceCommands.setCap('Desc_OreIron_C', 120);
    planConfig.sinkCommands.addSurplus('Desc_Screw_C');
    planConfig.machineCommands.setEnabled('Build_ConstructorMk1_C', false);
    planConfig.objectiveCommands.setPreset('low-power');
    planConfig.objectiveCommands.setWeight('powerWeight', 999);
    planConfig.objectiveCommands.setRawResourceMultiplier('Desc_OreCopper_C', 3);
    planConfig.objectiveCommands.resetRawResourceMultiplier('Desc_OreIron_C');

    expect(requiredProject(activeProject)).toMatchObject({
      targets: lockedProject.targets,
      recipeOverrides: lockedProject.recipeOverrides,
      itemInputs: lockedProject.itemInputs,
      sinkRules: lockedProject.sinkRules,
      resourceOverrides: lockedProject.resourceOverrides,
      machineOverrides: lockedProject.machineOverrides,
      objectiveProfile: lockedProject.objectiveProfile,
    });

    planConfig.noteCommands.set('Locked planning note');
    planConfig.displayCommands.setGraphEdgeStyle('curved');

    expect(requiredProject(activeProject).notes).toBe('Locked planning note');
    expect(requiredProject(activeProject).graphDisplay.edgeStyle).toBe('curved');
  });

  it('owns recipe and resource bulk commands with rows derived from the active project', () => {
    const { activeProject, planConfig } = createPlanConfigHarness();

    planConfig.recipeSearch.set('plate');
    expect(planConfig.recipeRows().every((row) => row.recipe.displayName.includes('Plate'))).toBe(
      true,
    );

    const shownBaseRecipeIds = planConfig.standardBaseRecipeRows().map((row) => row.recipe.id);
    planConfig.recipeCommands.setManyEnabled(shownBaseRecipeIds, false);
    expect(shownBaseRecipeIds.length).toBeGreaterThan(0);
    for (const recipeId of shownBaseRecipeIds) {
      expect(requiredProject(activeProject).recipeOverrides[recipeId]).toEqual({
        enabled: false,
      });
    }

    planConfig.resourceCommands.setAllEnabled(false);
    expect(planConfig.resourceRows().every((row) => !row.enabled)).toBe(true);

    planConfig.resourceCommands.resetAll();
    expect(requiredProject(activeProject).resourceOverrides).toEqual({});
  });

  it('clears zero cap edits on unlimited resources while preserving finite zero caps', () => {
    const dataset = withUnlimitedWaterDataset();
    const { activeProject, planConfig } = createPlanConfigHarness({
      dataset,
      project: createProject(dataset),
    });

    planConfig.resourceCommands.setCap('Desc_Water_C', 1);
    expect(requiredProject(activeProject).resourceOverrides['Desc_Water_C']).toEqual({
      maxPerMinute: 1,
    });

    planConfig.resourceCommands.setCap('Desc_Water_C', 0);
    const waterRow = planConfig
      .resourceRows()
      .find((row) => row.resource.itemId === 'Desc_Water_C');

    expect(requiredProject(activeProject).resourceOverrides['Desc_Water_C']).toBeUndefined();
    expect(waterRow).toMatchObject({
      enabled: true,
      capInputValue: null,
      effectiveCapLabel: 'Unlimited',
    });

    planConfig.resourceCommands.setCap('Desc_OreIron_C', 0);
    expect(requiredProject(activeProject).resourceOverrides['Desc_OreIron_C']).toEqual({
      maxPerMinute: 0,
    });
  });

  it('edits objective profile and renderer-neutral graph display settings', () => {
    const { activeProject, planConfig } = createPlanConfigHarness();

    planConfig.objectiveCommands.setPreset('low-power');
    expect(requiredProject(activeProject).objectiveProfile).toEqual(
      createObjectiveProfileFromPreset('low-power'),
    );

    planConfig.objectiveCommands.setWeight('powerWeight', Number.NaN);
    planConfig.objectiveCommands.setRawResourceMultiplier('Desc_OreIron_C', 2);
    expect(requiredProject(activeProject).objectiveProfile).toMatchObject({
      presetId: 'custom',
      powerWeight: 0,
      rawResourceMultipliers: {
        Desc_OreIron_C: 2,
      },
    });

    planConfig.objectiveCommands.resetRawResourceMultiplier('Desc_OreIron_C');
    planConfig.displayCommands.setMaxBeltTier(5);
    planConfig.displayCommands.setShowTransportLabels(false);

    expect(requiredProject(activeProject).objectiveProfile.rawResourceMultipliers).toEqual({});
    expect(planConfig.graphDisplaySettings()).toMatchObject({
      maxBeltTier: 5,
      showTransportLabels: false,
    });
  });

  it('adds, reports, toggles, and removes surplus sink rules for sinkable items', () => {
    const dataset = withSinkableScrewsDataset();
    const { activeProject, planConfig } = createPlanConfigHarness({
      dataset,
      project: createProject(dataset),
      solveResult: {
        status: 'optimal',
        recipeRates: {},
        rawInputs: {},
        externalInputs: {},
        itemFlows: [],
        outputs: {},
        surplus: {
          Desc_Screw_C: 12,
        },
        machineUsage: [],
        powerMw: 0,
        warnings: [],
      },
    });

    planConfig.sinkCommands.addSurplus('Desc_Screw_C');

    expect(requiredProject(activeProject).sinkRules).toEqual([
      {
        id: expect.stringMatching(/^sink-/),
        itemId: 'Desc_Screw_C',
        mode: 'surplus',
        sortOrder: 0,
      },
    ]);
    expect(planConfig.sinkRuleRows()).toMatchObject([
      {
        itemId: 'Desc_Screw_C',
        displayName: 'Screw',
        amountPerMinute: 12,
        sinkPointsPerMinute: 24,
      },
    ]);

    planConfig.sinkCommands.addSurplus('Desc_Screw_C');
    expect(requiredProject(activeProject).sinkRules).toHaveLength(1);

    planConfig.sinkCommands.toggleSurplus('Desc_Screw_C');
    expect(requiredProject(activeProject).sinkRules).toEqual([]);

    planConfig.sinkCommands.addSurplus('Desc_IngotIron_C');
    expect(requiredProject(activeProject).sinkRules).toEqual([]);
  });

  it('applies every objective preset and preserves priority order for custom edits', () => {
    const { activeProject, planConfig } = createPlanConfigHarness();

    for (const preset of OBJECTIVE_PRESET_DEFINITIONS.filter((preset) => preset.id !== 'custom')) {
      planConfig.objectiveCommands.setPreset(preset.id);
      expect(requiredProject(activeProject).objectiveProfile).toEqual(
        createObjectiveProfileFromPreset(preset.id),
      );
    }

    const previousProfile = requiredProject(activeProject).objectiveProfile;
    planConfig.objectiveCommands.setPreset('custom');
    expect(requiredProject(activeProject).objectiveProfile).toEqual({
      ...previousProfile,
      presetId: 'custom',
    });

    planConfig.objectiveCommands.setPreset('low-power');
    const lowPowerStageOrder = requiredProject(activeProject).objectiveProfile.stageOrder;
    planConfig.objectiveCommands.setWeight('powerWeight', 0.25);

    expect(requiredProject(activeProject).objectiveProfile).toMatchObject({
      presetId: 'custom',
      stageOrder: lowPowerStageOrder,
      powerWeight: 0.25,
    });
  });

  it('clamps custom objective weights and accumulates or removes raw resource multipliers', () => {
    const { activeProject, planConfig } = createPlanConfigHarness();
    const unsafeWeights: ReadonlyArray<readonly [ObjectiveWeightKey, number]> = [
      ['resourceScarcityWeight', Number.NaN],
      ['powerWeight', Number.NEGATIVE_INFINITY],
      ['machineCountWeight', -1],
      ['surplusWeight', 2.5],
    ];

    for (const [key, value] of unsafeWeights) {
      planConfig.objectiveCommands.setWeight(key, value);
    }

    expect(requiredProject(activeProject).objectiveProfile).toMatchObject({
      presetId: 'custom',
      resourceScarcityWeight: 0,
      powerWeight: 0,
      machineCountWeight: 0,
      surplusWeight: 2.5,
    });

    planConfig.objectiveCommands.setRawResourceMultiplier('Desc_OreIron_C', 2);
    planConfig.objectiveCommands.setRawResourceMultiplier('Desc_OreCopper_C', 3);
    expect(requiredProject(activeProject).objectiveProfile.rawResourceMultipliers).toEqual({
      Desc_OreIron_C: 2,
      Desc_OreCopper_C: 3,
    });

    planConfig.objectiveCommands.setRawResourceMultiplier('Desc_OreIron_C', 1);
    planConfig.objectiveCommands.resetRawResourceMultiplier('Desc_OreCopper_C');
    expect(requiredProject(activeProject).objectiveProfile.rawResourceMultipliers).toEqual({});
  });
});

function createPlanConfigHarness(
  options: {
    project?: PlannerProject;
    dataset?: GameDataset | null;
    solveResult?: ProductionPlanResult | null;
  } = {},
): {
  activeProject: WritableSignal<PlannerProject | null>;
  planConfig: PlannerPlanConfigStore;
} {
  const activeProject = signal<PlannerProject | null>(options.project ?? createProject());
  const port: PlannerPlanConfigStorePort = {
    dataset: signal<GameDataset | null>(options.dataset ?? tinySatisfactoryDataset),
    activeProject,
    solveResult: signal<ProductionPlanResult | null>(options.solveResult ?? null),
    updateActiveProject: (mapper) => {
      activeProject.update((project) => (project ? mapper(project) : project));
    },
  };
  const injector = Injector.create({
    providers: [{ provide: PLANNER_PLAN_CONFIG_STORE_PORT, useValue: port }],
  });
  const planConfig = runInInjectionContext(injector, () => new PlannerPlanConfigStore());

  return { activeProject, planConfig };
}

function createProject(dataset: GameDataset = tinySatisfactoryDataset): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset,
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

function withUnlimitedWaterDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Water_C: {
        id: 'Desc_Water_C',
        className: 'Desc_Water_C',
        displayName: 'Water',
        form: 'liquid',
      },
    },
    resources: {
      ...tinySatisfactoryDataset.resources,
      Desc_Water_C: {
        itemId: 'Desc_Water_C',
        displayName: 'Water',
        extraction: {
          allowedExtractors: ['Build_WaterPump_C'],
          baselineMaxPerMinute: Number.MAX_SAFE_INTEGER,
        },
      },
    },
  };
}

function withSinkableScrewsDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Screw_C: {
        ...tinySatisfactoryDataset.items['Desc_Screw_C']!,
        sinkPoints: 2,
      },
    },
  };
}

function requiredProject(project: WritableSignal<PlannerProject | null>): PlannerProject {
  const value = project();
  if (!value) {
    throw new Error('Expected an active project');
  }
  return value;
}
