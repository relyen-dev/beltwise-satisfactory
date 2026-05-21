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
import {
  EFZoomDirection,
  FCanvasComponent,
  FFlowComponent,
  FZoomDirective,
  F_CONNECTION_BUILDERS,
  FFlowModule,
} from '@foblex/flow';
import {
  FOBLEX_CONNECTION_BUILDERS,
  type BeltwiseFoblexFlowEdge,
  type BeltwiseFoblexFlowNode,
  foblexInputId,
  foblexOutputId,
  toFoblexFlowModel,
} from './adapters/foblex-flow.adapter';
import { toDefaultGraphRendererModel } from './production-graph.layout';
import { GraphInteractionController } from './graph-interaction.controller';
import {
  buildDirectFocusScope,
  emptyGraphFocusScope,
  formatTargetAmountInputValue,
  isEditableOutputTargetNode,
  isFixedOutputTargetNode,
  prepareTargetAmountEdit,
  shouldShowTargetAmountInputForNode,
  type GraphFocusScope,
} from './graph-interaction.presenter';
import {
  formatGraphNodeKindDisplayValue,
  formatMachineCountDisplayValue,
  formatTargetAmountDisplayValue,
  graphNodeNote,
  graphTooltipFlowKey,
  graphTooltipStatKey,
  isGraphEdgeDimmed,
  isGraphEdgeDone,
  isGraphEdgeFocused,
  isGraphNodeDimmed,
  isGraphNodeDone,
  isGraphNodeFocused,
  isGraphNodeSelected,
  type GraphTooltipFlowSection,
} from './graph-presentation.presenter';

const GRAPH_ZOOM_MINIMUM = 0.2;
const GRAPH_ZOOM_MAXIMUM = 2.5;
const GRAPH_ZOOM_STEP = 0.06;
const GRAPH_BUTTON_ZOOM_STEP = 0.05;
const GRAPH_AUTO_FIT_PADDING = { x: 72, y: 56 };

