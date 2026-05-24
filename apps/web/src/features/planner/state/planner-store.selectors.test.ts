import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import {
  selectAvailableSurplusSinkItems,
  selectCompletedGraphNodeIds,
  selectExternalInputRows,
  selectGraphNodeNotes,
  selectItemOptions,
  selectMachinePanelSummary,
  selectMachineRows,
  selectMachineUsageRows,
  selectRecipeRows,
  selectRawResourceMultiplierRows,
  selectResourceRows,
  selectSinkRuleRows,
} from './planner-store.selectors';

const NOW = '2026-05-12T00:00:00.000Z';

describe('planner store selectors', () => {
  it('sorts item options by display name', () => {
    expect(selectItemOptions(tinySatisfactoryDataset).map((item) => item.displayName)).toEqual([
      'Copper Ingot',
      'Copper Ore',
      'Iron Ingot',
      'Iron Ore',
      'Iron Plate',
      'Iron Rod',
      'Reinforced Iron Plate',
      'Screw',
      'Wire',
    ]);
    expect(selectItemOptions(null)).toEqual([]);
  });

  it('builds resource rows with override labels and custom flags', () => {
    const project: PlannerProject = {
      ...createProject(),
      resourceOverrides: {
        Desc_OreIron_C: { enabled: false, maxPerMinute: 120 },
      },
    };

    const rows = selectResourceRows(tinySatisfactoryDataset, project);
    const ironOre = rows.find((row) => row.resource.itemId === 'Desc_OreIron_C');
    const copperOre = rows.find((row) => row.resource.itemId === 'Desc_OreCopper_C');

    expect(ironOre).toMatchObject({
      enabled: false,
      iconSrc: '/game-icons/Desc_OreIron_C.png',
      isCustom: true,
      capInputValue: 120,
      baselineCapLabel: '600/min',
      effectiveCapLabel: '0/min',
    });
    expect(copperOre).toMatchObject({
      enabled: true,
      iconSrc: '/game-icons/Desc_OreCopper_C.png',
      isCustom: false,
      capInputValue: 300,
      baselineCapLabel: '300/min',
      effectiveCapLabel: '300/min',
    });
  });

  it('displays zero overrides on unlimited resources as unlimited defaults', () => {
    const dataset = withUnlimitedWaterDataset();
    const project: PlannerProject = {
      ...createProject(),
      resourceOverrides: {
        Desc_Water_C: { maxPerMinute: 0 },
        Desc_OreIron_C: { maxPerMinute: 0 },
      },
    };

    const rows = selectResourceRows(dataset, project);
    const water = rows.find((row) => row.resource.itemId === 'Desc_Water_C');
    const ironOre = rows.find((row) => row.resource.itemId === 'Desc_OreIron_C');

    expect(water).toMatchObject({
      enabled: true,
      isCustom: false,
      capInputValue: null,
      baselineCapLabel: 'Unlimited',
      effectiveCapLabel: 'Unlimited',
    });
    expect(ironOre).toMatchObject({
      enabled: true,
      isCustom: true,
      capInputValue: 0,
      effectiveCapLabel: '0/min',
    });
  });

  it('builds raw resource multiplier rows with neutral and custom states', () => {
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      resources: {
        ...tinySatisfactoryDataset.resources,
        Desc_Water_C: {
          itemId: 'Desc_Water_C',
          displayName: 'Water',
          extraction: {
            allowedExtractors: ['Build_WaterPump_C'],
            baselineMaxPerMinute: 12_000,
          },
        },
      },
    };
    const project: PlannerProject = {
      ...createProject(),
      objectiveProfile: {
        ...createProject().objectiveProfile,
        rawResourceMultipliers: {
          Desc_OreIron_C: 2,
          Desc_Water_C: 3,
          Desc_Missing_C: 99,
        },
      },
    };

    const rows = selectRawResourceMultiplierRows(dataset, project.objectiveProfile);

    expect(rows.map((row) => row.resource.displayName)).toEqual(['Copper Ore', 'Iron Ore']);
    expect(rows.some((row) => row.resource.itemId === 'Desc_Water_C')).toBe(false);
    expect(rows.find((row) => row.resource.itemId === 'Desc_OreCopper_C')).toMatchObject({
      iconSrc: '/game-icons/Desc_OreCopper_C.png',
      baselineAvailabilityLabel: '300/min',
      builtInCost: 2,
      builtInCostLabel: '2',
      builtInCostHelpText:
        'Copper Ore has 300/min static map availability. Iron Ore is the reference at 600/min, so Copper Ore starts at 2x before your custom multiplier. Custom multiplier 1x gives effective cost 2; lower effective costs are preferred when alternatives exist.',
      costFormulaAriaLabel: 'Copper Ore route cost: built-in 2 times custom 1x equals effective 2',
      multiplier: 1,
      multiplierLabel: '1x',
      effectiveCost: 2,
      effectiveCostLabel: '2',
      isNeutral: true,
      stateLabel: 'Neutral',
    });
    expect(rows.find((row) => row.resource.itemId === 'Desc_OreIron_C')).toMatchObject({
      iconSrc: '/game-icons/Desc_OreIron_C.png',
      baselineAvailabilityLabel: '600/min',
      builtInCost: 1,
      builtInCostLabel: '1',
      builtInCostHelpText:
        'Iron Ore has 600/min static map availability. Iron Ore is the reference resource for this list, so it starts at built-in cost 1. Custom multiplier 2x gives effective cost 2; lower effective costs are preferred when alternatives exist.',
      costFormulaAriaLabel: 'Iron Ore route cost: built-in 1 times custom 2x equals effective 2',
      multiplier: 2,
      multiplierLabel: '2x',
      effectiveCost: 2,
      effectiveCostLabel: '2',
      isNeutral: false,
      stateLabel: 'Avoid',
    });
  });

  it('explains raw resource built-in costs from static map availability', () => {
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      resources: {
        Desc_OreIron_C: {
          ...tinySatisfactoryDataset.resources['Desc_OreIron_C'],
          extraction: {
            allowedExtractors: ['Build_MinerMk1_C'],
            baselineMaxPerMinute: 92_100,
          },
        },
        Desc_OreUranium_C: {
          itemId: 'Desc_OreUranium_C',
          displayName: 'Uranium',
          extraction: {
            allowedExtractors: ['Build_MinerMk1_C'],
            baselineMaxPerMinute: 2_100,
          },
        },
      },
    };

    const rows = selectRawResourceMultiplierRows(dataset, createProject().objectiveProfile);
    const uranium = rows.find((row) => row.resource.itemId === 'Desc_OreUranium_C');

    expect(rows.map((row) => row.resource.displayName)).toEqual(['Iron Ore', 'Uranium']);
    expect(uranium).toMatchObject({
      baselineAvailabilityLabel: '2,100/min',
      builtInCost: 43.857142857142854,
      builtInCostLabel: '43.86',
      builtInCostHelpText:
        'Uranium has 2,100/min static map availability. Iron Ore is the reference at 92,100/min, so Uranium starts at 43.86x before your custom multiplier. Custom multiplier 1x gives effective cost 43.86; lower effective costs are preferred when alternatives exist.',
      effectiveCostLabel: '43.86',
    });
  });

  it('filters missing external input items and sorts visible rows', () => {
    const project: PlannerProject = {
      ...createProject(),
      itemInputs: {
        Desc_Wire_C: { amountPerMinute: 12 },
        Desc_Missing_C: { amountPerMinute: 99 },
        Desc_IngotIron_C: { amountPerMinute: 5 },
      },
    };

    expect(selectExternalInputRows(tinySatisfactoryDataset, project)).toEqual([
      { item: tinySatisfactoryDataset.items['Desc_IngotIron_C'], amountPerMinute: 5 },
      { item: tinySatisfactoryDataset.items['Desc_Wire_C'], amountPerMinute: 12 },
    ]);
  });

  it('builds sink rule rows with solved rates and sink points', () => {
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      items: {
        ...tinySatisfactoryDataset.items,
        Desc_Screw_C: {
          ...tinySatisfactoryDataset.items['Desc_Screw_C']!,
          sinkPoints: 2,
        },
      },
    };
    const project: PlannerProject = {
      ...createProject(),
      sinkRules: [
        {
          id: 'sink-screw',
          itemId: 'Desc_Screw_C',
          mode: 'surplus',
          sortOrder: 0,
        },
      ],
    };
    const result: ProductionPlanResult = {
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
    };

    expect(selectSinkRuleRows(dataset, project, result)).toMatchObject([
      {
        rule: project.sinkRules[0],
        itemId: 'Desc_Screw_C',
        displayName: 'Screw',
        iconSrc: '/game-icons/Desc_Screw_C.png',
        amountPerMinute: 12,
        sinkPointsPerMinute: 24,
      },
    ]);
  });

  it('lists only sinkable items without an existing surplus sink rule', () => {
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      items: {
        ...tinySatisfactoryDataset.items,
        Desc_Screw_C: {
          ...tinySatisfactoryDataset.items['Desc_Screw_C']!,
          sinkPoints: 2,
        },
        Desc_Wire_C: {
          ...tinySatisfactoryDataset.items['Desc_Wire_C']!,
          sinkPoints: 1,
        },
      },
    };
    const project: PlannerProject = {
      ...createProject(),
      sinkRules: [
        {
          id: 'sink-screw',
          itemId: 'Desc_Screw_C',
          mode: 'surplus',
          sortOrder: 0,
        },
      ],
    };

    expect(selectAvailableSurplusSinkItems(dataset, project).map((item) => item.id)).toEqual([
      'Desc_Wire_C',
    ]);
  });

  it('keeps machine rows to solve-relevant automated machines', () => {
    const project: PlannerProject = {
      ...createProject(),
      machineOverrides: {
        Build_ConstructorMk1_C: { enabled: false },
      },
    };

    const rows = selectMachineRows(tinySatisfactoryDataset, project);

    expect(rows.map((row) => row.machine.displayName)).toEqual([
      'Assembler',
      'Constructor',
      'Smelter',
    ]);
    expect(rows.find((row) => row.machine.id === 'Build_ConstructorMk1_C')).toMatchObject({
      enabled: false,
      iconSrc: '/game-icons/Desc_ConstructorMk1_C.png',
      powerLabel: '4 MW',
      toggleLabel: 'Constructor machine availability',
      typeLabel: 'Manufacturer',
    });
    expect(rows.find((row) => row.machine.id === 'Build_AssemblerMk1_C')?.iconSrc).toBe(
      '/game-icons/Desc_AssemblerMk1_C.png',
    );
    expect(rows.some((row) => row.machine.id === 'Build_MinerMk1_C')).toBe(false);
  });

  it('adds current plan usage analytics to machine rows', () => {
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {},
      rawInputs: {},
      externalInputs: {},
      itemFlows: [],
      outputs: {},
      surplus: {},
      machineUsage: [
        {
          recipeId: 'Recipe_IronPlate_C',
          machineId: 'Build_ConstructorMk1_C',
          machineDisplayName: 'Constructor',
          recipeDisplayName: 'Iron Plate',
          recipeRatePerMinute: 10,
          machineCount: 1,
          powerMw: 4,
        },
        {
          recipeId: 'Recipe_Wire_C',
          machineId: 'Build_ConstructorMk1_C',
          machineDisplayName: 'Constructor',
          recipeDisplayName: 'Wire',
          recipeRatePerMinute: 15,
          machineCount: 0.5,
          powerMw: 2,
        },
        {
          recipeId: 'Recipe_Screw_C',
          machineId: 'Build_ConstructorMk1_C',
          machineDisplayName: 'Constructor',
          recipeDisplayName: 'Screw',
          recipeRatePerMinute: 3,
          machineCount: 0.3,
          powerMw: 1.2,
        },
      ],
      powerMw: 7.2,
      warnings: [],
    };

    const rows = selectMachineRows(tinySatisfactoryDataset, createProject(), result);

    expect(rows.find((row) => row.machine.id === 'Build_ConstructorMk1_C')?.usage).toEqual({
      machineCount: 1.8,
      physicalMachineCount: 3,
      powerMw: 7.2,
      recipeGroupCount: 3,
      machineCountLabel: '1.8x',
      physicalMachineCountLabel: '3',
      powerLabel: '7.2 MW',
      recipeGroupCountLabel: '3 recipes',
    });
    expect(rows.find((row) => row.machine.id === 'Build_SmelterMk1_C')?.usage).toBeNull();
    expect(selectMachinePanelSummary(result)).toEqual({
      activeRecipeGroupCount: 3,
      usedMachineTypeCount: 1,
      totalMachineCountLabel: '1.8x',
      totalPhysicalMachineCountLabel: '3',
      totalPowerLabel: '7.2 MW',
    });
    expect(selectMachinePanelSummary(null)).toEqual({
      activeRecipeGroupCount: 0,
      usedMachineTypeCount: 0,
      totalMachineCountLabel: '0x',
      totalPhysicalMachineCountLabel: '0',
      totalPowerLabel: '0 MW',
    });
  });

  it('filters recipe rows by search and annotates override state and machine names', () => {
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      recipes: {
        ...tinySatisfactoryDataset.recipes,
        Recipe_MissingMachine_C: {
          id: 'Recipe_MissingMachine_C',
          className: 'Recipe_MissingMachine_C',
          displayName: 'Iron Mystery',
          ingredients: [{ itemId: 'Desc_IngotIron_C', amount: 1 }],
          products: [
            { itemId: 'Desc_IronRod_C', amount: 1 },
            { itemId: 'Desc_Screw_C', amount: 2 },
          ],
          durationSeconds: 4,
          producedIn: ['Build_NotPresent_C'],
          isAlternate: false,
          isHandCraftOnly: false,
          tags: [],
        },
      },
    };
    const project: PlannerProject = {
      ...createProject(),
      recipeOverrides: {
        ...createProject().recipeOverrides,
        Recipe_IronPlate_C: { enabled: false },
      },
    };

    const rows = selectRecipeRows(dataset, project, ' iron ');

    expect(rows.map((row) => row.recipe.displayName)).toEqual([
      'Alternate: Iron Wire',
      'Iron Ingot',
      'Iron Mystery',
      'Iron Plate',
      'Iron Rod',
      'Reinforced Iron Plate',
    ]);
    expect(rows.find((row) => row.recipe.id === 'Recipe_IronPlate_C')).toMatchObject({
      enabled: false,
      machineName: 'Constructor',
      toggleLabel: 'Iron Plate recipe availability',
      productIcons: [
        {
          itemId: 'Desc_IronPlate_C',
          displayName: 'Iron Plate',
          iconSrc: '/game-icons/Desc_IronPlate_C.png',
        },
      ],
      isConverterResourceRecipe: false,
      details: {
        durationLabel: '6s cycle',
        ingredients: [
          {
            itemId: 'Desc_IngotIron_C',
            displayName: 'Iron Ingot',
            iconSrc: '/game-icons/Desc_IngotIron_C.png',
            amountPerMinuteLabel: '20/min',
          },
        ],
        products: [
          {
            itemId: 'Desc_IronPlate_C',
            displayName: 'Iron Plate',
            iconSrc: '/game-icons/Desc_IronPlate_C.png',
            amountPerMinuteLabel: '10/min',
          },
        ],
      },
    });
    expect(rows.find((row) => row.recipe.id === 'Recipe_MissingMachine_C')?.machineName).toBe(
      'Unknown machine',
    );
    expect(rows.find((row) => row.recipe.id === 'Recipe_MissingMachine_C')).toMatchObject({
      hiddenProductIconCount: 1,
      productIcons: [
        {
          itemId: 'Desc_IronRod_C',
          displayName: 'Iron Rod',
          iconSrc: '/game-icons/Desc_IronRod_C.png',
        },
      ],
    });
  });

  it('marks converter recipes that output raw resources for separate display', () => {
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      machines: {
        ...tinySatisfactoryDataset.machines,
        Build_Converter_C: {
          id: 'Build_Converter_C',
          className: 'Build_Converter_C',
          displayName: 'Converter',
          type: 'variablePowerManufacturer',
          powerRangeMw: { min: 100, max: 400 },
          manufacturingSpeed: 1,
        },
      },
      recipes: {
        ...tinySatisfactoryDataset.recipes,
        Recipe_ConverterIronOre_C: {
          id: 'Recipe_ConverterIronOre_C',
          className: 'Recipe_ConverterIronOre_C',
          displayName: 'Iron Ore (Copper)',
          ingredients: [{ itemId: 'Desc_OreCopper_C', amount: 12 }],
          products: [{ itemId: 'Desc_OreIron_C', amount: 12 }],
          durationSeconds: 6,
          producedIn: ['Build_Converter_C'],
          isAlternate: false,
          isHandCraftOnly: false,
          tags: [],
        },
        Recipe_ConverterIronIngot_C: {
          id: 'Recipe_ConverterIronIngot_C',
          className: 'Recipe_ConverterIronIngot_C',
          displayName: 'Ficsite Ingot (Iron)',
          ingredients: [{ itemId: 'Desc_OreIron_C', amount: 12 }],
          products: [{ itemId: 'Desc_IngotIron_C', amount: 12 }],
          durationSeconds: 6,
          producedIn: ['Build_Converter_C'],
          isAlternate: false,
          isHandCraftOnly: false,
          tags: [],
        },
      },
    };

    const rows = selectRecipeRows(dataset, createProject(), 'iron');

    expect(rows.find((row) => row.recipe.id === 'Recipe_ConverterIronOre_C')).toMatchObject({
      machineName: 'Converter',
      isConverterResourceRecipe: true,
      productIcons: [
        {
          itemId: 'Desc_OreIron_C',
          displayName: 'Iron Ore',
          iconSrc: '/game-icons/Desc_OreIron_C.png',
        },
      ],
    });
    expect(rows.find((row) => row.recipe.id === 'Recipe_ConverterIronIngot_C')).toMatchObject({
      isConverterResourceRecipe: false,
    });
  });

  it('adds machine icon paths to machine usage rows without changing solver output', () => {
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {},
      rawInputs: {},
      externalInputs: {},
      itemFlows: [],
      outputs: {},
      surplus: {},
      machineUsage: [
        {
          recipeId: 'Recipe_ReinforcedIronPlate_C',
          machineId: 'Build_AssemblerMk1_C',
          machineDisplayName: 'Assembler',
          recipeDisplayName: 'Reinforced Iron Plate',
          recipeRatePerMinute: 5,
          machineCount: 1,
          powerMw: 15,
        },
      ],
      powerMw: 15,
      warnings: [],
    };

    expect(selectMachineUsageRows(result)).toEqual([
      {
        usage: result.machineUsage[0],
        machineIconSrc: '/game-icons/Desc_AssemblerMk1_C.png',
      },
    ]);
    expect(selectMachineUsageRows(null)).toEqual([]);
  });

  it('selects completed node ids and non-empty graph notes', () => {
    const project: PlannerProject = {
      ...createProject(),
      buildState: {
        planLocked: false,
        nodeLayoutLocked: false,
        nodeStates: {
          done: { done: true },
          note: { note: 'Check belts' },
          empty: {},
        },
      },
    };

    expect(Array.from(selectCompletedGraphNodeIds(project))).toEqual(['done']);
    expect(selectGraphNodeNotes(project)).toEqual({ note: 'Check belts' });
    expect(Array.from(selectCompletedGraphNodeIds(null))).toEqual([]);
    expect(selectGraphNodeNotes(null)).toEqual({});
  });
});

function createProject(): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [],
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
