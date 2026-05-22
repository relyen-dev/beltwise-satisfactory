import { signal, type Signal } from '@angular/core';
import {
  defaultGraphLayout,
  mutatePlanGraph,
  type GraphLayoutState,
  type PlannerProject,
} from '@beltwise/planner-core';

export const GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS = 150;

interface PendingGraphNodePositionCommit {
  projectId: string;
  positions: GraphLayoutState['nodePositions'];
  timeout: ReturnType<typeof setTimeout> | null;
}

interface PendingGraphNodePositionPreview {
  projectId: string;
  positions: GraphLayoutState['nodePositions'];
}

interface ActiveGraphNodePositionDrag {
  projectId: string;
  originalPositions: Record<string, { x: number; y: number } | null>;
}

interface PlannerGraphBuildSliceOptions {
  readonly activeProject: Signal<PlannerProject | null>;
  readonly updateActiveProject: (mapper: (project: PlannerProject) => PlannerProject) => void;
  readonly updateProjectById: (
    projectId: string,
    mapper: (project: PlannerProject) => PlannerProject,
  ) => void;
}

export class PlannerGraphBuildSlice {
  private pendingGraphNodePositionCommit: PendingGraphNodePositionCommit | null = null;
  private readonly pendingGraphNodePositionPreview =
    signal<PendingGraphNodePositionPreview | null>(null);
  private activeGraphNodePositionDrag: ActiveGraphNodePositionDrag | null = null;

  public readonly selectedGraphNodeId = signal<string | null>(null);

  public constructor(private readonly options: PlannerGraphBuildSliceOptions) {}

  public flushGraphNodePositions(): void {
    this.flushPendingGraphNodePositions();
    this.activeGraphNodePositionDrag = null;
  }

  public cancelGraphNodePositions(): void {
    const drag = this.activeGraphNodePositionDrag;
    this.clearPendingGraphNodePositions();
    this.activeGraphNodePositionDrag = null;
    if (!drag) {
      return;
    }

    this.options.updateProjectById(drag.projectId, (project) =>
      mutatePlanGraph(project, {
        type: 'restore-node-positions',
        positions: drag.originalPositions,
      }),
    );
  }

  public setGraphNodePosition(nodeId: string, position: { x: number; y: number }): void {
    if (this.nodeLayoutLocked()) {
      return;
    }
    const project = this.options.activeProject();
    if (!project) {
      return;
    }
    this.rememberGraphNodePositionDragStart(project, nodeId);
    this.queueGraphNodePosition(project, nodeId, position);
  }

