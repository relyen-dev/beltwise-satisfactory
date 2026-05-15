import { signal, type Signal } from '@angular/core';
import { type GraphLayoutState, type PlannerProject } from '@beltwise/planner-core';
import * as projectMutations from './planner-project-mutations';

export const GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS = 150;

interface PendingGraphNodePositionCommit {
  projectId: string;
  positions: GraphLayoutState['nodePositions'];
  timeout: ReturnType<typeof setTimeout> | null;
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

  public readonly selectedGraphNodeId = signal<string | null>(null);

  public constructor(private readonly options: PlannerGraphBuildSliceOptions) {}

  public flushGraphNodePositions(): void {
    this.flushPendingGraphNodePositions();
  }

  public setGraphNodePosition(nodeId: string, position: { x: number; y: number }): void {
    if (this.nodeLayoutLocked()) {
      return;
    }
    const project = this.options.activeProject();
    if (!project) {
      return;
    }
    this.queueGraphNodePosition(project, nodeId, position);
  }

  public resetGraphLayout(): void {
    if (this.nodeLayoutLocked()) {
      return;
    }
    this.clearPendingGraphNodePositions();
    this.options.updateActiveProject(projectMutations.resetGraphLayout);
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
    this.options.updateActiveProject((project) => projectMutations.setPlanLocked(project, locked));
  }

  public setNodeLayoutLocked(locked: boolean): void {
    this.options.updateActiveProject((project) =>
      projectMutations.setNodeLayoutLocked(project, locked),
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
      projectMutations.setGraphNodeNote(project, selectedNodeId, note),
    );
  }

  public activeLayout(): GraphLayoutState {
    return this.options.activeProject()?.graphLayout ?? projectMutations.defaultGraphLayout();
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
    this.options.updateProjectById(pending.projectId, (project) =>
      projectMutations.setGraphNodePositions(project, pending.positions),
    );
  }

  public clearPendingGraphNodePositions(): void {
    const pending = this.pendingGraphNodePositionCommit;
    if (pending && pending.timeout !== null) {
      clearTimeout(pending.timeout);
    }
    this.pendingGraphNodePositionCommit = null;
  }

  private setGraphNodeDone(nodeId: string, done: boolean): void {
    this.options.updateActiveProject((project) =>
      projectMutations.setGraphNodeDone(project, nodeId, done),
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
}
