import { inject, Injectable, signal, type OnDestroy } from '@angular/core';
import { type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type GraphLayoutState,
  type ObjectivePresetId,
  type ObjectiveWeightKey,
  type PipelineTier,
  type PlannerProject,
  type ProductTarget,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { DatasetService } from '../dataset.service';
import { PlannerPersistenceCoordinatorService } from '../persistence/planner-persistence-coordinator.service';
import { PlannerStoreConnections } from './planner-store-connections';
import { PlannerGraphBuildSlice } from './planner-store-graph-build';
import { PlannerDefaultsCommandSlice } from './planner-store-defaults';
import { PlannerPlanCommandSlice } from './planner-store-plan-commands';
import { PlannerStoreViewSelectors } from './planner-store-view-selectors';
import {
  createPlannerStoreViewSurface,
  type PlannerStoreGraphView,
  type PlannerStoreWorkbenchViews,
} from './planner-store-view-surface';
import { PlannerWorkspaceSlice } from './planner-store.workspace';
import { PlannerSolverService } from '../solving/planner-solver.service';
import { PlannerWorkbenchSlice } from '../workbench/planner-workbench-state';
import { type WorkbenchPanelId } from '../workbench/planner-workbench.models';
import {
  PlannerPlanTransferCapability,
  type PlannerPlanExportResult,
  type PlannerPlanImportResult,
  type PlannerPlanShareExportResult,
} from '../transfer/planner-plan-transfer-capability';

export { plannerRelevantMachineIds } from '@beltwise/planner-core';
export {
  createGameDatasetSolveKey,
  createPlannerSolveKey,
  selectPlannerSolveInput,
} from '../solving/planner-solve-input';
export type { PlannerSolveInput, PlannerSolveKey } from '../solving/planner-solve-input';
export {
  PLANNER_SOLVE_DEBOUNCE_MS,
  PlannerSolveScheduler,
  PlannerSolverService,
} from '../solving/planner-solver.service';
export type { SolveStatus } from '../solving/planner-solver.service';
export { GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS } from './planner-store-graph-build';
export type {
  PlannerStoreGraphView,
  PlannerStoreWorkbenchViews,
} from './planner-store-view-surface';
export type {
  WorkbenchFocusMode,
  WorkbenchFocusRequest,
  WorkbenchPanelId,
} from '../workbench/planner-workbench.models';

export type {
  PlannerPlanExportResult,
  PlannerPlanImportResult,
  PlannerPlanShareExportResult,
} from '../transfer/planner-plan-transfer-capability';

@Injectable({ providedIn: 'root' })
export class PlannerStoreService implements OnDestroy {
  private readonly datasetService = inject(DatasetService);
  private readonly persistenceCoordinator = inject(PlannerPersistenceCoordinatorService);
  private readonly solver = inject(PlannerSolverService);

  private readonly workspace: PlannerWorkspaceSlice;
  private readonly workbench: PlannerWorkbenchSlice;
  private readonly graphBuild: PlannerGraphBuildSlice;
  private readonly defaultsCommands: PlannerDefaultsCommandSlice;
  private readonly planCommands: PlannerPlanCommandSlice;
  private readonly planTransfer: PlannerPlanTransferCapability;
  private readonly viewSelectors: PlannerStoreViewSelectors;
  private readonly connections: PlannerStoreConnections;
  private readonly recipeSearch = signal('');
  private readonly defaultRecipeSearch = signal('');

  public readonly dataset = this.datasetService.dataset;
  public readonly datasetError = this.datasetService.loadError;
  public readonly solveStatus = this.solver.solveStatus;
  public readonly solveError = this.solver.solveError;
  public readonly solveResult = this.solver.solveResult;
  public readonly workbenchViews: PlannerStoreWorkbenchViews;
  public readonly graphView: PlannerStoreGraphView;

  public readonly sessions: PlannerWorkspaceSlice['sessions'];
  public readonly activeSessionId: PlannerWorkspaceSlice['activeSessionId'];
  public readonly activeSession: PlannerWorkspaceSlice['activeSession'];
  public readonly activeSessionProjects: PlannerWorkspaceSlice['activeSessionProjects'];
  public readonly projects: PlannerWorkspaceSlice['projects'];
  public readonly activeProjectId: PlannerWorkspaceSlice['activeProjectId'];
  public readonly userDefaults: PlannerWorkspaceSlice['userDefaults'];
  public readonly activeWorkbenchPanelId: PlannerWorkbenchSlice['activePanelId'];
  public readonly workbenchFocusRequest: PlannerWorkbenchSlice['focusRequest'];
  public readonly activeProject: PlannerWorkspaceSlice['activeProject'];

  public constructor() {
    this.workspace = new PlannerWorkspaceSlice({
      dataset: this.dataset,
    });
    this.workbench = new PlannerWorkbenchSlice();
    this.graphBuild = new PlannerGraphBuildSlice({
      activeProject: this.workspace.activeProject,
      updateActiveProject: (mapper) => this.workspace.updateActiveProject(mapper),
      updateProjectById: (projectId, mapper) => this.workspace.updateProjectById(projectId, mapper),
    });
    this.planTransfer = new PlannerPlanTransferCapability({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      activeSessionProjects: this.workspace.activeSessionProjects,
      flushGraphNodePositions: () => this.graphBuild.flushGraphNodePositions(),
      importProject: (project) => this.workspace.importProject(project),
    });
    this.workspace.connectGraphHooks({
      flushPendingGraphState: () => this.graphBuild.flushPendingGraphNodePositions(),
      clearPendingGraphState: () => this.graphBuild.clearPendingGraphNodePositions(),
      clearGraphSelection: () => this.graphBuild.clearSelectedGraphNode(),
    });
    this.workspace.connectActivationHooks({
      projectActivated: (project) => this.workbench.activateProject(project),
    });
    this.viewSelectors = new PlannerStoreViewSelectors({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      userDefaults: this.workspace.userDefaults,
      recipeSearch: this.recipeSearch,
      defaultRecipeSearch: this.defaultRecipeSearch,
      selectedGraphNodeId: this.graphBuild.selectedGraphNodeId,
      solveResult: this.solveResult,
    });
    const viewSurface = createPlannerStoreViewSurface({
      selectors: this.viewSelectors,
      recipeSearch: this.recipeSearch,
      defaultRecipeSearch: this.defaultRecipeSearch,
      selectedGraphNodeId: this.graphBuild.selectedGraphNodeId,
    });
    this.workbenchViews = viewSurface.workbench;
    this.graphView = viewSurface.graph;
    this.defaultsCommands = new PlannerDefaultsCommandSlice({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      updateUserDefaults: (mapper) => this.workspace.updateUserDefaults(mapper),
    });
    this.planCommands = new PlannerPlanCommandSlice({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      itemOptions: this.viewSelectors.itemOptions,
      planLocked: () => this.viewSelectors.planLocked(),
      updateActiveProject: (mapper) => this.workspace.updateActiveProject(mapper),
    });
    this.connections = new PlannerStoreConnections({
      dataset: this.dataset,
      projects: this.workspace.projects,
      sessions: this.workspace.sessions,
      activeSessionId: this.workspace.activeSessionId,
      activeProjectId: this.workspace.activeProjectId,
      userDefaults: this.workspace.userDefaults,
      activeProject: this.workspace.activeProject,
      initializeFromStoredState: (state) => this.workspace.initializeFromStoredState(state),
      initializeStarterProject: (dataset, userDefaults) =>
        this.workspace.initializeStarterProject(dataset, userDefaults),
    });

    this.sessions = this.workspace.sessions;
    this.activeSessionId = this.workspace.activeSessionId;
    this.activeSession = this.workspace.activeSession;
    this.activeSessionProjects = this.workspace.activeSessionProjects;
    this.projects = this.workspace.projects;
    this.activeProjectId = this.workspace.activeProjectId;
    this.userDefaults = this.workspace.userDefaults;
    this.activeWorkbenchPanelId = this.workbench.activePanelId;
    this.workbenchFocusRequest = this.workbench.focusRequest;
    this.activeProject = this.workspace.activeProject;

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

  public selectSession(sessionId: string): void {
    this.workspace.selectSession(sessionId);
  }

  public setActiveWorkbenchPanel(panelId: WorkbenchPanelId): void {
    this.workbench.setActivePanel(panelId);
  }

  public createSession(): void {
    this.workspace.createSession();
  }

  public deleteSession(sessionId?: string): void {
    this.workspace.deleteSession(sessionId);
  }

  public renameSession(name: string): void {
    this.workspace.renameSession(name);
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

  public exportActivePlan(): PlannerPlanExportResult {
    return this.planTransfer.exportActivePlan();
  }

  public importPlanJson(json: string): PlannerPlanImportResult {
    return this.planTransfer.importPlanJson(json);
  }

  public exportActivePlanSharePayload(): PlannerPlanShareExportResult {
    return this.planTransfer.exportActivePlanSharePayload();
  }

  public importPlanSharePayload(payload: unknown): PlannerPlanImportResult {
    return this.planTransfer.importPlanSharePayload(payload);
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

  public setObjectivePreset(presetId: ObjectivePresetId): void {
    this.planCommands.setObjectivePreset(presetId);
  }

  public setObjectiveWeight(key: ObjectiveWeightKey, value: number): void {
    this.planCommands.setObjectiveWeight(key, value);
  }

  public setObjectiveRawResourceMultiplier(itemId: ItemId, value: number): void {
    this.planCommands.setObjectiveRawResourceMultiplier(itemId, value);
  }

  public resetObjectiveRawResourceMultiplier(itemId: ItemId): void {
    this.planCommands.resetObjectiveRawResourceMultiplier(itemId);
  }

  public setDefaultRecipeEnabled(recipeId: RecipeId, enabled: boolean): void {
    this.defaultsCommands.setRecipeEnabled(recipeId, enabled);
  }

  public setDefaultRecipesEnabled(recipeIds: readonly RecipeId[], enabled: boolean): void {
    this.defaultsCommands.setRecipesEnabled(recipeIds, enabled);
  }

  public setDefaultMachineEnabled(machineId: MachineId, enabled: boolean): void {
    this.defaultsCommands.setMachineEnabled(machineId, enabled);
  }

  public setDefaultMachinesEnabled(machineIds: readonly MachineId[], enabled: boolean): void {
    this.defaultsCommands.setMachinesEnabled(machineIds, enabled);
  }

  public setDefaultResourceCap(itemId: ItemId, maxPerMinute: number): void {
    this.defaultsCommands.setResourceCap(itemId, maxPerMinute);
  }

  public setDefaultResourceEnabled(itemId: ItemId, enabled: boolean): void {
    this.defaultsCommands.setResourceEnabled(itemId, enabled);
  }

  public resetDefaultResource(itemId: ItemId): void {
    this.defaultsCommands.resetResource(itemId);
  }

  public resetAllDefaultResources(): void {
    this.defaultsCommands.resetAllResources();
  }

  public setAllDefaultResourcesEnabled(enabled: boolean): void {
    this.defaultsCommands.setAllResourcesEnabled(enabled);
  }

  public setDefaultObjectivePreset(presetId: ObjectivePresetId): void {
    this.defaultsCommands.setObjectivePreset(presetId);
  }

  public setDefaultObjectiveWeight(key: ObjectiveWeightKey, value: number): void {
    this.defaultsCommands.setObjectiveWeight(key, value);
  }

  public setDefaultObjectiveRawResourceMultiplier(itemId: ItemId, value: number): void {
    this.defaultsCommands.setObjectiveRawResourceMultiplier(itemId, value);
  }

  public resetDefaultObjectiveRawResourceMultiplier(itemId: ItemId): void {
    this.defaultsCommands.resetObjectiveRawResourceMultiplier(itemId);
  }

  public saveActivePlanAsDefaults(): void {
    this.defaultsCommands.saveActivePlanAsDefaults();
  }

  public resetUserDefaults(): void {
    this.defaultsCommands.resetUserDefaults();
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

  public setDefaultMaxBeltTier(maxBeltTier: ConveyorBeltTier): void {
    this.defaultsCommands.setMaxBeltTier(maxBeltTier);
  }

  public setMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.planCommands.setMaxPipeTier(maxPipeTier);
  }

  public setDefaultMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.defaultsCommands.setMaxPipeTier(maxPipeTier);
  }

  public setRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.planCommands.setRateDecimalPlaces(rateDecimalPlaces);
  }

  public setDefaultRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.defaultsCommands.setRateDecimalPlaces(rateDecimalPlaces);
  }

  public setGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.planCommands.setGraphEdgeStyle(edgeStyle);
  }

  public setDefaultGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.defaultsCommands.setGraphEdgeStyle(edgeStyle);
  }

  public setShowTransportLabels(showTransportLabels: boolean): void {
    this.planCommands.setShowTransportLabels(showTransportLabels);
  }

  public setDefaultShowTransportLabels(showTransportLabels: boolean): void {
    this.defaultsCommands.setShowTransportLabels(showTransportLabels);
  }

  public setAnimateFlowLines(animateFlowLines: boolean): void {
    this.planCommands.setAnimateFlowLines(animateFlowLines);
  }

  public setPlanNotes(notes: string): void {
    this.planCommands.setPlanNotes(notes);
  }

  public clearPlanNotes(): void {
    this.planCommands.setPlanNotes('');
  }

  public setDefaultAnimateFlowLines(animateFlowLines: boolean): void {
    this.defaultsCommands.setAnimateFlowLines(animateFlowLines);
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

  public clearSelectedGraphNodeNote(): void {
    this.graphBuild.setSelectedGraphNodeNote('');
  }

  public activeLayout(): GraphLayoutState {
    return this.graphBuild.activeLayout();
  }
}
