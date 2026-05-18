import { describe, expect, it } from 'vitest';
import type { GraphRendererModel, ProductionGraph } from '@beltwise/planner-core';
import { toDefaultGraphRendererModel, toGraphRendererModel } from './production-graph.layout';

describe('production graph Dagre layout', () => {
  it('lays out default graph positions by production flow instead of node kind columns', () => {
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
          id: 'recipe:Recipe_IronPlate_C',
          kind: 'recipe',
          label: 'Iron Plate',
          subtitle: '1.5x Constructor',
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
          id: 'resource:Desc_OreIron_C->recipe:Recipe_IronIngot_C:Desc_OreIron_C',
          sourceNodeId: 'resource:Desc_OreIron_C',
          targetNodeId: 'recipe:Recipe_IronIngot_C',
          itemId: 'Desc_OreIron_C',
          label: 'Iron Ore 45/min',
          amountPerMinute: 45,
        },
        {
          id: 'recipe:Recipe_IronIngot_C->recipe:Recipe_IronPlate_C:Desc_IngotIron_C',
          sourceNodeId: 'recipe:Recipe_IronIngot_C',
          targetNodeId: 'recipe:Recipe_IronPlate_C',
          itemId: 'Desc_IngotIron_C',
          label: 'Iron Ingot 45/min',
          amountPerMinute: 45,
        },
        {
          id: 'recipe:Recipe_IronPlate_C->output:target-plate:Desc_IronPlate_C',
          sourceNodeId: 'recipe:Recipe_IronPlate_C',
          targetNodeId: 'output:target-plate',
          itemId: 'Desc_IronPlate_C',
          label: 'Iron Plate 30/min',
          amountPerMinute: 30,
        },
      ],
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

    const defaultRenderer = toDefaultGraphRendererModel(graph);
    const repeatedDefaultRenderer = toDefaultGraphRendererModel(graph);
    const manualRenderer = toGraphRendererModel(graph, {
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

  it('keeps reciprocal production edges from locking default layout', () => {
    const graph: ProductionGraph = {
      nodes: [
        {
          id: 'resource:fuel',
          kind: 'resource',
          label: 'Fuel',
          subtitle: '800/min input',
        },
        {
          id: 'recipe:plastic',
          kind: 'recipe',
          label: 'Alternate: Recycled Plastic',
          subtitle: '18.889x Refinery',
        },
        {
          id: 'recipe:rubber',
          kind: 'recipe',
          label: 'Alternate: Recycled Rubber',
          subtitle: '7.778x Refinery',
        },
        {
          id: 'output:plastic',
          kind: 'output',
          label: 'Plastic',
          subtitle: '900/min target',
        },
      ],
      edges: [
        {
          id: 'resource:fuel->recipe:plastic:fuel',
          sourceNodeId: 'resource:fuel',
          targetNodeId: 'recipe:plastic',
          itemId: 'Desc_Fuel_C',
          label: 'Fuel 566.67/min',
          amountPerMinute: 566.67,
        },
        {
          id: 'recipe:plastic->recipe:rubber:plastic',
          sourceNodeId: 'recipe:plastic',
          targetNodeId: 'recipe:rubber',
          itemId: 'Desc_Plastic_C',
          label: 'Plastic 233.33/min',
          amountPerMinute: 233.33,
        },
        {
          id: 'recipe:rubber->recipe:plastic:rubber',
          sourceNodeId: 'recipe:rubber',
          targetNodeId: 'recipe:plastic',
          itemId: 'Desc_Rubber_C',
          label: 'Rubber 466.67/min',
          amountPerMinute: 466.67,
        },
        {
          id: 'recipe:plastic->output:plastic:plastic',
          sourceNodeId: 'recipe:plastic',
          targetNodeId: 'output:plastic',
          itemId: 'Desc_Plastic_C',
          label: 'Plastic 900/min',
          amountPerMinute: 900,
        },
      ],
    };

    const renderer = toGraphRendererModel(graph, { nodePositions: {} });
    const resource = nodePosition(renderer, 'resource:fuel');
    const plastic = nodePosition(renderer, 'recipe:plastic');
    const output = nodePosition(renderer, 'output:plastic');

    expect(resource.x).toBeLessThan(plastic.x);
    expect(plastic.x).toBeLessThan(output.x);
  });
});

function nodePosition(renderer: GraphRendererModel, nodeId: string): { x: number; y: number } {
  const node = renderer.nodes.find((candidate) => candidate.id === nodeId);
  expect(node).toBeDefined();

  return node?.position ?? { x: Number.NaN, y: Number.NaN };
}
