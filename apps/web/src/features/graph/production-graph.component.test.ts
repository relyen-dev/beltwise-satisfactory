import '@angular/compiler';
import 'zone.js';
import {
  Injector,
  type Signal,
  runInInjectionContext,
  signal,
  type WritableSignal,
} from '@angular/core';
import * as angularCore from '@angular/core';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createDefaultGraphDisplaySettings, type ProductionGraph } from '@beltwise/planner-core';
import { EFZoomDirection } from '@foblex/flow';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProductionGraphComponent } from './production-graph.component';
import type { BeltwiseFoblexFlowNode } from './adapters/foblex-flow.adapter';

declare module 'jsdom' {
  export class JSDOM {
    public readonly window: Window & typeof globalThis;

    public constructor(html?: string, options?: { url?: string });
  }
}

type AngularResourceResolver = (
  url: string,
) => Promise<string | { text(): Promise<string>; status?: number }>;

let angularTestingEnvironmentInitialized = false;

// Vitest does not have Angular CLI's resource loader, so external template/style
// standalone components must be resolved before TestBed imports them.
const angularResourceApi = angularCore as typeof angularCore & {
  readonly ɵresolveComponentResources?: (
    resourceResolver: AngularResourceResolver,
  ) => Promise<void>;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ProductionGraphComponent', () => {
  it('uses a gentle configured zoom step for Foblex canvas controls', () => {
    const { component } = createComponentHarness();

    expect(component.graphZoomStep).toBe(0.08);
    expect(component.graphButtonZoomStep).toBe(0.05);

    component.ngOnDestroy();
  });

  it('zooms around the visible graph center with the explicit button step', () => {
    const { component } = createComponentHarness();
    const zoom = { setZoom: vi.fn() };
    const flow = {
      hostElement: testHostElement({ left: 20, top: 30, width: 640, height: 360 }),
    };

    component.zoomGraphAroundVisibleCenter(zoom, flow, EFZoomDirection.ZOOM_IN);

    expect(zoom.setZoom).toHaveBeenCalledWith(
      { x: 340, y: 210 },
      0.05,
      EFZoomDirection.ZOOM_IN,
      false,
    );

    component.ngOnDestroy();
  });

  it('zooms wheel input around the cursor with the configured base step', () => {
    const { component } = createComponentHarness();
    const zoom = installGraphZoom(component, { scale: 1 });
    const event = wheelEvent({ clientX: 140, clientY: 90, deltaY: -100 });

    component.handleGraphWheel(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(zoom.setZoom).toHaveBeenCalledWith(
      { x: 140, y: 90 },
      0.08,
      EFZoomDirection.ZOOM_IN,
      false,
    );

    component.ngOnDestroy();
  });

  it('consumes ignored gesture wheel noise on the graph surface', () => {
    const { component } = createComponentHarness();
    const zoom = installGraphZoom(component, { scale: 1 });
    const event = wheelEvent({ ctrlKey: true, deltaY: -0.25 });

    component.handleGraphWheel(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(zoom.setZoom).not.toHaveBeenCalled();

    component.ngOnDestroy();
  });

  it('maps graph keyboard shortcuts to explicit zoom actions', () => {
    const { component } = createComponentHarness();
    const zoomAroundCenter = vi
      .spyOn(component, 'zoomGraphAroundVisibleCenter')
      .mockImplementation(() => undefined);
    const pageUp = keyboardEvent({ code: 'PageUp', key: 'PageUp' });
    const numpadMinus = keyboardEvent({ code: 'NumpadSubtract', key: '-' });
    const textInput = keyboardEvent({
      code: 'NumpadAdd',
      key: '+',
      target: keyboardTarget('input'),
    });

    component.handleGraphKeydown(pageUp);
    component.handleGraphKeydown(numpadMinus);
    component.handleGraphKeydown(textInput);

    expect(pageUp.preventDefault).toHaveBeenCalledOnce();
    expect(pageUp.stopPropagation).toHaveBeenCalledOnce();
    expect(numpadMinus.preventDefault).toHaveBeenCalledOnce();
    expect(numpadMinus.stopPropagation).toHaveBeenCalledOnce();
    expect(textInput.preventDefault).not.toHaveBeenCalled();
    expect(textInput.stopPropagation).not.toHaveBeenCalled();
    expect(zoomAroundCenter).toHaveBeenNthCalledWith(
      1,
      undefined,
      undefined,
      EFZoomDirection.ZOOM_IN,
    );
    expect(zoomAroundCenter).toHaveBeenNthCalledWith(
      2,
      undefined,
      undefined,
      EFZoomDirection.ZOOM_OUT,
    );

    component.ngOnDestroy();
  });

  it('emits a node selection toggle when pointer down and up stay within click tolerance', () => {
    const { component, nodeSelectionToggled } = createComponentHarness();

    component.handleNodePointerDown('recipe:iron-plate', pointerEvent(12, 20));
    component.handleNodePointerUp('recipe:iron-plate', pointerEvent(15, 24));

    expect(nodeSelectionToggled).toEqual(['recipe:iron-plate']);

    component.ngOnDestroy();
  });

  it('restores the previous selection on double-click and emits a done toggle', () => {
    vi.useFakeTimers();
    const { component, nodeDoneToggled, nodeSelectionSet, nodeSelectionToggled } =
      createComponentHarness();
    component.setSelectedNodeId('recipe:iron-rod');

    component.handleNodePointerDown('recipe:iron-plate', pointerEvent(12, 20));
    component.handleNodePointerUp('recipe:iron-plate', pointerEvent(13, 21));
    component.handleNodeDoubleClick('recipe:iron-plate', mouseEvent());

    expect(nodeSelectionToggled).toEqual(['recipe:iron-plate']);
    expect(nodeSelectionSet).toEqual(['recipe:iron-rod']);
    expect(nodeDoneToggled).toEqual(['recipe:iron-plate']);

    component.ngOnDestroy();
  });

  it('emits node move end on pointer up after a moved node', () => {
    const { component, nodeMoveEnded, nodeMoved } = createComponentHarness();

    component.handleNodePointerDown('recipe:iron-plate', pointerEvent(12, 20));
    component.handleNodePosition('recipe:iron-plate', { x: 100, y: 200 });
    component.handleNodePointerUp('recipe:iron-plate', pointerEvent(80, 120));

    expect(nodeMoved).toEqual([{ nodeId: 'recipe:iron-plate', position: { x: 100, y: 200 } }]);
    expect(nodeMoveEnded).toHaveLength(1);

    component.ngOnDestroy();
  });

  it('suppresses node move emissions while graph interaction is locked', () => {
    const { component, nodeMoveEnded, nodeMoved } = createComponentHarness();
    component.setInteractionLocked(true);

    component.handleNodePointerDown('recipe:iron-plate', pointerEvent(12, 20));
    component.handleNodePosition('recipe:iron-plate', { x: 100, y: 200 });
    component.handleNodePointerUp('recipe:iron-plate', pointerEvent(80, 120));

    expect(nodeMoved).toEqual([]);
    expect(nodeMoveEnded).toEqual([]);

    component.ngOnDestroy();
  });

  it('commits active node movement on window blur without selecting', () => {
    const { component, nodeMoveCanceled, nodeMoveEnded, nodeMoved, nodeSelectionToggled } =
      createComponentHarness();

    component.handleNodePointerDown('recipe:iron-plate', pointerEvent(12, 20));
    component.handleNodePosition('recipe:iron-plate', { x: 100, y: 200 });
    component.handleWindowBlur();
    component.handleNodePointerUp('recipe:iron-plate', pointerEvent(13, 21));

    expect(nodeMoved).toEqual([{ nodeId: 'recipe:iron-plate', position: { x: 100, y: 200 } }]);
    expect(nodeMoveCanceled).toEqual([]);
    expect(nodeMoveEnded).toHaveLength(1);
    expect(nodeSelectionToggled).toEqual([]);

    component.ngOnDestroy();
  });

  it('dispatches pointercancel on window blur to release Foblex document drag listeners', () => {
    const { component } = createComponentHarness();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('document', { dispatchEvent });

    try {
      component.handleWindowBlur();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: 'pointercancel' });

    component.ngOnDestroy();
  });

  it('emits target amount changes for editable output targets', () => {
    const { component, targetAmountChanged } = createComponentHarness();
    const event = controlEvent('42.5');

    component.handleTargetAmountChange(outputNode(), event);

    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.control.value).toBe('42.5');
    expect(targetAmountChanged).toEqual([{ targetId: 'target-plate', amountPerMinute: 42.5 }]);

    component.ngOnDestroy();
  });

  it('only exposes the output target input after the node is selected', () => {
    const { component } = createComponentHarness();
    const node = outputNode();

    expect(component.shouldShowTargetAmountInput(node)).toBe(false);

    component.setSelectedNodeId(node.id);

    expect(component.shouldShowTargetAmountInput(node)).toBe(true);

    component.ngOnDestroy();
  });

  it('does not emit target amount changes while target editing is locked', () => {
    const { component, targetAmountChanged } = createComponentHarness();
    const node = outputNode();
    component.setTargetEditingLocked(true);

    component.setSelectedNodeId(node.id);
    component.handleTargetAmountChange(node, controlEvent('99'));

    expect(component.shouldShowTargetAmountInput(node)).toBe(false);
    expect(targetAmountChanged).toEqual([]);

    component.ngOnDestroy();
  });

  it('resets target amount input without committing changes', () => {
    const { component, targetAmountChanged } = createComponentHarness();
    const event = controlEvent('88');

    component.resetTargetAmountInput(outputNode({ amountPerMinute: 25 }), event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.control.value).toBe('25');
    expect(targetAmountChanged).toEqual([]);

    component.ngOnDestroy();
  });
});

