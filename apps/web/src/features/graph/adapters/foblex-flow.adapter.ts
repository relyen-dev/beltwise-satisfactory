import type { GameDataset } from '@beltwise/game-data';
import type {
  GraphDisplaySettings,
  GraphEdgeStyle,
  GraphRendererEdge,
  GraphRendererModel,
  GraphRendererNode,
} from '@beltwise/planner-core';
import { EFConnectionBehavior, EFConnectionConnectableSide } from '@foblex/flow';
import {
  FOBLEX_CURVED_EDGE_CONNECTION_TYPE,
  FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE,
  FOBLEX_STRAIGHT_EDGE_CONNECTION_TYPE,
  type BeltwiseFoblexConnectionType,
} from './foblex-connection-builders';
import { buildNodeTooltip, type BeltwiseFoblexNodeTooltip } from './graph-tooltip.presenter';
import {
  buildEdgeTransportDisplay,
  type BeltwiseFoblexEdgeLabelLines,
  type BeltwiseFoblexEdgeTransport,
} from './graph-transport-display';

export {
  FOBLEX_CONNECTION_BUILDERS,
  FOBLEX_CURVED_EDGE_CONNECTION_TYPE,
  FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE,
  FOBLEX_STRAIGHT_EDGE_CONNECTION_TYPE,
} from './foblex-connection-builders';
export type { BeltwiseFoblexConnectionType } from './foblex-connection-builders';
export type { BeltwiseFoblexNodeTooltip } from './graph-tooltip.presenter';
export type {
  BeltwiseFoblexEdgeLabelLines,
  BeltwiseFoblexEdgeTransport,
} from './graph-transport-display';

export interface BeltwiseFoblexFlowModel extends Omit<GraphRendererModel, 'nodes' | 'edges'> {
  nodes: BeltwiseFoblexFlowNode[];
  edges: BeltwiseFoblexFlowEdge[];
}

export interface BeltwiseFoblexFlowNode extends GraphRendererNode {
  loopbacks: BeltwiseFoblexEdgeLabelLines[];
  tooltip: BeltwiseFoblexNodeTooltip | null;
}

export interface BeltwiseFoblexFlowEdge extends GraphRendererEdge {
  connectionType: BeltwiseFoblexConnectionType;
  connectionBehavior: EFConnectionBehavior;
  outputSide: EFConnectionConnectableSide;
  inputSide: EFConnectionConnectableSide;
  labelLines: BeltwiseFoblexEdgeLabelLines;
  labelPosition: number;
  labelOffset: number;
  transport: BeltwiseFoblexEdgeTransport;
}

export interface FoblexFlowModelOptions {
  dataset: GameDataset | null;
  displaySettings: GraphDisplaySettings;
}

export const FOBLEX_EDGE_CONNECTION_BEHAVIOR = EFConnectionBehavior.FLOATING;
export const FOBLEX_EDGE_LABEL_POSITION = 0.5;
export const FOBLEX_RECIPROCAL_EDGE_LABEL_POSITION = 0.42;
export const FOBLEX_EDGE_LABEL_OFFSET = -8;
export const FOBLEX_RECIPROCAL_EDGE_LABEL_MIN_OFFSET = 4;
export const FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET = 28;

const RECIPROCAL_EDGE_LABEL_CLOSE_GAP_PX = 100;
const RECIPROCAL_EDGE_LABEL_FAR_GAP_PX = 420;

export function toFoblexFlowModel(
  model: GraphRendererModel,
  options: FoblexFlowModelOptions,
): BeltwiseFoblexFlowModel {
  const edges = toFoblexFlowEdges(model, options);
  return {
    ...model,
    nodes: toFoblexFlowNodes(model, edges, options.displaySettings),
    edges: edges.filter((edge) => !isSelfLoopEdge(edge)),
  };
}

export function foblexInputId(nodeId: string): string {
  return `${nodeId}:input`;
}

export function foblexOutputId(nodeId: string): string {
  return `${nodeId}:output`;
}

function toFoblexFlowNodes(
  model: GraphRendererModel,
  edges: BeltwiseFoblexFlowEdge[],
  displaySettings: GraphDisplaySettings,
): BeltwiseFoblexFlowNode[] {
  const loopbacksByNodeId = loopbackLinesByNodeId(edges);

  return model.nodes.map((node) => ({
    ...node,
    loopbacks: loopbacksByNodeId.get(node.id) ?? [],
    tooltip: buildNodeTooltip(node, edges, displaySettings),
  }));
}

function toFoblexFlowEdges(
  model: GraphRendererModel,
  options: FoblexFlowModelOptions,
): BeltwiseFoblexFlowEdge[] {
  const nodesById = new Map(model.nodes.map((node) => [node.id, node]));
  const edgeKeys = new Set(
    model.edges.map((edge) => edgeKey(edge.sourceNodeId, edge.targetNodeId)),
  );

  return model.edges.map((edge) => {
    const isReciprocal = edgeKeys.has(edgeKey(edge.targetNodeId, edge.sourceNodeId));
    const { transport, labelLines } = buildEdgeTransportDisplay(edge, options);
    const connectionType = edgeConnectionType(options.displaySettings.edgeStyle, isReciprocal);
    const sides = edgeConnectionSides(options.displaySettings.edgeStyle, isReciprocal);

    return {
      ...edge,
      connectionType,
      connectionBehavior: FOBLEX_EDGE_CONNECTION_BEHAVIOR,
      outputSide: sides.outputSide,
      inputSide: sides.inputSide,
      labelLines,
      labelPosition: isReciprocal
        ? FOBLEX_RECIPROCAL_EDGE_LABEL_POSITION
        : FOBLEX_EDGE_LABEL_POSITION,
      labelOffset: edgeLabelOffset(edge, nodesById, isReciprocal),
      transport,
    };
  });
}

