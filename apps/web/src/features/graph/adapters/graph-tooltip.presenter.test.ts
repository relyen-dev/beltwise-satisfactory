import { describe, expect, it } from 'vitest';
import type { GraphRendererNode } from '@beltwise/planner-core';
import { buildNodeTooltip } from './graph-tooltip.presenter';

describe('graph tooltip presenter', () => {
  it('formats machine stats with the configured rate precision', () => {
    const tooltip = buildNodeTooltip(
      {
        id: 'recipe:rotor',
        kind: 'recipe',
        position: { x: 0, y: 0 },
        data: {
          id: 'recipe:rotor',
          kind: 'recipe',
          label: 'Alternate: Copper Rotor',
          subtitle: '2.963x Assembler',
          recipeId: 'Recipe_Alternate_CopperRotor_C',
          amountPerMinute: 11.1111,
          machineDisplayName: 'Assembler',
          machineCount: 2.96345,
        },
      },
      [],
      { rateDecimalPlaces: 4 },
    );

    expect(tooltip?.stats).toEqual(['2.9634x Assembler', 'Recipe cycles 11.1111/min']);
  });

  it('formats split output machine counts by item share', () => {
    const tooltip = buildNodeTooltip(
      fixtureRendererNode('recipe:plate', 4),
      [
        tooltipEdge('source', 'recipe:plate', 'Desc_IronOre_C', 120),
        tooltipEdge('recipe:plate', 'left-target', 'Desc_IronPlate_C', 30),
        tooltipEdge('recipe:plate', 'right-target', 'Desc_IronPlate_C', 90),
      ],
      { rateDecimalPlaces: 2 },
    );

    expect(tooltip?.inputs).toEqual([
      {
        itemName: 'Iron Ore',
        amountPerMinute: '120/min',
      },
    ]);
    expect(tooltip?.outputs).toEqual([
      {
        itemName: 'Iron Plate',
        amountPerMinute: '30/min',
        machineCount: '1',
      },
      {
        itemName: 'Iron Plate',
        amountPerMinute: '90/min',
        machineCount: '3',
      },
    ]);
  });

  it('keeps loopbacks out of split output machine-count allocation', () => {
    const tooltip = buildNodeTooltip(
      fixtureRendererNode('recipe:plate', 4),
      [
        tooltipEdge('recipe:plate', 'left-target', 'Desc_IronPlate_C', 30),
        tooltipEdge('recipe:plate', 'right-target', 'Desc_IronPlate_C', 90),
        tooltipEdge('recipe:plate', 'recipe:plate', 'Desc_IronPlate_C', 12),
      ],
      { rateDecimalPlaces: 2 },
    );

    expect(tooltip?.outputs).toEqual([
      {
        itemName: 'Iron Plate',
        amountPerMinute: '30/min',
        machineCount: '1',
      },
      {
        itemName: 'Iron Plate',
        amountPerMinute: '90/min',
        machineCount: '3',
      },
    ]);
    expect(tooltip?.loopbacks).toEqual([
      {
        itemName: 'Iron Plate',
        amountPerMinute: '12/min',
      },
    ]);
  });

  it('groups same-node flows as loopbacks instead of inputs or outputs', () => {
    const tooltip = buildNodeTooltip(
      fixtureRendererNode('recipe:plate', 4),
      [tooltipEdge('recipe:plate', 'recipe:plate', 'Desc_IronPlate_C', 5)],
      { rateDecimalPlaces: 2 },
    );

    expect(tooltip?.inputs).toEqual([]);
    expect(tooltip?.outputs).toEqual([]);
    expect(tooltip?.loopbacks).toEqual([
      {
        itemName: 'Iron Plate',
        amountPerMinute: '5/min',
      },
    ]);
  });
});

function fixtureRendererNode(id: string, machineCount: number): GraphRendererNode {
  return {
    id,
    kind: 'recipe',
    position: { x: 0, y: 0 },
    data: {
      id,
      kind: 'recipe',
      label: 'Iron Plate',
      subtitle: 'Constructor',
      amountPerMinute: 30,
      machineDisplayName: 'Constructor',
      machineCount,
    },
  };
}

function tooltipEdge(
  sourceNodeId: string,
  targetNodeId: string,
  itemId: string,
  amountPerMinute: number,
): {
  sourceNodeId: string;
  targetNodeId: string;
  data: {
    itemId: string;
    amountPerMinute: number;
  };
  labelLines: {
    itemName: string;
    amountPerMinute: string;
  };
} {
  const itemName = itemId === 'Desc_IronOre_C' ? 'Iron Ore' : 'Iron Plate';

  return {
    sourceNodeId,
    targetNodeId,
    data: {
      itemId,
      amountPerMinute,
    },
    labelLines: {
      itemName,
      amountPerMinute: `${amountPerMinute}/min`,
    },
  };
}