describe('ProductionGraphComponent template', () => {
  beforeAll(async () => {
    await installDomGlobals();
    await resolveExternalComponentResources();
    if (!angularTestingEnvironmentInitialized) {
      TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
      angularTestingEnvironmentInitialized = true;
    }
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('renders selected output target editing and respects plan/node locks', async () => {
    const { controls, fixture, targetAmountChanged } = await createRenderedGraphHarness();

    expect(targetRateInput(fixture)).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('/min target');

    controls.selectedNodeId.set(OUTPUT_NODE_ID);
    fixture.detectChanges();

    const selectedInput = requiredTargetRateInput(fixture);
    expect(selectedInput.value).toBe('25');

    controls.targetEditingLocked.set(true);
    fixture.detectChanges();

    expect(targetRateInput(fixture)).toBeNull();

    controls.targetEditingLocked.set(false);
    controls.interactionLocked.set(true);
    fixture.detectChanges();

    const lockedNodesInput = requiredTargetRateInput(fixture);
    const documentMouseDown = vi.fn();
    document.addEventListener('mousedown', documentMouseDown);
    lockedNodesInput.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    document.removeEventListener('mousedown', documentMouseDown);

    lockedNodesInput.value = '42';
    lockedNodesInput.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
    );
    fixture.detectChanges();

    expect(documentMouseDown).not.toHaveBeenCalled();
    expect(targetAmountChanged).toEqual([{ targetId: 'target-plate', amountPerMinute: 42 }]);
  });

  it('fits a freshly rendered graph into the canvas', async () => {
    const { controls, fixture } = await createRenderedGraphHarness();
    const canvas = { fitToScreen: vi.fn() };

    fixture.componentInstance.fitRenderedGraphIntoCanvas(canvas);
    fixture.componentInstance.fitRenderedGraphIntoCanvas(canvas);
    expect(canvas.fitToScreen).toHaveBeenCalledTimes(1);
    expect(canvas.fitToScreen).toHaveBeenCalledWith({ x: 72, y: 56 }, false);

    controls.graph.set(outputGraph());
    fixture.detectChanges();
    fixture.componentInstance.fitRenderedGraphIntoCanvas(canvas);

    expect(canvas.fitToScreen).toHaveBeenCalledTimes(2);
  });

  it('renders imported script-looking graph labels and notes as text', async () => {
    const globals = globalThis as typeof globalThis & { __beltwiseGraphXss?: boolean };
    delete globals.__beltwiseGraphXss;
    const attackText =
      '<img src=x onerror="globalThis.__beltwiseGraphXss = true"><script>alert(1)</script>';
    const { controls, fixture } = await createRenderedGraphHarness();

    controls.graph.set({
      nodes: [
        {
          id: OUTPUT_NODE_ID,
          kind: 'output',
          label: attackText,
          subtitle: attackText,
          itemId: 'Desc_IronPlate_C',
          targetId: 'target-plate',
          targetMode: 'fixed',
          amountPerMinute: 25,
        },
      ],
      edges: [],
    });
    controls.nodeNotes.set({ [OUTPUT_NODE_ID]: attackText });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain(attackText);
    expect(element.querySelector('img[src="x"]')).toBeNull();
    expect(element.querySelector('script')).toBeNull();
    expect(globals.__beltwiseGraphXss).toBeUndefined();
  });

  it('renders assumed input nodes with their own graph class', async () => {
    const { controls, fixture } = await createRenderedGraphHarness();

    controls.graph.set({
      nodes: [
        {
          id: 'assumed-input:Desc_NuclearWaste_C',
          kind: 'assumedInput',
          label: 'Uranium Waste',
          subtitle: '25/min assumed source',
          itemId: 'Desc_NuclearWaste_C',
          amountPerMinute: 25,
        },
      ],
      edges: [],
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const assumedNode = element.querySelector('.production-node--assumed-input');

    expect(assumedNode).not.toBeNull();
    expect(assumedNode?.textContent).toContain('assumed input');
    expect(assumedNode?.textContent).toContain('Uranium Waste');
    expect(assumedNode?.textContent).toContain('25/min assumed source');
  });

  it('renders compact zoom buttons that do not bubble graph control clicks', async () => {
    const { fixture } = await createRenderedGraphHarness();
    const graphSurface = requiredGraphSurface(fixture);
    const zoomControls = requiredZoomControlButtons(fixture);
    const zoomAroundCenter = vi
      .spyOn(fixture.componentInstance, 'zoomGraphAroundVisibleCenter')
      .mockImplementation(() => undefined);
    const documentClick = vi.fn();
    const documentMouseUp = vi.fn();
    const documentPointerUp = vi.fn();
    const documentTouchEnd = vi.fn();

    document.addEventListener('click', documentClick);
    zoomControls.zoomIn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    zoomControls.zoomOut.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    document.removeEventListener('click', documentClick);

    document.addEventListener('pointerup', documentPointerUp);
    zoomControls.zoomIn.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, cancelable: true }),
    );
    document.removeEventListener('pointerup', documentPointerUp);

    document.addEventListener('mouseup', documentMouseUp);
    zoomControls.zoomIn.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
    );
    document.removeEventListener('mouseup', documentMouseUp);

    document.addEventListener('touchend', documentTouchEnd);
    zoomControls.zoomIn.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    document.removeEventListener('touchend', documentTouchEnd);

    expect(zoomControls.zoomIn.getAttribute('aria-label')).toBe('Zoom in graph');
    expect(zoomControls.zoomOut.getAttribute('aria-label')).toBe('Zoom out graph');
    expect(graphSurface.getAttribute('role')).toBe('region');
    expect(graphSurface.getAttribute('aria-label')).toBe('Production graph');
    expect(graphSurface.getAttribute('aria-keyshortcuts')).toBe('PageUp PageDown plus - =');
    expect(documentClick).not.toHaveBeenCalled();
    expect(documentMouseUp).toHaveBeenCalledOnce();
    expect(documentPointerUp).toHaveBeenCalledOnce();
    expect(documentTouchEnd).toHaveBeenCalledOnce();
    expect(zoomAroundCenter).toHaveBeenCalledTimes(2);
  });
});

