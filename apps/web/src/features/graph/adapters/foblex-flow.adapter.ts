import type { GameDataset, Item } from '@beltwise/game-data';
import type {
  ConveyorBeltTier,
  GraphEdgeStyle,
  GraphDisplaySettings,
  GraphRendererEdge,
  GraphRendererModel,
  GraphRendererNode,
  PipelineTier,
  RateDecimalPlaces,
} from '@beltwise/planner-core';
import {
  EFConnectionConnectableSide,
  EFConnectionBehavior,
  EFConnectionType,
  EFConnectableSide,
  type IConnectionBuilders,
  type IFConnectionBuilder,
  type IFConnectionBuilderRequest,
  type IFConnectionBuilderResponse,
} from '@foblex/flow';

export interface BeltwiseFoblexFlowModel extends Omit<GraphRendererModel, 'nodes' | 'edges'> {
  nodes: BeltwiseFoblexFlowNode[];
  edges: BeltwiseFoblexFlowEdge[];
}

export interface BeltwiseFoblexFlowNode extends GraphRendererNode {
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

export interface BeltwiseFoblexEdgeLabelLines {
  itemName: string;
  amountPerMinute: string;
  transportLines?: string;
  machineCount?: string;
}

export interface BeltwiseFoblexEdgeTransport {
  kind: 'belt' | 'pipe' | 'none';
  lineCount: number;
  tierLabel: string;
}

export interface BeltwiseFoblexNodeTooltip {
  title: string;
  stats: string[];
  inputs: BeltwiseFoblexEdgeLabelLines[];
  outputs: BeltwiseFoblexEdgeLabelLines[];
}

export const FOBLEX_STRAIGHT_EDGE_CONNECTION_TYPE = EFConnectionType.STRAIGHT;
export const FOBLEX_CURVED_EDGE_CONNECTION_TYPE = 'beltwise-perpendicular-curve';
export const FOBLEX_EDGE_CONNECTION_BEHAVIOR = EFConnectionBehavior.FLOATING;
export const FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE = 'beltwise-reciprocal-arc';
export const FOBLEX_EDGE_LABEL_POSITION = 0.5;
export const FOBLEX_RECIPROCAL_EDGE_LABEL_POSITION = 0.42;
export const FOBLEX_EDGE_LABEL_OFFSET = -8;
export const FOBLEX_RECIPROCAL_EDGE_LABEL_OFFSET = -8;

type BeltwiseFoblexConnectionType =
  | EFConnectionType
  | typeof FOBLEX_CURVED_EDGE_CONNECTION_TYPE
  | typeof FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE;

interface ConnectionPoint {
  x: number;
  y: number;
}

export interface FoblexFlowModelOptions {
  dataset: GameDataset | null;
  displaySettings: GraphDisplaySettings;
}

const BELT_CAPACITY_PER_MINUTE: Record<ConveyorBeltTier, number> = {
  1: 60,
  2: 120,
  3: 270,
  4: 480,
  5: 780,
  6: 1200,
};

const PIPE_CAPACITY_PER_MINUTE: Record<PipelineTier, number> = {
  1: 300,
  2: 600,
};

export function toFoblexFlowModel(
  model: GraphRendererModel,
  options: FoblexFlowModelOptions,
): BeltwiseFoblexFlowModel {
  const edges = toFoblexFlowEdges(model, options);
  return {
    ...model,
    nodes: toFoblexFlowNodes(model, edges, options.displaySettings),
    edges,
  };
}

export function foblexInputId(nodeId: string): string {
  return `${nodeId}:input`;
}

export function foblexOutputId(nodeId: string): string {
  return `${nodeId}:output`;
}

const RECIPROCAL_EDGE_ARC_MIN_OFFSET_PX = 18;
const RECIPROCAL_EDGE_ARC_MAX_OFFSET_PX = 34;
const RECIPROCAL_EDGE_ARC_LENGTH_RATIO = 0.14;
const RECIPROCAL_EDGE_ENDPOINT_OFFSET_PX = 7;
const RECIPROCAL_EDGE_ARC_SAMPLE_COUNT = 12;
const CURVED_EDGE_HANDLE_MIN_PX = 36;
const CURVED_EDGE_HANDLE_MAX_PX = 130;
const CURVED_EDGE_HANDLE_LENGTH_RATIO = 0.32;
const CURVED_EDGE_SAMPLE_COUNT = 12;
const EDGE_LABEL_PATTERN = /^(.+?)\s+(\d+(?:\.\d+)?\/min)$/;

function toFoblexFlowNodes(
  model: GraphRendererModel,
  edges: BeltwiseFoblexFlowEdge[],
  displaySettings: GraphDisplaySettings,
): BeltwiseFoblexFlowNode[] {
  return model.nodes.map((node) => ({
    ...node,
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
    const transport = edgeTransport(edge, options);
    const connectionType = edgeConnectionType(options.displaySettings.edgeStyle, isReciprocal);
    const sides = edgeConnectionSides(
      edge,
      nodesById,
      options.displaySettings.edgeStyle,
      isReciprocal,
    );
    return {
      ...edge,
      connectionType,
      connectionBehavior: FOBLEX_EDGE_CONNECTION_BEHAVIOR,
      outputSide: sides.outputSide,
      inputSide: sides.inputSide,
      labelLines: {
        ...splitEdgeLabel(edge.label),
        ...(options.displaySettings.showTransportLabels && transport.kind !== 'none'
          ? { transportLines: formatTransportLines(transport) }
          : {}),
      },
      labelPosition: isReciprocal
        ? FOBLEX_RECIPROCAL_EDGE_LABEL_POSITION
        : FOBLEX_EDGE_LABEL_POSITION,
      labelOffset: isReciprocal ? FOBLEX_RECIPROCAL_EDGE_LABEL_OFFSET : FOBLEX_EDGE_LABEL_OFFSET,
      transport,
    };
  });
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
  edge: GraphRendererEdge,
  nodesById: ReadonlyMap<string, GraphRendererNode>,
  edgeStyle: GraphEdgeStyle,
  isReciprocal: boolean,
): EdgeConnectionSides {
  if (edgeStyle !== 'curved' || isReciprocal) {
    return defaultEdgeConnectionSides();
  }

  const sourceNode = nodesById.get(edge.sourceNodeId);
  const targetNode = nodesById.get(edge.targetNodeId);
  if (!sourceNode || !targetNode) {
    return defaultEdgeConnectionSides();
  }

  return {
    outputSide: rectExitSide(sourceNode, targetNode),
    inputSide: rectExitSide(targetNode, sourceNode),
  };
}

function defaultEdgeConnectionSides(): EdgeConnectionSides {
  return {
    outputSide: EFConnectionConnectableSide.DEFAULT,
    inputSide: EFConnectionConnectableSide.DEFAULT,
  };
}

function rectExitSide(
  fromNode: GraphRendererNode,
  toNode: GraphRendererNode,
): EFConnectionConnectableSide {
  const fromSize = fromNode.size ?? { width: 0, height: 0 };
  const toSize = toNode.size ?? { width: 0, height: 0 };
  const fromCenter = {
    x: fromNode.position.x + fromSize.width / 2,
    y: fromNode.position.y + fromSize.height / 2,
  };
  const toCenter = {
    x: toNode.position.x + toSize.width / 2,
    y: toNode.position.y + toSize.height / 2,
  };
  const deltaX = toCenter.x - fromCenter.x;
  const deltaY = toCenter.y - fromCenter.y;

  if (deltaX === 0 && deltaY === 0) {
    return EFConnectionConnectableSide.DEFAULT;
  }

  const halfWidth = fromSize.width / 2;
  const halfHeight = fromSize.height / 2;
  const exitScaleX = deltaX === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(deltaX);
  const exitScaleY = deltaY === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(deltaY);

  if (exitScaleX < exitScaleY) {
    return deltaX >= 0 ? EFConnectionConnectableSide.RIGHT : EFConnectionConnectableSide.LEFT;
  }
  return deltaY >= 0 ? EFConnectionConnectableSide.BOTTOM : EFConnectionConnectableSide.TOP;
}

function buildNodeTooltip(
  node: GraphRendererNode,
  edges: BeltwiseFoblexFlowEdge[],
  displaySettings: GraphDisplaySettings,
): BeltwiseFoblexNodeTooltip | null {
  const inputs = edges
    .filter((edge) => edge.targetNodeId === node.id)
    .map((edge) => edge.labelLines);
  const outgoingEdges = edges.filter((edge) => edge.sourceNodeId === node.id);
  const outputs = outgoingEdges.map((edge) =>
    outputTooltipLine(edge, outgoingEdges, node.data.machineCount, displaySettings),
  );
  const stats = nodeTooltipStats(node, displaySettings);

  if (stats.length === 0 && inputs.length === 0 && outputs.length === 0) {
    return null;
  }

  return {
    title: node.data.label,
    stats,
    inputs,
    outputs,
  };
}

function outputTooltipLine(
  edge: BeltwiseFoblexFlowEdge,
  outgoingEdges: BeltwiseFoblexFlowEdge[],
  nodeMachineCount: number | undefined,
  displaySettings: GraphDisplaySettings,
): BeltwiseFoblexEdgeLabelLines {
  const splitItemTotal = splitItemOutputTotal(edge, outgoingEdges);
  if (!nodeMachineCount || splitItemTotal === null) {
    return edge.labelLines;
  }

  return {
    ...edge.labelLines,
    machineCount: formatMachineCount(
      (nodeMachineCount * edge.data.amountPerMinute) / splitItemTotal,
      displaySettings.rateDecimalPlaces,
    ),
  };
}

function splitItemOutputTotal(
  edge: BeltwiseFoblexFlowEdge,
  outgoingEdges: BeltwiseFoblexFlowEdge[],
): number | null {
  const sameItemOutputs = outgoingEdges.filter(
    (candidate) =>
      candidate.data.itemId === edge.data.itemId && candidate.targetNodeId !== edge.targetNodeId,
  );
  if (sameItemOutputs.length === 0) {
    return null;
  }

  return sameItemOutputs.reduce(
    (sum, candidate) => sum + candidate.data.amountPerMinute,
    edge.data.amountPerMinute,
  );
}

function nodeTooltipStats(
  node: GraphRendererNode,
  displaySettings: GraphDisplaySettings,
): string[] {
  if (node.data.machineDisplayName) {
    return [
      `${formatMachineCount(node.data.machineCount, displaySettings.rateDecimalPlaces)}x ${node.data.machineDisplayName}`,
      `Recipe cycles ${formatRate(node.data.amountPerMinute, displaySettings.rateDecimalPlaces)}/min`,
    ];
  }

  return node.data.subtitle ? [node.data.subtitle] : [];
}

function splitEdgeLabel(label: string): BeltwiseFoblexEdgeLabelLines {
  const match = EDGE_LABEL_PATTERN.exec(label.trim());
  const itemName = match?.[1];
  const amountPerMinute = match?.[2];
  if (!itemName || !amountPerMinute) {
    return { itemName: label, amountPerMinute: '' };
  }

  return { itemName, amountPerMinute };
}

function edgeTransport(
  edge: GraphRendererEdge,
  options: FoblexFlowModelOptions,
): BeltwiseFoblexEdgeTransport {
  const item = options.dataset?.items[edge.data.itemId];
  const kind = item ? transportKindForItem(item) : 'none';
  if (kind === 'belt') {
    const capacity = BELT_CAPACITY_PER_MINUTE[options.displaySettings.maxBeltTier];
    return {
      kind,
      lineCount: Math.max(1, Math.ceil(edge.data.amountPerMinute / capacity)),
      tierLabel: `Mk.${options.displaySettings.maxBeltTier}`,
    };
  }
  if (kind === 'pipe') {
    const capacity = PIPE_CAPACITY_PER_MINUTE[options.displaySettings.maxPipeTier];
    return {
      kind,
      lineCount: Math.max(1, Math.ceil(edge.data.amountPerMinute / capacity)),
      tierLabel: `Mk.${options.displaySettings.maxPipeTier}`,
    };
  }
  return { kind: 'none', lineCount: 0, tierLabel: '' };
}

function transportKindForItem(item: Item): BeltwiseFoblexEdgeTransport['kind'] {
  if (item.form === 'liquid' || item.form === 'gas') {
    return 'pipe';
  }
  if (item.form === 'solid') {
    return 'belt';
  }
  return 'none';
}

function formatTransportLines(transport: BeltwiseFoblexEdgeTransport): string {
  const noun = transport.kind === 'pipe' ? 'pipe' : 'belt';
  const suffix = transport.lineCount === 1 ? noun : `${noun}s`;
  return `${transport.lineCount}x ${transport.tierLabel} ${suffix}`;
}

export function formatDisplayDecimalValue(
  value: number | undefined,
  decimalPlaces: RateDecimalPlaces,
): string {
  const safeValue = value ?? 0;
  return Number.isInteger(safeValue)
    ? safeValue.toString()
    : safeValue.toFixed(decimalPlaces).replace(/0+$/, '').replace(/\.$/, '');
}

function formatMachineCount(
  machineCount: number | undefined,
  decimalPlaces: RateDecimalPlaces,
): string {
  return formatDisplayDecimalValue(machineCount, decimalPlaces);
}

function formatRate(
  amountPerMinute: number | undefined,
  decimalPlaces: RateDecimalPlaces,
): string {
  return formatDisplayDecimalValue(amountPerMinute, decimalPlaces);
}

function edgeKey(sourceNodeId: string, targetNodeId: string): string {
  return `${sourceNodeId}\u0000${targetNodeId}`;
}

class BeltwiseReciprocalArcConnectionBuilder implements IFConnectionBuilder {
  public handle(request: IFConnectionBuilderRequest): IFConnectionBuilderResponse {
    const deltaX = request.target.x - request.source.x;
    const deltaY = request.target.y - request.source.y;
    const length = Math.hypot(deltaX, deltaY);

    if (length === 0) {
      return {
        path: `M ${request.source.x} ${request.source.y} L ${request.target.x} ${request.target.y}`,
        penultimatePoint: request.source,
        secondPoint: request.target,
        points: [request.source, request.target],
        candidates: [request.source],
      };
    }

    const arcOffset = clamp(
      length * RECIPROCAL_EDGE_ARC_LENGTH_RATIO,
      RECIPROCAL_EDGE_ARC_MIN_OFFSET_PX,
      RECIPROCAL_EDGE_ARC_MAX_OFFSET_PX,
    );
    const normalX = -deltaY / length;
    const normalY = deltaX / length;
    const sourceOffset = endpointOffset(
      request.sourceSide,
      normalX,
      normalY,
      RECIPROCAL_EDGE_ENDPOINT_OFFSET_PX,
    );
    const targetOffset = endpointOffset(
      request.targetSide,
      normalX,
      normalY,
      RECIPROCAL_EDGE_ENDPOINT_OFFSET_PX,
    );
    const source = {
      x: request.source.x + sourceOffset.x,
      y: request.source.y + sourceOffset.y,
    };
    const target = {
      x: request.target.x + targetOffset.x,
      y: request.target.y + targetOffset.y,
    };
    const controlPoint1 = {
      x: source.x + deltaX / 3 + normalX * arcOffset,
      y: source.y + deltaY / 3 + normalY * arcOffset,
    };
    const controlPoint2 = {
      x: source.x + (deltaX * 2) / 3 + normalX * arcOffset,
      y: source.y + (deltaY * 2) / 3 + normalY * arcOffset,
    };

    return {
      path: [
        `M ${source.x} ${source.y}`,
        `C ${controlPoint1.x} ${controlPoint1.y}`,
        `${controlPoint2.x} ${controlPoint2.y}`,
        `${target.x} ${target.y}`,
      ].join(' '),
      penultimatePoint: controlPoint2,
      secondPoint: controlPoint1,
      points: sampleCubicBezier(
        source,
        controlPoint1,
        controlPoint2,
        target,
        RECIPROCAL_EDGE_ARC_SAMPLE_COUNT,
      ),
      candidates: [cubicBezierAt(source, controlPoint1, controlPoint2, target, 0.5)],
    };
  }
}

class BeltwisePerpendicularCurveConnectionBuilder implements IFConnectionBuilder {
  public handle(request: IFConnectionBuilderRequest): IFConnectionBuilderResponse {
    const deltaX = request.target.x - request.source.x;
    const deltaY = request.target.y - request.source.y;
    const length = Math.hypot(deltaX, deltaY);

    if (length === 0) {
      return {
        path: `M ${request.source.x} ${request.source.y} L ${request.target.x} ${request.target.y}`,
        penultimatePoint: request.source,
        secondPoint: request.target,
        points: [request.source, request.target],
        candidates: [request.source],
      };
    }

    const handleLength = clamp(
      length * CURVED_EDGE_HANDLE_LENGTH_RATIO,
      CURVED_EDGE_HANDLE_MIN_PX,
      CURVED_EDGE_HANDLE_MAX_PX,
    );
    const sourceDirection = sideDirection(request.sourceSide, request.source, request.target);
    const targetDirection = sideDirection(request.targetSide, request.target, request.source);
    const segments = curvedEdgeSegments(request, sourceDirection, targetDirection, handleLength);
    const points = segments.flatMap((segment, index) => {
      const samples = sampleCubicBezier(
        segment.start,
        segment.controlPoint1,
        segment.controlPoint2,
        segment.end,
        CURVED_EDGE_SAMPLE_COUNT,
      );
      return index === 0 ? samples : samples.slice(1);
    });
    const firstSegment = segments[0];
    const lastSegment = segments.at(-1);

    return {
      path: createCubicPath(segments),
      penultimatePoint: lastSegment?.controlPoint2 ?? request.source,
      secondPoint: firstSegment?.controlPoint1 ?? request.target,
      points,
      candidates: segments.map((segment) =>
        cubicBezierAt(
          segment.start,
          segment.controlPoint1,
          segment.controlPoint2,
          segment.end,
          0.5,
        ),
      ),
    };
  }
}

interface CubicCurveSegment {
  start: ConnectionPoint;
  controlPoint1: ConnectionPoint;
  controlPoint2: ConnectionPoint;
  end: ConnectionPoint;
}

function curvedEdgeSegments(
  request: IFConnectionBuilderRequest,
  sourceDirection: ConnectionPoint,
  targetDirection: ConnectionPoint,
  handleLength: number,
): CubicCurveSegment[] {
  if (isHorizontalDirection(sourceDirection) && isHorizontalDirection(targetDirection)) {
    return horizontalSCurveSegments(request, sourceDirection, targetDirection, handleLength);
  }
  if (isVerticalDirection(sourceDirection) && isVerticalDirection(targetDirection)) {
    return verticalSCurveSegments(request, sourceDirection, targetDirection, handleLength);
  }
  return mixedSCurveSegments(request, sourceDirection, targetDirection, handleLength);
}

function horizontalSCurveSegments(
  request: IFConnectionBuilderRequest,
  sourceDirection: ConnectionPoint,
  targetDirection: ConnectionPoint,
  handleLength: number,
): CubicCurveSegment[] {
  const midpoint = centerPoint(request.source, request.target);
  const firstControlPoint = {
    x: request.source.x + sourceDirection.x * handleLength,
    y: request.source.y,
  };
  const secondControlPoint = {
    x: midpoint.x,
    y: request.source.y,
  };
  const thirdControlPoint = {
    x: midpoint.x,
    y: request.target.y,
  };
  const fourthControlPoint = {
    x: request.target.x + targetDirection.x * handleLength,
    y: request.target.y,
  };

  return [
    {
      start: request.source,
      controlPoint1: firstControlPoint,
      controlPoint2: secondControlPoint,
      end: midpoint,
    },
    {
      start: midpoint,
      controlPoint1: thirdControlPoint,
      controlPoint2: fourthControlPoint,
      end: request.target,
    },
  ];
}

function verticalSCurveSegments(
  request: IFConnectionBuilderRequest,
  sourceDirection: ConnectionPoint,
  targetDirection: ConnectionPoint,
  handleLength: number,
): CubicCurveSegment[] {
  const midpoint = centerPoint(request.source, request.target);
  const firstControlPoint = {
    x: request.source.x,
    y: request.source.y + sourceDirection.y * handleLength,
  };
  const secondControlPoint = {
    x: request.source.x,
    y: midpoint.y,
  };
  const thirdControlPoint = {
    x: request.target.x,
    y: midpoint.y,
  };
  const fourthControlPoint = {
    x: request.target.x,
    y: request.target.y + targetDirection.y * handleLength,
  };

  return [
    {
      start: request.source,
      controlPoint1: firstControlPoint,
      controlPoint2: secondControlPoint,
      end: midpoint,
    },
    {
      start: midpoint,
      controlPoint1: thirdControlPoint,
      controlPoint2: fourthControlPoint,
      end: request.target,
    },
  ];
}

function mixedSCurveSegments(
  request: IFConnectionBuilderRequest,
  sourceDirection: ConnectionPoint,
  targetDirection: ConnectionPoint,
  handleLength: number,
): CubicCurveSegment[] {
  const midpoint = centerPoint(request.source, request.target);
  const midpointDirection = normalizedDirection({
    x: sourceDirection.x - targetDirection.x,
    y: sourceDirection.y - targetDirection.y,
  });
  const midpointHandleLength = clamp(
    Math.hypot(request.target.x - request.source.x, request.target.y - request.source.y) * 0.18,
    CURVED_EDGE_HANDLE_MIN_PX,
    handleLength,
  );

  return [
    {
      start: request.source,
      controlPoint1: {
        x: request.source.x + sourceDirection.x * handleLength,
        y: request.source.y + sourceDirection.y * handleLength,
      },
      controlPoint2: {
        x: midpoint.x - midpointDirection.x * midpointHandleLength,
        y: midpoint.y - midpointDirection.y * midpointHandleLength,
      },
      end: midpoint,
    },
    {
      start: midpoint,
      controlPoint1: {
        x: midpoint.x + midpointDirection.x * midpointHandleLength,
        y: midpoint.y + midpointDirection.y * midpointHandleLength,
      },
      controlPoint2: {
        x: request.target.x + targetDirection.x * handleLength,
        y: request.target.y + targetDirection.y * handleLength,
      },
      end: request.target,
    },
  ];
}

function centerPoint(start: ConnectionPoint, end: ConnectionPoint): ConnectionPoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function createCubicPath(segments: CubicCurveSegment[]): string {
  const [firstSegment, ...remainingSegments] = segments;
  if (!firstSegment) {
    return '';
  }

  return [
    `M ${firstSegment.start.x} ${firstSegment.start.y}`,
    cubicPathCommand(firstSegment),
    ...remainingSegments.map((segment) => cubicPathCommand(segment)),
  ].join(' ');
}

function cubicPathCommand(segment: CubicCurveSegment): string {
  return [
    `C ${segment.controlPoint1.x} ${segment.controlPoint1.y}`,
    `${segment.controlPoint2.x} ${segment.controlPoint2.y}`,
    `${segment.end.x} ${segment.end.y}`,
  ].join(' ');
}

function isHorizontalDirection(direction: ConnectionPoint): boolean {
  return Math.abs(direction.x) > 0 && direction.y === 0;
}

function isVerticalDirection(direction: ConnectionPoint): boolean {
  return direction.x === 0 && Math.abs(direction.y) > 0;
}

function sideDirection(
  side: EFConnectableSide,
  from: ConnectionPoint,
  to: ConnectionPoint,
): ConnectionPoint {
  switch (side) {
    case EFConnectableSide.TOP:
      return { x: 0, y: -1 };
    case EFConnectableSide.BOTTOM:
      return { x: 0, y: 1 };
    case EFConnectableSide.LEFT:
      return { x: -1, y: 0 };
    case EFConnectableSide.RIGHT:
      return { x: 1, y: 0 };
    case EFConnectableSide.CALCULATE_HORIZONTAL:
      return { x: Math.sign(to.x - from.x || 1), y: 0 };
    case EFConnectableSide.CALCULATE_VERTICAL:
      return { x: 0, y: Math.sign(to.y - from.y || 1) };
    case EFConnectableSide.CALCULATE:
    case EFConnectableSide.AUTO:
      return dominantAxisDirection(from, to);
  }
}

function dominantAxisDirection(from: ConnectionPoint, to: ConnectionPoint): ConnectionPoint {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { x: Math.sign(deltaX || 1), y: 0 };
  }
  return { x: 0, y: Math.sign(deltaY || 1) };
}

function normalizedDirection(direction: ConnectionPoint): ConnectionPoint {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return { x: 1, y: 0 };
  }
  return { x: direction.x / length, y: direction.y / length };
}

