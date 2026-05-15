import {
  EFConnectionType,
  EFConnectableSide,
  type IConnectionBuilders,
  type IFConnectionBuilder,
  type IFConnectionBuilderRequest,
  type IFConnectionBuilderResponse,
} from '@foblex/flow';

export const FOBLEX_STRAIGHT_EDGE_CONNECTION_TYPE = EFConnectionType.STRAIGHT;
export const FOBLEX_CURVED_EDGE_CONNECTION_TYPE = 'beltwise-perpendicular-curve';
export const FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE = 'beltwise-reciprocal-arc';

export type BeltwiseFoblexConnectionType =
  | EFConnectionType
  | typeof FOBLEX_CURVED_EDGE_CONNECTION_TYPE
  | typeof FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE;

interface ConnectionPoint {
  x: number;
  y: number;
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
