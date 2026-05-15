import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import type { GraphRendererModel } from '@beltwise/planner-core';
import { EFConnectableSide, EFConnectionConnectableSide } from '@foblex/flow';
import {
  FOBLEX_CONNECTION_BUILDERS,
  FOBLEX_CURVED_EDGE_CONNECTION_TYPE,
  toFoblexFlowModel,
} from './foblex-flow.adapter';

describe('toFoblexFlowModel transport display', () => {
  it('adds belt and pipe counts from configured max transport tiers', () => {
    const model = fixtureRendererModel();

    const flowModel = toFoblexFlowModel(model, {
      dataset: transportDataset(),
      displaySettings: {
        maxBeltTier: 5,
        maxPipeTier: 2,
        rateDecimalPlaces: 3,
        edgeStyle: 'straight',
        showTransportLabels: true,
        animateFlowLines: true,
      },
    });

    const beltEdge = flowModel.edges.find((edge) => edge.id === 'belt-edge');
    const pipeEdge = flowModel.edges.find((edge) => edge.id === 'pipe-edge');

    expect(beltEdge?.transport).toEqual({
      kind: 'belt',
      lineCount: 2,
      tierLabel: 'Mk.5',
    });
    expect(beltEdge?.labelLines.transportLines).toBe('2x Mk.5 belts');
    expect(pipeEdge?.transport).toEqual({
      kind: 'pipe',
      lineCount: 2,
      tierLabel: 'Mk.2',
    });
    expect(pipeEdge?.labelLines.transportLines).toBe('2x Mk.2 pipes');
  });

  it('can keep transport counts off the visible edge label', () => {
    const model = fixtureRendererModel();

    const flowModel = toFoblexFlowModel(model, {
      dataset: transportDataset(),
      displaySettings: {
        maxBeltTier: 6,
        maxPipeTier: 2,
        rateDecimalPlaces: 3,
        edgeStyle: 'straight',
        showTransportLabels: false,
        animateFlowLines: false,
      },
    });

    expect(flowModel.edges[0]?.transport.kind).toBe('belt');
    expect(flowModel.edges[0]?.labelLines.transportLines).toBeUndefined();
  });

  it('formats machine multipliers with the configured rate precision', () => {
    const model: GraphRendererModel = {
      nodes: [
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
      ],
      edges: [],
    };

    const flowModel = toFoblexFlowModel(model, {
      dataset: transportDataset(),
      displaySettings: {
        maxBeltTier: 6,
        maxPipeTier: 2,
        rateDecimalPlaces: 4,
        edgeStyle: 'straight',
        showTransportLabels: true,
        animateFlowLines: true,
      },
    });

    expect(flowModel.nodes[0]?.tooltip?.stats).toEqual([
      '2.9634x Assembler',
      'Recipe cycles 11.1111/min',
    ]);
  });

  it('switches normal edges to perpendicular curves for curved edge style', () => {
    const model = fixtureRendererModel();

    const flowModel = toFoblexFlowModel(model, {
      dataset: transportDataset(),
      displaySettings: {
        maxBeltTier: 6,
        maxPipeTier: 2,
        rateDecimalPlaces: 3,
        edgeStyle: 'curved',
        showTransportLabels: true,
        animateFlowLines: true,
      },
    });

    expect(flowModel.edges.map((edge) => edge.connectionType)).toEqual([
      FOBLEX_CURVED_EDGE_CONNECTION_TYPE,
      FOBLEX_CURVED_EDGE_CONNECTION_TYPE,
    ]);
  });

  it('uses node-rectangle side hints for curved edge endpoint tangents', () => {
    const model: GraphRendererModel = {
      nodes: [
        fixtureRendererNode('source', { x: 0, y: 220 }),
        fixtureRendererNode('target', { x: 700, y: -280 }),
      ],
      edges: [fixtureRendererEdge('edge', 'source', 'target')],
    };

    const flowModel = toFoblexFlowModel(model, {
      dataset: transportDataset(),
      displaySettings: {
        maxBeltTier: 6,
        maxPipeTier: 2,
        rateDecimalPlaces: 3,
        edgeStyle: 'curved',
        showTransportLabels: true,
        animateFlowLines: true,
      },
    });

    expect(flowModel.edges[0]?.outputSide).toBe(EFConnectionConnectableSide.TOP);
    expect(flowModel.edges[0]?.inputSide).toBe(EFConnectionConnectableSide.BOTTOM);
  });

  it('builds curved edges as two-segment S curves', () => {
    const builder = FOBLEX_CONNECTION_BUILDERS[FOBLEX_CURVED_EDGE_CONNECTION_TYPE];
    if (!builder) {
      throw new Error('Curved edge builder must be registered');
    }

    const response = builder.handle({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.RIGHT,
      target: { x: 200, y: 100 },
      targetSide: EFConnectableSide.LEFT,
      radius: 0,
      offset: 0,
      waypoints: [],
    });

    expect(response.path.match(/\bC\b/g)).toHaveLength(2);
    expect(response.path).toContain('100 50 C 100 100');
    expect(response.points).toHaveLength(25);
  });

  it('keeps mixed-side curved edges as two-segment S curves', () => {
    const builder = FOBLEX_CONNECTION_BUILDERS[FOBLEX_CURVED_EDGE_CONNECTION_TYPE];
    if (!builder) {
      throw new Error('Curved edge builder must be registered');
    }

    const response = builder.handle({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.RIGHT,
      target: { x: 180, y: 120 },
      targetSide: EFConnectableSide.TOP,
      radius: 0,
      offset: 0,
      waypoints: [],
    });

    expect(response.path.match(/\bC\b/g)).toHaveLength(2);
    expect(response.path).toContain('90 60 C');
    expect(response.points).toHaveLength(25);
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

function fixtureRendererModel(): GraphRendererModel {
  return {
    nodes: [],
    edges: [
      {
        id: 'belt-edge',
        sourceNodeId: 'source',
        targetNodeId: 'target',
        label: 'Plastic 900/min',
        data: {
          id: 'belt-edge',
          sourceNodeId: 'source',
          targetNodeId: 'target',
          itemId: 'Desc_IronPlate_C',
          label: 'Plastic 900/min',
          amountPerMinute: 900,
        },
      },
      {
        id: 'pipe-edge',
        sourceNodeId: 'source',
        targetNodeId: 'target',
        label: 'Water 800/min',
        data: {
          id: 'pipe-edge',
          sourceNodeId: 'source',
          targetNodeId: 'target',
          itemId: 'Desc_Water_C',
          label: 'Water 800/min',
          amountPerMinute: 800,
        },
      },
    ],
  };
}

function fixtureRendererNode(
  id: string,
  position: { x: number; y: number },
): GraphRendererModel['nodes'][number] {
  return {
    id,
    kind: 'recipe',
    position,
    size: { width: 220, height: 104 },
    data: {
      id,
      kind: 'recipe',
      label: id,
      subtitle: 'Constructor',
      amountPerMinute: 1,
    },
  };
}

function fixtureRendererEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
): GraphRendererModel['edges'][number] {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    label: 'Iron Ore 60/min',
    data: {
      id,
      sourceNodeId,
      targetNodeId,
      itemId: 'Desc_IronOre_C',
      label: 'Iron Ore 60/min',
      amountPerMinute: 60,
    },
  };
}
