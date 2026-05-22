export const NODE_CLICK_MOVE_TOLERANCE_PX = 5;
export const NODE_DESELECTION_DELAY_MS = 300;
export const NODE_DOUBLE_CLICK_RESTORE_WINDOW_MS = 500;

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphInteractionControllerOptions {
  getSelectedNodeId: () => string | null;
  isInteractionLocked: () => boolean;
  onNodeDoneToggled: (nodeId: string) => void;
  onNodeMoveCanceled: () => void;
  onNodeMoved: (move: { nodeId: string; position: GraphPoint }) => void;
  onNodeMoveEnded: () => void;
  onNodeSelectionSet: (nodeId: string | null) => void;
  onNodeSelectionToggled: (nodeId: string) => void;
  clickMoveTolerancePx?: number;
  deselectionDelayMs?: number;
  doubleClickRestoreWindowMs?: number;
}

interface ImmediateSelectionSnapshot {
  nodeId: string;
  previousSelectedNodeId: string | null;
}

export class GraphInteractionController {
  private readonly clickMoveTolerancePx: number;
  private readonly deselectionDelayMs: number;
  private readonly doubleClickRestoreWindowMs: number;
  private readonly nodePointerStarts = new Map<string, GraphPoint>();
  private readonly movedNodeIds = new Set<string>();
  private immediateSelectionSnapshot: ImmediateSelectionSnapshot | null = null;
  private clearImmediateSelectionSnapshotTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingNodeDeselectionTimeout: ReturnType<typeof setTimeout> | null = null;

  public constructor(private readonly options: GraphInteractionControllerOptions) {
    this.clickMoveTolerancePx = options.clickMoveTolerancePx ?? NODE_CLICK_MOVE_TOLERANCE_PX;
    this.deselectionDelayMs = options.deselectionDelayMs ?? NODE_DESELECTION_DELAY_MS;
    this.doubleClickRestoreWindowMs =
      options.doubleClickRestoreWindowMs ?? NODE_DOUBLE_CLICK_RESTORE_WINDOW_MS;
  }

  public handleNodePointerDown(nodeId: string, point: GraphPoint): void {
    this.nodePointerStarts.set(nodeId, point);
  }

  public handleNodePointerUp(nodeId: string, point: GraphPoint): void {
    const start = this.nodePointerStarts.get(nodeId);
    this.nodePointerStarts.delete(nodeId);
    if (this.movedNodeIds.delete(nodeId)) {
      this.options.onNodeMoveEnded();
      return;
    }
    if (!start) {
      return;
    }

    const movedDistance = Math.hypot(point.x - start.x, point.y - start.y);
    if (movedDistance <= this.clickMoveTolerancePx) {
      this.handleNodeClick(nodeId);
    }
  }

  public handleNodeDoubleClick(nodeId: string): void {
    const selectionSnapshot = this.immediateSelectionSnapshot;
    this.clearPendingNodeDeselection();
    this.clearImmediateSelectionSnapshot();
    if (selectionSnapshot?.nodeId === nodeId) {
      this.options.onNodeSelectionSet(selectionSnapshot.previousSelectedNodeId);
    }
    this.options.onNodeDoneToggled(nodeId);
  }

  public handleNodePosition(nodeId: string, position: GraphPoint): void {
    if (this.options.isInteractionLocked()) {
      return;
    }
    this.movedNodeIds.add(nodeId);
    this.options.onNodeMoved({ nodeId, position });
  }

  public cancelActiveNodeMove(): void {
    const hadActiveNodePointer = this.nodePointerStarts.size > 0;
    const hadMovedNode = this.movedNodeIds.size > 0;
    this.nodePointerStarts.clear();
    this.movedNodeIds.clear();
    this.clearPendingNodeDeselection();
    this.clearImmediateSelectionSnapshot();
    if (hadActiveNodePointer || hadMovedNode) {
      this.options.onNodeMoveCanceled();
    }
  }

  public destroy(): void {
    this.clearPendingNodeDeselection();
    this.clearImmediateSelectionSnapshot();
  }

  private handleNodeClick(nodeId: string): void {
    const selectedNodeId = this.options.getSelectedNodeId();
    if (selectedNodeId === nodeId) {
      this.scheduleNodeDeselection(nodeId);
      return;
    }

    this.clearPendingNodeDeselection();
    this.rememberImmediateSelection(nodeId, selectedNodeId);
    this.options.onNodeSelectionToggled(nodeId);
  }

  private scheduleNodeDeselection(nodeId: string): void {
    this.clearPendingNodeDeselection();
    this.pendingNodeDeselectionTimeout = setTimeout(() => {
      this.pendingNodeDeselectionTimeout = null;
      this.options.onNodeSelectionToggled(nodeId);
    }, this.deselectionDelayMs);
  }

  private clearPendingNodeDeselection(): void {
    if (this.pendingNodeDeselectionTimeout === null) {
      return;
    }
    clearTimeout(this.pendingNodeDeselectionTimeout);
    this.pendingNodeDeselectionTimeout = null;
  }

  private rememberImmediateSelection(nodeId: string, previousSelectedNodeId: string | null): void {
    this.clearImmediateSelectionSnapshot();
    this.immediateSelectionSnapshot = { nodeId, previousSelectedNodeId };
    this.clearImmediateSelectionSnapshotTimeout = setTimeout(() => {
      this.immediateSelectionSnapshot = null;
      this.clearImmediateSelectionSnapshotTimeout = null;
    }, this.doubleClickRestoreWindowMs);
  }

  private clearImmediateSelectionSnapshot(): void {
    if (this.clearImmediateSelectionSnapshotTimeout !== null) {
      clearTimeout(this.clearImmediateSelectionSnapshotTimeout);
      this.clearImmediateSelectionSnapshotTimeout = null;
    }
    this.immediateSelectionSnapshot = null;
  }
}
