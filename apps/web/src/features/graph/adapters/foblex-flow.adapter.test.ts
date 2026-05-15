import '@angular/compiler';
import { describe, expect, it } from 'vitest';
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

  it('maps curved edges to perpendicular curves with node-rectangle side hints', () => {
    const model: GraphRendererModel = {
      nodes: [
        fixtureRendererNode('source', { x: 0, y: 220 }),
        fixtureRendererNode('target', { x: 700, y: -280 }),
      ],
      edges: [fixtureRendererEdge('edge', 'source', 'target')],
    };

    const flowModel = toFoblexFlowModel(model, modelOptions('curved'));

    expect(flowModel.edges[0]?.connectionType).toBe(FOBLEX_CURVED_EDGE_CONNECTION_TYPE);
    expect(flowModel.edges[0]?.outputSide).toBe(EFConnectionConnectableSide.TOP);
    expect(flowModel.edges[0]?.inputSide).toBe(EFConnectionConnectableSide.BOTTOM);
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
    expect(flowModel.edges.map((edge) => edge.outputSide)).toEqual([
      EFConnectionConnectableSide.DEFAULT,
      EFConnectionConnectableSide.DEFAULT,
    ]);
  });
});

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
