import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset, type ItemId } from '@beltwise/game-data';
import {
  createObjectiveProfileFromPreset,
  createPlannerProject,
  type PlannerProject,
} from '@beltwise/planner-core';
import {
  assumedInputVariable,
  buildMachineUsage,
  buildProductionLpModel,
  DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS,
  powerGeneratorVariable,
  rawInputVariable,
  rawResourceCost,
  recipeVariable,
} from '@beltwise/solver';

function fixtureProject(): PlannerProject {
  return {
    ...createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    }),
    targets: [
      {
        id: 'target-plate',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 25,
        sortOrder: 0,
      },
      {
        id: 'target-rod',
        itemId: 'Desc_IronRod_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 1,
      },
    ],
  };
}

function variablePowerMachineDataset(): GameDataset {
  const ironPlateRecipe = tinySatisfactoryDataset.recipes['Recipe_IronPlate_C'];
  if (!ironPlateRecipe) {
    throw new Error('Fixture is missing Recipe_IronPlate_C.');
  }

  return {
    ...tinySatisfactoryDataset,
    machines: {
      ...tinySatisfactoryDataset.machines,
      Build_FastVariableConstructor_C: {
        id: 'Build_FastVariableConstructor_C',
        className: 'Build_FastVariableConstructor_C',
        displayName: 'Fast Variable Constructor',
        type: 'variablePowerManufacturer',
        powerRangeMw: {
          min: 20,
          max: 40,
        },
        manufacturingSpeed: 2,
      },
    },
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_IronPlate_C: {
        ...ironPlateRecipe,
        producedIn: ['Build_FastVariableConstructor_C', 'Build_ConstructorMk1_C'],
      },
    },
  };
}

function wasteInputDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_NuclearWaste_C: {
        id: 'Desc_NuclearWaste_C',
        className: 'Desc_NuclearWaste_C',
        displayName: 'Uranium Waste',
        form: 'solid',
      },
      Desc_WasteWidget_C: {
        id: 'Desc_WasteWidget_C',
        className: 'Desc_WasteWidget_C',
        displayName: 'Waste Widget',
        form: 'solid',
      },
    },
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_WasteWidget_C: {
        id: 'Recipe_WasteWidget_C',
        className: 'Recipe_WasteWidget_C',
        displayName: 'Waste Widget',
        ingredients: [{ itemId: 'Desc_NuclearWaste_C', amount: 1 }],
        products: [{ itemId: 'Desc_WasteWidget_C', amount: 1 }],
        durationSeconds: 6,
        producedIn: ['Build_ConstructorMk1_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
      },
    },
  };
}

function powerFixtureDataset(): GameDataset {
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
        displayName: 'Coal-Powered Generator',
        type: 'generator',
        powerMw: 75,
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
    },
    resources: {
      ...tinySatisfactoryDataset.resources,
      Desc_Coal_C: {
        itemId: 'Desc_Coal_C',
        displayName: 'Coal',
        extraction: {
          allowedExtractors: ['Build_MinerMk1_C'],
          baselineMaxPerMinute: 1200,
        },
      },
      Desc_Water_C: {
        itemId: 'Desc_Water_C',
        displayName: 'Water',
        extraction: {
          allowedExtractors: [],
          baselineMaxPerMinute: 10_000,
        },
      },
    },
  };
}

