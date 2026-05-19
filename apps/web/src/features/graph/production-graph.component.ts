import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';

import type { GameDataset } from '@beltwise/game-data';
import {
  applyGraphLayout,
  createDefaultGraphDisplaySettings,
  type GraphLayoutState,
  type GraphDisplaySettings,
  type ProductionGraph,
} from '@beltwise/planner-core';
import { FCanvasComponent, F_CONNECTION_BUILDERS, FFlowModule } from '@foblex/flow';
import {
  FOBLEX_CONNECTION_BUILDERS,
  type BeltwiseFoblexFlowEdge,
  type BeltwiseFoblexFlowNode,
  foblexInputId,
  foblexOutputId,
  formatDisplayDecimalValue,
  toFoblexFlowModel,
} from './adapters/foblex-flow.adapter';
import { toDefaultGraphRendererModel } from './production-graph.layout';
import { GraphInteractionController } from './graph-interaction.controller';
import {
  buildDirectFocusScope,
  emptyGraphFocusScope,
  formatTargetAmountInputValue,
  normalizeTargetAmount,
  parseTargetAmount,
  type GraphFocusScope,
} from './graph-interaction.presenter';

const GRAPH_ZOOM_MINIMUM = 0.2;
const GRAPH_ZOOM_MAXIMUM = 2.5;
const GRAPH_ZOOM_STEP = 0.12;
const GRAPH_AUTO_FIT_PADDING = { x: 72, y: 56 };

type CanvasFitTarget = Pick<FCanvasComponent, 'fitToScreen'>;

@Component({
  selector: 'bw-production-graph',
  standalone: true,
  imports: [FFlowModule],
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
  public readonly targetEditingLocked = input(false);
  public readonly nodeMoved = output<{ nodeId: string; position: { x: number; y: number } }>();
  public readonly nodeMoveEnded = output<void>();
  public readonly nodeSelectionSet = output<string | null>();
  public readonly nodeSelectionToggled = output<string>();
  public readonly nodeDoneToggled = output<string>();
  public readonly targetAmountChanged = output<{ targetId: string; amountPerMinute: number }>();
  public readonly graphZoomMinimum = GRAPH_ZOOM_MINIMUM;
  public readonly graphZoomMaximum = GRAPH_ZOOM_MAXIMUM;
  public readonly graphZoomStep = GRAPH_ZOOM_STEP;
  private readonly canvas = viewChild<FCanvasComponent>('graphCanvas');
  private readonly interactionController = new GraphInteractionController({
    getSelectedNodeId: () => this.selectedNodeId(),
    isInteractionLocked: () => this.interactionLocked(),
    onNodeDoneToggled: (nodeId) => this.nodeDoneToggled.emit(nodeId),
    onNodeMoved: (move) => this.nodeMoved.emit(move),
    onNodeMoveEnded: () => this.nodeMoveEnded.emit(),
    onNodeSelectionSet: (nodeId) => this.nodeSelectionSet.emit(nodeId),
    onNodeSelectionToggled: (nodeId) => this.nodeSelectionToggled.emit(nodeId),
  });
  private autoFittedGraph: ProductionGraph | null = null;

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
      return emptyGraphFocusScope();
    }
    return buildDirectFocusScope(flow, selectedNodeId);
  });

  public handleFlowRendered(): void {
    this.fitRenderedGraphIntoCanvas(this.canvas());
  }

  public fitRenderedGraphIntoCanvas(canvas: CanvasFitTarget | undefined): void {
    const graph = this.graph();
    const flow = this.flowModel();
    if (!canvas || !graph || !flow || graph === this.autoFittedGraph) {
      return;
    }

    this.autoFittedGraph = graph;
    canvas.fitToScreen(GRAPH_AUTO_FIT_PADDING, false);
  }

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

  public isFixedOutputTarget(node: BeltwiseFoblexFlowNode): boolean {
    return node.kind === 'output' && node.data.targetMode === 'fixed';
  }

  public isEditableOutputTarget(node: BeltwiseFoblexFlowNode): boolean {
    return (
      this.isFixedOutputTarget(node) &&
      node.data.targetId !== undefined &&
      !this.targetEditingLocked()
    );
  }

  public targetAmountInputValue(node: BeltwiseFoblexFlowNode): string {
    return formatTargetAmountInputValue(node.data.amountPerMinute);
  }

  public targetAmountDisplayValue(node: BeltwiseFoblexFlowNode): string {
    return formatDisplayDecimalValue(
      node.data.amountPerMinute,
      this.displaySettings().rateDecimalPlaces,
    );
  }

  public shouldShowTargetAmountInput(node: BeltwiseFoblexFlowNode): boolean {
    return this.isEditableOutputTarget(node) && this.isNodeSelected(node.id);
  }

  public handleTargetAmountChange(node: BeltwiseFoblexFlowNode, event: Event): void {
    event.stopPropagation();
    const control = eventControlTarget(event);
    const targetId = node.data.targetId;
    if (!control || !targetId || !this.isEditableOutputTarget(node)) {
      return;
    }

    const amountPerMinute = parseTargetAmount(control.value);
    control.value = formatTargetAmountInputValue(amountPerMinute);
    if (amountPerMinute === normalizeTargetAmount(node.data.amountPerMinute)) {
      return;
    }
    this.targetAmountChanged.emit({ targetId, amountPerMinute });
  }

  public commitTargetAmount(node: BeltwiseFoblexFlowNode, event: Event): void {
    event.preventDefault();
    this.handleTargetAmountChange(node, event);
  }

  public stopNodeControlEvent(event: Event): void {
    event.stopPropagation();
  }

  public resetTargetAmountInput(node: BeltwiseFoblexFlowNode, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const control = eventControlTarget(event);
    if (control) {
      control.value = this.targetAmountInputValue(node);
    }
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
    this.interactionController.handleNodePointerDown(nodeId, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  public handleNodePointerUp(nodeId: string, event: PointerEvent): void {
    this.interactionController.handleNodePointerUp(nodeId, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  public handleNodeDoubleClick(nodeId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.interactionController.handleNodeDoubleClick(nodeId);
  }

  public handleNodePosition(nodeId: string, position: { x: number; y: number }): void {
    this.interactionController.handleNodePosition(nodeId, position);
  }

  public ngOnDestroy(): void {
    this.interactionController.destroy();
  }
}

interface GraphControlTarget extends EventTarget {
  value: string;
}

function eventControlTarget(event: Event): GraphControlTarget | null {
  return isGraphControlTarget(event.target) ? event.target : null;
}

function isGraphControlTarget(target: EventTarget | null): target is GraphControlTarget {
  if (target === null) {
    return false;
  }
  const candidate = target as { value?: unknown };
  return typeof candidate.value === 'string';
}
