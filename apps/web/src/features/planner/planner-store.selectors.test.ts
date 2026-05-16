import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import {
  selectCompletedGraphNodeIds,
  selectExternalInputRows,
  selectGraphNodeNotes,
  selectItemOptions,
  selectMachineRows,
  selectMachineUsageRows,
  selectRecipeRows,
  selectResourceRows,
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
