import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  buildMachinePanelReport,
  buildPlanOverviewReport,
  buildProductionGraph,
  buildSelectedNodeReport,
  createPlannerProject,
  type PlannerProject,
  type ProductionGraph,
  type ProductionGraphNode,
  type ProductionPlanResult,
  type ProductTarget,
} from '@beltwise/planner-core';

const NOW = '2026-05-18T00:00:00.000Z';

describe('plan report module', () => {
  it('builds overview report facts with target-specific solved amounts and machine summaries', () => {
    const context = createReportContext();
    const overview = buildPlanOverviewReport(
      context.dataset,
      context.project,
      context.result,
      context.graph,
    );

    expect(overview).toMatchObject({
      status: 'optimal',
      powerMw: 16,
      activeRecipeGroupCount: 3,
      totalMachineCount: 1.8,
      totalPhysicalMachineCount: 3,
      rawInputTypeCount: 2,
      targetCount: 2,
      objective: {
        label: 'Resource Efficient',
        hasMaximizeTarget: true,
      },
    });
    expect(
      overview.targets.map((target) => [
        target.targetId,
        target.itemDisplayName,
        target.amountPerMinute,
      ]),
    ).toEqual([
      ['target-plate', 'Iron Plate', 10],
      ['target-wire', 'Wire', 30],
    ]);
    expect(overview.rawInputs.map((row) => row.itemId)).toEqual([
      'Desc_OreCopper_C',
      'Desc_OreIron_C',
    ]);
    expect(overview.machineSummary).toEqual([
      {
        machineId: 'Build_ConstructorMk1_C',
        machineDisplayName: 'Constructor',
        machineCount: 1.8,
        physicalMachineCount: 3,
        powerMw: 16,
        recipeGroupCount: 3,
      },
    ]);
  });

  it('reports visible and stale plan notes without presentation labels', () => {
    const context = createReportContext();
    const project: PlannerProject = {
      ...context.project,
      notes: 'Bring power shards',
      buildState: {
        ...context.project.buildState,
        nodeStates: {
          'recipe:Recipe_IronPlate_C': { note: 'Build on floor 2' },
          'recipe:Recipe_Missing_C': { note: 'Old recipe note' },
        },
      },
    };

    const overview = buildPlanOverviewReport(
      context.dataset,
      project,
      context.result,
      context.graph,
    );

    expect(overview.notes).toEqual({
      hasPlanNote: true,
      planNote: 'Bring power shards',
      visibleNodeNoteCount: 1,
      staleNodeNoteCount: 1,
      nodeNotes: [
        {
          nodeId: 'recipe:Recipe_IronPlate_C',
          label: 'Iron Plate',
          kind: 'recipe',
          note: 'Build on floor 2',
          visible: true,
        },
        {
          nodeId: 'recipe:Recipe_Missing_C',
          label: 'recipe:Recipe_Missing_C',
          kind: null,
          note: 'Old recipe note',
          visible: false,
        },
      ],
    });
  });

  it('leaves draft target presentation labels to app adapters', () => {
    const project = createPlannerProject({
      id: 'project-draft-target',
      name: 'Draft target factory',
      dataset: tinySatisfactoryDataset,
      now: NOW,
      targets: [
        {
          id: 'target-draft',
          itemId: '',
          mode: 'fixed',
          amountPerMinute: 10,
          sortOrder: 0,
        },
      ],
    });

    const overview = buildPlanOverviewReport(tinySatisfactoryDataset, project, null, null);

    expect(overview.targets).toEqual([
      {
        targetId: 'target-draft',
        itemId: '',
        itemDisplayName: null,
        mode: 'fixed',
        amountPerMinute: 10,
      },
    ]);
  });

  it('keeps internal solver details out of overview warnings', () => {
    const context = createReportContext();
    const result: ProductionPlanResult = {
      status: 'infeasible',
      recipeRates: {},
      rawInputs: {},
      externalInputs: {},
      itemFlows: [],
      outputs: {},
      surplus: {},
      machineUsage: [],
      powerMw: 0,
      warnings: [
        {
          code: 'solver-infeasible',
          message: 'raw-resources: HiGHS returned Infeasible.',
        },
      ],
    };

    const overview = buildPlanOverviewReport(context.dataset, context.project, result, null);

    expect(overview.warnings.map((warning) => warning.message)).toEqual([
      'This plan cannot be built with the current recipes, available raw resources, and Inputs.',
    ]);
  });

  it('builds selected resource details with cap source, headroom, flows, and related warnings', () => {
    const context = createReportContext();
    const report = buildSelectedNodeReport(
      context.dataset,
      context.project,
      context.result,
      nodeById(context, 'resource:Desc_OreIron_C'),
    );

    expect(report.icon).toEqual({
      kind: 'item',
      id: 'Desc_OreIron_C',
      label: 'Iron Ore',
    });
    expect(report.outgoingFlows.map((flow) => flow.flowKey)).toEqual([
      'outgoing:Desc_OreIron_C:resource:Desc_OreIron_C:recipe:Recipe_IronPlate_C',
    ]);
    expect(report.warnings.map((warning) => warning.message)).toEqual([
      'Iron Ore usage is near the cap.',
    ]);
    expect(report.details).toMatchObject({
      kind: 'resource',
      item: {
        itemId: 'Desc_OreIron_C',
        displayName: 'Iron Ore',
        amountPerMinute: 70,
        role: 'raw-resource-consumption',
      },
      capPerMinute: 100,
      capSource: 'custom',
      headroomPerMinute: 30,
    });
  });

  it('reports assumed input streams without counting them as raw resources', () => {
    const dataset = datasetWithPowerItems();
    const targets: ProductTarget[] = [
      {
        id: 'target-waste',
        itemId: 'Desc_NuclearWaste_C',
        mode: 'fixed',
        amountPerMinute: 25,
        sortOrder: 0,
      },
    ];
    const project = createPlannerProject({
      id: 'project-assumed-waste',
      name: 'Assumed waste',
      dataset,
      targets,
      now: NOW,
    });
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {},
      rawInputs: {},
      externalInputs: {},
      assumedInputs: {
        Desc_NuclearWaste_C: 25,
      },
      itemFlows: [
        {
          itemId: 'Desc_NuclearWaste_C',
          amountPerMinute: 25,
          source: { kind: 'assumedInput', id: 'Desc_NuclearWaste_C' },
          target: { kind: 'output', id: 'target-waste' },
        },
      ],
      outputs: {
        Desc_NuclearWaste_C: 25,
      },
      surplus: {},
      machineUsage: [],
      powerMw: 0,
      warnings: [],
    };
    const graph = buildProductionGraph(dataset, targets, result);
    const overview = buildPlanOverviewReport(dataset, project, result, graph);
    const selected = buildSelectedNodeReport(
      dataset,
      project,
      result,
      graph.nodes.find((node) => node.id === 'assumed-input:Desc_NuclearWaste_C')!,
    );

    expect(overview.rawInputTypeCount).toBe(0);
    expect(overview.rawInputs).toEqual([]);
    expect(overview.assumedInputs).toEqual([
      {
        itemId: 'Desc_NuclearWaste_C',
        displayName: 'Uranium Waste',
        amountPerMinute: 25,
        role: 'assumed-input-supply',
      },
    ]);
    expect(selected.details).toMatchObject({
      kind: 'assumedInput',
      item: {
        itemId: 'Desc_NuclearWaste_C',
        displayName: 'Uranium Waste',
        amountPerMinute: 25,
        role: 'assumed-input-supply',
      },
      sourceNote:
        'Modeled as supplied nuclear waste. Add this item in Inputs to replace the assumed source.',
    });
  });

  it('uses per-target incoming flow for duplicate maximize output items', () => {
    const context = createReportContext();
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
    const selected = buildSelectedNodeReport(
      context.dataset,
      project,
      result,
      nodeById({ ...context, graph, nodes: graph.nodes }, 'output:target-wire-maximize'),
    );
    const overview = buildPlanOverviewReport(context.dataset, project, result, graph);

    expect(overview.targets.map((target) => target.amountPerMinute)).toEqual([20, 55]);
    expect(selected.details).toMatchObject({
      kind: 'output',
      targetMode: 'maximize',
      solvedAmountPerMinute: 55,
      incomingAmountPerMinute: 55,
      item: {
        itemId: 'Desc_Wire_C',
        amountPerMinute: 55,
      },
    });
  });

  it('reports configured surplus sinks separately from unused surplus', () => {
    const context = createReportContext();
    const project: PlannerProject = {
      ...context.project,
      sinkRules: [
        {
          id: 'sink-screw',
          itemId: 'Desc_Screw_C',
          mode: 'surplus',
          sortOrder: 0,
        },
      ],
    };
    const graph = buildProductionGraph(context.dataset, project.targets, context.result, {
      sinkRules: project.sinkRules,
    });

    const overview = buildPlanOverviewReport(context.dataset, project, context.result, graph);
    const selected = buildSelectedNodeReport(
      context.dataset,
      project,
      context.result,
      graph.nodes.find((node) => node.id === 'sink:Desc_Screw_C')!,
    );

    expect(overview.surplus).toEqual([]);
    expect(overview.sinks).toEqual([
      {
        sinkRuleId: 'sink-screw',
        itemId: 'Desc_Screw_C',
        itemDisplayName: 'Screw',
        amountPerMinute: 12,
        sinkPointsPerMinute: 24,
      },
    ]);
    expect(selected.details).toMatchObject({
      kind: 'sink',
      item: {
        itemId: 'Desc_Screw_C',
        displayName: 'Screw',
        amountPerMinute: 12,
        role: 'sink-consumption',
      },
      sinkRuleId: 'sink-screw',
      sinkPointsPerMinute: 24,
    });
    expect(selected.incomingFlows).toMatchObject([
      {
        flowKey: 'incoming:Desc_Screw_C:recipe:Recipe_Screw_C:sink:Desc_Screw_C',
        endpointKind: 'recipe',
        endpointLabel: 'Screw',
      },
    ]);
  });

  it('adds fuel power estimates and nuclear waste rates to output reports', () => {
    const dataset = datasetWithPowerItems();
    const targets: ProductTarget[] = [
      {
        id: 'target-uranium-rods',
        itemId: 'Desc_NuclearFuelRod_C',
        mode: 'fixed',
        amountPerMinute: 0.4,
        sortOrder: 0,
      },
    ];
    const project = createPlannerProject({
      id: 'project-nuclear',
      name: 'Nuclear Factory',
      dataset,
      targets,
      now: NOW,
    });
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {},
      rawInputs: {},
      externalInputs: {
        Desc_NuclearFuelRod_C: 0.4,
      },
      itemFlows: [
        {
          itemId: 'Desc_NuclearFuelRod_C',
          amountPerMinute: 0.4,
          source: { kind: 'externalInput', id: 'Desc_NuclearFuelRod_C' },
          target: { kind: 'output', id: 'target-uranium-rods' },
        },
      ],
      outputs: {
        Desc_NuclearFuelRod_C: 0.4,
      },
      surplus: {},
      machineUsage: [],
      powerMw: 0,
      warnings: [],
    };
    const graph = buildProductionGraph(dataset, targets, result);

    const selected = buildSelectedNodeReport(
      dataset,
      project,
      result,
      graph.nodes.find((node) => node.id === 'output:target-uranium-rods')!,
    );

    expect(selected.details).toMatchObject({
      kind: 'output',
      fuelPower: {
        generatorId: 'Build_GeneratorNuclear_C',
        generatorCount: 2,
        grossPowerMw: 5000,
        fuelPerGeneratorPerMinute: 0.2,
        noteKind: 'nuclear-byproducts-shown',
        waste: {
          itemId: 'Desc_NuclearWaste_C',
          displayName: 'Uranium Waste',
          amountPerMinute: 20,
          role: 'nuclear-byproduct',
        },
      },
    });
  });

  it('summarizes machine panel totals for null and solved results', () => {
    const context = createReportContext();

    expect(buildMachinePanelReport(null)).toEqual({
      activeRecipeGroupCount: 0,
      usedMachineTypeCount: 0,
      totalMachineCount: 0,
      totalPhysicalMachineCount: 0,
      totalPowerMw: 0,
    });
    expect(buildMachinePanelReport(context.result)).toEqual({
      activeRecipeGroupCount: 3,
      usedMachineTypeCount: 1,
      totalMachineCount: 1.8,
      totalPhysicalMachineCount: 3,
      totalPowerMw: 16,
    });
  });
});

