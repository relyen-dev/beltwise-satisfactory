import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import { createPlannerProject, type PlannerProject } from '@beltwise/planner-core';
import {
  buildMachineUsage,
  buildProductionLpModel,
  DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS,
  rawInputVariable,
  rawResourceCost,
  recipeVariable
} from '@beltwise/solver';

function fixtureProject(): PlannerProject {
  return {
    ...createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z'
    }),
    targets: [
      {
        id: 'target-plate',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 25,
        sortOrder: 0
      },
      {
        id: 'target-rod',
        itemId: 'Desc_IronRod_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 1
      }
    ]
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
          max: 40
        },
        manufacturingSpeed: 2
      }
    },
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_IronPlate_C: {
        ...ironPlateRecipe,
        producedIn: ['Build_FastVariableConstructor_C', 'Build_ConstructorMk1_C']
      }
    }
  };
}

describe('buildProductionLpModel', () => {
  it('builds item balance constraints for multiple fixed outputs together', () => {
    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project: fixtureProject()
    });

    const ingotBalance = model.constraints.find((constraint) => constraint.name === 'balance:Desc_IngotIron_C');
    const plateBalance = model.constraints.find((constraint) => constraint.name === 'balance:Desc_IronPlate_C');
    const rodBalance = model.constraints.find((constraint) => constraint.name === 'balance:Desc_IronRod_C');

    expect(ingotBalance?.coefficients[recipeVariable('Recipe_IronIngot_C')]).toBe(1);
    expect(ingotBalance?.coefficients[recipeVariable('Recipe_IronPlate_C')]).toBe(-2);
    expect(ingotBalance?.coefficients[recipeVariable('Recipe_IronRod_C')]).toBe(-1);
    expect(plateBalance?.rhs).toBe(25);
    expect(rodBalance?.rhs).toBe(20);
  });

  it('bounds raw input variables from generated resource limits', () => {
    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project: fixtureProject()
    });

    expect(model.variables.find((variable) => variable.name === rawInputVariable('Desc_OreIron_C'))).toMatchObject({
      lowerBound: 0,
      upperBound: 600
    });
  });

  it('removes disabled recipes from the LP model', () => {
    const project = fixtureProject();
    project.recipeOverrides['Recipe_IronPlate_C'] = { enabled: false };

    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project
    });

    expect(model.metadata.recipeVariableById['Recipe_IronPlate_C']).toBeUndefined();
  });

  it('does not add machine count or power costs to recipe variables', () => {
    const project = fixtureProject();
    project.objectiveProfile.machineCountWeight = 10_000;
    project.objectiveProfile.powerWeight = 10_000;

    const model = buildProductionLpModel({
      dataset: tinySatisfactoryDataset,
      project
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
      project
    });
    const oneRateUsage = buildMachineUsage(dataset, project, {
      Recipe_IronPlate_C: 1
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
        project
      }),
    ).toBe(0);
  });

  it('applies the project raw resource multiplier to objective unit cost', () => {
    const project = fixtureProject();
    const baseCost = rawResourceCost({
      itemId: 'Desc_OreIron_C',
      dataset: tinySatisfactoryDataset,
      project
    });

    project.objectiveProfile.rawResourceMultipliers['Desc_OreIron_C'] = 2;

    expect(
      rawResourceCost({
        itemId: 'Desc_OreIron_C',
        dataset: tinySatisfactoryDataset,
        project
      }),
    ).toBeCloseTo(baseCost * 2, 10);
  });

  it('falls back to a finite neutral scarcity cost when no baseline limit exists', () => {
    const project = fixtureProject();

    expect(
      rawResourceCost({
        itemId: 'Desc_UnmappedOre_C',
        dataset: tinySatisfactoryDataset,
        project
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
        project
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
            baselineMaxPerMinute: 600
          }
        }
      }
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
              source: 'manual-map-count'
            }
          }
        }
      }),
    ).toBeCloseTo(1 / 400, 10);
  });
});
