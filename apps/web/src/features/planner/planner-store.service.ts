import { inject, Injectable, signal, type OnDestroy } from '@angular/core';
import { type ItemId, type RecipeId } from '@beltwise/game-data';
import {
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type GraphLayoutState,
  type PipelineTier,
  type ProductTarget,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { DatasetService } from './dataset.service';
import { PlannerPersistenceCoordinatorService } from './planner-persistence-coordinator.service';
import { PlannerStoreConnections } from './planner-store-connections';
import { PlannerGraphBuildSlice } from './planner-store-graph-build';
import { PlannerPlanCommandSlice } from './planner-store-plan-commands';
import { PlannerStoreViewSelectors } from './planner-store-view-selectors';
import { PlannerWorkspaceSlice } from './planner-store.workspace';
import { PlannerSolverService } from './planner-solver.service';

export { plannerRelevantMachineIds } from './planner-domain.helpers';
export {
  createGameDatasetSolveKey,
  createPlannerSolveKey,
  selectPlannerSolveInput,
} from './planner-solve-input';
export type { PlannerSolveInput, PlannerSolveKey } from './planner-solve-input';
export {
  PLANNER_SOLVE_DEBOUNCE_MS,
  PlannerSolveScheduler,
  PlannerSolverService,
} from './planner-solver.service';
export type { SolveStatus } from './planner-solver.service';
export { GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS } from './planner-store-graph-build';
export type {
  ConfigurationTab,
  WorkbenchFocusMode,
  WorkbenchFocusRequest,
} from './planner-store.models';

@Injectable({ providedIn: 'root' })
export class PlannerStoreService implements OnDestroy {
  private readonly datasetService = inject(DatasetService);
  private readonly persistenceCoordinator = inject(PlannerPersistenceCoordinatorService);
  private readonly solver = inject(PlannerSolverService);

  private readonly workspace: PlannerWorkspaceSlice;
  private readonly graphBuild: PlannerGraphBuildSlice;
  private readonly planCommands: PlannerPlanCommandSlice;
  private readonly views: PlannerStoreViewSelectors;
  private readonly connections: PlannerStoreConnections;

  public readonly dataset = this.datasetService.dataset;
  public readonly datasetError = this.datasetService.loadError;
  public readonly recipeSearch = signal('');
  public readonly solveStatus = this.solver.solveStatus;
  public readonly solveError = this.solver.solveError;
  public readonly solveResult = this.solver.solveResult;

  public readonly projects: PlannerWorkspaceSlice['projects'];
  public readonly activeProjectId: PlannerWorkspaceSlice['activeProjectId'];
  public readonly activeConfigTab: PlannerWorkspaceSlice['activeConfigTab'];
  public readonly workbenchFocusRequest: PlannerWorkspaceSlice['workbenchFocusRequest'];
  public readonly activeProject: PlannerWorkspaceSlice['activeProject'];
  public readonly selectedGraphNodeId: PlannerGraphBuildSlice['selectedGraphNodeId'];
  public readonly itemOptions: PlannerStoreViewSelectors['itemOptions'];
  public readonly resourceRows: PlannerStoreViewSelectors['resourceRows'];
  public readonly externalInputRows: PlannerStoreViewSelectors['externalInputRows'];
  public readonly machineRows: PlannerStoreViewSelectors['machineRows'];
  public readonly machineUsageRows: PlannerStoreViewSelectors['machineUsageRows'];
  public readonly recipeRows: PlannerStoreViewSelectors['recipeRows'];
  public readonly baseRecipeRows: PlannerStoreViewSelectors['baseRecipeRows'];
  public readonly standardBaseRecipeRows: PlannerStoreViewSelectors['standardBaseRecipeRows'];
  public readonly converterResourceRecipeRows: PlannerStoreViewSelectors['converterResourceRecipeRows'];
  public readonly alternateRecipeRows: PlannerStoreViewSelectors['alternateRecipeRows'];
  public readonly graph: PlannerStoreViewSelectors['graph'];
  public readonly planLocked: PlannerStoreViewSelectors['planLocked'];
  public readonly nodeLayoutLocked: PlannerStoreViewSelectors['nodeLayoutLocked'];
  public readonly completedGraphNodeIds: PlannerStoreViewSelectors['completedGraphNodeIds'];
  public readonly graphNodeNotes: PlannerStoreViewSelectors['graphNodeNotes'];
  public readonly graphDisplaySettings: PlannerStoreViewSelectors['graphDisplaySettings'];
  public readonly selectedGraphNode: PlannerStoreViewSelectors['selectedGraphNode'];
  public readonly selectedGraphNodeState: PlannerStoreViewSelectors['selectedGraphNodeState'];

  public constructor() {
    this.workspace = new PlannerWorkspaceSlice({
      dataset: this.dataset,
    });
    this.graphBuild = new PlannerGraphBuildSlice({
      activeProject: this.workspace.activeProject,
      updateActiveProject: (mapper) => this.workspace.updateActiveProject(mapper),
      updateProjectById: (projectId, mapper) => this.workspace.updateProjectById(projectId, mapper),
    });
    this.workspace.connectGraphHooks({
      flushPendingGraphState: () => this.graphBuild.flushPendingGraphNodePositions(),
      clearPendingGraphState: () => this.graphBuild.clearPendingGraphNodePositions(),
      clearGraphSelection: () => this.graphBuild.clearSelectedGraphNode(),
    });
    this.views = new PlannerStoreViewSelectors({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      recipeSearch: this.recipeSearch,
      selectedGraphNodeId: this.graphBuild.selectedGraphNodeId,
      solveResult: this.solveResult,
    });
    this.planCommands = new PlannerPlanCommandSlice({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      itemOptions: this.views.itemOptions,
      planLocked: () => this.views.planLocked(),
      updateActiveProject: (mapper) => this.workspace.updateActiveProject(mapper),
    });
    this.connections = new PlannerStoreConnections({
      dataset: this.dataset,
      projects: this.workspace.projects,
      activeProjectId: this.workspace.activeProjectId,
      activeProject: this.workspace.activeProject,
      initializeFromStoredState: (state) => this.workspace.initializeFromStoredState(state),
      initializeStarterProject: (dataset) => this.workspace.initializeStarterProject(dataset),
    });

    this.projects = this.workspace.projects;
    this.activeProjectId = this.workspace.activeProjectId;
    this.activeConfigTab = this.workspace.activeConfigTab;
    this.workbenchFocusRequest = this.workspace.workbenchFocusRequest;
    this.activeProject = this.workspace.activeProject;
    this.selectedGraphNodeId = this.graphBuild.selectedGraphNodeId;
    this.itemOptions = this.views.itemOptions;
    this.resourceRows = this.views.resourceRows;
    this.externalInputRows = this.views.externalInputRows;
    this.machineRows = this.views.machineRows;
    this.machineUsageRows = this.views.machineUsageRows;
    this.recipeRows = this.views.recipeRows;
    this.baseRecipeRows = this.views.baseRecipeRows;
    this.standardBaseRecipeRows = this.views.standardBaseRecipeRows;
    this.converterResourceRecipeRows = this.views.converterResourceRecipeRows;
    this.alternateRecipeRows = this.views.alternateRecipeRows;
    this.graph = this.views.graph;
    this.planLocked = this.views.planLocked;
    this.nodeLayoutLocked = this.views.nodeLayoutLocked;
    this.completedGraphNodeIds = this.views.completedGraphNodeIds;
    this.graphNodeNotes = this.views.graphNodeNotes;
    this.graphDisplaySettings = this.views.graphDisplaySettings;
    this.selectedGraphNode = this.views.selectedGraphNode;
    this.selectedGraphNodeState = this.views.selectedGraphNodeState;

    this.connections.connect(this.persistenceCoordinator, this.solver);
  }

  public ngOnDestroy(): void {
    this.graphBuild.flushGraphNodePositions();
  }

  public flushGraphNodePositions(): void {
    this.graphBuild.flushGraphNodePositions();
  }

  public selectProject(projectId: string): void {
    this.workspace.selectProject(projectId);
  }

  public createProject(): void {
    this.workspace.createProject();
  }

  public duplicateProject(): void {
    this.workspace.duplicateProject();
  }

  public deleteProject(): void {
    this.workspace.deleteProject();
  }

  public renameProject(name: string): void {
    this.workspace.renameProject(name);
  }

  public addTarget(): void {
    this.planCommands.addTarget();
  }

  public duplicateTarget(target: ProductTarget): void {
    this.planCommands.duplicateTarget(target);
  }

  public removeTarget(targetId: string): void {
    this.planCommands.removeTarget(targetId);
  }

  public updateTargetItem(targetId: string, itemId: ItemId): void {
    this.planCommands.updateTargetItem(targetId, itemId);
  }

  public updateTargetMode(targetId: string, mode: ProductTarget['mode']): void {
    this.planCommands.updateTargetMode(targetId, mode);
  }

  public updateTargetAmount(targetId: string, amountPerMinute: number): void {
    this.planCommands.updateTargetAmount(targetId, amountPerMinute);
  }

  public setRecipeEnabled(recipeId: RecipeId, enabled: boolean): void {
    this.planCommands.setRecipeEnabled(recipeId, enabled);
  }

  public setRecipesEnabled(recipeIds: readonly RecipeId[], enabled: boolean): void {
    this.planCommands.setRecipesEnabled(recipeIds, enabled);
  }

  public setRecipeGroupEnabled(isAlternate: boolean, enabled: boolean): void {
    this.planCommands.setRecipeGroupEnabled(isAlternate, enabled);
  }

  public setItemInput(itemId: ItemId, amountPerMinute: number): void {
    this.planCommands.setItemInput(itemId, amountPerMinute);
  }

  public addExternalInput(): void {
    this.planCommands.addExternalInput();
  }

  public updateExternalInputItem(previousItemId: ItemId, nextItemId: ItemId): void {
    this.planCommands.updateExternalInputItem(previousItemId, nextItemId);
  }

  public removeExternalInput(itemId: ItemId): void {
    this.planCommands.removeExternalInput(itemId);
  }

  public setResourceCap(itemId: ItemId, maxPerMinute: number): void {
    this.planCommands.setResourceCap(itemId, maxPerMinute);
  }

  public setResourceEnabled(itemId: ItemId, enabled: boolean): void {
    this.planCommands.setResourceEnabled(itemId, enabled);
  }

  public resetResource(itemId: ItemId): void {
    this.planCommands.resetResource(itemId);
  }

  public resetAllResources(): void {
    this.planCommands.resetAllResources();
  }

  public setAllResourcesEnabled(enabled: boolean): void {
    this.planCommands.setAllResourcesEnabled(enabled);
  }

  public setMachineEnabled(machineId: string, enabled: boolean): void {
    this.planCommands.setMachineEnabled(machineId, enabled);
  }

  public setGraphNodePosition(nodeId: string, position: { x: number; y: number }): void {
    this.graphBuild.setGraphNodePosition(nodeId, position);
  }

  public resetGraphLayout(): void {
    this.graphBuild.resetGraphLayout();
  }

  public selectGraphNode(nodeId: string): void {
    this.graphBuild.selectGraphNode(nodeId);
  }

  public setGraphNodeSelection(nodeId: string | null): void {
    this.graphBuild.setGraphNodeSelection(nodeId);
  }

  public toggleGraphNodeSelection(nodeId: string): void {
    this.graphBuild.toggleGraphNodeSelection(nodeId);
  }

  public clearSelectedGraphNode(): void {
    this.graphBuild.clearSelectedGraphNode();
  }

  public setPlanLocked(locked: boolean): void {
    this.graphBuild.setPlanLocked(locked);
  }

  public setNodeLayoutLocked(locked: boolean): void {
    this.graphBuild.setNodeLayoutLocked(locked);
  }

  public setMaxBeltTier(maxBeltTier: ConveyorBeltTier): void {
    this.planCommands.setMaxBeltTier(maxBeltTier);
  }

  public setMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.planCommands.setMaxPipeTier(maxPipeTier);
  }

  public setRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.planCommands.setRateDecimalPlaces(rateDecimalPlaces);
  }

  public setGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.planCommands.setGraphEdgeStyle(edgeStyle);
  }

  public setShowTransportLabels(showTransportLabels: boolean): void {
    this.planCommands.setShowTransportLabels(showTransportLabels);
  }

  public setAnimateFlowLines(animateFlowLines: boolean): void {
    this.planCommands.setAnimateFlowLines(animateFlowLines);
  }

  public setSelectedGraphNodeDone(done: boolean): void {
    this.graphBuild.setSelectedGraphNodeDone(done);
  }

  public toggleGraphNodeDone(nodeId: string): void {
    this.graphBuild.toggleGraphNodeDone(nodeId);
  }

  public setSelectedGraphNodeNote(note: string): void {
    this.graphBuild.setSelectedGraphNodeNote(note);
  }

  public activeLayout(): GraphLayoutState {
    return this.graphBuild.activeLayout();
  }
}