describe('buildProductionLpModel', () => {
  it('builds item balance constraints for multiple fixed outputs together', () => {
    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project: fixtureProject(),
    });

    const ingotBalance = model.constraints.find(
      (constraint) => constraint.name === 'balance:Desc_IngotIron_C',
    );
    const plateBalance = model.constraints.find(
      (constraint) => constraint.name === 'balance:Desc_IronPlate_C',
    );
    const rodBalance = model.constraints.find(
      (constraint) => constraint.name === 'balance:Desc_IronRod_C',
    );

    expect(ingotBalance?.coefficients[recipeVariable('Recipe_IronIngot_C')]).toBe(1);
    expect(ingotBalance?.coefficients[recipeVariable('Recipe_IronPlate_C')]).toBe(-2);
    expect(ingotBalance?.coefficients[recipeVariable('Recipe_IronRod_C')]).toBe(-1);
    expect(plateBalance?.rhs).toBe(25);
    expect(rodBalance?.rhs).toBe(20);
  });

  it('uses own dictionary semantics for inherited target item ids', () => {
    const project = {
      ...fixtureProject(),
      targets: [
        {
          id: 'target-to-string',
          itemId: 'toString' as ItemId,
          mode: 'fixed' as const,
          amountPerMinute: 5,
          sortOrder: 0,
        },
        {
          id: 'target-has-own',
          itemId: 'hasOwnProperty' as ItemId,
          mode: 'fixed' as const,
          amountPerMinute: 7,
          sortOrder: 1,
        },
      ],
    };

    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project,
    });
    const toStringBalance = model.constraints.find(
      (constraint) => constraint.name === 'balance:toString',
    );
    const hasOwnBalance = model.constraints.find(
      (constraint) => constraint.name === 'balance:hasOwnProperty',
    );

    expect(toStringBalance?.rhs).toBe(5);
    expect(toStringBalance?.coefficients['surplus:toString']).toBe(-1);
    expect(hasOwnBalance?.rhs).toBe(7);
    expect(hasOwnBalance?.coefficients['surplus:hasOwnProperty']).toBe(-1);
    expect(model.metadata.rawInputVariableByItemId['toString' as ItemId]).toBeUndefined();
    expect(
      model.metadata.externalInputVariableByItemId['hasOwnProperty' as ItemId],
    ).toBeUndefined();
  });

  it('bounds raw input variables from generated resource limits', () => {
    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project: fixtureProject(),
    });

    expect(
      model.variables.find((variable) => variable.name === rawInputVariable('Desc_OreIron_C')),
    ).toMatchObject({
      lowerBound: 0,
      upperBound: 600,
    });
  });

  it('adds assumed input variables for nuclear waste without making them raw inputs', () => {
    const dataset = wasteInputDataset();
    const project = createPlannerProject({
      id: 'project-waste',
      name: 'Waste factory',
      dataset,
      now: '2026-05-12T00:00:00.000Z',
      targets: [
        {
          id: 'target-widget',
          itemId: 'Desc_WasteWidget_C',
          mode: 'fixed',
          amountPerMinute: 10,
          sortOrder: 0,
        },
      ],
    });

    const model = buildProductionLpModel({
      dataset,
      project,
    });
    const assumedVar = assumedInputVariable('Desc_NuclearWaste_C');
    const wasteBalance = model.constraints.find(
      (constraint) => constraint.name === 'balance:Desc_NuclearWaste_C',
    );
    const rawResourceStage = model.objectiveStages.find((stage) => stage.name === 'raw-resources');

    expect(model.metadata.rawInputVariableByItemId['Desc_NuclearWaste_C']).toBeUndefined();
    expect(model.metadata.assumedInputVariableByItemId['Desc_NuclearWaste_C']).toBe(assumedVar);
    expect(model.variables.find((variable) => variable.name === assumedVar)).toMatchObject({
      lowerBound: 0,
    });
    expect(wasteBalance?.coefficients[assumedVar]).toBe(1);
    expect(rawResourceStage?.objective.coefficients[assumedVar]).toBeGreaterThan(0);
  });

  it('removes disabled recipes from the LP model', () => {
    const project = fixtureProject();
    project.recipeOverrides['Recipe_IronPlate_C'] = { enabled: false };

    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(model.metadata.recipeVariableById['Recipe_IronPlate_C']).toBeUndefined();
  });

  it('does not add machine count or power costs to recipe variables', () => {
    const project = fixtureProject();
    project.objectiveProfile.machineCountWeight = 10_000;
    project.objectiveProfile.powerWeight = 10_000;

    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(model.objective.coefficients[recipeVariable('Recipe_IronIngot_C')]).toBe(0);
    expect(model.objective.coefficients[recipeVariable('Recipe_IronPlate_C')]).toBe(0);
    expect(model.objective.coefficients[recipeVariable('Recipe_IronRod_C')]).toBe(0);
  });

  it('uses the same machine math for LP objective coefficients and reported usage', () => {
    const dataset = variablePowerMachineDataset();
    const project = fixtureProject();
    project.objectiveProfile.machineCountWeight = 3;
    project.objectiveProfile.powerWeight = 5;
    const model = buildProductionLpModel({
      dataset,
      project,
    });
    const oneRateUsage = buildMachineUsage(dataset, project, {
      Recipe_IronPlate_C: 1,
    })[0];
    const recipeVar = recipeVariable('Recipe_IronPlate_C');
    const recipeActivityStage = model.objectiveStages.find(
      (stage) => stage.name === 'recipe-activity',
    );
    const powerStage = model.objectiveStages.find((stage) => stage.name === 'power');

    expect(oneRateUsage).toBeDefined();
    if (!oneRateUsage || !recipeActivityStage || !powerStage) {
      throw new Error('Expected fixture usage and objective stages to exist.');
    }

    expect(oneRateUsage.machineId).toBe('Build_FastVariableConstructor_C');
    expect(oneRateUsage.machineCount).toBeCloseTo(0.05, 10);
    expect(oneRateUsage.powerMw).toBeCloseTo(1.5, 10);
    expect(recipeActivityStage.objective.coefficients[recipeVar] ?? 0).toBeCloseTo(
      project.objectiveProfile.machineCountWeight * oneRateUsage.machineCount + 0.000001,
      10,
    );
    expect(powerStage.objective.coefficients[recipeVar] ?? 0).toBeCloseTo(
      project.objectiveProfile.powerWeight * oneRateUsage.powerMw,
      10,
    );
  });

  it('orders objective stages from the selected preset priority', () => {
    const lowPowerProject = fixtureProject();
    lowPowerProject.objectiveProfile = createObjectiveProfileFromPreset('low-power');
    const fewMachinesProject = fixtureProject();
    fewMachinesProject.objectiveProfile = createObjectiveProfileFromPreset('few-machines');
    const lowSurplusProject = fixtureProject();
    lowSurplusProject.objectiveProfile = createObjectiveProfileFromPreset('low-surplus');

    expect(
      buildProductionLpModel({
        dataset: tinySatisfactoryDataset,
        project: lowPowerProject,
      }).objectiveStages.map((stage) => stage.name),
    ).toEqual(['power', 'raw-resources', 'surplus', 'recipe-activity']);
    expect(
      buildProductionLpModel({
        dataset: tinySatisfactoryDataset,
        project: fewMachinesProject,
      }).objectiveStages.map((stage) => stage.name),
    ).toEqual(['recipe-activity', 'raw-resources', 'surplus', 'power']);
    expect(
      buildProductionLpModel({
        dataset: tinySatisfactoryDataset,
        project: lowSurplusProject,
      }).objectiveStages.map((stage) => stage.name),
    ).toEqual(['surplus', 'raw-resources', 'recipe-activity', 'power']);
  });

  it('keeps maximize-target stages before preset priorities', () => {
    const project = {
      ...fixtureProject(),
      targets: [
        {
          id: 'target-plate',
          itemId: 'Desc_IronPlate_C',
          mode: 'maximize' as const,
          sortOrder: 0,
        },
      ],
      objectiveProfile: createObjectiveProfileFromPreset('low-power'),
    };

    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(model.objectiveStages.map((stage) => stage.name)).toEqual([
      'target-output',
      'power',
      'raw-resources',
      'surplus',
      'recipe-activity',
    ]);
  });

  it('adds selected generator variables and item balances for coal power targets', () => {
    const dataset = powerFixtureDataset();
    const project = {
      ...createPlannerProject({
        id: 'project-power',
        name: 'Power',
        dataset,
        now: '2026-05-12T00:00:00.000Z',
      }),
      powerTargets: [
        {
          id: 'power-coal',
          mode: 'generator-count' as const,
          generatorId: 'Build_GeneratorCoal_C',
          fuelItemId: 'Desc_Coal_C',
          generatorCount: 16,
          sortOrder: 0,
        },
      ],
    };

    const model = buildProductionLpModel({
      dataset,
      project,
    });
    const variableName = powerGeneratorVariable('power-coal');
    const generatorConstraint = model.constraints.find(
      (constraint) => constraint.name === 'power-target-generators:power-coal',
    );
    const coalBalance = model.constraints.find(
      (constraint) => constraint.name === 'balance:Desc_Coal_C',
    );
    const waterBalance = model.constraints.find(
      (constraint) => constraint.name === 'balance:Desc_Water_C',
    );

    expect(model.variables.find((variable) => variable.name === variableName)).toMatchObject({
      lowerBound: 0,
    });
    expect(model.metadata.powerGeneratorVariableByTargetId['power-coal']).toBe(variableName);
    expect(generatorConstraint).toMatchObject({
      coefficients: { [variableName]: 1 },
      sense: 'eq',
      rhs: 16,
    });
    expect(coalBalance?.coefficients[variableName]).toBe(-15);
    expect(coalBalance?.coefficients[rawInputVariable('Desc_Coal_C')]).toBe(1);
    expect(waterBalance?.coefficients[variableName]).toBe(-45);
    expect(waterBalance?.coefficients[rawInputVariable('Desc_Water_C')]).toBe(1);
    expect(Math.abs((coalBalance?.coefficients[variableName] ?? 0) * 16)).toBe(240);
    expect(Math.abs((waterBalance?.coefficients[variableName] ?? 0) * 16)).toBe(720);
  });
});

