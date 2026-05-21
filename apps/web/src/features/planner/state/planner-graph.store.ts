import {
  computed,
  inject,
  Injectable,
  InjectionToken,
  type OnDestroy,
  type Signal,
} from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import {
  createDefaultGraphDisplaySettings,
  type GraphDisplaySettings,
  type GraphLayoutState,
  type GraphNodeBuildState,
  type PlannerProject,
  type ProductionGraph,
  type ProductionGraphNode,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { DatasetService } from '../dataset.service';
import { PlannerSolverService } from '../solving/planner-solver.service';
import { selectInspectorViewModel } from './planner-inspector.selectors';
import { PlannerGraphBuildSlice } from './planner-store-graph-build';
import {
  buildProductionGraphFromInput,
  equalProductionGraphInputs,
  selectCompletedGraphNodeIds,
  selectGraphNode,
  selectGraphNodeNotes,
  selectGraphNodeState,
  selectProductionGraphInput,
} from './planner-store.selectors';
import { PlannerWorkspaceSlice } from './planner-store.workspace';

export { GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS } from './planner-store-graph-build';

export interface PlannerGraphStorePort {
  readonly dataset: Signal<GameDataset | null>;
  readonly activeProject: Signal<PlannerProject | null>;
  readonly solveResult: Signal<ProductionPlanResult | null>;
  readonly updateActiveProject: (mapper: (project: PlannerProject) => PlannerProject) => void;
  readonly updateProjectById: (
    projectId: string,
    mapper: (project: PlannerProject) => PlannerProject,
  ) => void;
}

export interface PlannerGraphReadModel {
  readonly graph: Signal<ProductionGraph | null>;
  readonly layout: Signal<GraphLayoutState>;
  readonly displaySettings: Signal<GraphDisplaySettings>;
  readonly selectedNodeId: Signal<string | null>;
  readonly selectedNode: Signal<ProductionGraphNode | null>;
  readonly selectedNodeState: Signal<GraphNodeBuildState>;
  readonly inspectorViewModel: Signal<ReturnType<typeof selectInspectorViewModel>>;
  readonly planLocked: Signal<boolean>;
  readonly nodeLayoutLocked: Signal<boolean>;
  readonly completedNodeIds: Signal<ReadonlySet<string>>;
  readonly nodeNotes: Signal<Readonly<Record<string, string>>>;
}

export interface PlannerGraphSelectionCommands {
  readonly select: (nodeId: string) => void;
  readonly set: (nodeId: string | null) => void;
  readonly toggle: (nodeId: string) => void;
  readonly clear: () => void;
}

export interface PlannerGraphNodeStateCommands {
  readonly setSelectedDone: (done: boolean) => void;
  readonly toggleDone: (nodeId: string) => void;
  readonly setSelectedNote: (note: string) => void;
  readonly clearSelectedNote: () => void;
}

export interface PlannerGraphLayoutCommands {
  readonly setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  readonly flushNodePositions: () => void;
  readonly resetLayout: () => void;
}

export interface PlannerGraphLockCommands {
  readonly setPlanLocked: (locked: boolean) => void;
  readonly setNodeLayoutLocked: (locked: boolean) => void;
}

export interface PlannerGraphLifecycleCommands {
  readonly flushPendingState: () => void;
  readonly clearPendingState: () => void;
}

export const PLANNER_GRAPH_STORE_PORT = new InjectionToken<PlannerGraphStorePort>(
  'PLANNER_GRAPH_STORE_PORT',
  {
    providedIn: 'root',
    factory: createPlannerGraphStorePort,
  },
);

@Injectable({ providedIn: 'root' })
export class PlannerGraphStore implements OnDestroy {
  private readonly port = inject(PLANNER_GRAPH_STORE_PORT);
  private readonly graphBuild = new PlannerGraphBuildSlice({
    activeProject: this.port.activeProject,
    updateActiveProject: this.port.updateActiveProject,
    updateProjectById: this.port.updateProjectById,
  });

  private readonly productionGraphInput = computed(
    () =>
      selectProductionGraphInput(
        this.port.dataset(),
        this.port.activeProject(),
        this.port.solveResult(),
      ),
    { equal: equalProductionGraphInputs },
  );

  private readonly productionGraph = computed<ProductionGraph | null>(() => {
    const input = this.productionGraphInput();
    return input ? buildProductionGraphFromInput(input) : null;
  });

  private readonly layout = computed<GraphLayoutState>(() => this.graphBuild.activeLayout());

  private readonly displaySettings = computed<GraphDisplaySettings>(
    () => this.port.activeProject()?.graphDisplay ?? createDefaultGraphDisplaySettings(),
  );

  private readonly planLocked = computed(
    () => this.port.activeProject()?.buildState.planLocked ?? false,
  );

  private readonly nodeLayoutLocked = computed(
    () => this.port.activeProject()?.buildState.nodeLayoutLocked ?? false,
  );

  private readonly completedNodeIds = computed<ReadonlySet<string>>(() =>
    selectCompletedGraphNodeIds(this.port.activeProject()),
  );

  private readonly nodeNotes = computed<Readonly<Record<string, string>>>(() =>
    selectGraphNodeNotes(this.port.activeProject()),
  );

  private readonly selectedNodeId = computed<string | null>(() => {
    const selectedNodeId = this.graphBuild.selectedGraphNodeId();
    const graph = this.productionGraph();
    if (!selectedNodeId || !graph) {
      return selectedNodeId;
    }
    return graph.nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : null;
  });

  private readonly selectedNode = computed<ProductionGraphNode | null>(() =>
    selectGraphNode(this.productionGraph(), this.selectedNodeId()),
  );

  private readonly selectedNodeState = computed<GraphNodeBuildState>(() =>
    selectGraphNodeState(this.port.activeProject(), this.selectedNodeId()),
  );

  private readonly inspectorViewModel = computed(() =>
    selectInspectorViewModel(
      this.port.dataset(),
      this.port.activeProject(),
      this.port.solveResult(),
      this.productionGraph(),
      this.selectedNode(),
      this.selectedNodeState(),
    ),
  );

  public readonly readModel: PlannerGraphReadModel = {
    graph: this.productionGraph,
    layout: this.layout,
    displaySettings: this.displaySettings,
    selectedNodeId: this.selectedNodeId,
    selectedNode: this.selectedNode,
    selectedNodeState: this.selectedNodeState,
    inspectorViewModel: this.inspectorViewModel,
    planLocked: this.planLocked,
    nodeLayoutLocked: this.nodeLayoutLocked,
    completedNodeIds: this.completedNodeIds,
    nodeNotes: this.nodeNotes,
  };

  public readonly selectionCommands: PlannerGraphSelectionCommands = {
    select: (nodeId) => this.graphBuild.selectGraphNode(nodeId),
    set: (nodeId) => this.graphBuild.setGraphNodeSelection(nodeId),
    toggle: (nodeId) => this.graphBuild.toggleGraphNodeSelection(nodeId),
    clear: () => this.graphBuild.clearSelectedGraphNode(),
  };

  public readonly nodeStateCommands: PlannerGraphNodeStateCommands = {
    setSelectedDone: (done) => this.graphBuild.setSelectedGraphNodeDone(done),
    toggleDone: (nodeId) => this.graphBuild.toggleGraphNodeDone(nodeId),
    setSelectedNote: (note) => this.graphBuild.setSelectedGraphNodeNote(note),
    clearSelectedNote: () => this.graphBuild.setSelectedGraphNodeNote(''),
  };

  public readonly layoutCommands: PlannerGraphLayoutCommands = {
    setNodePosition: (nodeId, position) => this.graphBuild.setGraphNodePosition(nodeId, position),
    flushNodePositions: () => this.graphBuild.flushGraphNodePositions(),
    resetLayout: () => this.graphBuild.resetGraphLayout(),
  };

  public readonly lockCommands: PlannerGraphLockCommands = {
    setPlanLocked: (locked) => this.graphBuild.setPlanLocked(locked),
    setNodeLayoutLocked: (locked) => this.graphBuild.setNodeLayoutLocked(locked),
  };

  public readonly lifecycle: PlannerGraphLifecycleCommands = {
    flushPendingState: () => this.graphBuild.flushPendingGraphNodePositions(),
    clearPendingState: () => this.graphBuild.clearPendingGraphNodePositions(),
  };

  public ngOnDestroy(): void {
    this.lifecycle.flushPendingState();
  }
}

function createPlannerGraphStorePort(): PlannerGraphStorePort {
  const datasetService = inject(DatasetService);
  const workspace = inject(PlannerWorkspaceSlice);
  const solver = inject(PlannerSolverService);

  return {
    dataset: datasetService.dataset,
    activeProject: workspace.activeProject,
    solveResult: solver.solveResult,
    updateActiveProject: (mapper) => workspace.updateActiveProject(mapper),
    updateProjectById: (projectId, mapper) => workspace.updateProjectById(projectId, mapper),
  };
}
