import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  gameDatasetSchema,
  recipeAvailabilityCategoryForDataset,
  tinySatisfactoryDataset,
  type GameDataset,
} from '@beltwise/game-data';
import {
  buildProductionGraph,
  createObjectiveProfileFromPreset,
  createPlannerProject,
  type PlannerProject,
  type ProductTarget,
  type PowerTarget,
} from '@beltwise/planner-core';
import { solveProductionPlan } from '@beltwise/solver';

function fixtureProject(
  targets: ProductTarget[],
  dataset: GameDataset = tinySatisfactoryDataset,
): PlannerProject {
  return {
    ...createPlannerProject({
      id: 'project-test',
      name: 'Test',
      dataset,
      now: '2026-05-12T00:00:00.000Z',
    }),
    targets,
  };
}

function fixedTarget(
  id: string,
  itemId: string,
  amountPerMinute: number,
  sortOrder = 0,
): ProductTarget {
  return {
    id,
    itemId,
    mode: 'fixed',
    amountPerMinute,
    sortOrder,
  };
}

function byproductDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_ByproductPlate_C: {
        id: 'Recipe_ByproductPlate_C',
        className: 'Recipe_ByproductPlate_C',
        displayName: 'Byproduct Plate',
        ingredients: [{ itemId: 'Desc_IngotIron_C', amount: 2 }],
        products: [
          { itemId: 'Desc_IronPlate_C', amount: 1 },
          { itemId: 'Desc_CopperIngot_C', amount: 1 },
        ],
        durationSeconds: 6,
        producedIn: ['Build_ConstructorMk1_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
      },
    },
  };
}

function resourceChoiceDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Widget_C: {
        id: 'Desc_Widget_C',
        className: 'Desc_Widget_C',
        displayName: 'Widget',
        form: 'solid',
      },
    },
    machines: {
      ...tinySatisfactoryDataset.machines,
      Build_ResourceHungryManufacturer_C: {
        id: 'Build_ResourceHungryManufacturer_C',
        className: 'Build_ResourceHungryManufacturer_C',
        displayName: 'Resource-Hungry Manufacturer',
        type: 'manufacturer',
        powerMw: 10000,
        manufacturingSpeed: 1,
      },
      Build_FrugalConstructor_C: {
        id: 'Build_FrugalConstructor_C',
        className: 'Build_FrugalConstructor_C',
        displayName: 'Frugal Constructor',
        type: 'manufacturer',
        powerMw: 1,
        manufacturingSpeed: 1,
      },
    },
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_IronWidget_C: {
        id: 'Recipe_IronWidget_C',
        className: 'Recipe_IronWidget_C',
        displayName: 'Iron Widget',
        ingredients: [{ itemId: 'Desc_OreIron_C', amount: 1 }],
        products: [{ itemId: 'Desc_Widget_C', amount: 1 }],
        durationSeconds: 6,
        producedIn: ['Build_ResourceHungryManufacturer_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
      },
      Recipe_CopperWidget_C: {
        id: 'Recipe_CopperWidget_C',
        className: 'Recipe_CopperWidget_C',
        displayName: 'Copper Widget',
        ingredients: [{ itemId: 'Desc_OreCopper_C', amount: 1 }],
        products: [{ itemId: 'Desc_Widget_C', amount: 1 }],
        durationSeconds: 6,
        producedIn: ['Build_FrugalConstructor_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
      },
    },
  };
}

function machineChoiceDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Widget_C: {
        id: 'Desc_Widget_C',
        className: 'Desc_Widget_C',
        displayName: 'Widget',
        form: 'solid',
      },
    },
    machines: {
      ...tinySatisfactoryDataset.machines,
      Build_SlowWidgetConstructor_C: {
        id: 'Build_SlowWidgetConstructor_C',
        className: 'Build_SlowWidgetConstructor_C',
        displayName: 'Slow Widget Constructor',
        type: 'manufacturer',
        powerMw: 4,
        manufacturingSpeed: 1,
      },
      Build_BulkWidgetManufacturer_C: {
        id: 'Build_BulkWidgetManufacturer_C',
        className: 'Build_BulkWidgetManufacturer_C',
        displayName: 'Bulk Widget Manufacturer',
        type: 'manufacturer',
        powerMw: 80,
        manufacturingSpeed: 1,
      },
    },
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_IronWidget_C: {
        id: 'Recipe_IronWidget_C',
        className: 'Recipe_IronWidget_C',
        displayName: 'Iron Widget',
        ingredients: [{ itemId: 'Desc_OreIron_C', amount: 1 }],
        products: [{ itemId: 'Desc_Widget_C', amount: 1 }],
        durationSeconds: 60,
        producedIn: ['Build_SlowWidgetConstructor_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
      },
      Recipe_CopperBulkWidget_C: {
        id: 'Recipe_CopperBulkWidget_C',
        className: 'Recipe_CopperBulkWidget_C',
        displayName: 'Copper Bulk Widget',
        ingredients: [{ itemId: 'Desc_OreCopper_C', amount: 10 }],
        products: [{ itemId: 'Desc_Widget_C', amount: 10 }],
        durationSeconds: 60,
        producedIn: ['Build_BulkWidgetManufacturer_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
      },
    },
  };
}