interface ReportTestContext {
  readonly dataset: GameDataset;
  readonly project: PlannerProject;
  readonly result: ProductionPlanResult;
  readonly graph: ProductionGraph;
  readonly nodes: readonly ProductionGraphNode[];
}

function createReportContext(): ReportTestContext {
  const dataset = datasetWithPowerItems();
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
    graph,
    nodes: graph.nodes,
  };
}

function datasetWithPowerItems(): GameDataset {
  return {
    ...tinySatisfactoryDataset,
    items: {
      ...tinySatisfactoryDataset.items,
      Desc_Screw_C: {
        ...tinySatisfactoryDataset.items['Desc_Screw_C']!,
        sinkPoints: 2,
      },
      Desc_NuclearFuelRod_C: {
        id: 'Desc_NuclearFuelRod_C',
        className: 'Desc_NuclearFuelRod_C',
        displayName: 'Uranium Fuel Rod',
        form: 'solid',
        energyValue: 750000,
      },
      Desc_NuclearWaste_C: {
        id: 'Desc_NuclearWaste_C',
        className: 'Desc_NuclearWaste_C',
        displayName: 'Uranium Waste',
        form: 'solid',
      },
      Desc_PlutoniumWaste_C: {
        id: 'Desc_PlutoniumWaste_C',
        className: 'Desc_PlutoniumWaste_C',
        displayName: 'Plutonium Waste',
        form: 'solid',
      },
    },
  };
}

function nodeById(context: ReportTestContext, nodeId: string): ProductionGraphNode {
  const node = context.nodes.find((candidate) => candidate.id === nodeId);
  expect(node).toBeDefined();
  if (!node) {
    throw new Error(`Missing node ${nodeId}`);
  }
  return node;
}
