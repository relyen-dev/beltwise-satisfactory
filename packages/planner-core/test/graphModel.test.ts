import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  applyGraphLayout,
  buildProductionGraph,
  toDefaultGraphRendererModel,
  toGraphRendererModel,
  type GraphRendererModel,
  type ProductionGraph,
  type ProductionPlanResult,
  type ProductTarget
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
      itemFlows: []
    };

    const graph = buildProductionGraph(tinySatisfactoryDataset, [], result);
    const renderer = toGraphRendererModel(graph, { nodePositions: {} });

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
        sortOrder: 0
      },
      {
        id: 'target-rod',
        itemId: 'Desc_IronRod_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 1
      }
    ];
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {
        Recipe_IronIngot_C: 70,
        Recipe_IronPlate_C: 25,
        Recipe_IronRod_C: 20
      },
      rawInputs: { Desc_OreIron_C: 70 },
      outputs: {
        Desc_IronPlate_C: 25,
        Desc_IronRod_C: 20
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
          powerMw: 10
        }
      ],
      itemFlows: [
        {
          itemId: 'Desc_OreIron_C',
          amountPerMinute: 70,
          source: { kind: 'resource', id: 'Desc_OreIron_C' },
          target: { kind: 'recipe', id: 'Recipe_IronPlate_C' }
        },
        {
          itemId: 'Desc_IronPlate_C',
          amountPerMinute: 25,
          source: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
          target: { kind: 'output', id: 'target-plate' }
        }
      ]
    };

    const graph = buildProductionGraph(tinySatisfactoryDataset, targets, result);
    const renderer = toGraphRendererModel(graph, {
      nodePositions: {
        'recipe:Recipe_IronPlate_C': { x: 123, y: 456 }
      }
    });

    expect(graph.nodes.map((node) => node.id)).toContain('output:target-plate');
    expect(graph.nodes.map((node) => node.id)).toContain('output:target-rod');
    expect(graph.nodes.find((node) => node.id === 'recipe:Recipe_IronPlate_C')?.subtitle).toContain(
      'Constructor',
    );
    expect(renderer.nodes.find((node) => node.id === 'recipe:Recipe_IronPlate_C')?.position).toEqual({
      x: 123,
      y: 456
    });
  });

  it('formats per-minute graph rates with up to three decimals', () => {
    const targets: ProductTarget[] = [
      {
        id: 'target-ore',
        itemId: 'Desc_OreIron_C',
        mode: 'fixed',
        amountPerMinute: 0.7114,
        sortOrder: 0
      }
    ];
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {
        Recipe_IronIngot_C: 1
      },
      rawInputs: { Desc_OreIron_C: 0.7114 },
      outputs: {
        Desc_OreIron_C: 0.7114
      },
      surplus: {
        Desc_IronRod_C: 6.7894
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
          powerMw: 12
        }
      ],
      itemFlows: [
        {
          itemId: 'Desc_OreIron_C',
          amountPerMinute: 0.7114,
          source: { kind: 'resource', id: 'Desc_OreIron_C' },
          target: { kind: 'output', id: 'target-ore' }
        }
      ]
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

  it('lays out default graph positions by production flow instead of node kind columns', () => {
    const graph: ProductionGraph = {
      nodes: [
        {
          id: 'resource:Desc_OreIron_C',
          kind: 'resource',
          label: 'Iron Ore',
          subtitle: '45/min input'
        },
        {
          id: 'recipe:Recipe_IronIngot_C',
          kind: 'recipe',
          label: 'Iron Ingot',
          subtitle: '1.5x Smelter'
        },
        {
          id: 'recipe:Recipe_IronPlate_C',
          kind: 'recipe',
          label: 'Iron Plate',
          subtitle: '1.5x Constructor'
        },
        {
          id: 'output:target-plate',
          kind: 'output',
          label: 'Iron Plate',
          subtitle: '30/min target'
        }
      ],
      edges: [
        {
          id: 'resource:Desc_OreIron_C->recipe:Recipe_IronIngot_C:Desc_OreIron_C',
          sourceNodeId: 'resource:Desc_OreIron_C',
          targetNodeId: 'recipe:Recipe_IronIngot_C',
          itemId: 'Desc_OreIron_C',
          label: 'Iron Ore 45/min',
          amountPerMinute: 45
        },
        {
          id: 'recipe:Recipe_IronIngot_C->recipe:Recipe_IronPlate_C:Desc_IngotIron_C',
          sourceNodeId: 'recipe:Recipe_IronIngot_C',
          targetNodeId: 'recipe:Recipe_IronPlate_C',
          itemId: 'Desc_IngotIron_C',
          label: 'Iron Ingot 45/min',
          amountPerMinute: 45
        },
        {
          id: 'recipe:Recipe_IronPlate_C->output:target-plate:Desc_IronPlate_C',
          sourceNodeId: 'recipe:Recipe_IronPlate_C',
          targetNodeId: 'output:target-plate',
          itemId: 'Desc_IronPlate_C',
          label: 'Iron Plate 30/min',
          amountPerMinute: 30
        }
      ]
    };

    const renderer = toGraphRendererModel(graph, { nodePositions: {} });
    const resource = nodePosition(renderer, 'resource:Desc_OreIron_C');
    const ingot = nodePosition(renderer, 'recipe:Recipe_IronIngot_C');
    const plate = nodePosition(renderer, 'recipe:Recipe_IronPlate_C');
    const output = nodePosition(renderer, 'output:target-plate');

    expect(resource.x).toBeLessThan(ingot.x);
    expect(ingot.x).toBeLessThan(plate.x);
    expect(plate.x).toBeLessThan(output.x);
  });

  it('keeps default layout stable while overlaying manual positions', () => {
    const graph: ProductionGraph = {
      nodes: [
        {
          id: 'resource:Desc_OreIron_C',
          kind: 'resource',
          label: 'Iron Ore',
          subtitle: '45/min input'
        },
        {
          id: 'recipe:Recipe_IronIngot_C',
          kind: 'recipe',
          label: 'Iron Ingot',
          subtitle: '1.5x Smelter'
        },
        {
          id: 'output:target-ingot',
          kind: 'output',
          label: 'Iron Ingot',
          subtitle: '45/min target'
        }
      ],
      edges: [
        {
          id: 'resource:Desc_OreIron_C->recipe:Recipe_IronIngot_C:Desc_OreIron_C',
          sourceNodeId: 'resource:Desc_OreIron_C',
          targetNodeId: 'recipe:Recipe_IronIngot_C',
          itemId: 'Desc_OreIron_C',
          label: 'Iron Ore 45/min',
          amountPerMinute: 45
        },
        {
          id: 'recipe:Recipe_IronIngot_C->output:target-ingot:Desc_IngotIron_C',
          sourceNodeId: 'recipe:Recipe_IronIngot_C',
          targetNodeId: 'output:target-ingot',
          itemId: 'Desc_IngotIron_C',
          label: 'Iron Ingot 45/min',
          amountPerMinute: 45
        }
      ]
    };

    const defaultRenderer = toDefaultGraphRendererModel(graph);
    const repeatedDefaultRenderer = toDefaultGraphRendererModel(graph);
    const manualRenderer = applyGraphLayout(defaultRenderer, {
      nodePositions: {
        'recipe:Recipe_IronIngot_C': { x: 999, y: 123 }
      }
    });

    expect(defaultRenderer).toEqual(repeatedDefaultRenderer);
    expect(nodePosition(manualRenderer, 'recipe:Recipe_IronIngot_C')).toEqual({
      x: 999,
      y: 123
    });
    expect(nodePosition(defaultRenderer, 'recipe:Recipe_IronIngot_C')).toEqual(
      nodePosition(repeatedDefaultRenderer, 'recipe:Recipe_IronIngot_C'),
    );
    expect(nodePosition(defaultRenderer, 'recipe:Recipe_IronIngot_C')).not.toEqual({
      x: 999,
      y: 123
    });
  });

  it('keeps reciprocal production edges from locking default layout', () => {
    const graph: ProductionGraph = {
      nodes: [
        {
          id: 'resource:fuel',
          kind: 'resource',
          label: 'Fuel',
          subtitle: '800/min input'
        },
        {
          id: 'recipe:plastic',
          kind: 'recipe',
          label: 'Alternate: Recycled Plastic',
          subtitle: '18.889x Refinery'
        },
        {
          id: 'recipe:rubber',
          kind: 'recipe',
          label: 'Alternate: Recycled Rubber',
          subtitle: '7.778x Refinery'
        },
        {
          id: 'output:plastic',
          kind: 'output',
          label: 'Plastic',
          subtitle: '900/min target'
        }
      ],
      edges: [
        {
          id: 'resource:fuel->recipe:plastic:fuel',
          sourceNodeId: 'resource:fuel',
          targetNodeId: 'recipe:plastic',
          itemId: 'Desc_Fuel_C',
          label: 'Fuel 566.67/min',
          amountPerMinute: 566.67
        },
        {
          id: 'recipe:plastic->recipe:rubber:plastic',
          sourceNodeId: 'recipe:plastic',
          targetNodeId: 'recipe:rubber',
          itemId: 'Desc_Plastic_C',
          label: 'Plastic 233.33/min',
          amountPerMinute: 233.33
        },
        {
          id: 'recipe:rubber->recipe:plastic:rubber',
          sourceNodeId: 'recipe:rubber',
          targetNodeId: 'recipe:plastic',
          itemId: 'Desc_Rubber_C',
          label: 'Rubber 466.67/min',
          amountPerMinute: 466.67
        },
        {
          id: 'recipe:plastic->output:plastic:plastic',
          sourceNodeId: 'recipe:plastic',
          targetNodeId: 'output:plastic',
          itemId: 'Desc_Plastic_C',
          label: 'Plastic 900/min',
          amountPerMinute: 900
        }
      ]
    };

    const renderer = toGraphRendererModel(graph, { nodePositions: {} });
    const resource = nodePosition(renderer, 'resource:fuel');
    const plastic = nodePosition(renderer, 'recipe:plastic');
    const output = nodePosition(renderer, 'output:plastic');

    expect(resource.x).toBeLessThan(plastic.x);
    expect(plastic.x).toBeLessThan(output.x);
  });

  it('maps consumed external inputs to distinct source nodes', () => {
    const targets: ProductTarget[] = [
      {
        id: 'target-plate',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 25,
        sortOrder: 0
      }
    ];
    const result: ProductionPlanResult = {
      status: 'optimal',
      recipeRates: {
        Recipe_IronPlate_C: 25
      },
      rawInputs: {},
      externalInputs: {
        Desc_IngotIron_C: 50
      },
      outputs: {
        Desc_IronPlate_C: 25
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
          powerMw: 10
        }
      ],
      itemFlows: [
        {
          itemId: 'Desc_IngotIron_C',
          amountPerMinute: 50,
          source: { kind: 'externalInput', id: 'Desc_IngotIron_C' },
          target: { kind: 'recipe', id: 'Recipe_IronPlate_C' }
        },
        {
          itemId: 'Desc_IronPlate_C',
          amountPerMinute: 25,
          source: { kind: 'recipe', id: 'Recipe_IronPlate_C' },
          target: { kind: 'output', id: 'target-plate' }
        }
      ]
    };

    const graph = buildProductionGraph(tinySatisfactoryDataset, targets, result);

    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: 'external-input:Desc_IngotIron_C',
        kind: 'externalInput',
        label: 'Iron Ingot'
      }),
    );
    expect(graph.edges.map((edge) => edge.sourceNodeId)).toContain('external-input:Desc_IngotIron_C');
  });
});

function nodePosition(renderer: GraphRendererModel, nodeId: string): { x: number; y: number } {
  const node = renderer.nodes.find((candidate) => candidate.id === nodeId);
  expect(node).toBeDefined();

  return node?.position ?? { x: Number.NaN, y: Number.NaN };
}
