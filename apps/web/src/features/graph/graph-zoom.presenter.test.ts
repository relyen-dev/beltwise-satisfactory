import { describe, expect, it } from 'vitest';
import { graphWheelScaleFactor, graphWheelZoomIntent } from './graph-zoom.presenter';

describe('graph zoom presenter', () => {
  it('keeps the normal mouse wheel step at full scale', () => {
    const intent = graphWheelZoomIntent(wheelEvent({ deltaY: -100 }), 1, 0.08);

    expect(intent).toEqual({
      direction: 'in',
      point: { x: 120, y: 80 },
      step: 0.08,
    });
  });

  it('attenuates mouse wheel zoom when already zoomed out', () => {
    const intent = graphWheelZoomIntent(wheelEvent({ deltaY: 100 }), 0.25, 0.08);

    expect(intent).toEqual({
      direction: 'out',
      point: { x: 120, y: 80 },
      step: 0.04,
    });
  });

  it('keeps a floor so low-scale wheel zoom does not become tedious', () => {
    expect(graphWheelScaleFactor(0.01)).toBe(0.45);
  });

  it('keeps gesture wheel deltas gentler and ignores tiny gesture noise', () => {
    expect(graphWheelZoomIntent(wheelEvent({ ctrlKey: true, deltaY: -0.25 }), 1, 0.08)).toBeNull();
    expect(graphWheelZoomIntent(wheelEvent({ ctrlKey: true, deltaY: -30 }), 1, 0.08)).toEqual({
      direction: 'in',
      point: { x: 120, y: 80 },
      step: 0.04,
    });
  });
});

function wheelEvent(
  overrides: Partial<Parameters<typeof graphWheelZoomIntent>[0]>,
): Parameters<typeof graphWheelZoomIntent>[0] {
  return {
    clientX: 120,
    clientY: 80,
    ctrlKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    metaKey: false,
    ...overrides,
  };
}
