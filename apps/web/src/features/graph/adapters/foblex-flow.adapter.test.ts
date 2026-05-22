import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import type {
  GraphDisplaySettings,
  GraphEdgeStyle,
  GraphRendererModel,
} from '@beltwise/planner-core';
import { EFConnectionConnectableSide } from '@foblex/flow';
import {
  FOBLEX_CURVED_EDGE_CONNECTION_TYPE,
  FOBLEX_EDGE_LABEL_POSITION,
  FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE,
  FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET,
  FOBLEX_RECIPROCAL_EDGE_LABEL_MIN_OFFSET,
  FOBLEX_RECIPROCAL_EDGE_LABEL_POSITION,
  FOBLEX_STRAIGHT_EDGE_CONNECTION_TYPE,
  toFoblexFlowModel,
} from './foblex-flow.adapter';

describe('toFoblexFlowModel edge style mapping', () => {
  it('maps straight edges to the default Foblex straight connection type', () => {
    const flowModel = toFoblexFlowModel(
      {
        nodes: [],
        edges: [fixtureRendererEdge('edge', 'source', 'target')],
      },
      modelOptions('straight'),
    );

    expect(flowModel.edges[0]?.connectionType).toBe(FOBLEX_STRAIGHT_EDGE_CONNECTION_TYPE);
    expect(flowModel.edges[0]?.labelPosition).toBe(FOBLEX_EDGE_LABEL_POSITION);
  });

  it('maps curved edges to perpendicular curves with live calculated side hints', () => {
    const model: GraphRendererModel = {
      nodes: [
        fixtureRendererNode('source', { x: 0, y: 220 }),
        fixtureRendererNode('target', { x: 700, y: -280 }),
      ],
      edges: [fixtureRendererEdge('edge', 'source', 'target')],
    };

    const flowModel = toFoblexFlowModel(model, modelOptions('curved'));

    expect(flowModel.edges[0]?.connectionType).toBe(FOBLEX_CURVED_EDGE_CONNECTION_TYPE);
    expect(flowModel.edges[0]?.outputSide).toBe(EFConnectionConnectableSide.CALCULATE);
    expect(flowModel.edges[0]?.inputSide).toBe(EFConnectionConnectableSide.CALCULATE);
  });

  it('maps reciprocal edge pairs to reciprocal arcs with reciprocal label positions', () => {
    const flowModel = toFoblexFlowModel(
      {
        nodes: [],
        edges: [
          fixtureRendererEdge('forward-edge', 'source', 'target'),
          fixtureRendererEdge('return-edge', 'target', 'source'),
        ],
      },
      modelOptions('curved'),
    );

    expect(flowModel.edges.map((edge) => edge.connectionType)).toEqual([
      FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE,
      FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE,
    ]);
    expect(flowModel.edges.map((edge) => edge.labelPosition)).toEqual([
      FOBLEX_RECIPROCAL_EDGE_LABEL_POSITION,
      FOBLEX_RECIPROCAL_EDGE_LABEL_POSITION,
    ]);
    expect(flowModel.edges.map((edge) => edge.labelOffset)).toEqual([
      FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET,
      FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET,
    ]);
    expect(flowModel.edges.every((edge) => edge.labelOffset > 0)).toBe(true);
    expect(flowModel.edges.map((edge) => edge.outputSide)).toEqual([
      EFConnectionConnectableSide.DEFAULT,
      EFConnectionConnectableSide.DEFAULT,
    ]);
  });

  it('scales reciprocal label offsets down as node gaps get roomier', () => {
    const closeFlowModel = toFoblexFlowModel(
      {
        nodes: [
          fixtureRendererNode('source', { x: 0, y: 0 }),
          fixtureRendererNode('target', { x: 300, y: 0 }),
        ],
        edges: [
          fixtureRendererEdge('forward-edge', 'source', 'target'),
          fixtureRendererEdge('return-edge', 'target', 'source'),
        ],
      },
      modelOptions('curved'),
    );
    const farFlowModel = toFoblexFlowModel(
      {
        nodes: [
          fixtureRendererNode('source', { x: 0, y: 0 }),
          fixtureRendererNode('target', { x: 720, y: 0 }),
        ],
        edges: [
          fixtureRendererEdge('forward-edge', 'source', 'target'),
          fixtureRendererEdge('return-edge', 'target', 'source'),
        ],
      },
      modelOptions('curved'),
    );

    expect(closeFlowModel.edges.map((edge) => edge.labelOffset)).toEqual([
      FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET,
      FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET,
    ]);
    expect(farFlowModel.edges.map((edge) => edge.labelOffset)).toEqual([
      FOBLEX_RECIPROCAL_EDGE_LABEL_MIN_OFFSET,
      FOBLEX_RECIPROCAL_EDGE_LABEL_MIN_OFFSET,
    ]);
  });
});

describe('toFoblexFlowModel adapter composition', () => {
  it('wires transport labels into node tooltip output split lines', () => {
    const flowModel = toFoblexFlowModel(
      {
        nodes: [fixtureMachineNode('recipe:plate')],
        edges: [
          fixtureRendererEdge('left-edge', 'recipe:plate', 'left-target', 30),
          fixtureRendererEdge('right-edge', 'recipe:plate', 'right-target', 90),
        ],
      },
      {
        dataset: transportDataset(),
        displaySettings: {
          maxBeltTier: 1,
          maxPipeTier: 2,
          rateDecimalPlaces: 2,
          edgeStyle: 'straight',
          showTransportLabels: true,
          animateFlowLines: true,
        },
      },
    );

    expect(flowModel.edges[1]?.labelLines.transportLines).toBe('2x Mk.1 belts');
    expect(flowModel.nodes[0]?.tooltip?.stats).toEqual(['4x Constructor', 'Recipe cycles 30/min']);
    expect(flowModel.nodes[0]?.tooltip?.outputs).toEqual([
      {
        itemName: 'Iron Plate',
        amountPerMinute: '30/min',
        transportLines: '1x Mk.1 belt',
        machineCount: '1',
      },
      {
        itemName: 'Iron Plate',
        amountPerMinute: '90/min',
        transportLines: '2x Mk.1 belts',
        machineCount: '3',
      },
    ]);
  });
});

function transportDataset(): GameDataset {
  return tinySatisfactoryDataset;
}

function modelOptions(edgeStyle: GraphEdgeStyle): {
  dataset: null;
  displaySettings: GraphDisplaySettings;
} {
  return {
    dataset: null,
    displaySettings: {
      maxBeltTier: 6,
      maxPipeTier: 2,
      rateDecimalPlaces: 3,
      edgeStyle,
      showTransportLabels: true,
      animateFlowLines: true,
    },
  };
}

function fixtureMachineNode(id: string): GraphRendererModel['nodes'][number] {
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
      machineCount: 4,
    },
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
  amountPerMinute = 60,
): GraphRendererModel['edges'][number] {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    label: `Iron Plate ${amountPerMinute}/min`,
    data: {
      id,
      sourceNodeId,
      targetNodeId,
      itemId: 'Desc_IronPlate_C',
      label: `Iron Plate ${amountPerMinute}/min`,
      amountPerMinute,
    },
  };
}
