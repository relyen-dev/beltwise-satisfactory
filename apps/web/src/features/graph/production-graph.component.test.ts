import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductionGraphComponent } from './production-graph.component';

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductionGraphComponent', () => {
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
});

function createComponentHarness(): ProductionGraphHarness {
  const injector = Injector.create({ providers: [] });
  const component = runInInjectionContext(injector, () => new TestProductionGraphComponent());
  const nodeDoneToggled: string[] = [];
  const nodeMoveEnded: void[] = [];
  const nodeMoved: Array<{ nodeId: string; position: { x: number; y: number } }> = [];
  const nodeSelectionSet: Array<string | null> = [];
  const nodeSelectionToggled: string[] = [];

  component.nodeDoneToggled.subscribe((nodeId) => nodeDoneToggled.push(nodeId));
  component.nodeMoveEnded.subscribe(() => nodeMoveEnded.push(undefined));
  component.nodeMoved.subscribe((move) => nodeMoved.push(move));
  component.nodeSelectionSet.subscribe((nodeId) => nodeSelectionSet.push(nodeId));
  component.nodeSelectionToggled.subscribe((nodeId) => nodeSelectionToggled.push(nodeId));

  return {
    component,
    nodeDoneToggled,
    nodeMoveEnded,
    nodeMoved,
    nodeSelectionSet,
    nodeSelectionToggled,
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

interface ProductionGraphHarness {
  component: TestProductionGraphComponent;
  nodeDoneToggled: string[];
  nodeMoveEnded: void[];
  nodeMoved: Array<{ nodeId: string; position: { x: number; y: number } }>;
  nodeSelectionSet: Array<string | null>;
  nodeSelectionToggled: string[];
}

class TestProductionGraphComponent extends ProductionGraphComponent {
  private readonly selectedNodeIdValue = signal<string | null>(null);
  private readonly interactionLockedValue = signal(false);

  public override readonly selectedNodeId: ProductionGraphComponent['selectedNodeId'] =
    this.selectedNodeIdValue.asReadonly() as ProductionGraphComponent['selectedNodeId'];

  public override readonly interactionLocked: ProductionGraphComponent['interactionLocked'] =
    this.interactionLockedValue.asReadonly() as ProductionGraphComponent['interactionLocked'];

  public setSelectedNodeId(nodeId: string | null): void {
    this.selectedNodeIdValue.set(nodeId);
  }

  public setInteractionLocked(locked: boolean): void {
    this.interactionLockedValue.set(locked);
  }
}
