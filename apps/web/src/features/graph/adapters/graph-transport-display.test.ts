import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import type { GraphRendererEdge } from '@beltwise/planner-core';
import { buildEdgeTransportDisplay, edgeLabelLines } from './graph-transport-display';

describe('graph transport display', () => {
  it('adds belt and pipe counts from configured max transport tiers', () => {
    const beltDisplay = buildEdgeTransportDisplay(
      fixtureRendererEdge('belt-edge', 'Desc_IronPlate_C', 'Plastic 900/min', 900),
      {
        dataset: transportDataset(),
        displaySettings: {
          maxBeltTier: 5,
          maxPipeTier: 2,
          rateDecimalPlaces: 3,
          showTransportLabels: true,
        },
      },
    );
    const pipeDisplay = buildEdgeTransportDisplay(
      fixtureRendererEdge('pipe-edge', 'Desc_Water_C', 'Water 800/min', 800),
      {
        dataset: transportDataset(),
        displaySettings: {
          maxBeltTier: 5,
          maxPipeTier: 2,
          rateDecimalPlaces: 3,
          showTransportLabels: true,
        },
      },
    );

    expect(beltDisplay.transport).toEqual({
      kind: 'belt',
      lineCount: 2,
      tierLabel: 'Mk.5',
    });
    expect(beltDisplay.labelLines.transportLines).toBe('2x Mk.5 belts');
    expect(pipeDisplay.transport).toEqual({
      kind: 'pipe',
      lineCount: 2,
      tierLabel: 'Mk.2',
    });
    expect(pipeDisplay.labelLines.transportLines).toBe('2x Mk.2 pipes');
  });

  it('keeps at least one transport line and uses singular nouns for one line', () => {
    const display = buildEdgeTransportDisplay(
      fixtureRendererEdge('belt-edge', 'Desc_IronPlate_C', 'Iron Plate 30/min', 30),
      {
        dataset: transportDataset(),
        displaySettings: {
          maxBeltTier: 5,
          maxPipeTier: 2,
          rateDecimalPlaces: 3,
          showTransportLabels: true,
        },
      },
    );

    expect(display.transport).toEqual({
      kind: 'belt',
      lineCount: 1,
      tierLabel: 'Mk.5',
    });
    expect(display.labelLines.transportLines).toBe('1x Mk.5 belt');
  });

  it('can keep transport counts off the visible edge label', () => {
    const display = buildEdgeTransportDisplay(
      fixtureRendererEdge('belt-edge', 'Desc_IronPlate_C', 'Plastic 900/min', 900),
      {
        dataset: transportDataset(),
        displaySettings: {
          maxBeltTier: 6,
          maxPipeTier: 2,
          rateDecimalPlaces: 3,
          showTransportLabels: false,
        },
      },
    );

    expect(display.transport.kind).toBe('belt');
    expect(display.labelLines.transportLines).toBeUndefined();
  });

  it('derives edge label lines from structured edge data and display settings', () => {
    expect(
      edgeLabelLines(
        fixtureRendererEdge(
          'edge',
          'Desc_IronPlate_C',
          'Stale Plate Label 7.333333/min',
          7.333333,
        ),
        {
          dataset: transportDataset(),
          displaySettings: {
            rateDecimalPlaces: 2,
          },
        },
      ),
    ).toEqual({
      itemName: 'Iron Plate',
      amountPerMinute: '7.33/min',
    });
  });

  it('falls back to the item id when dataset display names are missing', () => {
    expect(
      edgeLabelLines(fixtureRendererEdge('edge', 'Desc_Missing_C', 'Stored Label 7/min', 7), {
        dataset: transportDataset(),
        displaySettings: {
          rateDecimalPlaces: 3,
        },
      }),
    ).toEqual({
      itemName: 'Desc_Missing_C',
      amountPerMinute: '7/min',
    });
  });
});

function transportDataset(): GameDataset {
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
  };
}

function fixtureRendererEdge(
  id: string,
  itemId: string,
  label: string,
  amountPerMinute: number,
): GraphRendererEdge {
  return {
    id,
    sourceNodeId: 'source',
    targetNodeId: 'target',
    label,
    data: {
      id,
      sourceNodeId: 'source',
      targetNodeId: 'target',
      itemId,
      label,
      amountPerMinute,
    },
  };
}