function createComponentHarness(): ProductionGraphHarness {
  const injector = Injector.create({ providers: [] });
  const component = runInInjectionContext(injector, () => new TestProductionGraphComponent());
  const nodeDoneToggled: string[] = [];
  const nodeMoveCanceled: void[] = [];
  const nodeMoveEnded: void[] = [];
  const nodeMoved: Array<{ nodeId: string; position: { x: number; y: number } }> = [];
  const nodeSelectionSet: Array<string | null> = [];
  const nodeSelectionToggled: string[] = [];
  const targetAmountChanged: Array<{ targetId: string; amountPerMinute: number }> = [];

  component.nodeDoneToggled.subscribe((nodeId) => nodeDoneToggled.push(nodeId));
  component.nodeMoveCanceled.subscribe(() => nodeMoveCanceled.push(undefined));
  component.nodeMoveEnded.subscribe(() => nodeMoveEnded.push(undefined));
  component.nodeMoved.subscribe((move) => nodeMoved.push(move));
  component.nodeSelectionSet.subscribe((nodeId) => nodeSelectionSet.push(nodeId));
  component.nodeSelectionToggled.subscribe((nodeId) => nodeSelectionToggled.push(nodeId));
  component.targetAmountChanged.subscribe((change) => targetAmountChanged.push(change));

  return {
    component,
    nodeDoneToggled,
    nodeMoveCanceled,
    nodeMoveEnded,
    nodeMoved,
    nodeSelectionSet,
    nodeSelectionToggled,
    targetAmountChanged,
  };
}

