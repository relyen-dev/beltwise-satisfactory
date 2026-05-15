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

  it('builds reciprocal arcs offset from the direct edge path', () => {
    const response = registeredBuilder(FOBLEX_RECIPROCAL_EDGE_CONNECTION_TYPE).handle({
      source: { x: 0, y: 0 },
      sourceSide: EFConnectableSide.RIGHT,
      target: { x: 120, y: 0 },
      targetSide: EFConnectableSide.LEFT,
      radius: 0,
      offset: 0,
      waypoints: [],
    });

    expect(response.path).toBe('M 0 7 C 40 25 80 25 120 7');
    expect(response.points).toHaveLength(13);
    expect(response.candidates).toHaveLength(1);
  });
});

function registeredBuilder(connectionType: string): IFConnectionBuilder {
  const builder = FOBLEX_CONNECTION_BUILDERS[connectionType];
  if (!builder) {
    throw new Error(`${connectionType} builder must be registered`);
  }
  return builder;
}
