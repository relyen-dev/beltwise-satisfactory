import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  buildProductionGraph,
  createPlannerProject,
  type PlannerProject,
  type ProductionGraphNode,
  type ProductionPlanResult,
  type ProductTarget,
} from '@beltwise/planner-core';
import {
  selectInspectorViewModel,
  type InspectorSelectedNodeViewModel,
} from './planner-inspector.selectors';

const NOW = '2026-05-16T00:00:00.000Z';

describe('planner inspector selectors', () => {
  it('builds a no-selection plan overview', () => {
    const context = createInspectorContext();

    const viewModel = selectInspectorViewModel(
      context.dataset,
      context.project,
      context.result,
      null,
      {},
    );

    expect(viewModel?.mode).toBe('overview');
    expect(viewModel?.overview?.metrics).toEqual([
      { label: 'Solve status', value: 'Optimal', detail: null },
      { label: 'Power', value: '16 MW', detail: null },
      { label: 'Recipes', value: '3', detail: 'active recipe groups' },
      { label: 'Machines', value: '1.8x', detail: 'total constructors, smelters, etc.' },
      { label: 'Raw inputs', value: '2', detail: 'resource types' },
      { label: 'Targets', value: '2', detail: 'configured outputs' },
    ]);
    expect(viewModel?.overview?.targets.map((target) => target.amountLabel)).toEqual([
      '10/min requested',
      '30/min solved',
    ]);
    expect(viewModel?.overview?.topRawInputs.map((row) => row.displayName)).toEqual([
      'Iron Ore',
      'Copper Ore',
    ]);
    expect(viewModel?.overview?.externalInputs).toMatchObject([
      {
        itemId: 'Desc_IngotIron_C',
        displayName: 'Iron Ingot',
        amountPerMinuteLabel: '5/min',
      },
    ]);
    expect(viewModel?.overview?.surplus).toMatchObject([
      {
        itemId: 'Desc_Screw_C',
        displayName: 'Screw',
        amountPerMinuteLabel: '12/min',
      },
    ]);
    expect(viewModel?.overview?.machineSummary).toEqual([
      {
        machineId: 'Build_ConstructorMk1_C',
        machineDisplayName: 'Constructor',
        machineIconSrc: '/game-icons/Desc_ConstructorMk1_C.png',
        machineCountLabel: '1.8x',
        powerLabel: '16 MW',
        recipeGroupCountLabel: '3 recipes',
      },
    ]);
    expect(viewModel?.overview?.machineSummaryTotalCount).toBe(1);
    expect(viewModel?.overview?.hiddenMachineSummaryCount).toBe(0);
  });

  it('summarizes overview machines by type for build planning', () => {
    const context = createInspectorContext();
    const result: ProductionPlanResult = {
      ...context.result,
      machineUsage: [
        ...context.result.machineUsage,
        {
          recipeId: 'Recipe_IronIngot_C',
          machineId: 'Build_SmelterMk1_C',
          machineDisplayName: 'Smelter',
          recipeDisplayName: 'Iron Ingot',
          recipeRatePerMinute: 30,
          machineCount: 1,
          powerMw: 4,
        },
      ],
    };

    const viewModel = selectInspectorViewModel(context.dataset, context.project, result, null, {});

    expect(viewModel?.overview?.machineSummary).toEqual([
      {
        machineId: 'Build_ConstructorMk1_C',
        machineDisplayName: 'Constructor',
        machineIconSrc: '/game-icons/Desc_ConstructorMk1_C.png',
        machineCountLabel: '1.8x',
        powerLabel: '16 MW',
        recipeGroupCountLabel: '3 recipes',
      },
      {
        machineId: 'Build_SmelterMk1_C',
        machineDisplayName: 'Smelter',
        machineIconSrc: '/game-icons/Desc_SmelterMk1_C.png',
        machineCountLabel: '1x',
        powerLabel: '4 MW',
        recipeGroupCountLabel: '1 recipe',
      },
    ]);
    expect(viewModel?.overview?.machineSummaryTotalCount).toBe(2);
    expect(viewModel?.overview?.hiddenMachineSummaryCount).toBe(0);
  });

  it('builds recipe node details with machine, rate, power, ingredients, and products', () => {
    const context = createInspectorContext();
    const node = nodeById(context, 'recipe:Recipe_IronPlate_C');

    const selection = selectSelection(context, node);

    expect(selection.kindLabel).toBe('Recipe');
    expect(selection.metrics).toEqual([
      { label: 'Machine', value: 'Constructor', detail: null },
      { label: 'Machines', value: '1x', detail: null },
      { label: 'Executions', value: '10/min', detail: null },
      { label: 'Power', value: '4 MW', detail: null },
    ]);
    if (selection.details.kind !== 'recipe') {
      throw new Error('Expected recipe details');
    }
    expect(selection.details).toMatchObject({
      recipeName: 'Iron Plate',
      machineName: 'Constructor',
      machineCountLabel: '1x',
      recipeRateLabel: '10/min',
      powerLabel: '4 MW',
    });
    expect(selection.details.inputs).toMatchObject([
      {
        itemId: 'Desc_IngotIron_C',
        displayName: 'Iron Ingot',
        amountPerMinuteLabel: '20/min',
      },
    ]);
    expect(selection.details.outputs).toMatchObject([
      {
        itemId: 'Desc_IronPlate_C',
        displayName: 'Iron Plate',
        amountPerMinuteLabel: '10/min',
      },
    ]);
    expect(selection.warnings.map((warning) => warning.message)).toEqual([
      'Iron Plate recipe is constrained.',
    ]);
  });

  it('builds stable flow keys and endpoint kind labels for duplicate item flows', () => {
    const context = createInspectorContext();
    const result: ProductionPlanResult = {
      ...context.result,
      externalInputs: {
        ...context.result.externalInputs,
        Desc_OreIron_C: 5,
      },
      itemFlows: [
        ...context.result.itemFlows.filter(
          (flow) =>
            !(
              flow.itemId === 'Desc_OreIron_C' &&
              flow.target.kind === 'recipe' &&
              flow.target.id === 'Recipe_IronPlate_C'
            ),
        ),
        {
          itemId: 'Desc_OreIron_C',
          amountPerMinute: 70,
          source: { kind: 'resource', id: 'Desc_OreIron_C' },
          target: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
        },
        {
          itemId: 'Desc_OreIron_C',
          amountPerMinute: 5,
          source: { kind: 'externalInput', id: 'Desc_OreIron_C' },
          target: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
        },
      ],
    };
    const graph = buildProductionGraph(context.dataset, context.project.targets, result);
    const duplicateContext: InspectorTestContext = {
      ...context,
      result,
      nodes: graph.nodes,
    };

    const selection = selectSelection(
      duplicateContext,
      nodeById(duplicateContext, 'recipe:Recipe_IronPlate_C'),
    );
    const ironOreFlows = selection.incomingFlows.filter((flow) => flow.itemId === 'Desc_OreIron_C');

    expect(new Set(ironOreFlows.map((flow) => flow.flowKey)).size).toBe(2);
    expect(
      ironOreFlows.map((flow) => ({
        flowKey: flow.flowKey,
        endpointKindLabel: flow.endpointKindLabel,
        endpointLabel: flow.endpointLabel,
        amountPerMinuteLabel: flow.amountPerMinuteLabel,
      })),
    ).toEqual([
      {
        flowKey: 'incoming:Desc_OreIron_C:resource:Desc_OreIron_C:recipe:Recipe_IronPlate_C',
        endpointKindLabel: 'Resource',
        endpointLabel: 'Iron Ore',
        amountPerMinuteLabel: '70/min',
      },
      {
        flowKey: 'incoming:Desc_OreIron_C:externalInput:Desc_OreIron_C:recipe:Recipe_IronPlate_C',
        endpointKindLabel: 'External input',
        endpointLabel: 'Iron Ore',
        amountPerMinuteLabel: '5/min',
      },
    ]);
  });

  it('builds resource node details with usage, cap source, and remaining headroom', () => {
    const context = createInspectorContext();
    const node = nodeById(context, 'resource:Desc_OreIron_C');

    const selection = selectSelection(context, node);

    if (selection.details.kind !== 'resource') {
      throw new Error('Expected resource details');
    }
    expect(selection.details.item).toMatchObject({
      itemId: 'Desc_OreIron_C',
      displayName: 'Iron Ore',
      amountPerMinuteLabel: '70/min',
    });
    expect(selection.details.capLabel).toBe('100/min');
    expect(selection.details.capSourceLabel).toBe('Custom cap');
    expect(selection.details.headroomLabel).toBe('30/min');
    expect(selection.warnings.map((warning) => warning.message)).toEqual([
      'Iron Ore usage is near the cap.',
    ]);
  });

  it('builds output node details with target mode and solved amount', () => {
    const context = createInspectorContext();
    const node = nodeById(context, 'output:target-wire');

    const selection = selectSelection(context, node);

    if (selection.details.kind !== 'output') {
      throw new Error('Expected output details');
    }
    expect(selection.details).toMatchObject({
      targetModeLabel: 'Maximize',
      requestedAmountPerMinuteLabel: null,
      solvedAmountPerMinuteLabel: '30/min',
      incomingAmountPerMinuteLabel: '30/min',
    });
  });

  it('adds fuel power potential for fuel output nodes', () => {
    const dataset = datasetWithSinkPoints();
    const targets: ProductTarget[] = [
      {
        id: 'target-coal',
        itemId: 'Desc_Coal_C',
        mode: 'fixed',
        amountPerMinute: 45,
        sortOrder: 0,
      },
    ];
    const project = createPlannerProject({
      id: 'project-fuel',
      name: 'Fuel Factory',
      dataset,
      targets,
      now: NOW,
    });
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {},
      rawInputs: {
        Desc_Coal_C: 45,
      },
      externalInputs: {},
      itemFlows: [
        {
          itemId: 'Desc_Coal_C',
          amountPerMinute: 45,
          source: { kind: 'resource', id: 'Desc_Coal_C' },
          target: { kind: 'output', id: 'target-coal' },
        },
      ],
      outputs: {
        Desc_Coal_C: 45,
      },
      surplus: {},
      machineUsage: [],
      powerMw: 0,
      warnings: [],
    };
    const graph = buildProductionGraph(dataset, targets, result);
    const context: InspectorTestContext = {
      dataset,
      project,
      result,
      nodes: graph.nodes,
    };

    const selection = selectSelection(context, nodeById(context, 'output:target-coal'));

    if (selection.details.kind !== 'output') {
      throw new Error('Expected output details');
    }
    expect(selection.details.fuelPower).toMatchObject({
      generatorName: 'Coal-Powered Generator',
      generatorIcon: {
        src: '/game-icons/Desc_GeneratorCoal_C.png',
        label: 'Coal-Powered Generator',
        kind: 'machine',
      },
      generatorCountLabel: '3x',
      grossPowerLabel: '225 MW',
      fuelPerGeneratorLabel: '15/min each',
      note: 'Gross estimate. Water logistics are not modeled here.',
    });
  });

  it('uses target-specific flows for duplicate output target items', () => {
    const context = createInspectorContext();
    const targets: ProductTarget[] = [
      {
        id: 'target-wire-fixed',
        itemId: 'Desc_Wire_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 0,
      },
      {
        id: 'target-wire-maximize',
        itemId: 'Desc_Wire_C',
        mode: 'maximize',
        sortOrder: 1,
      },
    ];
    const project: PlannerProject = {
      ...context.project,
      targets,
    };
    const result: ProductionPlanResult = {
      ...context.result,
      itemFlows: [
        ...context.result.itemFlows.filter(
          (flow) => flow.target.kind !== 'output' || flow.itemId !== 'Desc_Wire_C',
        ),
        {
          itemId: 'Desc_Wire_C',
          amountPerMinute: 20,
          source: { kind: 'recipe', id: 'Recipe_Wire_C' },
          target: { kind: 'output', id: 'target-wire-fixed' },
        },
        {
          itemId: 'Desc_Wire_C',
          amountPerMinute: 55,
          source: { kind: 'recipe', id: 'Recipe_Wire_C' },
          target: { kind: 'output', id: 'target-wire-maximize' },
        },
      ],
      outputs: {
        ...context.result.outputs,
        Desc_Wire_C: 75,
      },
    };
    const graph = buildProductionGraph(context.dataset, targets, result);
    const duplicateContext: InspectorTestContext = {
      dataset: context.dataset,
      project,
      result,
      nodes: graph.nodes,
    };

    const overview = selectInspectorViewModel(context.dataset, project, result, null, {});
    const selection = selectSelection(
      duplicateContext,
      nodeById(duplicateContext, 'output:target-wire-maximize'),
    );

    expect(overview?.overview?.targets.map((target) => target.amountLabel)).toEqual([
      '20/min requested',
      '55/min solved',
    ]);
    if (selection.details.kind !== 'output') {
      throw new Error('Expected output details');
    }
    expect(selection.details.item.amountPerMinuteLabel).toBe('55/min');
    expect(selection.details).toMatchObject({
      targetModeLabel: 'Maximize',
      solvedAmountPerMinuteLabel: '55/min',
      incomingAmountPerMinuteLabel: '55/min',
    });
  });

  it('builds external input node details with supplied item and rate', () => {
    const context = createInspectorContext();
    const node = nodeById(context, 'external-input:Desc_IngotIron_C');

    const selection = selectSelection(context, node);

    if (selection.details.kind !== 'externalInput') {
      throw new Error('Expected external input details');
    }
    expect(selection.details.item).toMatchObject({
      itemId: 'Desc_IngotIron_C',
      displayName: 'Iron Ingot',
      amountPerMinuteLabel: '5/min',
    });
    expect(selection.details.sourceNote).toBe('Manual supply from another factory.');
    expect(selection.outgoingFlows.map((flow) => flow.endpointLabel)).toEqual(['Iron Plate']);
  });

  it('builds byproduct node details with surplus and potential sink points', () => {
    const context = createInspectorContext();
    const node = nodeById(context, 'byproduct:Desc_Screw_C');

    const selection = selectSelection(context, node);

    if (selection.details.kind !== 'byproduct') {
      throw new Error('Expected byproduct details');
    }
    expect(selection.details.item).toMatchObject({
      itemId: 'Desc_Screw_C',
      displayName: 'Screw',
      amountPerMinuteLabel: '12/min',
    });
    expect(selection.details.sinkPointsPerMinuteLabel).toBe('24/min');
    expect(selection.details.surplusNote).toBe('Unused surplus. Sink routing is not modeled yet.');
  });
});

