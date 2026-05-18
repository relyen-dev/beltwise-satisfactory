import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  applyGraphLayout,
  buildProductionGraph,
  toGraphPresentationModel,
  type GraphPresentationModel,
  type ProductionGraph,
  type ProductionPlanResult,
  type ProductTarget,
} from '@beltwise/planner-core';

describe('production graph conversion', () => {
  it('keeps empty solved plans as empty graph models', () => {
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {},
      rawInputs: {},
      externalInputs: {},
      outputs: {},
      surplus: {},
      powerMw: 0,
      warnings: [],
      machineUsage: [],
      itemFlows: [],
    };

    const graph = buildProductionGraph(tinySatisfactoryDataset, [], result);
    const renderer = toGraphPresentationModel(graph);

    expect(graph).toEqual({ nodes: [], edges: [] });
    expect(renderer).toEqual({ nodes: [], edges: [] });
  });

  it('creates stable recipe, resource, and per-target output nodes', () => {
    const targets: ProductTarget[] = [
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
    ];
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {
        Recipe_IronIngot_C: 70,
        Recipe_IronPlate_C: 25,
        Recipe_IronRod_C: 20,
      },
      rawInputs: { Desc_OreIron_C: 70 },
      outputs: {
        Desc_IronPlate_C: 25,
        Desc_IronRod_C: 20,
      },
      surplus: {},
      powerMw: 22,
      warnings: [],
      machineUsage: [
        {
          recipeId: 'Recipe_IronPlate_C',
          machineId: 'Build_ConstructorMk1_C',
          machineDisplayName: 'Constructor',
          recipeDisplayName: 'Iron Plate',
          recipeRatePerMinute: 25,
          machineCount: 2.5,
          powerMw: 10,
        },
      ],
      itemFlows: [
        {
          itemId: 'Desc_OreIron_C',
          amountPerMinute: 70,
          source: { kind: 'resource', id: 'Desc_OreIron_C' },
          target: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
        },
        {
          itemId: 'Desc_IronPlate_C',
          amountPerMinute: 25,
          source: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
          target: { kind: 'output', id: 'target-plate' },
        },
      ],
    };

    const graph = buildProductionGraph(tinySatisfactoryDataset, targets, result);
    const renderer = applyGraphLayout(toGraphPresentationModel(graph), {
      nodePositions: {
        'recipe:Recipe_IronPlate_C': { x: 123, y: 456 },
      },
    });

    expect(graph.nodes.map((node) => node.id)).toContain('output:target-plate');
    expect(graph.nodes.map((node) => node.id)).toContain('output:target-rod');
    expect(graph.nodes.find((node) => node.id === 'output:target-plate')).toMatchObject({
      targetId: 'target-plate',
      targetMode: 'fixed',
      amountPerMinute: 25,
    });
    expect(graph.nodes.find((node) => node.id === 'recipe:Recipe_IronPlate_C')?.subtitle).toContain(
      'Constructor',
    );
    expect(
      renderer.nodes.find((node) => node.id === 'recipe:Recipe_IronPlate_C')?.position,
    ).toEqual({
      x: 123,
      y: 456,
    });
  });

  it('formats per-minute graph rates with up to three decimals', () => {
    const targets: ProductTarget[] = [
      {
        id: 'target-ore',
        itemId: 'Desc_OreIron_C',
        mode: 'fixed',
        amountPerMinute: 0.7114,
        sortOrder: 0,
      },
    ];
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {
        Recipe_IronIngot_C: 1,
      },
      rawInputs: { Desc_OreIron_C: 0.7114 },
      outputs: {
        Desc_OreIron_C: 0.7114,
      },
      surplus: {
        Desc_IronRod_C: 6.7894,
      },
      powerMw: 0,
      warnings: [],
      machineUsage: [
        {
          recipeId: 'Recipe_IronIngot_C',
          machineId: 'Build_SmelterMk1_C',
          machineDisplayName: 'Smelter',
          recipeDisplayName: 'Iron Ingot',
          recipeRatePerMinute: 1,
          machineCount: 2.9634,
          powerMw: 12,
        },
      ],
      itemFlows: [
        {
          itemId: 'Desc_OreIron_C',
          amountPerMinute: 0.7114,
          source: { kind: 'resource', id: 'Desc_OreIron_C' },
          target: { kind: 'output', id: 'target-ore' },
        },
      ],
    };

    const graph = buildProductionGraph(tinySatisfactoryDataset, targets, result);

    expect(graph.nodes.find((node) => node.id === 'resource:Desc_OreIron_C')?.subtitle).toBe(
      '0.711/min input',
    );
    expect(graph.nodes.find((node) => node.id === 'output:target-ore')?.subtitle).toBe(
      '0.711/min target',
    );
    expect(graph.nodes.find((node) => node.id === 'byproduct:Desc_IronRod_C')?.subtitle).toBe(
      '6.789/min surplus',
    );
    expect(graph.nodes.find((node) => node.id === 'recipe:Recipe_IronIngot_C')?.subtitle).toBe(
      '2.963x Smelter',
    );
    expect(graph.edges[0]?.label).toBe('Iron Ore 0.711/min');

    const oneDecimalGraph = buildProductionGraph(tinySatisfactoryDataset, targets, result, {
      rateDecimalPlaces: 1,
    });
    expect(oneDecimalGraph.edges[0]?.label).toBe('Iron Ore 0.7/min');
    expect(
      oneDecimalGraph.nodes.find((node) => node.id === 'recipe:Recipe_IronIngot_C')?.subtitle,
    ).toBe('3x Smelter');
  });

  it('builds renderer-neutral graph presentation data with supplied positions', () => {
    const graph: ProductionGraph = {
      nodes: [
        {
          id: 'resource:Desc_OreIron_C',
          kind: 'resource',
          label: 'Iron Ore',
          subtitle: '45/min input',
        },
        {
          id: 'output:target-plate',
          kind: 'output',
          label: 'Iron Plate',
          subtitle: '30/min target',
        },
      ],
      edges: [
        {
          id: 'resource:Desc_OreIron_C->output:target-plate:Desc_OreIron_C',
          sourceNodeId: 'resource:Desc_OreIron_C',
          targetNodeId: 'output:target-plate',
          itemId: 'Desc_OreIron_C',
          label: 'Iron Ore 45/min',
          amountPerMinute: 45,
        },
      ],
    };

    const renderer = toGraphPresentationModel(graph, {
      'output:target-plate': { x: 320, y: 48 },
    });

    expect(nodePosition(renderer, 'resource:Desc_OreIron_C')).toEqual({ x: 48, y: 48 });
    expect(nodePosition(renderer, 'output:target-plate')).toEqual({ x: 320, y: 48 });
    expect(renderer.nodes[0]?.size).toEqual({ width: 220, height: 104 });
    expect(renderer.edges[0]).toMatchObject({
      sourceNodeId: 'resource:Desc_OreIron_C',
      targetNodeId: 'output:target-plate',
      label: 'Iron Ore 45/min',
    });
  });

  it('overlays saved layout state without mutating default presentation positions', () => {
    const graph: ProductionGraph = {
      nodes: [
        {
          id: 'resource:Desc_OreIron_C',
          kind: 'resource',
          label: 'Iron Ore',
          subtitle: '45/min input',
        },
        {
          id: 'recipe:Recipe_IronIngot_C',
          kind: 'recipe',
          label: 'Iron Ingot',
          subtitle: '1.5x Smelter',
        },
        {
          id: 'output:target-ingot',
          kind: 'output',
          label: 'Iron Ingot',
          subtitle: '45/min target',
        },
      ],
      edges: [
        {
          id: 'resource:Desc_OreIron_C->recipe:Recipe_IronIngot_C:Desc_OreIron_C',
          sourceNodeId: 'resource:Desc_OreIron_C',
          targetNodeId: 'recipe:Recipe_IronIngot_C',
          itemId: 'Desc_OreIron_C',
          label: 'Iron Ore 45/min',
          amountPerMinute: 45,
        },
        {
          id: 'recipe:Recipe_IronIngot_C->output:target-ingot:Desc_IngotIron_C',
          sourceNodeId: 'recipe:Recipe_IronIngot_C',
          targetNodeId: 'output:target-ingot',
          itemId: 'Desc_IngotIron_C',
          label: 'Iron Ingot 45/min',
          amountPerMinute: 45,
        },
      ],
    };

    const defaultRenderer = toGraphPresentationModel(graph, {
      'resource:Desc_OreIron_C': { x: 48, y: 48 },
      'recipe:Recipe_IronIngot_C': { x: 416, y: 48 },
      'output:target-ingot': { x: 784, y: 48 },
    });
    const repeatedDefaultRenderer = toGraphPresentationModel(graph, {
      'resource:Desc_OreIron_C': { x: 48, y: 48 },
      'recipe:Recipe_IronIngot_C': { x: 416, y: 48 },
      'output:target-ingot': { x: 784, y: 48 },
    });
    const manualRenderer = applyGraphLayout(defaultRenderer, {
      nodePositions: {
        'recipe:Recipe_IronIngot_C': { x: 999, y: 123 },
      },
    });

    expect(defaultRenderer).toEqual(repeatedDefaultRenderer);
    expect(nodePosition(manualRenderer, 'recipe:Recipe_IronIngot_C')).toEqual({
      x: 999,
      y: 123,
    });
    expect(nodePosition(defaultRenderer, 'recipe:Recipe_IronIngot_C')).toEqual(
      nodePosition(repeatedDefaultRenderer, 'recipe:Recipe_IronIngot_C'),
    );
    expect(nodePosition(defaultRenderer, 'recipe:Recipe_IronIngot_C')).not.toEqual({
      x: 999,
      y: 123,
    });
  });

  it('maps consumed external inputs to distinct source nodes', () => {
    const targets: ProductTarget[] = [
      {
        id: 'target-plate',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 25,
        sortOrder: 0,
      },
    ];
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {
        Recipe_IronPlate_C: 25,
      },
      rawInputs: {},
      externalInputs: {
        Desc_IngotIron_C: 50,
      },
      outputs: {
        Desc_IronPlate_C: 25,
      },
      surplus: {},
      powerMw: 10,
      warnings: [],
      machineUsage: [
        {
          recipeId: 'Recipe_IronPlate_C',
          machineId: 'Build_ConstructorMk1_C',
          machineDisplayName: 'Constructor',
          recipeDisplayName: 'Iron Plate',
          recipeRatePerMinute: 25,
          machineCount: 2.5,
          powerMw: 10,
        },
      ],
      itemFlows: [
        {
          itemId: 'Desc_IngotIron_C',
          amountPerMinute: 50,
          source: { kind: 'externalInput', id: 'Desc_IngotIron_C' },
          target: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
        },
        {
          itemId: 'Desc_IronPlate_C',
          amountPerMinute: 25,
          source: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
          target: { kind: 'output', id: 'target-plate' },
        },
      ],
    };

    const graph = buildProductionGraph(tinySatisfactoryDataset, targets, result);

    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: 'external-input:Desc_IngotIron_C',
        kind: 'externalInput',
        label: 'Iron Ingot',
      }),
    );
    expect(graph.edges.map((edge) => edge.sourceNodeId)).toContain(
      'external-input:Desc_IngotIron_C',
    );
  });
});

function nodePosition(renderer: GraphPresentationModel, nodeId: string): { x: number; y: number } {
  const node = renderer.nodes.find((candidate) => candidate.id === nodeId);
  expect(node).toBeDefined();

  return node?.position ?? { x: Number.NaN, y: Number.NaN };
}