  public resetGraphLayout(): void {
    if (this.nodeLayoutLocked()) {
      return;
    }
    this.clearPendingGraphNodePositions();
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'reset-layout' }),
    );
  }

  public selectGraphNode(nodeId: string): void {
    this.selectedGraphNodeId.set(nodeId);
  }

  public setGraphNodeSelection(nodeId: string | null): void {
    this.selectedGraphNodeId.set(nodeId);
  }

  public toggleGraphNodeSelection(nodeId: string): void {
    this.selectedGraphNodeId.update((selectedNodeId) =>
      selectedNodeId === nodeId ? null : nodeId,
    );
  }

  public clearSelectedGraphNode(): void {
    this.selectedGraphNodeId.set(null);
  }

  public setPlanLocked(locked: boolean): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-plan-locked', locked }),
    );
  }

  public setNodeLayoutLocked(locked: boolean): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-node-layout-locked', locked }),
    );
  }

  public setSelectedGraphNodeDone(done: boolean): void {
    const selectedNodeId = this.selectedGraphNodeId();
    if (!selectedNodeId) {
      return;
    }
    this.setGraphNodeDone(selectedNodeId, done);
  }

  public toggleGraphNodeDone(nodeId: string): void {
    const currentDone = this.options.activeProject()?.buildState.nodeStates[nodeId]?.done === true;
    this.setGraphNodeDone(nodeId, !currentDone);
  }

  public setSelectedGraphNodeNote(note: string): void {
    const selectedNodeId = this.selectedGraphNodeId();
    if (!selectedNodeId) {
      return;
    }
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-node-note', nodeId: selectedNodeId, note }),
    );
  }

  public activeLayout(): GraphLayoutState {
    const project = this.options.activeProject();
    if (!project) {
      return defaultGraphLayout();
    }

    const preview = this.pendingGraphNodePositionPreview();
    if (preview?.projectId !== project.id) {
      return project.graphLayout;
    }

    return {
      nodePositions: {
        ...project.graphLayout.nodePositions,
        ...preview.positions,
      },
    };
  }

  public flushPendingGraphNodePositions(): void {
    const pending = this.pendingGraphNodePositionCommit;
    if (!pending) {
      return;
    }
    if (pending.timeout !== null) {
      clearTimeout(pending.timeout);
    }
    this.pendingGraphNodePositionCommit = null;
    this.pendingGraphNodePositionPreview.set(null);
    this.options.updateProjectById(pending.projectId, (project) =>
      mutatePlanGraph(project, { type: 'set-node-positions', positions: pending.positions }),
    );
  }

  public clearPendingGraphNodePositions(): void {
    const pending = this.pendingGraphNodePositionCommit;
    if (pending && pending.timeout !== null) {
      clearTimeout(pending.timeout);
    }
    this.pendingGraphNodePositionCommit = null;
    this.pendingGraphNodePositionPreview.set(null);
    this.activeGraphNodePositionDrag = null;
  }

  private setGraphNodeDone(nodeId: string, done: boolean): void {
    this.options.updateActiveProject((project) =>
      mutatePlanGraph(project, { type: 'set-node-done', nodeId, done }),
    );
  }

  private queueGraphNodePosition(
    project: PlannerProject,
    nodeId: string,
    position: { x: number; y: number },
  ): void {
    if (this.pendingGraphNodePositionCommit?.projectId !== project.id) {
      this.flushPendingGraphNodePositions();
    }

    const pending = this.pendingGraphNodePositionCommit ?? {
      projectId: project.id,
      positions: {},
      timeout: null,
    };
    const comparisonPosition =
      pending.positions[nodeId] ?? project.graphLayout.nodePositions[nodeId];
    if (comparisonPosition?.x === position.x && comparisonPosition.y === position.y) {
      return;
    }

    pending.positions[nodeId] = position;
    this.pendingGraphNodePositionCommit = pending;
    this.pendingGraphNodePositionPreview.set({
      projectId: pending.projectId,
      positions: { ...pending.positions },
    });
    this.schedulePendingGraphNodePositionCommit(pending);
  }

  private schedulePendingGraphNodePositionCommit(pending: PendingGraphNodePositionCommit): void {
    if (pending.timeout !== null) {
      clearTimeout(pending.timeout);
    }
    pending.timeout = setTimeout(() => {
      this.flushPendingGraphNodePositions();
    }, GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS);
  }

  private nodeLayoutLocked(): boolean {
    return this.options.activeProject()?.buildState.nodeLayoutLocked ?? false;
  }

  private rememberGraphNodePositionDragStart(project: PlannerProject, nodeId: string): void {
    if (this.activeGraphNodePositionDrag?.projectId !== project.id) {
      this.activeGraphNodePositionDrag = {
        projectId: project.id,
        originalPositions: {},
      };
    }
    if (
      Object.prototype.hasOwnProperty.call(
        this.activeGraphNodePositionDrag.originalPositions,
        nodeId,
      )
    ) {
      return;
    }

    const currentPosition = project.graphLayout.nodePositions[nodeId];
    this.activeGraphNodePositionDrag.originalPositions[nodeId] = currentPosition
      ? { x: currentPosition.x, y: currentPosition.y }
      : null;
  }
}