interface InspectorTestContext {
  dataset: GameDataset;
  project: PlannerProject;
  result: ProductionPlanResult;
  nodes: ProductionGraphNode[];
}

function createInspectorContext(): InspectorTestContext {
  const dataset = datasetWithSinkPoints();
  const targets: ProductTarget[] = [
    {
      id: 'target-plate',
      itemId: 'Desc_IronPlate_C',
      mode: 'fixed',
      amountPerMinute: 10,
      sortOrder: 0,
    },
    {
      id: 'target-wire',
      itemId: 'Desc_Wire_C',
      mode: 'maximize',
      sortOrder: 1,
    },
  ];
  const project = createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset,
    targets,
    now: NOW,
  });
  const projectWithInputs: PlannerProject = {
    ...project,
    resourceOverrides: {
      Desc_OreIron_C: { maxPerMinute: 100 },
    },
    itemInputs: {
      Desc_IngotIron_C: { amountPerMinute: 5 },
    },
  };
  const result: ProductionPlanResult = {
    status: 'optimal',
    recipeRates: {
      Recipe_IronPlate_C: 10,
      Recipe_Screw_C: 3,
      Recipe_Wire_C: 15,
    },
    rawInputs: {
      Desc_OreIron_C: 70,
      Desc_OreCopper_C: 15,
    },
    externalInputs: {
      Desc_IngotIron_C: 5,
    },
    itemFlows: [
      {
        itemId: 'Desc_OreIron_C',
        amountPerMinute: 70,
        source: { kind: 'resource', id: 'Desc_OreIron_C' },
        target: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
      },
      {
        itemId: 'Desc_IngotIron_C',
        amountPerMinute: 5,
        source: { kind: 'externalInput', id: 'Desc_IngotIron_C' },
        target: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
      },
      {
        itemId: 'Desc_IronPlate_C',
        amountPerMinute: 10,
        source: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
        target: { kind: 'output', id: 'target-plate' },
      },
      {
        itemId: 'Desc_OreCopper_C',
        amountPerMinute: 15,
        source: { kind: 'resource', id: 'Desc_OreCopper_C' },
        target: { kind: 'recipe', id: 'Recipe_Wire_C' },
      },
      {
        itemId: 'Desc_Wire_C',
        amountPerMinute: 30,
        source: { kind: 'recipe', id: 'Recipe_Wire_C' },
        target: { kind: 'output', id: 'target-wire' },
      },
      {
        itemId: 'Desc_Screw_C',
        amountPerMinute: 12,
        source: { kind: 'recipe', id: 'Recipe_Screw_C' },
        target: { kind: 'byproduct', id: 'Desc_Screw_C' },
      },
    ],
    outputs: {
      Desc_IronPlate_C: 10,
      Desc_Wire_C: 30,
    },
    surplus: {
      Desc_Screw_C: 12,
    },
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
        powerMw: 10,
      },
    ],
    powerMw: 16,
    warnings: [
      {
        code: 'recipe-constrained',
        message: 'Iron Plate recipe is constrained.',
        recipeId: 'Recipe_IronPlate_C',
      },
      {
        code: 'resource-near-cap',
        message: 'Iron Ore usage is near the cap.',
        itemId: 'Desc_OreIron_C',
      },
    ],
  };
  const graph = buildProductionGraph(dataset, projectWithInputs.targets, result);

  return {
    dataset,
    project: projectWithInputs,
    result,
    nodes: graph.nodes,
  };
}

function datasetWithSinkPoints(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Screw_C: {
        ...tinySatisfactoryDataset.items['Desc_Screw_C']!,
        sinkPoints: 2,
      },
      Desc_Coal_C: {
        id: 'Desc_Coal_C',
        className: 'Desc_Coal_C',
        displayName: 'Coal',
        form: 'solid',
        energyValue: 300,
      },
    },
  };
}

function nodeById(context: InspectorTestContext, nodeId: string): ProductionGraphNode {
  const node = context.nodes.find((candidate) => candidate.id === nodeId);
  expect(node).toBeDefined();
  if (!node) {
    throw new Error(`Missing node ${nodeId}`);
  }
  return node;
}

function selectSelection(
  context: InspectorTestContext,
  node: ProductionGraphNode,
): InspectorSelectedNodeViewModel {
  const viewModel = selectInspectorViewModel(
    context.dataset,
    context.project,
    context.result,
    node,
    {
      done: true,
      note: 'Build this soon',
    },
  );
  expect(viewModel?.mode).toBe('selected');
  expect(viewModel?.selection).toBeDefined();
  if (!viewModel?.selection) {
    throw new Error('Expected selected node view model');
  }
  return viewModel.selection;
}
