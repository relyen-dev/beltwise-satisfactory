const DOM_DELTA_PIXEL = 0;
const DEFAULT_WHEEL_INTENSITY_MIN = 0.1;
const DEFAULT_WHEEL_INTENSITY_MAX = 1;
const GESTURE_WHEEL_DELTA_THRESHOLD = 0.5;
const GESTURE_WHEEL_INTENSITY_DIVISOR = 60;
const GESTURE_WHEEL_INTENSITY_MAX = 0.5;
const LOW_SCALE_WHEEL_FACTOR_MINIMUM = 0.45;

export interface GraphWheelZoomEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly ctrlKey: boolean;
  readonly deltaMode: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly metaKey: boolean;
}

export interface GraphWheelZoomIntent {
  readonly direction: 'in' | 'out';
  readonly point: { x: number; y: number };
  readonly step: number;
}

export function graphWheelZoomIntent(
  event: GraphWheelZoomEvent,
  currentScale: number,
  baseStep: number,
): GraphWheelZoomIntent | null {
  const delta = resolveGraphWheelDelta(event);
  if (delta === 0) {
    return null;
  }

  const normalizedStep = normalizeGraphWheelStep(event, delta, baseStep);
  if (normalizedStep === 0) {
    return null;
  }

  return {
    direction: delta > 0 ? 'out' : 'in',
    point: { x: event.clientX, y: event.clientY },
    step: normalizedStep * graphWheelScaleFactor(currentScale),
  };
}

export function graphWheelScaleFactor(currentScale: number): number {
  if (!Number.isFinite(currentScale) || currentScale >= 1) {
    return 1;
  }
  return Math.max(LOW_SCALE_WHEEL_FACTOR_MINIMUM, Math.sqrt(Math.max(0, currentScale)));
}

function resolveGraphWheelDelta(event: GraphWheelZoomEvent): number {
  return Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
}

function normalizeGraphWheelStep(
  event: GraphWheelZoomEvent,
  delta: number,
  baseStep: number,
): number {
  if (isGestureWheelEvent(event)) {
    return normalizeGestureWheelStep(delta, baseStep);
  }
  return normalizeMouseWheelStep(delta, baseStep);
}

function isGestureWheelEvent(event: GraphWheelZoomEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.deltaMode === DOM_DELTA_PIXEL;
}

function normalizeMouseWheelStep(delta: number, baseStep: number): number {
  const intensity = Math.abs(delta) / 100;
  return baseStep * clamp(intensity, DEFAULT_WHEEL_INTENSITY_MIN, DEFAULT_WHEEL_INTENSITY_MAX);
}

function normalizeGestureWheelStep(delta: number, baseStep: number): number {
  if (Math.abs(delta) < GESTURE_WHEEL_DELTA_THRESHOLD) {
    return 0;
  }
  const intensity = Math.abs(delta) / GESTURE_WHEEL_INTENSITY_DIVISOR;
  return baseStep * clamp(intensity, 0, GESTURE_WHEEL_INTENSITY_MAX);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
