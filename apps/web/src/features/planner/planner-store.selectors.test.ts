import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import { createPlannerProject, type PlannerProject } from '@beltwise/planner-core';
import {
  selectCompletedGraphNodeIds,
  selectExternalInputRows,
  selectGraphNodeNotes,
  selectItemOptions,
  selectMachineRows,
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
      isCustom: true,
      capInputValue: 120,
      baselineCapLabel: '600/min',
      effectiveCapLabel: '0/min',
    });
    expect(copperOre).toMatchObject({
      enabled: true,
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
    expect(rows.find((row) => row.machine.id === 'Build_ConstructorMk1_C')?.enabled).toBe(false);
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
          products: [{ itemId: 'Desc_IronRod_C', amount: 1 }],
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
    });
    expect(rows.find((row) => row.recipe.id === 'Recipe_MissingMachine_C')?.machineName).toBe(
      'Unknown machine',
    );
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