describe('rawResourceCost', () => {
  it('uses neutral default opinion multipliers for finite raw resources', () => {
    for (const [itemId, multiplier] of Object.entries(DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS)) {
      if (itemId === 'Desc_Water_C') {
        continue;
      }
      expect(multiplier).toBe(1);
    }
    expect(DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS['Desc_OreIron_C']).toBe(
      DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS['Desc_OreCopper_C'],
    );
  });

  it('uses a free default opinion multiplier for Water', () => {
    const project = fixtureProject();

    expect(DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS['Desc_Water_C']).toBe(0);
    expect(
      rawResourceCost({
        itemId: 'Desc_Water_C',
        dataset: tinySatisfactoryDataset,
        project,
      }),
    ).toBe(0);
  });

  it('applies the project raw resource multiplier to objective unit cost', () => {
    const project = fixtureProject();
    const baseCost = rawResourceCost({
      itemId: 'Desc_OreIron_C',
      dataset: tinySatisfactoryDataset,
      project,
    });

    project.objectiveProfile.rawResourceMultipliers['Desc_OreIron_C'] = 2;

    expect(
      rawResourceCost({
        itemId: 'Desc_OreIron_C',
        dataset: tinySatisfactoryDataset,
        project,
      }),
    ).toBeCloseTo(baseCost * 2, 10);
  });

  it('falls back to a finite neutral scarcity cost when no baseline limit exists', () => {
    const project = fixtureProject();

    expect(
      rawResourceCost({
        itemId: 'Desc_UnmappedOre_C',
        dataset: tinySatisfactoryDataset,
        project,
      }),
    ).toBe(1);
  });

  it('uses baseline map limits for scarcity instead of project resource cap overrides', () => {
    const project = fixtureProject();
    project.resourceOverrides['Desc_OreIron_C'] = { maxPerMinute: 1 };

    expect(
      rawResourceCost({
        itemId: 'Desc_OreIron_C',
        dataset: tinySatisfactoryDataset,
        project,
      }),
    ).toBeCloseTo(1 / 600, 10);
  });

  it('prefers explicit baseline map limits over generated dataset baseline limits', () => {
    const project = fixtureProject();
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      resources: {
        ...tinySatisfactoryDataset.resources,
        Desc_OreIron_C: {
          ...tinySatisfactoryDataset.resources['Desc_OreIron_C'],
          extraction: {
            ...tinySatisfactoryDataset.resources['Desc_OreIron_C']?.extraction,
            baselineMaxPerMinute: 600,
          },
        },
      },
    };

    expect(
      rawResourceCost({
        itemId: 'Desc_OreIron_C',
        dataset,
        project,
        baselineLimits: {
          id: 'test-baseline',
          gameVersionLabel: 'test',
          assumptions: [],
          limits: {
            Desc_OreIron_C: {
              itemId: 'Desc_OreIron_C',
              maxPerMinute: 400,
              source: 'manual-map-count',
            },
          },
        },
      }),
    ).toBeCloseTo(1 / 400, 10);
  });
});
