import { inject, Injectable, signal, type OnDestroy } from '@angular/core';
import { type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type ObjectivePresetId,
  type ObjectiveWeightKey,
  type PipelineTier,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { DatasetService } from '../dataset.service';
import { PlannerPersistenceCoordinatorService } from '../persistence/planner-persistence-coordinator.service';
import { PlannerStoreConnections } from './planner-store-connections';
import { PlannerGraphStore } from './planner-graph.store';
import { PlannerDefaultsCommandSlice } from './planner-store-defaults';
import { PlannerStoreViewSelectors } from './planner-store-view-selectors';
import {
  createPlannerStoreViewSurface,
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
export type { PlannerStoreWorkbenchViews } from './planner-store-view-surface';
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

  private readonly workspace = inject(PlannerWorkspaceSlice);
  private readonly graphStore = inject(PlannerGraphStore);
  private readonly workbench: PlannerWorkbenchSlice;
  private readonly defaultsCommands: PlannerDefaultsCommandSlice;
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
    this.workbench = new PlannerWorkbenchSlice();
    this.planTransfer = new PlannerPlanTransferCapability({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      activeSessionProjects: this.workspace.activeSessionProjects,
      flushGraphNodePositions: () => this.graphStore.layoutCommands.flushNodePositions(),
      importProject: (project) => this.workspace.importProject(project),
    });
    this.workspace.connectGraphHooks({
      flushPendingGraphState: () => this.graphStore.lifecycle.flushPendingState(),
      clearPendingGraphState: () => this.graphStore.lifecycle.clearPendingState(),
      clearGraphSelection: () => this.graphStore.selectionCommands.clear(),
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
      solveResult: this.solveResult,
    });
    const viewSurface = createPlannerStoreViewSurface({
      selectors: this.viewSelectors,
      defaultRecipeSearch: this.defaultRecipeSearch,
    });
    this.workbenchViews = viewSurface.workbench;
    this.defaultsCommands = new PlannerDefaultsCommandSlice({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      updateUserDefaults: (mapper) => this.workspace.updateUserDefaults(mapper),
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
    this.graphStore.layoutCommands.flushNodePositions();
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

  public setDefaultMaxBeltTier(maxBeltTier: ConveyorBeltTier): void {
    this.defaultsCommands.setMaxBeltTier(maxBeltTier);
  }

  public setDefaultMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.defaultsCommands.setMaxPipeTier(maxPipeTier);
  }

  public setDefaultRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.defaultsCommands.setRateDecimalPlaces(rateDecimalPlaces);
  }

  public setDefaultGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.defaultsCommands.setGraphEdgeStyle(edgeStyle);
  }

  public setDefaultShowTransportLabels(showTransportLabels: boolean): void {
    this.defaultsCommands.setShowTransportLabels(showTransportLabels);
  }

  public setDefaultAnimateFlowLines(animateFlowLines: boolean): void {
    this.defaultsCommands.setAnimateFlowLines(animateFlowLines);
  }
}