export const FOBLEX_CONNECTION_BUILDERS: IConnectionBuilders = {
  [FOBLEX_CURVED_EDGE_CONNECTION_TYPE]: new BeltwisePerpendicularCurveConnectionBuilder(),
  [FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE]: new BeltwiseReciprocalArcConnectionBuilder(),
};

function endpointOffset(
  side: EFConnectableSide,
  normalX: number,
  normalY: number,
  offset: number,
): ConnectionPoint {
  switch (side) {
    case EFConnectableSide.TOP:
    case EFConnectableSide.BOTTOM:
      return { x: Math.sign(normalX || 1) * offset, y: 0 };
    case EFConnectableSide.LEFT:
    case EFConnectableSide.RIGHT:
      return { x: 0, y: Math.sign(normalY || 1) * offset };
    default:
      return { x: normalX * offset, y: normalY * offset };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sampleCubicBezier(
  start: ConnectionPoint,
  controlPoint1: ConnectionPoint,
  controlPoint2: ConnectionPoint,
  end: ConnectionPoint,
  sampleCount: number,
): ConnectionPoint[] {
  return Array.from({ length: sampleCount + 1 }, (_, index) =>
    cubicBezierAt(start, controlPoint1, controlPoint2, end, index / sampleCount),
  );
}

function cubicBezierAt(
  start: ConnectionPoint,
  controlPoint1: ConnectionPoint,
  controlPoint2: ConnectionPoint,
  end: ConnectionPoint,
  position: number,
): ConnectionPoint {
  const inverse = 1 - position;
  const inverseSquared = inverse * inverse;
  const positionSquared = position * position;

  return {
    x:
      inverseSquared * inverse * start.x +
      3 * inverseSquared * position * controlPoint1.x +
      3 * inverse * positionSquared * controlPoint2.x +
      positionSquared * position * end.x,
    y:
      inverseSquared * inverse * start.y +
      3 * inverseSquared * position * controlPoint1.y +
      3 * inverse * positionSquared * controlPoint2.y +
      positionSquared * position * end.y,
  };
}