type CanvasFitTarget = Pick<FCanvasComponent, 'fitToScreen'>;
type GraphHostTarget = Pick<FFlowComponent, 'hostElement'>;
type GraphZoomTarget = Pick<FZoomDirective, 'setZoom'>;

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
  public readonly graphButtonZoomStep = GRAPH_BUTTON_ZOOM_STEP;
  private readonly flow = viewChild<FFlowComponent>(FFlowComponent);
  private readonly canvas = viewChild<FCanvasComponent>('graphCanvas');
  private readonly zoom = viewChild<FZoomDirective>(FZoomDirective);
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

  public zoomGraphIn(event: Event): void {
    this.stopNodeControlEvent(event);
    this.zoomGraphAroundVisibleCenter(this.zoom(), this.flow(), EFZoomDirection.ZOOM_IN);
  }

  public zoomGraphOut(event: Event): void {
    this.stopNodeControlEvent(event);
    this.zoomGraphAroundVisibleCenter(this.zoom(), this.flow(), EFZoomDirection.ZOOM_OUT);
  }

  public handleGraphKeydown(event: KeyboardEvent): void {
    if (isEditableKeyboardTarget(event.target)) {
      return;
    }

    const direction = graphKeyboardZoomDirection(event);
    if (direction === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.zoomGraphAroundVisibleCenter(this.zoom(), this.flow(), direction);
  }

  public zoomGraphAroundVisibleCenter(
    zoom: GraphZoomTarget | undefined,
    flow: GraphHostTarget | undefined,
    direction: EFZoomDirection,
  ): void {
    if (!zoom || !flow) {
      return;
    }

    const centerPoint = visibleGraphCenterPoint(flow.hostElement);
    zoom.setZoom(centerPoint, GRAPH_BUTTON_ZOOM_STEP, direction, false);
  }

  public inputId(nodeId: string): string {
    return foblexInputId(nodeId);
  }

  public outputId(nodeId: string): string {
    return foblexOutputId(nodeId);
  }

  public isNodeSelected(nodeId: string): boolean {
    return isGraphNodeSelected(nodeId, this.selectedNodeId());
  }

  public isNodeFocused(nodeId: string): boolean {
    return isGraphNodeFocused(nodeId, this.focusScope());
  }

  public isNodeDimmed(nodeId: string): boolean {
    return isGraphNodeDimmed(nodeId, this.selectedNodeId(), this.focusScope());
  }

  public isNodeDone(nodeId: string): boolean {
    return isGraphNodeDone(nodeId, this.completedNodeIds());
  }

  public isEdgeFocused(edgeId: string): boolean {
    return isGraphEdgeFocused(edgeId, this.focusScope());
  }

  public isEdgeDimmed(edgeId: string): boolean {
    return isGraphEdgeDimmed(edgeId, this.selectedNodeId(), this.focusScope());
  }

  public isEdgeDone(edge: BeltwiseFoblexFlowEdge): boolean {
    return isGraphEdgeDone(edge, this.completedNodeIds());
  }

  public nodeNote(nodeId: string): string {
    return graphNodeNote(nodeId, this.nodeNotes());
  }

  public isFixedOutputTarget(node: BeltwiseFoblexFlowNode): boolean {
    return isFixedOutputTargetNode(node);
  }

  public isEditableOutputTarget(node: BeltwiseFoblexFlowNode): boolean {
    return isEditableOutputTargetNode(node, this.targetEditingLocked());
  }

  public targetAmountInputValue(node: BeltwiseFoblexFlowNode): string {
    return formatTargetAmountInputValue(node.data.amountPerMinute);
  }

  public targetAmountDisplayValue(node: BeltwiseFoblexFlowNode): string {
    return formatTargetAmountDisplayValue(
      node.data.amountPerMinute,
      this.displaySettings().rateDecimalPlaces,
    );
  }

  public shouldShowTargetAmountInput(node: BeltwiseFoblexFlowNode): boolean {
    return shouldShowTargetAmountInputForNode(
      node,
      this.selectedNodeId(),
      this.targetEditingLocked(),
    );
  }

  public handleTargetAmountChange(node: BeltwiseFoblexFlowNode, event: Event): void {
    event.stopPropagation();
    const control = eventControlTarget(event);
    if (!control) {
      return;
    }

    const edit = prepareTargetAmountEdit(node, control.value, this.targetEditingLocked());
    if (!edit) {
      return;
    }

    control.value = edit.inputValue;
    if (edit.change) {
      this.targetAmountChanged.emit(edit.change);
    }
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
    return formatMachineCountDisplayValue(machineCount, this.displaySettings().rateDecimalPlaces);
  }

  public formatNodeKind(kind: BeltwiseFoblexFlowNode['kind']): string {
    return formatGraphNodeKindDisplayValue(kind);
  }

  public tooltipStatKey(stat: string, index: number): string {
    return graphTooltipStatKey(stat, index);
  }

  public tooltipFlowKey(
    flow: { itemName: string; amountPerMinute: string; machineCount?: string },
    section: GraphTooltipFlowSection,
    index: number,
  ): string {
    return graphTooltipFlowKey(flow, section, index);
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

function visibleGraphCenterPoint(hostElement: HTMLElement): { x: number; y: number } {
  const rect = hostElement.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function graphKeyboardZoomDirection(event: KeyboardEvent): EFZoomDirection | null {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (event.code === 'PageUp' || event.code === 'NumpadAdd') {
    return EFZoomDirection.ZOOM_IN;
  }
  if (event.code === 'PageDown' || event.code === 'NumpadSubtract') {
    return EFZoomDirection.ZOOM_OUT;
  }
  if (event.key === '+' || event.key === '=') {
    return EFZoomDirection.ZOOM_IN;
  }
  if (event.key === '-' || event.key === '_') {
    return EFZoomDirection.ZOOM_OUT;
  }
  return null;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!isKeyboardTargetElement(target)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'select' ||
    tagName === 'textarea' ||
    target.isContentEditable === true
  );
}

function isKeyboardTargetElement(
  target: EventTarget | null,
): target is EventTarget & { isContentEditable?: boolean; tagName: string } {
  if (target === null) {
    return false;
  }
  const candidate = target as { isContentEditable?: unknown; tagName?: unknown };
  return typeof candidate.tagName === 'string';
}