function pointerEvent(clientX: number, clientY: number): PointerEvent {
  return { clientX, clientY } as PointerEvent;
}

function mouseEvent(): MouseEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}

function wheelEvent(options: {
  clientX?: number;
  clientY?: number;
  ctrlKey?: boolean;
  deltaMode?: number;
  deltaX?: number;
  deltaY?: number;
  metaKey?: boolean;
}): WheelEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
} {
  return {
    clientX: options.clientX ?? 120,
    clientY: options.clientY ?? 80,
    ctrlKey: options.ctrlKey ?? false,
    deltaMode: options.deltaMode ?? 0,
    deltaX: options.deltaX ?? 0,
    deltaY: options.deltaY ?? 0,
    metaKey: options.metaKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as WheelEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

function installGraphZoom(
  component: ProductionGraphComponent,
  options: { scale: number },
): { getZoomValue: () => number; setZoom: ReturnType<typeof vi.fn> } {
  const zoom = {
    getZoomValue: () => options.scale,
    setZoom: vi.fn(),
  };
  Object.defineProperty(component, 'zoom', { value: () => zoom });
  return zoom;
}

function keyboardEvent(options: {
  code: string;
  key: string;
  target?: EventTarget | null;
}): KeyboardEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  return {
    altKey: false,
    code: options.code,
    ctrlKey: false,
    key: options.key,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: options.target ?? null,
  } as unknown as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

function keyboardTarget(tagName: string): EventTarget {
  return {
    isContentEditable: false,
    tagName,
  } as unknown as EventTarget;
}

function controlEvent(value: string): Event & {
  control: { blur: ReturnType<typeof vi.fn>; value: string };
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  const control = {
    blur: vi.fn(),
    value,
  };
  return {
    control,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: control,
  } as unknown as Event & {
    control: { blur: ReturnType<typeof vi.fn>; value: string };
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

function outputNode(data: Partial<BeltwiseFoblexFlowNode['data']> = {}): BeltwiseFoblexFlowNode {
  return {
    id: 'output:target-plate',
    kind: 'output',
    position: { x: 0, y: 0 },
    size: { width: 220, height: 104 },
    data: {
      id: 'output:target-plate',
      kind: 'output',
      label: 'Iron Plate',
      subtitle: '25/min target',
      itemId: 'Desc_IronPlate_C',
      targetId: 'target-plate',
      targetMode: 'fixed',
      amountPerMinute: 25,
      ...data,
    },
    tooltip: null,
  };
}

async function createRenderedGraphHarness(): Promise<RenderedProductionGraphHarness> {
  TestBed.configureTestingModule({
    imports: [ProductionGraphComponent],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(ProductionGraphComponent);
  const controls = installRenderedGraphInputs(fixture.componentInstance);
  const targetAmountChanged: Array<{ targetId: string; amountPerMinute: number }> = [];
  fixture.componentInstance.targetAmountChanged.subscribe((change) =>
    targetAmountChanged.push(change),
  );
  fixture.detectChanges();

  return { controls, fixture, targetAmountChanged };
}

function installRenderedGraphInputs(
  component: ProductionGraphComponent,
): RenderedProductionGraphControls {
  const controls: RenderedProductionGraphControls = {
    graph: signal<ReturnType<ProductionGraphComponent['graph']>>(outputGraph()),
    dataset: signal<ReturnType<ProductionGraphComponent['dataset']>>(null),
    layout: signal<ReturnType<ProductionGraphComponent['layout']>>({ nodePositions: {} }),
    displaySettings: signal<ReturnType<ProductionGraphComponent['displaySettings']>>(
      createDefaultGraphDisplaySettings(),
    ),
    selectedNodeId: signal<ReturnType<ProductionGraphComponent['selectedNodeId']>>(null),
    completedNodeIds: signal<ReturnType<ProductionGraphComponent['completedNodeIds']>>(
      new Set<string>(),
    ),
    nodeNotes: signal<ReturnType<ProductionGraphComponent['nodeNotes']>>({}),
    interactionLocked: signal<ReturnType<ProductionGraphComponent['interactionLocked']>>(false),
    targetEditingLocked: signal<ReturnType<ProductionGraphComponent['targetEditingLocked']>>(false),
  };
  const inputs = component as unknown as RenderedProductionGraphInputSignals;

  inputs.graph = controls.graph.asReadonly();
  inputs.dataset = controls.dataset.asReadonly();
  inputs.layout = controls.layout.asReadonly();
  inputs.displaySettings = controls.displaySettings.asReadonly();
  inputs.selectedNodeId = controls.selectedNodeId.asReadonly();
  inputs.completedNodeIds = controls.completedNodeIds.asReadonly();
  inputs.nodeNotes = controls.nodeNotes.asReadonly();
  inputs.interactionLocked = controls.interactionLocked.asReadonly();
  inputs.targetEditingLocked = controls.targetEditingLocked.asReadonly();

  return controls;
}

function outputGraph(): ProductionGraph {
  return {
    nodes: [
      {
        id: OUTPUT_NODE_ID,
        kind: 'output',
        label: 'Iron Plate',
        subtitle: '25/min target',
        itemId: 'Desc_IronPlate_C',
        targetId: 'target-plate',
        targetMode: 'fixed',
        amountPerMinute: 25,
      },
    ],
    edges: [],
  };
}

function targetRateInput(
  fixture: ComponentFixture<ProductionGraphComponent>,
): HTMLInputElement | null {
  return fixture.nativeElement.querySelector('.node-target-rate__input') as HTMLInputElement | null;
}

function requiredTargetRateInput(
  fixture: ComponentFixture<ProductionGraphComponent>,
): HTMLInputElement {
  const input = targetRateInput(fixture);
  if (!input) {
    throw new Error('Expected the graph target rate input to render');
  }
  return input;
}

function requiredGraphSurface(fixture: ComponentFixture<ProductionGraphComponent>): HTMLElement {
  const graphSurface = fixture.nativeElement.querySelector('.beltwise-flow') as HTMLElement | null;
  if (!graphSurface) {
    throw new Error('Expected the graph surface to render');
  }
  return graphSurface;
}

function requiredZoomControlButtons(
  fixture: ComponentFixture<ProductionGraphComponent>,
): { zoomIn: HTMLButtonElement; zoomOut: HTMLButtonElement } {
  const zoomIn = fixture.nativeElement.querySelector(
    '.graph-zoom-button[aria-label="Zoom in graph"]',
  ) as HTMLButtonElement | null;
  const zoomOut = fixture.nativeElement.querySelector(
    '.graph-zoom-button[aria-label="Zoom out graph"]',
  ) as HTMLButtonElement | null;
  if (!zoomIn || !zoomOut) {
    throw new Error('Expected graph zoom controls to render');
  }
  return { zoomIn, zoomOut };
}

function testHostElement(rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>): HTMLElement {
  return {
    getBoundingClientRect: () =>
      ({
        bottom: rect.top + rect.height,
        height: rect.height,
        left: rect.left,
        right: rect.left + rect.width,
        top: rect.top,
        width: rect.width,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
      }) as DOMRect,
  } as HTMLElement;
}

async function installDomGlobals(): Promise<void> {
  const { JSDOM } = await import('jsdom');
  const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1/',
  });
  const animationFrames = new Map<number, ReturnType<typeof setTimeout>>();
  let nextAnimationFrameId = 1;

  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('Node', window.Node);
  vi.stubGlobal('Element', window.Element);
  vi.stubGlobal('HTMLElement', window.HTMLElement);
  vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
  vi.stubGlobal('SVGElement', window.SVGElement);
  vi.stubGlobal('Event', window.Event);
  vi.stubGlobal('MouseEvent', window.MouseEvent);
  vi.stubGlobal('KeyboardEvent', window.KeyboardEvent);
  vi.stubGlobal('PointerEvent', window.PointerEvent ?? window.MouseEvent);
  vi.stubGlobal('TouchEvent', window.TouchEvent ?? window.Event);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const animationFrameId = nextAnimationFrameId;
    nextAnimationFrameId += 1;
    animationFrames.set(
      animationFrameId,
      setTimeout(() => callback(Date.now()), 0),
    );
    return animationFrameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (animationFrameId: number) => {
    const timeout = animationFrames.get(animationFrameId);
    if (timeout) {
      clearTimeout(timeout);
      animationFrames.delete(animationFrameId);
    }
  });
}

async function resolveExternalComponentResources(): Promise<void> {
  const resolveComponentResources = angularResourceApi.ɵresolveComponentResources;
  if (typeof resolveComponentResources !== 'function') {
    throw new Error(
      'Angular component resource resolver is unavailable. Update the graph template test ' +
        'resource-loading setup for this Angular version before importing external-template ' +
        'standalone components into TestBed.',
    );
  }
  await resolveComponentResources(loadAngularComponentResource);
}

async function loadAngularComponentResource(url: string): Promise<string> {
  const resourceUrl = new URL(url, import.meta.url);
  resourceUrl.search = '';
  resourceUrl.hash = '';
  return readFile(resourceUrl, 'utf8');
}

interface ProductionGraphHarness {
  component: TestProductionGraphComponent;
  nodeDoneToggled: string[];
  nodeMoveCanceled: void[];
  nodeMoveEnded: void[];
  nodeMoved: Array<{ nodeId: string; position: { x: number; y: number } }>;
  nodeSelectionSet: Array<string | null>;
  nodeSelectionToggled: string[];
  targetAmountChanged: Array<{ targetId: string; amountPerMinute: number }>;
}

interface RenderedProductionGraphHarness {
  controls: RenderedProductionGraphControls;
  fixture: ComponentFixture<ProductionGraphComponent>;
  targetAmountChanged: Array<{ targetId: string; amountPerMinute: number }>;
}

interface RenderedProductionGraphControls {
  graph: WritableSignal<ReturnType<ProductionGraphComponent['graph']>>;
  dataset: WritableSignal<ReturnType<ProductionGraphComponent['dataset']>>;
  layout: WritableSignal<ReturnType<ProductionGraphComponent['layout']>>;
  displaySettings: WritableSignal<ReturnType<ProductionGraphComponent['displaySettings']>>;
  selectedNodeId: WritableSignal<ReturnType<ProductionGraphComponent['selectedNodeId']>>;
  completedNodeIds: WritableSignal<ReturnType<ProductionGraphComponent['completedNodeIds']>>;
  nodeNotes: WritableSignal<ReturnType<ProductionGraphComponent['nodeNotes']>>;
  interactionLocked: WritableSignal<ReturnType<ProductionGraphComponent['interactionLocked']>>;
  targetEditingLocked: WritableSignal<ReturnType<ProductionGraphComponent['targetEditingLocked']>>;
}

interface RenderedProductionGraphInputSignals {
  graph: Signal<ReturnType<ProductionGraphComponent['graph']>>;
  dataset: Signal<ReturnType<ProductionGraphComponent['dataset']>>;
  layout: Signal<ReturnType<ProductionGraphComponent['layout']>>;
  displaySettings: Signal<ReturnType<ProductionGraphComponent['displaySettings']>>;
  selectedNodeId: Signal<ReturnType<ProductionGraphComponent['selectedNodeId']>>;
  completedNodeIds: Signal<ReturnType<ProductionGraphComponent['completedNodeIds']>>;
  nodeNotes: Signal<ReturnType<ProductionGraphComponent['nodeNotes']>>;
  interactionLocked: Signal<ReturnType<ProductionGraphComponent['interactionLocked']>>;
  targetEditingLocked: Signal<ReturnType<ProductionGraphComponent['targetEditingLocked']>>;
}

const OUTPUT_NODE_ID = 'output:target-plate';

class TestResizeObserver {
  public observe(): void {
    return undefined;
  }

  public unobserve(): void {
    return undefined;
  }

  public disconnect(): void {
    return undefined;
  }
}

class TestProductionGraphComponent extends ProductionGraphComponent {
  private readonly selectedNodeIdValue = signal<string | null>(null);
  private readonly interactionLockedValue = signal(false);
  private readonly targetEditingLockedValue = signal(false);

  public override readonly selectedNodeId: ProductionGraphComponent['selectedNodeId'] =
    this.selectedNodeIdValue.asReadonly() as ProductionGraphComponent['selectedNodeId'];

  public override readonly interactionLocked: ProductionGraphComponent['interactionLocked'] =
    this.interactionLockedValue.asReadonly() as ProductionGraphComponent['interactionLocked'];

  public override readonly targetEditingLocked: ProductionGraphComponent['targetEditingLocked'] =
    this.targetEditingLockedValue.asReadonly() as ProductionGraphComponent['targetEditingLocked'];

  public setSelectedNodeId(nodeId: string | null): void {
    this.selectedNodeIdValue.set(nodeId);
  }

  public setInteractionLocked(locked: boolean): void {
    this.interactionLockedValue.set(locked);
  }

  public setTargetEditingLocked(locked: boolean): void {
    this.targetEditingLockedValue.set(locked);
  }
}
