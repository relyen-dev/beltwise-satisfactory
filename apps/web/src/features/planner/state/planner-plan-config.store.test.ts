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

  it('exposes assumed input rows from the latest solve result', () => {
    const { planConfig } = createPlanConfigHarness({
      solveResult: {
        status: 'optimal',
        recipeRates: {},
        rawInputs: {},
        externalInputs: {},
        assumedInputs: {
          Desc_Wire_C: 4.5,
        },
        itemFlows: [],
        outputs: {},
        surplus: {},
        machineUsage: [],
        powerMw: 0,
        warnings: [],
      },
    });

    expect(planConfig.assumedInputRows()).toEqual([
      {
        item: tinySatisfactoryDataset.items['Desc_Wire_C'],
        amountPerMinute: 4.5,
        amountPerMinuteLabel: '4.5/min',
        iconSrc: '/game-icons/Desc_Wire_C.png',
      },
    ]);
  });

  it('exposes catalog-backed power target rows and commands', () => {
    const dataset = withPowerDataset();
    const { activeProject, planConfig } = createPlanConfigHarness({
      dataset,
      project: createProject(dataset),
    });

    expect(planConfig.powerTargetGeneratorOptions().map((option) => option.displayName)).toEqual([
      'Coal Generator',
      'Nuclear Power Plant',
    ]);

    planConfig.powerTargetCommands.add();
    const addedTarget = requiredProject(activeProject).powerTargets[0];
    if (!addedTarget) {
      throw new Error('Expected a power target');
    }

    expect(addedTarget).toMatchObject({
      id: expect.stringMatching(/^power-target-/),
      mode: 'generator-count',
      generatorCount: 1,
      sortOrder: 0,
    });
    expect(planConfig.powerTargetRows()[0]).toMatchObject({
      isComplete: false,
      summary: {
        label: 'Select generator and fuel',
      },
    });

    planConfig.powerTargetCommands.updateGenerator(addedTarget.id, 'Build_GeneratorCoal_C');
    planConfig.powerTargetCommands.updateFuel(addedTarget.id, 'Desc_NuclearFuelRod_C');
    expect(requiredProject(activeProject).powerTargets[0]?.fuelItemId).toBeUndefined();

    planConfig.powerTargetCommands.updateFuel(addedTarget.id, 'Desc_Coal_C');
    planConfig.powerTargetCommands.updateAmount(addedTarget.id, 4);

    expect(requiredProject(activeProject).powerTargets[0]).toMatchObject({
      generatorId: 'Build_GeneratorCoal_C',
      fuelItemId: 'Desc_Coal_C',
      generatorCount: 4,
    });
    expect(planConfig.powerTargetRows()[0]).toMatchObject({
      fuelOptions: [
        {
          fuelItemId: 'Desc_Coal_C',
          displayName: 'Coal',
        },
      ],
      summary: {
        label: '300 MW total',
        lines: [
          {
            label: 'Coal fuel',
            value: '60/min',
          },
          {
            label: 'Water input',
            value: '180/min',
          },
        ],
      },
    });

    planConfig.powerTargetCommands.updateMode(addedTarget.id, 'power');
    planConfig.powerTargetCommands.updateAmount(addedTarget.id, 150);

    expect(requiredProject(activeProject).powerTargets[0]).toMatchObject({
      mode: 'power',
      powerMw: 150,
    });
    expect(requiredProject(activeProject).powerTargets[0]?.generatorCount).toBeUndefined();
    expect(planConfig.powerTargetRows()[0]).toMatchObject({
      amountValue: 150,
      amountStep: 10,
      summary: {
        label: '150 MW total',
        lines: [
          {
            label: 'Coal fuel',
            value: '30/min',
          },
          {
            label: 'Water input',
            value: '90/min',
          },
        ],
      },
    });

    const targetBeforeDuplicate = requiredProject(activeProject).powerTargets[0];
    if (!targetBeforeDuplicate) {
      throw new Error('Expected a configured power target');
    }
    planConfig.powerTargetCommands.duplicate(targetBeforeDuplicate);
    const [firstTarget, secondTarget] = requiredProject(activeProject).powerTargets;
    if (!firstTarget || !secondTarget) {
      throw new Error('Expected duplicated power targets');
    }

    expect(secondTarget).toMatchObject({
      id: expect.stringMatching(/^power-target-/),
      mode: 'power',
      generatorId: 'Build_GeneratorCoal_C',
      fuelItemId: 'Desc_Coal_C',
      powerMw: 150,
      sortOrder: 1,
    });

    planConfig.powerTargetCommands.reorder([secondTarget.id, firstTarget.id]);
    expect(requiredProject(activeProject).powerTargets.map((target) => target.id)).toEqual([
      secondTarget.id,
      firstTarget.id,
    ]);

    planConfig.powerTargetCommands.remove(firstTarget.id);
    expect(requiredProject(activeProject).powerTargets).toEqual([
      {
        ...secondTarget,
        sortOrder: 0,
      },
    ]);
  });

  it('blocks solve-relevant edits while locked but still allows notes and display settings', () => {
    const project = createProject();
    const { activeProject, planConfig } = createPlanConfigHarness({
      project: {
        ...project,
        powerTargets: [
          {
            id: 'power-a',
            mode: 'generator-count',
            generatorId: 'Build_GeneratorCoal_C',
            fuelItemId: 'Desc_Coal_C',
            generatorCount: 1,
            sortOrder: 0,
          },
        ],
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
    const powerTarget = lockedProject.powerTargets[0];
    if (!powerTarget) {
      throw new Error('Expected a power target');
    }

    planConfig.targetCommands.add();
    planConfig.targetCommands.updateAmount(target.id, 999);
    planConfig.powerTargetCommands.add();
    planConfig.powerTargetCommands.updateMode(powerTarget.id, 'power');
    planConfig.powerTargetCommands.updateGenerator(powerTarget.id, 'Build_GeneratorNuclear_C');
    planConfig.powerTargetCommands.updateFuel(powerTarget.id, 'Desc_NuclearFuelRod_C');
    planConfig.powerTargetCommands.updateAmount(powerTarget.id, 999);
    planConfig.powerTargetCommands.duplicate(powerTarget);
    planConfig.powerTargetCommands.remove(powerTarget.id);
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
      powerTargets: lockedProject.powerTargets,
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

  it('keeps unlock recipes out of alternate bulk commands', () => {
    const dataset = withUnlockRecipeDataset();
    const { activeProject, planConfig } = createPlanConfigHarness({
      dataset,
      project: createProject(dataset),
    });

    expect(planConfig.unlockRecipeRows().map((row) => row.recipe.id)).toEqual([
      'Recipe_Alternate_Turbofuel_C',
    ]);
    expect(planConfig.alternateRecipeRows().map((row) => row.recipe.id)).toContain(
      'Recipe_IronWire_C',
    );

    planConfig.recipeCommands.setGroupEnabled(true, true);
    expect(requiredProject(activeProject).recipeOverrides['Recipe_IronWire_C']).toEqual({
      enabled: true,
    });
    expect(
      requiredProject(activeProject).recipeOverrides['Recipe_Alternate_Turbofuel_C'],
    ).toBeUndefined();

    planConfig.recipeCommands.setGroupEnabled(true, false);
    expect(requiredProject(activeProject).recipeOverrides['Recipe_IronWire_C']).toEqual({
      enabled: false,
    });
    expect(
      requiredProject(activeProject).recipeOverrides['Recipe_Alternate_Turbofuel_C'],
    ).toBeUndefined();
  });

  it('lets users explicitly disable unlock recipes', () => {
    const dataset = withUnlockRecipeDataset();
    const { activeProject, planConfig } = createPlanConfigHarness({
      dataset,
      project: createProject(dataset),
    });

    planConfig.recipeCommands.setEnabled('Recipe_Alternate_Turbofuel_C', false);

    expect(requiredProject(activeProject).recipeOverrides['Recipe_Alternate_Turbofuel_C']).toEqual(
      {
        enabled: false,
      },
    );
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

    expect(planConfig.availableSurplusSinkItems().map((item) => item.id)).toEqual(['Desc_Screw_C']);

    planConfig.sinkCommands.addSurplus('Desc_Screw_C');

    expect(requiredProject(activeProject).sinkRules).toEqual([
      {
        id: expect.stringMatching(/^sink-/),
        itemId: 'Desc_Screw_C',
        mode: 'surplus',
        sortOrder: 0,
      },
    ]);
    expect(planConfig.availableSurplusSinkItems()).toEqual([]);
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

function withUnlockRecipeDataset(): GameDataset {
  const alternateWire = tinySatisfactoryDataset.recipes['Recipe_IronWire_C'];
  if (!alternateWire) {
    throw new Error('Tiny dataset must contain alternate wire.');
  }

  return {
    ...tinySatisfactoryDataset,
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_Alternate_Turbofuel_C: {
        ...alternateWire,
        id: 'Recipe_Alternate_Turbofuel_C',
        className: 'Recipe_Alternate_Turbofuel_C',
        displayName: 'Turbofuel',
      },
    },
  };
}

function withPowerDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Coal_C: {
        id: 'Desc_Coal_C',
        className: 'Desc_Coal_C',
        displayName: 'Coal',
        form: 'solid',
      },
      Desc_NuclearFuelRod_C: {
        id: 'Desc_NuclearFuelRod_C',
        className: 'Desc_NuclearFuelRod_C',
        displayName: 'Uranium Fuel Rod',
        form: 'solid',
      },
      Desc_NuclearWaste_C: {
        id: 'Desc_NuclearWaste_C',
        className: 'Desc_NuclearWaste_C',
        displayName: 'Uranium Waste',
        form: 'solid',
      },
      Desc_Water_C: {
        id: 'Desc_Water_C',
        className: 'Desc_Water_C',
        displayName: 'Water',
        form: 'liquid',
      },
    },
    machines: {
      ...tinySatisfactoryDataset.machines,
      Build_GeneratorCoal_C: {
        id: 'Build_GeneratorCoal_C',
        className: 'Build_GeneratorCoal_C',
        displayName: 'Coal Generator',
        type: 'generator',
        powerMw: 75,
      },
      Build_GeneratorNuclear_C: {
        id: 'Build_GeneratorNuclear_C',
        className: 'Build_GeneratorNuclear_C',
        displayName: 'Nuclear Power Plant',
        type: 'generator',
        powerMw: 2500,
      },
    },
    generatorFuelOptions: {
      'Build_GeneratorCoal_C:Desc_Coal_C': {
        id: 'Build_GeneratorCoal_C:Desc_Coal_C',
        generatorId: 'Build_GeneratorCoal_C',
        fuelItemId: 'Desc_Coal_C',
        powerMw: 75,
        fuelConsumedPerMinute: 15,
        supplementalInputs: [{ itemId: 'Desc_Water_C', amountPerMinute: 45 }],
        byproducts: [],
      },
      'Build_GeneratorNuclear_C:Desc_NuclearFuelRod_C': {
        id: 'Build_GeneratorNuclear_C:Desc_NuclearFuelRod_C',
        generatorId: 'Build_GeneratorNuclear_C',
        fuelItemId: 'Desc_NuclearFuelRod_C',
        powerMw: 2500,
        fuelConsumedPerMinute: 0.2,
        supplementalInputs: [],
        byproducts: [{ itemId: 'Desc_NuclearWaste_C', amountPerMinute: 10 }],
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
