import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphInteractionController } from './graph-interaction.controller';

describe('GraphInteractionController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a node selection toggle when pointer down and up stay within click tolerance', () => {
    const harness = createInteractionHarness();

    harness.controller.handleNodePointerDown('recipe:iron-plate', { x: 12, y: 20 });
    harness.controller.handleNodePointerUp('recipe:iron-plate', { x: 15, y: 24 });

    expect(harness.nodeSelectionToggled).toEqual(['recipe:iron-plate']);
  });

  it('delays deselection for an already selected node', () => {
    vi.useFakeTimers();
    const harness = createInteractionHarness();
    harness.selectedNodeId = 'recipe:iron-plate';

    harness.controller.handleNodePointerDown('recipe:iron-plate', { x: 12, y: 20 });
    harness.controller.handleNodePointerUp('recipe:iron-plate', { x: 12, y: 20 });

    expect(harness.nodeSelectionToggled).toEqual([]);

    vi.advanceTimersByTime(299);
    expect(harness.nodeSelectionToggled).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(harness.nodeSelectionToggled).toEqual(['recipe:iron-plate']);
  });

  it('restores the previous selection on double-click and emits a done toggle', () => {
    vi.useFakeTimers();
    const harness = createInteractionHarness();
    harness.selectedNodeId = 'recipe:iron-rod';

    harness.controller.handleNodePointerDown('recipe:iron-plate', { x: 12, y: 20 });
    harness.controller.handleNodePointerUp('recipe:iron-plate', { x: 13, y: 21 });
    harness.controller.handleNodeDoubleClick('recipe:iron-plate');

    expect(harness.nodeSelectionToggled).toEqual(['recipe:iron-plate']);
    expect(harness.nodeSelectionSet).toEqual(['recipe:iron-rod']);
    expect(harness.nodeDoneToggled).toEqual(['recipe:iron-plate']);
  });

  it('does not restore a stale immediate selection snapshot on double-click', () => {
    vi.useFakeTimers();
    const harness = createInteractionHarness();
    harness.selectedNodeId = 'recipe:iron-rod';

    harness.controller.handleNodePointerDown('recipe:iron-plate', { x: 12, y: 20 });
    harness.controller.handleNodePointerUp('recipe:iron-plate', { x: 13, y: 21 });
    vi.advanceTimersByTime(500);
    harness.controller.handleNodeDoubleClick('recipe:iron-plate');

    expect(harness.nodeSelectionSet).toEqual([]);
    expect(harness.nodeDoneToggled).toEqual(['recipe:iron-plate']);
  });

  it('emits node move end on pointer up after a moved node without selecting', () => {
    const harness = createInteractionHarness();

    harness.controller.handleNodePointerDown('recipe:iron-plate', { x: 12, y: 20 });
    harness.controller.handleNodePosition('recipe:iron-plate', { x: 100, y: 200 });
    harness.controller.handleNodePointerUp('recipe:iron-plate', { x: 80, y: 120 });

    expect(harness.nodeMoved).toEqual([
      { nodeId: 'recipe:iron-plate', position: { x: 100, y: 200 } },
    ]);
    expect(harness.nodeMoveEnded).toHaveLength(1);
    expect(harness.nodeSelectionToggled).toEqual([]);
  });

  it('suppresses node move emissions while graph interaction is locked', () => {
    const harness = createInteractionHarness();
    harness.interactionLocked = true;

    harness.controller.handleNodePointerDown('recipe:iron-plate', { x: 12, y: 20 });
    harness.controller.handleNodePosition('recipe:iron-plate', { x: 100, y: 200 });
    harness.controller.handleNodePointerUp('recipe:iron-plate', { x: 80, y: 120 });

    expect(harness.nodeMoved).toEqual([]);
    expect(harness.nodeMoveEnded).toEqual([]);
    expect(harness.nodeSelectionToggled).toEqual([]);
  });

  it('clears pending delayed actions on destroy', () => {
    vi.useFakeTimers();
    const harness = createInteractionHarness();
    harness.selectedNodeId = 'recipe:iron-plate';

    harness.controller.handleNodePointerDown('recipe:iron-plate', { x: 12, y: 20 });
    harness.controller.handleNodePointerUp('recipe:iron-plate', { x: 12, y: 20 });
    harness.controller.destroy();
    vi.runAllTimers();

    expect(harness.nodeSelectionToggled).toEqual([]);
  });
});

function createInteractionHarness(): GraphInteractionHarness {
  let interactionLocked = false;
  let selectedNodeId: string | null = null;
  const nodeDoneToggled: string[] = [];
  const nodeMoveEnded: void[] = [];
  const nodeMoved: Array<{ nodeId: string; position: { x: number; y: number } }> = [];
  const nodeSelectionSet: Array<string | null> = [];
  const nodeSelectionToggled: string[] = [];
  const controller = new GraphInteractionController({
    getSelectedNodeId: () => selectedNodeId,
    isInteractionLocked: () => interactionLocked,
    onNodeDoneToggled: (nodeId) => nodeDoneToggled.push(nodeId),
    onNodeMoved: (move) => nodeMoved.push(move),
    onNodeMoveEnded: () => nodeMoveEnded.push(undefined),
    onNodeSelectionSet: (nodeId) => nodeSelectionSet.push(nodeId),
    onNodeSelectionToggled: (nodeId) => nodeSelectionToggled.push(nodeId),
  });
  return {
    controller,
    get interactionLocked(): boolean {
      return interactionLocked;
    },
    set interactionLocked(value: boolean) {
      interactionLocked = value;
    },
    nodeDoneToggled,
    nodeMoveEnded,
    nodeMoved,
    nodeSelectionSet,
    nodeSelectionToggled,
    get selectedNodeId(): string | null {
      return selectedNodeId;
    },
    set selectedNodeId(value: string | null) {
      selectedNodeId = value;
    },
  };
}

interface GraphInteractionHarness {
  controller: GraphInteractionController;
  interactionLocked: boolean;
  nodeDoneToggled: string[];
  nodeMoveEnded: void[];
  nodeMoved: Array<{ nodeId: string; position: { x: number; y: number } }>;
  nodeSelectionSet: Array<string | null>;
  nodeSelectionToggled: string[];
  selectedNodeId: string | null;
}
