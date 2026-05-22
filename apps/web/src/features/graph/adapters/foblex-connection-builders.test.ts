import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { EFConnectableSide, type IFConnectionBuilder } from '@foblex/flow';
import {
  FOBLEX_CONNECTION_BUILDERS,
  FOBLEX_CURVED_EDGE_CONNECTION_TYPE,
  FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE,
} from './foblex-connection-builders';

describe('foblex connection builders', () => {
  it('builds curved edges as two-segment S curves', () => {
    const response = registeredBuilder(FOBLEX_CURVED_EDGE_CONNECTION_TYPE).handle({
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
    const response = registeredBuilder(FOBLEX_CURVED_EDGE_CONNECTION_TYPE).handle({
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

  it('builds reciprocal arcs as smooth side-aware curves offset from the direct edge path', () => {
    const response = reciprocalResponse({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.RIGHT,
      target: { x: 120, y: 0 },
      targetSide: EFConnectableSide.LEFT,
      radius: 0,
      offset: 0,
      waypoints: [],
    });

    expect(response.path).toBe('M 0 12 C 40 36 80 36 120 12');
    expect(response.path.match(/\bC\b/g)).toHaveLength(1);
    expect(response.secondPoint).toEqual({ x: 40, y: 36 });
    expect(response.penultimatePoint).toEqual({ x: 80, y: 36 });
    expect(response.points).toHaveLength(13);
    expect(response.candidates).toHaveLength(1);
    expect(response.candidates[0]).toEqual({ x: 60, y: 30 });
  });

  it('keeps side-entry reciprocal arcs clear when the normal has no side-tangent component', () => {
    const forward = reciprocalResponse({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.RIGHT,
      target: { x: 0, y: 200 },
      targetSide: EFConnectableSide.LEFT,
      radius: 0,
      offset: 0,
      waypoints: [],
    });
    const reverse = reciprocalResponse({
      source: { x: 0, y: 200 },
      sourceSide: EFConnectableSide.LEFT,
      target: { x: 0, y: 0 },
      targetSide: EFConnectableSide.RIGHT,
      radius: 0,
      offset: 0,
      waypoints: [],
    });

    expect(forward.points[0]).toEqual({ x: -16, y: 0 });
    expect(forward.points.at(-1)).toEqual({ x: -16, y: 200 });
    expect(forward.secondPoint.x).toBeLessThan(0);
    expect(forward.penultimatePoint.x).toBeLessThan(0);
    expect(forward.candidates[0]?.x).toBeLessThanOrEqual(-24);
    expect(hasForwardEndpointTangents(forward)).toBe(true);

    expect(reverse.points[0]).toEqual({ x: 16, y: 200 });
    expect(reverse.points.at(-1)).toEqual({ x: 16, y: 0 });
    expect(reverse.secondPoint.x).toBeGreaterThan(0);
    expect(reverse.penultimatePoint.x).toBeGreaterThan(0);
    expect(reverse.candidates[0]?.x).toBeGreaterThanOrEqual(24);
    expect(hasForwardEndpointTangents(reverse)).toBe(true);
  });

  it('keeps top-bottom reciprocal arcs clear when the normal has no side-tangent component', () => {
    const forward = reciprocalResponse({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.BOTTOM,
      target: { x: 200, y: 0 },
      targetSide: EFConnectableSide.TOP,
      radius: 0,
      offset: 0,
      waypoints: [],
    });
    const reverse = reciprocalResponse({
      source: { x: 200, y: 0 },
      sourceSide: EFConnectableSide.TOP,
      target: { x: 0, y: 0 },
      targetSide: EFConnectableSide.BOTTOM,
      radius: 0,
      offset: 0,
      waypoints: [],
    });

    expect(forward.points[0]).toEqual({ x: 0, y: 12 });
    expect(forward.points.at(-1)).toEqual({ x: 200, y: 12 });
    expect(forward.secondPoint.y).toBeGreaterThan(0);
    expect(forward.penultimatePoint.y).toBeGreaterThan(0);
    expect(forward.candidates[0]?.y).toBeGreaterThanOrEqual(24);
    expect(hasForwardEndpointTangents(forward)).toBe(true);

    expect(reverse.points[0]).toEqual({ x: 200, y: -12 });
    expect(reverse.points.at(-1)).toEqual({ x: 0, y: -12 });
    expect(reverse.secondPoint.y).toBeLessThan(0);
    expect(reverse.penultimatePoint.y).toBeLessThan(0);
    expect(reverse.candidates[0]?.y).toBeLessThanOrEqual(-24);
    expect(hasForwardEndpointTangents(reverse)).toBe(true);
  });

  it('keeps diagonal reciprocal arcs leaving the source and target sides before bending', () => {
    const response = reciprocalResponse({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.RIGHT,
      target: { x: 160, y: 120 },
      targetSide: EFConnectableSide.TOP,
      radius: 0,
      offset: 0,
      waypoints: [],
    });

    expect(response.points[0]).toEqual({ x: 0, y: 0 });
    expect(response.points.at(-1)).toEqual({ x: 160, y: 120 });
    expect(response.secondPoint.x).toBeGreaterThan(response.points[0]?.x ?? 0);
    expect(response.penultimatePoint.y).toBeLessThan(response.points.at(-1)?.y ?? 0);
    expect(response.candidates[0]?.x).toBeLessThan(80);
    expect(response.candidates[0]?.y).toBeGreaterThan(60);
    expect(hasForwardEndpointTangents(response)).toBe(true);
  });

  it('keeps nearby diagonal reciprocal endpoint offsets continuous', () => {
    const first = reciprocalResponse({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.RIGHT,
      target: { x: 160, y: 120 },
      targetSide: EFConnectableSide.TOP,
      radius: 0,
      offset: 0,
      waypoints: [],
    });
    const nearby = reciprocalResponse({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.RIGHT,
      target: { x: 160, y: 110 },
      targetSide: EFConnectableSide.TOP,
      radius: 0,
      offset: 0,
      waypoints: [],
    });

    expect(first.points[0]).toEqual({ x: 0, y: 0 });
    expect(nearby.points[0]).toEqual({ x: 0, y: 0 });
    expect(distance(first.points[0], nearby.points[0])).toBe(0);
    expect(distance(first.points.at(-1), nearby.points.at(-1))).toBeLessThan(11);
    expect(hasForwardEndpointTangents(first)).toBe(true);
    expect(hasForwardEndpointTangents(nearby)).toBe(true);
  });
});

function registeredBuilder(connectionType: string): IFConnectionBuilder {
  const builder = FOBLEX_CONNECTION_BUILDERS[connectionType];
  if (!builder) {
    throw new Error(`${connectionType} builder must be registered`);
  }
  return builder;
}

type ConnectionBuilderRequest = Parameters<IFConnectionBuilder['handle']>[0];

function reciprocalResponse(request: ConnectionBuilderRequest) {
  return registeredBuilder(FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE).handle(request);
}

function hasForwardEndpointTangents(response: ReturnType<typeof reciprocalResponse>): boolean {
  const start = response.points[0];
  const end = response.points.at(-1);
  if (!start || !end) {
    return false;
  }

  const delta = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const sourceTangent = {
    x: response.secondPoint.x - start.x,
    y: response.secondPoint.y - start.y,
  };
  const targetTangent = {
    x: end.x - response.penultimatePoint.x,
    y: end.y - response.penultimatePoint.y,
  };

  return dotProduct(delta, sourceTangent) > 0 && dotProduct(delta, targetTangent) > 0;
}

function dotProduct(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return first.x * second.x + first.y * second.y;
}

function distance(
  first: { x: number; y: number } | undefined,
  second: { x: number; y: number } | undefined,
): number {
  if (!first || !second) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.hypot(second.x - first.x, second.y - first.y);
}