function loopbackLinesByNodeId(
  edges: readonly BeltwiseFoblexFlowEdge[],
): ReadonlyMap<string, BeltwiseFoblexEdgeLabelLines[]> {
  const loopbacksByNodeId = new Map<string, BeltwiseFoblexEdgeLabelLines[]>();

  for (const edge of edges) {
    if (!isSelfLoopEdge(edge)) {
      continue;
    }

    const loopbacks = loopbacksByNodeId.get(edge.sourceNodeId) ?? [];
    loopbacks.push(edge.labelLines);
    loopbacksByNodeId.set(edge.sourceNodeId, loopbacks);
  }

  return loopbacksByNodeId;
}

function isSelfLoopEdge(edge: Pick<GraphRendererEdge, 'sourceNodeId' | 'targetNodeId'>): boolean {
  return edge.sourceNodeId === edge.targetNodeId;
}

function edgeLabelOffset(
  edge: GraphRendererEdge,
  nodesById: ReadonlyMap<string, GraphRendererNode>,
  isReciprocal: boolean,
): number {
  if (!isReciprocal) {
    return FOBLEX_EDGE_LABEL_OFFSET;
  }

  return reciprocalEdgeLabelOffset(edge, nodesById);
}

function reciprocalEdgeLabelOffset(
  edge: GraphRendererEdge,
  nodesById: ReadonlyMap<string, GraphRendererNode>,
): number {
  const sourceNode = nodesById.get(edge.sourceNodeId);
  const targetNode = nodesById.get(edge.targetNodeId);
  if (!sourceNode || !targetNode) {
    return FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET;
  }

  const gap = rectClearGap(sourceNode, targetNode);
  const farProgress = clamp(
    (gap - RECIPROCAL_EDGE_LABEL_CLOSE_GAP_PX) /
      (RECIPROCAL_EDGE_LABEL_FAR_GAP_PX - RECIPROCAL_EDGE_LABEL_CLOSE_GAP_PX),
    0,
    1,
  );

  return roundToTenth(
    FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET -
      (FOBLEX_RECIPROCAL_EDGE_LABEL_MAX_OFFSET - FOBLEX_RECIPROCAL_EDGE_LABEL_MIN_OFFSET) *
        farProgress,
  );
}

interface EdgeConnectionSides {
  outputSide: EFConnectionConnectableSide;
  inputSide: EFConnectionConnectableSide;
}

function edgeConnectionType(
  edgeStyle: GraphEdgeStyle,
  isReciprocal: boolean,
): BeltwiseFoblexConnectionType {
  if (isReciprocal) {
    return FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE;
  }
  return edgeStyle === 'curved'
    ? FOBLEX_CURVED_EDGE_CONNECTION_TYPE
    : FOBLEX_STRAIGHT_EDGE_CONNECTION_TYPE;
}

function edgeConnectionSides(
  edgeStyle: GraphEdgeStyle,
  isReciprocal: boolean,
): EdgeConnectionSides {
  if (edgeStyle !== 'curved' || isReciprocal) {
    return defaultEdgeConnectionSides();
  }

  return {
    outputSide: EFConnectionConnectableSide.CALCULATE,
    inputSide: EFConnectionConnectableSide.CALCULATE,
  };
}

function defaultEdgeConnectionSides(): EdgeConnectionSides {
  return {
    outputSide: EFConnectionConnectableSide.DEFAULT,
    inputSide: EFConnectionConnectableSide.DEFAULT,
  };
}

function rectClearGap(fromNode: GraphRendererNode, toNode: GraphRendererNode): number {
  const fromSize = fromNode.size ?? { width: 0, height: 0 };
  const toSize = toNode.size ?? { width: 0, height: 0 };
  const fromCenter = nodeCenter(fromNode, fromSize);
  const toCenter = nodeCenter(toNode, toSize);
  const deltaX = toCenter.x - fromCenter.x;
  const deltaY = toCenter.y - fromCenter.y;
  const centerDistance = Math.hypot(deltaX, deltaY);
  if (centerDistance === 0) {
    return 0;
  }

  const directionX = deltaX / centerDistance;
  const directionY = deltaY / centerDistance;
  const fromProjection =
    (Math.abs(directionX) * fromSize.width) / 2 + (Math.abs(directionY) * fromSize.height) / 2;
  const toProjection =
    (Math.abs(directionX) * toSize.width) / 2 + (Math.abs(directionY) * toSize.height) / 2;

  return Math.max(0, centerDistance - fromProjection - toProjection);
}

function nodeCenter(
  node: GraphRendererNode,
  size: NonNullable<GraphRendererNode['size']>,
): { x: number; y: number } {
  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
}

function edgeKey(sourceNodeId: string, targetNodeId: string): string {
  return `${sourceNodeId}\u0000${targetNodeId}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