function cycleDataset(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_CycleA_C: {
        id: 'Desc_CycleA_C',
        className: 'Desc_CycleA_C',
        displayName: 'Cycle A',
        form: 'solid',
      },
      Desc_CycleB_C: {
        id: 'Desc_CycleB_C',
        className: 'Desc_CycleB_C',
        displayName: 'Cycle B',
        form: 'solid',
      },
    },
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_CycleAtoB_C: {
        id: 'Recipe_CycleAtoB_C',
        className: 'Recipe_CycleAtoB_C',
        displayName: 'Cycle A to B',
        ingredients: [{ itemId: 'Desc_CycleA_C', amount: 1 }],
        products: [{ itemId: 'Desc_CycleB_C', amount: 1 }],
        durationSeconds: 4,
        producedIn: ['Build_ConstructorMk1_C'],
        isAlternate: true,
        isHandCraftOnly: false,
        tags: [],
      },
      Recipe_CycleBtoA_C: {
        id: 'Recipe_CycleBtoA_C',
        className: 'Recipe_CycleBtoA_C',
        displayName: 'Cycle B to A',
        ingredients: [{ itemId: 'Desc_CycleB_C', amount: 1 }],
        products: [{ itemId: 'Desc_CycleA_C', amount: 1 }],
        durationSeconds: 4,
        producedIn: ['Build_ConstructorMk1_C'],
        isAlternate: true,
        isHandCraftOnly: false,
        tags: [],
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
      Desc_LiquidFuel_C: {
        id: 'Desc_LiquidFuel_C',
        className: 'Desc_LiquidFuel_C',
        displayName: 'Fuel',
        form: 'liquid',
      },
      Desc_LiquidOil_C: {
        id: 'Desc_LiquidOil_C',
        className: 'Desc_LiquidOil_C',
        displayName: 'Crude Oil',
        form: 'liquid',
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
        displayName: 'Coal-Powered Generator',
        type: 'generator',
        powerMw: 75,
      },
      Build_GeneratorFuel_C: {
        id: 'Build_GeneratorFuel_C',
        className: 'Build_GeneratorFuel_C',
        displayName: 'Fuel-Powered Generator',
        type: 'generator',
        powerMw: 250,
      },
      Build_GeneratorNuclear_C: {
        id: 'Build_GeneratorNuclear_C',
        className: 'Build_GeneratorNuclear_C',
        displayName: 'Nuclear Power Plant',
        type: 'generator',
        powerMw: 2500,
      },
      Build_Refinery_C: {
        id: 'Build_Refinery_C',
        className: 'Build_Refinery_C',
        displayName: 'Refinery',
        type: 'manufacturer',
        powerMw: 30,
        manufacturingSpeed: 1,
      },
    },
    recipes: {
      ...tinySatisfactoryDataset.recipes,
      Recipe_FuelFromOil_C: {
        id: 'Recipe_FuelFromOil_C',
        className: 'Recipe_FuelFromOil_C',
        displayName: 'Fuel from Oil',
        ingredients: [{ itemId: 'Desc_LiquidOil_C', amount: 2 }],
        products: [{ itemId: 'Desc_LiquidFuel_C', amount: 4 }],
        durationSeconds: 6,
        producedIn: ['Build_Refinery_C'],
        isAlternate: false,
        isHandCraftOnly: false,
        tags: [],
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
      'Build_GeneratorFuel_C:Desc_LiquidFuel_C': {
        id: 'Build_GeneratorFuel_C:Desc_LiquidFuel_C',
        generatorId: 'Build_GeneratorFuel_C',
        fuelItemId: 'Desc_LiquidFuel_C',
        powerMw: 250,
        fuelConsumedPerMinute: 20,
        supplementalInputs: [],
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
      Desc_LiquidOil_C: {
        itemId: 'Desc_LiquidOil_C',
        displayName: 'Crude Oil',
        extraction: {
          allowedExtractors: [],
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

function fullDataset(): GameDataset {
  const datasetPath = fileURLToPath(
    new URL('../../../apps/web/public/data/satisfactory-current.json', import.meta.url),
  );
  return gameDatasetSchema.parse(JSON.parse(readFileSync(datasetPath, 'utf8')) as unknown);
}

function enableAllAlternateRecipes(project: PlannerProject, dataset: GameDataset): void {
  for (const recipe of Object.values(dataset.recipes)) {
    if (recipeAvailabilityCategoryForDataset(dataset, recipe) === 'alternate') {
      project.recipeOverrides[recipe.id] = { enabled: true };
    }
  }
}

function flowAmount(
  result: Awaited<ReturnType<typeof solveProductionPlan>>,
  itemId: string,
  sourceId: string,
  targetId: string,
): number | undefined {
  return result.itemFlows.find(
    (flow) => flow.itemId === itemId && flow.source.id === sourceId && flow.target.id === targetId,
  )?.amountPerMinute;
}

function totalMachineCount(result: Awaited<ReturnType<typeof solveProductionPlan>>): number {
  return result.machineUsage.reduce((total, usage) => total + usage.machineCount, 0);
}

function setPowerTargets(project: PlannerProject, powerTargets: PowerTarget[]): PlannerProject {
  return {
    ...project,
    powerTargets,
  };
}

describe('solveProductionPlan real LP solver', () => {
  it('returns a clean empty optimal result for a project with no targets', async () => {
    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project: fixtureProject([]),
    });

    expect(result).toEqual({
      status: 'optimal',
      recipeRates: {},
      rawInputs: {},
      externalInputs: {},
      assumedInputs: {},
      itemFlows: [],
      outputs: {},
      surplus: {},
      machineUsage: [],
      powerMw: 0,
      warnings: [],
    });
  });

  it('solves a fixed Iron Plate output with correct ore, ingot, and plate rates', async () => {
    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project: fixtureProject([fixedTarget('target-plate', 'Desc_IronPlate_C', 25)]),
    });

    expect(result.status).toBe('optimal');
    expect(result.recipeRates['Recipe_IronPlate_C']).toBeCloseTo(25, 6);
    expect(result.recipeRates['Recipe_IronIngot_C']).toBeCloseTo(50, 6);
    expect(result.rawInputs['Desc_OreIron_C']).toBeCloseTo(50, 6);
    expect(result.outputs['Desc_IronPlate_C']).toBeCloseTo(25, 6);
  });

  it('solves selected coal generator counts as generated power with fuel and water demand', async () => {
    const dataset = powerFixtureDataset();
    const project = setPowerTargets(fixtureProject([], dataset), [
      {
        id: 'power-coal',
        mode: 'generator-count',
        generatorId: 'Build_GeneratorCoal_C',
        fuelItemId: 'Desc_Coal_C',
        generatorCount: 16,
        sortOrder: 0,
      },
    ]);

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.generatedPowerMw).toBeCloseTo(1200, 6);
    expect(result.powerMw).toBe(0);
    expect(result.powerGeneratorUsage).toHaveLength(1);
    expect(result.powerGeneratorUsage?.[0]).toMatchObject({
      powerTargetId: 'power-coal',
      optionId: 'Build_GeneratorCoal_C:Desc_Coal_C',
      generatorId: 'Build_GeneratorCoal_C',
      fuelItemId: 'Desc_Coal_C',
      generatorCount: 16,
      powerMw: 1200,
      fuelConsumedPerMinute: 240,
      supplementalInputs: [{ itemId: 'Desc_Water_C', amountPerMinute: 720 }],
    });
    expect(result.rawInputs['Desc_Coal_C']).toBeCloseTo(240, 6);
    expect(result.rawInputs['Desc_Water_C']).toBeCloseTo(720, 6);
    expect(flowAmount(result, 'Desc_Coal_C', 'Desc_Coal_C', 'power-coal')).toBeCloseTo(240, 6);
    expect(flowAmount(result, 'Desc_Water_C', 'Desc_Water_C', 'power-coal')).toBeCloseTo(720, 6);
    expect(result.itemFlows).toContainEqual(
      expect.objectContaining({
        itemId: 'Desc_Coal_C',
        source: { kind: 'resource', id: 'Desc_Coal_C' },
        target: { kind: 'power', id: 'power-coal' },
      }),
    );
  });

  it('solves selected fuel-generator MW targets through upstream fuel production', async () => {
    const dataset = powerFixtureDataset();
    const project = setPowerTargets(fixtureProject([], dataset), [
      {
        id: 'power-fuel',
        mode: 'power',
        generatorId: 'Build_GeneratorFuel_C',
        fuelItemId: 'Desc_LiquidFuel_C',
        powerMw: 10_000,
        sortOrder: 0,
      },
    ]);

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.generatedPowerMw).toBeCloseTo(10_000, 6);
    expect(result.powerGeneratorUsage?.[0]?.generatorCount).toBeCloseTo(40, 6);
    expect(result.powerGeneratorUsage?.[0]?.fuelConsumedPerMinute).toBeCloseTo(800, 6);
    expect(result.recipeRates['Recipe_FuelFromOil_C']).toBeCloseTo(200, 6);
    expect(result.rawInputs['Desc_LiquidOil_C']).toBeCloseTo(400, 6);
    expect(
      flowAmount(result, 'Desc_LiquidFuel_C', 'Recipe_FuelFromOil_C', 'power-fuel'),
    ).toBeCloseTo(800, 6);
  });

  it('solves full-data Turbofuel generator targets with deterministic unlock recipes enabled by default', async () => {
    const dataset = fullDataset();
    const powerTarget: PowerTarget = {
      id: 'power-turbofuel',
      mode: 'generator-count',
      generatorId: 'Build_GeneratorFuel_C',
      fuelItemId: 'Desc_LiquidTurboFuel_C',
      generatorCount: 1,
      sortOrder: 0,
    };
    const project = setPowerTargets(fixtureProject([], dataset), [powerTarget]);

    expect(project.recipeOverrides['Recipe_Alternate_EnrichedCoal_C']).toBeUndefined();
    expect(project.recipeOverrides['Recipe_Alternate_Turbofuel_C']).toBeUndefined();
    expect(project.recipeOverrides['Recipe_Alternate_TurboBlendFuel_C']).toEqual({
      enabled: false,
    });

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.generatedPowerMw).toBeCloseTo(250, 6);
    expect(result.recipeRates['Recipe_Alternate_EnrichedCoal_C']).toBeGreaterThan(0);
    expect(result.recipeRates['Recipe_Alternate_Turbofuel_C']).toBeGreaterThan(0);

    const disabledUnlockProject = setPowerTargets(fixtureProject([], dataset), [powerTarget]);
    disabledUnlockProject.recipeOverrides['Recipe_Alternate_Turbofuel_C'] = { enabled: false };

    const disabledUnlockResult = await solveProductionPlan({
      dataset,
      project: disabledUnlockProject,
    });

    expect(disabledUnlockResult.status).toBe('infeasible');
  });

  it('reports nuclear generator waste as surplus byproduct', async () => {
    const dataset = powerFixtureDataset();
    const project = setPowerTargets(fixtureProject([], dataset), [
      {
        id: 'power-nuclear',
        mode: 'generator-count',
        generatorId: 'Build_GeneratorNuclear_C',
        fuelItemId: 'Desc_NuclearFuelRod_C',
        generatorCount: 1,
        sortOrder: 0,
      },
    ]);
    project.itemInputs['Desc_NuclearFuelRod_C'] = { amountPerMinute: 1 };

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.generatedPowerMw).toBeCloseTo(2500, 6);
    expect(result.externalInputs?.['Desc_NuclearFuelRod_C']).toBeCloseTo(0.2, 6);
    expect(result.surplus['Desc_NuclearWaste_C']).toBeCloseTo(10, 6);
    expect(result.powerGeneratorUsage?.[0]?.byproducts).toEqual([
      { itemId: 'Desc_NuclearWaste_C', amountPerMinute: 10 },
    ]);
    expect(
      flowAmount(result, 'Desc_NuclearFuelRod_C', 'Desc_NuclearFuelRod_C', 'power-nuclear'),
    ).toBeCloseTo(0.2, 6);
    expect(
      flowAmount(result, 'Desc_NuclearWaste_C', 'power-nuclear', 'Desc_NuclearWaste_C'),
    ).toBeCloseTo(10, 6);
    expect(result.itemFlows).toContainEqual(
      expect.objectContaining({
        itemId: 'Desc_NuclearWaste_C',
        source: { kind: 'power', id: 'power-nuclear' },
        target: { kind: 'byproduct', id: 'Desc_NuclearWaste_C' },
      }),
    );
  });

  it('ignores invalid selected power targets without crashing', async () => {
    const dataset = powerFixtureDataset();
    const project = setPowerTargets(fixtureProject([], dataset), [
      {
        id: 'power-invalid-option',
        mode: 'power',
        generatorId: 'Build_GeneratorCoal_C',
        fuelItemId: 'Desc_LiquidFuel_C',
        powerMw: 100,
        sortOrder: 0,
      },
      {
        id: 'power-draft',
        mode: 'generator-count',
        sortOrder: 1,
      },
    ]);

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.generatedPowerMw).toBeUndefined();
    expect(result.powerGeneratorUsage).toBeUndefined();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'power-target-invalid-option',
        powerTargetId: 'power-invalid-option',
      }),
    ]);
  });

  it('solves multiple fixed outputs through shared intermediates', async () => {
    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project: fixtureProject([
        fixedTarget('target-plate', 'Desc_IronPlate_C', 25),
        fixedTarget('target-rod', 'Desc_IronRod_C', 20, 1),
      ]),
    });

    expect(result.status).toBe('optimal');
    expect(result.recipeRates['Recipe_IronIngot_C']).toBeCloseTo(70, 6);
    expect(result.rawInputs['Desc_OreIron_C']).toBeCloseTo(70, 6);
    expect(result.outputs).toMatchObject({
      Desc_IronPlate_C: 25,
      Desc_IronRod_C: 20,
    });
  });

  it('returns infeasible when a raw resource cap cannot satisfy the fixed output', async () => {
    const project = fixtureProject([fixedTarget('target-plate', 'Desc_IronPlate_C', 25)]);
    project.resourceOverrides['Desc_OreIron_C'] = { maxPerMinute: 10 };

    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(result.status).toBe('infeasible');
    expect(result.recipeRates).toEqual({});
    expect(result.itemFlows).toEqual([]);
  });

  it('returns infeasible when a required raw resource is disabled', async () => {
    const project = fixtureProject([fixedTarget('target-plate', 'Desc_IronPlate_C', 25)]);
    project.resourceOverrides['Desc_OreIron_C'] = { enabled: false, maxPerMinute: 600 };

    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(result.status).toBe('infeasible');
    expect(result.recipeRates).toEqual({});
  });

  it('can force an alternate route when a base recipe is disabled', async () => {
    const project = fixtureProject([fixedTarget('target-wire', 'Desc_Wire_C', 90)]);
    project.recipeOverrides['Recipe_Wire_C'] = { enabled: false };
    project.recipeOverrides['Recipe_IronWire_C'] = { enabled: true };

    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.recipeRates['Recipe_IronWire_C']).toBeCloseTo(10, 6);
    expect(result.rawInputs['Desc_OreIron_C']).toBeCloseTo(50, 6);
    expect(result.rawInputs['Desc_OreCopper_C']).toBeUndefined();
  });

  it('returns infeasible when a disabled recipe leaves no production route', async () => {
    const project = fixtureProject([fixedTarget('target-plate', 'Desc_IronPlate_C', 25)]);
    project.recipeOverrides['Recipe_IronPlate_C'] = { enabled: false };

    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(result.status).toBe('infeasible');
  });

  it('returns infeasible when a required machine is disabled', async () => {
    const project = fixtureProject([fixedTarget('target-plate', 'Desc_IronPlate_C', 25)]);
    project.machineOverrides['Build_ConstructorMk1_C'] = { enabled: false };

    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(result.status).toBe('infeasible');
  });

  it('uses external item inputs to reduce required raw input', async () => {
    const project = fixtureProject([fixedTarget('target-plate', 'Desc_IronPlate_C', 25)]);
    project.itemInputs['Desc_IngotIron_C'] = { amountPerMinute: 20 };

    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.externalInputs?.['Desc_IngotIron_C']).toBeCloseTo(20, 6);
    expect(result.recipeRates['Recipe_IronIngot_C']).toBeCloseTo(30, 6);
    expect(result.rawInputs['Desc_OreIron_C']).toBeCloseTo(30, 6);
  });

  it('sources nuclear waste through assumed inputs when no manual input exists', async () => {
    const dataset = wasteInputDataset();
    const project = fixtureProject(
      [fixedTarget('target-widget', 'Desc_WasteWidget_C', 10)],
      dataset,
    );

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.rawInputs['Desc_NuclearWaste_C']).toBeUndefined();
    expect(result.externalInputs?.['Desc_NuclearWaste_C']).toBeUndefined();
    expect(result.assumedInputs?.['Desc_NuclearWaste_C']).toBeCloseTo(10, 6);
    expect(
      result.itemFlows.find(
        (flow) =>
          flow.itemId === 'Desc_NuclearWaste_C' &&
          flow.source.kind === 'assumedInput' &&
          flow.target.id === 'Recipe_WasteWidget_C',
      )?.amountPerMinute,
    ).toBeCloseTo(10, 6);
  });

  it('uses manual nuclear waste inputs before any assumed stream', async () => {
    const dataset = wasteInputDataset();
    const partialProject = fixtureProject(
      [fixedTarget('target-widget', 'Desc_WasteWidget_C', 10)],
      dataset,
    );
    partialProject.itemInputs['Desc_NuclearWaste_C'] = { amountPerMinute: 4 };

    const partialResult = await solveProductionPlan({
      dataset,
      project: partialProject,
    });

    expect(partialResult.status).toBe('optimal');
    expect(partialResult.externalInputs?.['Desc_NuclearWaste_C']).toBeCloseTo(4, 6);
    expect(partialResult.assumedInputs?.['Desc_NuclearWaste_C']).toBeCloseTo(6, 6);

    const fullProject = fixtureProject(
      [fixedTarget('target-widget', 'Desc_WasteWidget_C', 10)],
      dataset,
    );
    fullProject.itemInputs['Desc_NuclearWaste_C'] = { amountPerMinute: 10 };

    const fullResult = await solveProductionPlan({
      dataset,
      project: fullProject,
    });

    expect(fullResult.status).toBe('optimal');
    expect(fullResult.externalInputs?.['Desc_NuclearWaste_C']).toBeCloseTo(10, 6);
    expect(fullResult.assumedInputs?.['Desc_NuclearWaste_C']).toBeUndefined();
  });

  it('maximizes an output under raw resource caps without rewarding surplus', async () => {
    const project = fixtureProject([
      {
        id: 'target-plate',
        itemId: 'Desc_IronPlate_C',
        mode: 'maximize',
        sortOrder: 0,
      },
    ]);
    project.resourceOverrides['Desc_OreIron_C'] = { maxPerMinute: 100 };

    const result = await solveProductionPlan({
      dataset: tinySatisfactoryDataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.outputs['Desc_IronPlate_C']).toBeCloseTo(50, 6);
    expect(result.rawInputs['Desc_OreIron_C']).toBeCloseTo(100, 6);
    expect(result.surplus['Desc_IronPlate_C']).toBeUndefined();
  });

  it('reports byproduct surplus without inventing extra surplus', async () => {
    const dataset = byproductDataset();
    const project = fixtureProject([fixedTarget('target-plate', 'Desc_IronPlate_C', 25)], dataset);
    project.recipeOverrides['Recipe_IronPlate_C'] = { enabled: false };

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.recipeRates['Recipe_ByproductPlate_C']).toBeCloseTo(25, 6);
    expect(result.surplus['Desc_CopperIngot_C']).toBeCloseTo(25, 6);
    expect(Math.max(0, ...Object.values(result.surplus))).toBeCloseTo(25, 6);
  });

  it('does not expose tiny rounded recipe artifacts as graph-driving records', async () => {
    const dataset = fullDataset();
    const project = fixtureProject([fixedTarget('target-plastic', 'Desc_Plastic_C', 900)], dataset);
    enableAllAlternateRecipes(project, dataset);

    const result = await solveProductionPlan({
      dataset,
      project,
    });
    const graph = buildProductionGraph(dataset, project.targets, result);
    const fourDecimalGraph = buildProductionGraph(dataset, project.targets, result, {
      rateDecimalPlaces: 4,
    });
    const plasticOutputFlow = result.itemFlows.find(
      (flow) => flow.itemId === 'Desc_Plastic_C' && flow.target.kind === 'output',
    );
    const residualRubberFlow = result.itemFlows.find(
      (flow) => flow.itemId === 'Desc_Rubber_C' && flow.source.id === 'Recipe_ResidualRubber_C',
    );

    expect(result.status).toBe('optimal');
    expect(result.outputs['Desc_Plastic_C']).toBeCloseTo(900, 6);
    expect(result.rawInputs['Desc_LiquidOil_C']).toBeCloseTo(300, 3);
    expect(result.rawInputs['Desc_Water_C']).toBeCloseTo(1000, 3);
    expect(plasticOutputFlow?.amountPerMinute).toBeCloseTo(900, 4);
    expect(residualRubberFlow?.amountPerMinute).toBeCloseTo(100, 4);
    expect(
      fourDecimalGraph.edges.find(
        (edge) => edge.itemId === 'Desc_Plastic_C' && edge.targetNodeId === 'output:target-plastic',
      )?.label,
    ).toBe('Plastic 900/min');
    expect(result.recipeRates['Recipe_Rubber_C']).toBeUndefined();
    expect(result.machineUsage.some((usage) => usage.recipeId === 'Recipe_Rubber_C')).toBe(false);
    expect(
      result.itemFlows.some(
        (flow) => flow.source.id === 'Recipe_Rubber_C' || flow.target.id === 'Recipe_Rubber_C',
      ),
    ).toBe(false);
    expect(graph.nodes.some((node) => node.id === 'recipe:Recipe_Rubber_C')).toBe(false);
  });

  it('keeps recipe-internal recycled fluids as self-loop item flows', async () => {
    const dataset = fullDataset();
    const project = fixtureProject([fixedTarget('target-cell', 'Desc_UraniumCell_C', 5)], dataset);

    const result = await solveProductionPlan({
      dataset,
      project,
    });
    const graph = buildProductionGraph(dataset, project.targets, result);

    expect(result.status).toBe('optimal');
    expect(result.recipeRates['Recipe_UraniumCell_C']).toBeCloseTo(1, 6);
    expect(
      flowAmount(
        result,
        'Desc_SulfuricAcid_C',
        'Recipe_UraniumCell_C',
        'Recipe_UraniumCell_C',
      ),
    ).toBeCloseTo(2, 6);
    expect(
      flowAmount(
        result,
        'Desc_SulfuricAcid_C',
        'Recipe_SulfuricAcid_C',
        'Recipe_UraniumCell_C',
      ),
    ).toBeCloseTo(6, 6);
    expect(result.itemFlows).toContainEqual(
      expect.objectContaining({
        itemId: 'Desc_SulfuricAcid_C',
        amountPerMinute: 2,
        source: { kind: 'recipe', id: 'Recipe_UraniumCell_C' },
        target: { kind: 'recipe', id: 'Recipe_UraniumCell_C' },
      }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        sourceNodeId: 'recipe:Recipe_UraniumCell_C',
        targetNodeId: 'recipe:Recipe_UraniumCell_C',
        itemId: 'Desc_SulfuricAcid_C',
        amountPerMinute: 2,
      }),
    );
  });

  it('routes byproduct rubber into recycled plastic before assigning rubber to output', async () => {
    const dataset = fullDataset();
    const project = fixtureProject([fixedTarget('target-rubber', 'Desc_Rubber_C', 900)], dataset);
    enableAllAlternateRecipes(project, dataset);
    project.machineOverrides['Build_Converter_C'] = { enabled: false };

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.outputs['Desc_Rubber_C']).toBeCloseTo(900, 6);
    expect(result.recipeRates['Recipe_ResidualRubber_C']).toBeCloseTo(50, 4);
    expect(result.recipeRates['Recipe_Alternate_Plastic_1_C']).toBeCloseTo(44.4444, 4);
    expect(result.recipeRates['Recipe_Alternate_RecycledRubber_C']).toBeCloseTo(88.8889, 4);
    expect(
      flowAmount(
        result,
        'Desc_Rubber_C',
        'Recipe_ResidualRubber_C',
        'Recipe_Alternate_Plastic_1_C',
      ),
    ).toBeCloseTo(100, 4);
    expect(
      flowAmount(
        result,
        'Desc_Rubber_C',
        'Recipe_Alternate_RecycledRubber_C',
        'Recipe_Alternate_Plastic_1_C',
      ),
    ).toBeCloseTo(166.6667, 4);
    expect(
      flowAmount(
        result,
        'Desc_Plastic_C',
        'Recipe_Alternate_Plastic_1_C',
        'Recipe_Alternate_RecycledRubber_C',
      ),
    ).toBeCloseTo(533.3333, 4);
    expect(
      flowAmount(result, 'Desc_Rubber_C', 'Recipe_Alternate_RecycledRubber_C', 'target-rubber'),
    ).toBeCloseTo(900, 4);
    expect(
      flowAmount(result, 'Desc_Rubber_C', 'Recipe_ResidualRubber_C', 'target-rubber') ?? 0,
    ).toBeCloseTo(0, 4);
  });

  it('uses map scarcity weighting to choose between otherwise equivalent recipes', async () => {
    const dataset = resourceChoiceDataset();
    const project = fixtureProject([fixedTarget('target-widget', 'Desc_Widget_C', 10)], dataset);

    const defaultResult = await solveProductionPlan({
      dataset,
      project,
    });

    expect(defaultResult.status).toBe('optimal');
    expect(defaultResult.recipeRates['Recipe_IronWidget_C']).toBeCloseTo(10, 6);
    expect(defaultResult.recipeRates['Recipe_CopperWidget_C']).toBeUndefined();

    project.objectiveProfile.rawResourceMultipliers['Desc_OreIron_C'] = 10;

    const userWeightedResult = await solveProductionPlan({
      dataset,
      project,
    });

    expect(userWeightedResult.status).toBe('optimal');
    expect(userWeightedResult.recipeRates['Recipe_CopperWidget_C']).toBeCloseTo(10, 6);
    expect(userWeightedResult.recipeRates['Recipe_IronWidget_C']).toBeUndefined();
  });

  it('does not run an unrelated recipe cycle for positive rates', async () => {
    const dataset = cycleDataset();
    const project = fixtureProject([fixedTarget('target-plate', 'Desc_IronPlate_C', 25)], dataset);
    project.recipeOverrides['Recipe_CycleAtoB_C'] = { enabled: true };
    project.recipeOverrides['Recipe_CycleBtoA_C'] = { enabled: true };

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.recipeRates['Recipe_CycleAtoB_C']).toBeUndefined();
    expect(result.recipeRates['Recipe_CycleBtoA_C']).toBeUndefined();
    expect(Math.max(0, ...Object.values(result.surplus))).toBeLessThan(1_000);
  });

  it('ignores machine and power weights when choosing the resource-efficient route', async () => {
    const dataset = resourceChoiceDataset();
    const project = fixtureProject([fixedTarget('target-widget', 'Desc_Widget_C', 10)], dataset);
    project.objectiveProfile.machineCountWeight = 10_000;
    project.objectiveProfile.powerWeight = 10_000;

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.recipeRates['Recipe_IronWidget_C']).toBeCloseTo(10, 6);
    expect(result.recipeRates['Recipe_CopperWidget_C']).toBeUndefined();
  });

  it('uses Low Power to choose a lower-power route over the resource-efficient route', async () => {
    const dataset = resourceChoiceDataset();
    const project = fixtureProject([fixedTarget('target-widget', 'Desc_Widget_C', 10)], dataset);
    project.objectiveProfile = createObjectiveProfileFromPreset('low-power');

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.recipeRates['Recipe_CopperWidget_C']).toBeCloseTo(10, 6);
    expect(result.recipeRates['Recipe_IronWidget_C']).toBeUndefined();
    expect(result.powerMw).toBeLessThan(10);
  });

  it('uses Few Machines to choose a lower-machine route over the resource-efficient route', async () => {
    const dataset = machineChoiceDataset();
    const defaultProject = fixtureProject(
      [fixedTarget('target-widget', 'Desc_Widget_C', 10)],
      dataset,
    );
    const fewMachinesProject = {
      ...fixtureProject([fixedTarget('target-widget', 'Desc_Widget_C', 10)], dataset),
      objectiveProfile: createObjectiveProfileFromPreset('few-machines'),
    };

    const defaultResult = await solveProductionPlan({
      dataset,
      project: defaultProject,
    });
    const fewMachinesResult = await solveProductionPlan({
      dataset,
      project: fewMachinesProject,
    });

    expect(defaultResult.status).toBe('optimal');
    expect(defaultResult.recipeRates['Recipe_IronWidget_C']).toBeCloseTo(10, 6);
    expect(defaultResult.recipeRates['Recipe_CopperBulkWidget_C']).toBeUndefined();
    expect(fewMachinesResult.status).toBe('optimal');
    expect(fewMachinesResult.recipeRates['Recipe_CopperBulkWidget_C']).toBeCloseTo(1, 6);
    expect(fewMachinesResult.recipeRates['Recipe_IronWidget_C']).toBeUndefined();
    expect(totalMachineCount(fewMachinesResult)).toBeLessThan(totalMachineCount(defaultResult));
  });

  it('can use Insulated Crystal Oscillator at 10 per minute when it is the only Crystal Oscillator route', async () => {
    const dataset = fullDataset();
    const project = fixtureProject(
      [fixedTarget('target-crystal-oscillator', 'Desc_CrystalOscillator_C', 10)],
      dataset,
    );
    project.recipeOverrides['Recipe_CrystalOscillator_C'] = { enabled: false };
    enableAllAlternateRecipes(project, dataset);

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.warnings).toEqual([]);
    expect(result.recipeRates['Recipe_Alternate_CrystalOscillator_C']).toBeCloseTo(10, 6);
    expect(result.recipeRates['Recipe_CrystalOscillator_C']).toBeUndefined();
    expect(result.rawInputs['Desc_LiquidOil_C']).toBeGreaterThan(0);
    expect(Math.max(0, ...Object.values(result.surplus))).toBeLessThan(1_000);
  });

  it('solves a full-data Uranium Fuel Rod target with all alternates without absurd surplus values', async () => {
    const dataset = fullDataset();
    const project = fixtureProject(
      [fixedTarget('target-uranium-fuel-rod', 'Desc_NuclearFuelRod_C', 10)],
      dataset,
    );
    enableAllAlternateRecipes(project, dataset);

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.warnings).toEqual([]);
    expect(result.outputs['Desc_NuclearFuelRod_C']).toBeCloseTo(10, 6);
    expect(Object.values(result.rawInputs).some((amountPerMinute) => amountPerMinute > 0)).toBe(
      true,
    );
    expect(Math.max(0, ...Object.values(result.surplus))).toBeLessThan(1_000);
  });

  it('solves a full-data Plutonium Fuel Rod target using assumed uranium waste', async () => {
    const dataset = fullDataset();
    const project = fixtureProject(
      [fixedTarget('target-plutonium-fuel-rod', 'Desc_PlutoniumFuelRod_C', 10)],
      dataset,
    );

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.warnings).toEqual([]);
    expect(result.outputs['Desc_PlutoniumFuelRod_C']).toBeCloseTo(10, 6);
    expect(result.rawInputs['Desc_NuclearWaste_C']).toBeUndefined();
    expect(result.externalInputs?.['Desc_NuclearWaste_C']).toBeUndefined();
    expect(result.assumedInputs?.['Desc_NuclearWaste_C']).toBeGreaterThan(0);
    expect(
      result.itemFlows.some(
        (flow) => flow.itemId === 'Desc_NuclearWaste_C' && flow.source.kind === 'assumedInput',
      ),
    ).toBe(true);
  });

  it('solves a full-data Ficsonium Fuel Rod target using assumed plutonium waste', async () => {
    const dataset = fullDataset();
    const project = fixtureProject(
      [fixedTarget('target-ficsonium-fuel-rod', 'Desc_FicsoniumFuelRod_C', 1)],
      dataset,
    );

    const result = await solveProductionPlan({
      dataset,
      project,
    });

    expect(result.status).toBe('optimal');
    expect(result.warnings).toEqual([]);
    expect(result.outputs['Desc_FicsoniumFuelRod_C']).toBeCloseTo(1, 6);
    expect(result.rawInputs['Desc_PlutoniumWaste_C']).toBeUndefined();
    expect(result.externalInputs?.['Desc_PlutoniumWaste_C']).toBeUndefined();
    expect(result.assumedInputs?.['Desc_PlutoniumWaste_C']).toBeGreaterThan(0);
    expect(
      result.itemFlows.some(
        (flow) => flow.itemId === 'Desc_PlutoniumWaste_C' && flow.source.kind === 'assumedInput',
      ),
    ).toBe(true);
  });

  it('does not report orphan resources or tiny split screw routes in a Uranium Fuel Rod plan', async () => {
    const dataset = fullDataset();
    const project = fixtureProject(
      [fixedTarget('target-uranium-fuel-rod', 'Desc_NuclearFuelRod_C', 10)],
      dataset,
    );
    enableAllAlternateRecipes(project, dataset);
    project.machineOverrides['Build_Converter_C'] = { enabled: false };

    const result = await solveProductionPlan({
      dataset,
      project,
    });
    const graph = buildProductionGraph(dataset, project.targets, result);

    expect(result.status).toBe('optimal');
    expect(result.outputs['Desc_NuclearFuelRod_C']).toBeCloseTo(10, 6);
    expect(result.rawInputs['Desc_OreBauxite_C']).toBeUndefined();
    expect(result.recipeRates['Recipe_Alternate_Screw_2_C']).toBeUndefined();
    expect(result.recipeRates['Recipe_SteelBeam_C']).toBeUndefined();
    expect(graph.nodes.some((node) => node.id === 'resource:Desc_OreBauxite_C')).toBe(false);
  });
});
