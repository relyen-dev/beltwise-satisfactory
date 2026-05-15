import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { GameDataset } from '@beltwise/game-data';
import {
  applyGraphLayout,
  createDefaultGraphDisplaySettings,
  toDefaultGraphRendererModel,
  type GraphLayoutState,
  type GraphDisplaySettings,
  type ProductionGraph,
} from '@beltwise/planner-core';
import { F_CONNECTION_BUILDERS, FFlowModule } from '@foblex/flow';
import {
  FOBLEX_CONNECTION_BUILDERS,
  type BeltwiseFoblexFlowEdge,
  type BeltwiseFoblexFlowModel,
  foblexInputId,
  foblexOutputId,
  formatDisplayDecimalValue,
  toFoblexFlowModel,
} from './adapters/foblex-flow.adapter';

const GRAPH_ZOOM_MINIMUM = 0.2;
const GRAPH_ZOOM_MAXIMUM = 2.5;
const GRAPH_ZOOM_STEP = 0.12;
const NODE_CLICK_MOVE_TOLERANCE_PX = 5;
const NODE_DESELECTION_DELAY_MS = 300;
const NODE_DOUBLE_CLICK_RESTORE_WINDOW_MS = 500;

interface GraphFocusScope {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

interface NodePointerStart {
  x: number;
  y: number;
}

interface ImmediateSelectionSnapshot {
  nodeId: string;
  previousSelectedNodeId: string | null;
}

@Component({
  selector: 'bw-production-graph',
  standalone: true,
  imports: [CommonModule, FFlowModule],
  providers: [{ provide: F_CONNECTION_BUILDERS, useValue: FOBLEX_CONNECTION_BUILDERS }],
  templateUrl: './production-graph.component.html',
  styleUrl: './production-graph.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionGraphComponent implements OnDestroy {
  public readonly graph = input<ProductionGraph | null>(null);
  public readonly dataset = input<GameDataset | null>(null);
  public readonly layout = input<GraphLayoutState>({ nodePositions: {} });
  public readonly displaySettings = input<GraphDisplaySettings>(
    createDefaultGraphDisplaySettings(),
  );
  public readonly selectedNodeId = input<string | null>(null);
  public readonly completedNodeIds = input<ReadonlySet<string>>(new Set<string>());
  public readonly nodeNotes = input<Readonly<Record<string, string>>>({});
  public readonly interactionLocked = input(false);
  public readonly nodeMoved = output<{ nodeId: string; position: { x: number; y: number } }>();
  public readonly nodeMoveEnded = output<void>();
  public readonly nodeSelectionSet = output<string | null>();
  public readonly nodeSelectionToggled = output<string>();
  public readonly nodeDoneToggled = output<string>();
  public readonly graphZoomMinimum = GRAPH_ZOOM_MINIMUM;
  public readonly graphZoomMaximum = GRAPH_ZOOM_MAXIMUM;
  public readonly graphZoomStep = GRAPH_ZOOM_STEP;
  private readonly nodePointerStarts = new Map<string, NodePointerStart>();
  private readonly movedNodeIds = new Set<string>();
  private immediateSelectionSnapshot: ImmediateSelectionSnapshot | null = null;
  private clearImmediateSelectionSnapshotTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingNodeDeselectionTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly defaultRendererModel = computed(() => {
    const graph = this.graph();
    return graph ? toDefaultGraphRendererModel(graph) : null;
  });

  public readonly flowModel = computed(() => {
    const defaultRendererModel = this.defaultRendererModel();
    if (!defaultRendererModel) {
      return null;
    }

    const flowModel = toFoblexFlowModel(applyGraphLayout(defaultRendererModel, this.layout()), {
      dataset: this.dataset(),
      displaySettings: this.displaySettings(),
    });
    return flowModel.nodes.length > 0 ? flowModel : null;
  });

  public readonly focusScope = computed<GraphFocusScope>(() => {
    const selectedNodeId = this.selectedNodeId();
    const flow = this.flowModel();
    if (!selectedNodeId || !flow) {
      return { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
    }
    return buildDirectFocusScope(flow, selectedNodeId);
  });

  public inputId(nodeId: string): string {
    return foblexInputId(nodeId);
  }

  public outputId(nodeId: string): string {
    return foblexOutputId(nodeId);
  }

  public isNodeSelected(nodeId: string): boolean {
    return this.selectedNodeId() === nodeId;
  }

  public isNodeFocused(nodeId: string): boolean {
    return this.focusScope().nodeIds.has(nodeId);
  }

  public isNodeDimmed(nodeId: string): boolean {
    return this.selectedNodeId() !== null && !this.focusScope().nodeIds.has(nodeId);
  }

  public isNodeDone(nodeId: string): boolean {
    return this.completedNodeIds().has(nodeId);
  }

  public isEdgeFocused(edgeId: string): boolean {
    return this.focusScope().edgeIds.has(edgeId);
  }

  public isEdgeDimmed(edgeId: string): boolean {
    return this.selectedNodeId() !== null && !this.focusScope().edgeIds.has(edgeId);
  }

  public isEdgeDone(edge: BeltwiseFoblexFlowEdge): boolean {
    return this.completedNodeIds().has(edge.targetNodeId);
  }

  public nodeNote(nodeId: string): string {
    return this.nodeNotes()[nodeId] ?? '';
  }

  public formatMachineCount(machineCount: number | undefined): string {
    return formatDisplayDecimalValue(machineCount, this.displaySettings().rateDecimalPlaces);
  }

  public tooltipStatKey(stat: string, index: number): string {
    return `stat:${index}:${stat}`;
  }

  public tooltipFlowKey(
    flow: { itemName: string; amountPerMinute: string; machineCount?: string },
    section: string,
    index: number,
  ): string {
    return `${section}:${index}:${flow.itemName}:${flow.amountPerMinute}:${flow.machineCount ?? ''}`;
  }

  public handleNodePointerDown(nodeId: string, event: PointerEvent): void {
    this.nodePointerStarts.set(nodeId, { x: event.clientX, y: event.clientY });
  }

  public handleNodePointerUp(nodeId: string, event: PointerEvent): void {
    const start = this.nodePointerStarts.get(nodeId);
    this.nodePointerStarts.delete(nodeId);
    if (this.movedNodeIds.delete(nodeId)) {
      this.nodeMoveEnded.emit();
      return;
    }
    if (!start) {
      return;
    }

    const movedDistance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (movedDistance <= NODE_CLICK_MOVE_TOLERANCE_PX) {
      this.handleNodeClick(nodeId);
    }
  }

  public handleNodeDoubleClick(nodeId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const selectionSnapshot = this.immediateSelectionSnapshot;
    this.clearPendingNodeDeselection();
    this.clearImmediateSelectionSnapshot();
    if (selectionSnapshot?.nodeId === nodeId) {
      this.nodeSelectionSet.emit(selectionSnapshot.previousSelectedNodeId);
    }
    this.nodeDoneToggled.emit(nodeId);
  }

  public handleNodePosition(nodeId: string, position: { x: number; y: number }): void {
    if (this.interactionLocked()) {
      return;
    }
    this.movedNodeIds.add(nodeId);
    this.nodeMoved.emit({ nodeId, position });
  }

  public ngOnDestroy(): void {
    this.clearPendingNodeDeselection();
    this.clearImmediateSelectionSnapshot();
  }

  private handleNodeClick(nodeId: string): void {
    const selectedNodeId = this.selectedNodeId();
    if (selectedNodeId === nodeId) {
      this.scheduleNodeDeselection(nodeId);
      return;
    }

    this.clearPendingNodeDeselection();
    this.rememberImmediateSelection(nodeId, selectedNodeId);
    this.nodeSelectionToggled.emit(nodeId);
  }

  private scheduleNodeDeselection(nodeId: string): void {
    this.clearPendingNodeDeselection();
    this.pendingNodeDeselectionTimeout = setTimeout(() => {
      this.pendingNodeDeselectionTimeout = null;
      this.nodeSelectionToggled.emit(nodeId);
    }, NODE_DESELECTION_DELAY_MS);
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
    }, NODE_DOUBLE_CLICK_RESTORE_WINDOW_MS);
  }

  private clearImmediateSelectionSnapshot(): void {
    if (this.clearImmediateSelectionSnapshotTimeout !== null) {
      clearTimeout(this.clearImmediateSelectionSnapshotTimeout);
      this.clearImmediateSelectionSnapshotTimeout = null;
    }
    this.immediateSelectionSnapshot = null;
  }
}

function buildDirectFocusScope(
  flow: BeltwiseFoblexFlowModel,
  selectedNodeId: string,
): GraphFocusScope {
  const selectedNode = flow.nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNode) {
    return { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
  }

  const nodeIds = new Set<string>([selectedNode.id]);
  const edgeIds = new Set<string>();
  for (const edge of flow.edges) {
    if (edge.sourceNodeId !== selectedNodeId && edge.targetNodeId !== selectedNodeId) {
      continue;
    }
    edgeIds.add(edge.id);
    nodeIds.add(edge.sourceNodeId);
    nodeIds.add(edge.targetNodeId);
  }

  return { nodeIds, edgeIds };
}
