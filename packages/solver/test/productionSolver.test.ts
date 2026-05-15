import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gameDatasetSchema, tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  buildProductionGraph,
  createPlannerProject,
  type PlannerProject,
  type ProductTarget,
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

function fullDataset(): GameDataset {
  const datasetPath = fileURLToPath(
    new URL('../../../apps/web/public/data/satisfactory-current.json', import.meta.url),
  );
  return gameDatasetSchema.parse(JSON.parse(readFileSync(datasetPath, 'utf8')) as unknown);
}

function enableAllAlternateRecipes(project: PlannerProject, dataset: GameDataset): void {
  for (const recipe of Object.values(dataset.recipes)) {
    if (recipe.isAlternate) {
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
    (flow) =>
      flow.itemId === itemId && flow.source.id === sourceId && flow.target.id === targetId,
  )?.amountPerMinute;
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
      flowAmount(
        result,
        'Desc_Rubber_C',
        'Recipe_Alternate_RecycledRubber_C',
        'target-rubber',
      ),
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

  it('can use Insulated Crystal Oscillator at 10 per minute when it is the only Crystal Oscillator route', async () => {
    const dataset = fullDataset();
    const project = fixtureProject(
      [fixedTarget('target-crystal-oscillator', 'Desc_CrystalOscillator_C', 10)],
      dataset,
    );
    project.recipeOverrides['Recipe_CrystalOscillator_C'] = { enabled: false };
    for (const recipe of Object.values(dataset.recipes)) {
      if (recipe.isAlternate) {
        project.recipeOverrides[recipe.id] = { enabled: true };
      }
    }

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
    for (const recipe of Object.values(dataset.recipes)) {
      if (recipe.isAlternate) {
        project.recipeOverrides[recipe.id] = { enabled: true };
      }
    }

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

  it('does not report orphan resources or tiny split screw routes in a Uranium Fuel Rod plan', async () => {
    const dataset = fullDataset();
    const project = fixtureProject(
      [fixedTarget('target-uranium-fuel-rod', 'Desc_NuclearFuelRod_C', 10)],
      dataset,
    );
    for (const recipe of Object.values(dataset.recipes)) {
      if (recipe.isAlternate) {
        project.recipeOverrides[recipe.id] = { enabled: true };
      }
    }
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
