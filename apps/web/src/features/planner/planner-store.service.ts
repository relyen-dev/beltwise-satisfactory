import { inject, Injectable, signal, type OnDestroy } from '@angular/core';
import { type GameDataset, type ItemId, type MachineId, type RecipeId } from '@beltwise/game-data';
import {
  createBeltwisePlanExportFilename,
  createUniqueImportedPlannerProjectName,
  decodeBeltwisePlanShare,
  encodeBeltwisePlanShare,
  encodeBeltwisePlanExport,
  parseBeltwisePlanExportJson,
  prepareImportedPlannerProject,
  stringifyBeltwisePlanExport,
  type BeltwisePlanImportWarning,
  type BeltwisePlanSharePayload,
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type GraphLayoutState,
  type ObjectivePresetId,
  type PipelineTier,
  type PlannerProject,
  type ProductTarget,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import { DatasetService } from './dataset.service';
import { PlannerPersistenceCoordinatorService } from './planner-persistence-coordinator.service';
import { PlannerStoreConnections } from './planner-store-connections';
import { PlannerGraphBuildSlice } from './planner-store-graph-build';
import { PlannerDefaultsCommandSlice } from './planner-store-defaults';
import { PlannerPlanCommandSlice } from './planner-store-plan-commands';
import { PlannerStoreViewSelectors } from './planner-store-view-selectors';
import { PlannerWorkspaceSlice } from './planner-store.workspace';
import { PlannerSolverService } from './planner-solver.service';
import { type ObjectiveWeightKey } from './planner-project-mutations';

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

export type PlannerPlanExportResult =
  | {
      ok: true;
      filename: string;
      json: string;
    }
  | {
      ok: false;
      message: string;
    };

export type PlannerPlanImportResult =
  | {
      ok: true;
      project: PlannerProject;
      warnings: BeltwisePlanImportWarning[];
    }
  | {
      ok: false;
      message: string;
    };

export type PlannerPlanShareExportResult =
  | {
      ok: true;
      payload: BeltwisePlanSharePayload;
    }
  | {
      ok: false;
      message: string;
    };

@Injectable({ providedIn: 'root' })
export class PlannerStoreService implements OnDestroy {
  private readonly datasetService = inject(DatasetService);
  private readonly persistenceCoordinator = inject(PlannerPersistenceCoordinatorService);
  private readonly solver = inject(PlannerSolverService);

  private readonly workspace: PlannerWorkspaceSlice;
  private readonly graphBuild: PlannerGraphBuildSlice;
  private readonly defaultsCommands: PlannerDefaultsCommandSlice;
  private readonly planCommands: PlannerPlanCommandSlice;
  private readonly views: PlannerStoreViewSelectors;
  private readonly connections: PlannerStoreConnections;

  public readonly dataset = this.datasetService.dataset;
  public readonly datasetError = this.datasetService.loadError;
  public readonly recipeSearch = signal('');
  public readonly defaultRecipeSearch = signal('');
  public readonly solveStatus = this.solver.solveStatus;
  public readonly solveError = this.solver.solveError;
  public readonly solveResult = this.solver.solveResult;

  public readonly sessions: PlannerWorkspaceSlice['sessions'];
  public readonly activeSessionId: PlannerWorkspaceSlice['activeSessionId'];
  public readonly activeSession: PlannerWorkspaceSlice['activeSession'];
  public readonly activeSessionProjects: PlannerWorkspaceSlice['activeSessionProjects'];
  public readonly projects: PlannerWorkspaceSlice['projects'];
  public readonly activeProjectId: PlannerWorkspaceSlice['activeProjectId'];
  public readonly userDefaults: PlannerWorkspaceSlice['userDefaults'];
  public readonly activeConfigTab: PlannerWorkspaceSlice['activeConfigTab'];
  public readonly workbenchFocusRequest: PlannerWorkspaceSlice['workbenchFocusRequest'];
  public readonly activeProject: PlannerWorkspaceSlice['activeProject'];
  public readonly selectedGraphNodeId: PlannerGraphBuildSlice['selectedGraphNodeId'];
  public readonly itemOptions: PlannerStoreViewSelectors['itemOptions'];
  public readonly resourceRows: PlannerStoreViewSelectors['resourceRows'];
  public readonly defaultResourceRows: PlannerStoreViewSelectors['defaultResourceRows'];
  public readonly externalInputRows: PlannerStoreViewSelectors['externalInputRows'];
  public readonly machineRows: PlannerStoreViewSelectors['machineRows'];
  public readonly defaultMachineRows: PlannerStoreViewSelectors['defaultMachineRows'];
  public readonly machinePanelSummary: PlannerStoreViewSelectors['machinePanelSummary'];
  public readonly machineUsageRows: PlannerStoreViewSelectors['machineUsageRows'];
  public readonly recipeRows: PlannerStoreViewSelectors['recipeRows'];
  public readonly defaultRecipeRows: PlannerStoreViewSelectors['defaultRecipeRows'];
  public readonly baseRecipeRows: PlannerStoreViewSelectors['baseRecipeRows'];
  public readonly defaultBaseRecipeRows: PlannerStoreViewSelectors['defaultBaseRecipeRows'];
  public readonly standardBaseRecipeRows: PlannerStoreViewSelectors['standardBaseRecipeRows'];
  public readonly defaultStandardBaseRecipeRows: PlannerStoreViewSelectors['defaultStandardBaseRecipeRows'];
  public readonly converterResourceRecipeRows: PlannerStoreViewSelectors['converterResourceRecipeRows'];
  public readonly defaultConverterResourceRecipeRows: PlannerStoreViewSelectors['defaultConverterResourceRecipeRows'];
  public readonly alternateRecipeRows: PlannerStoreViewSelectors['alternateRecipeRows'];
  public readonly defaultAlternateRecipeRows: PlannerStoreViewSelectors['defaultAlternateRecipeRows'];
  public readonly graph: PlannerStoreViewSelectors['graph'];
  public readonly planLocked: PlannerStoreViewSelectors['planLocked'];
  public readonly nodeLayoutLocked: PlannerStoreViewSelectors['nodeLayoutLocked'];
  public readonly completedGraphNodeIds: PlannerStoreViewSelectors['completedGraphNodeIds'];
  public readonly graphNodeNotes: PlannerStoreViewSelectors['graphNodeNotes'];
  public readonly graphDisplaySettings: PlannerStoreViewSelectors['graphDisplaySettings'];
  public readonly defaultGraphDisplaySettings: PlannerStoreViewSelectors['defaultGraphDisplaySettings'];
  public readonly selectedGraphNode: PlannerStoreViewSelectors['selectedGraphNode'];
  public readonly selectedGraphNodeState: PlannerStoreViewSelectors['selectedGraphNodeState'];
  public readonly inspectorViewModel: PlannerStoreViewSelectors['inspectorViewModel'];

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
      userDefaults: this.workspace.userDefaults,
      recipeSearch: this.recipeSearch,
      defaultRecipeSearch: this.defaultRecipeSearch,
      selectedGraphNodeId: this.graphBuild.selectedGraphNodeId,
      solveResult: this.solveResult,
    });
    this.defaultsCommands = new PlannerDefaultsCommandSlice({
      dataset: this.dataset,
      activeProject: this.workspace.activeProject,
      updateUserDefaults: (mapper) => this.workspace.updateUserDefaults(mapper),
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
    this.activeConfigTab = this.workspace.activeConfigTab;
    this.workbenchFocusRequest = this.workspace.workbenchFocusRequest;
    this.activeProject = this.workspace.activeProject;
    this.selectedGraphNodeId = this.graphBuild.selectedGraphNodeId;
    this.itemOptions = this.views.itemOptions;
    this.resourceRows = this.views.resourceRows;
    this.defaultResourceRows = this.views.defaultResourceRows;
    this.externalInputRows = this.views.externalInputRows;
    this.machineRows = this.views.machineRows;
    this.defaultMachineRows = this.views.defaultMachineRows;
    this.machinePanelSummary = this.views.machinePanelSummary;
    this.machineUsageRows = this.views.machineUsageRows;
    this.recipeRows = this.views.recipeRows;
    this.defaultRecipeRows = this.views.defaultRecipeRows;
    this.baseRecipeRows = this.views.baseRecipeRows;
    this.defaultBaseRecipeRows = this.views.defaultBaseRecipeRows;
    this.standardBaseRecipeRows = this.views.standardBaseRecipeRows;
    this.defaultStandardBaseRecipeRows = this.views.defaultStandardBaseRecipeRows;
    this.converterResourceRecipeRows = this.views.converterResourceRecipeRows;
    this.defaultConverterResourceRecipeRows = this.views.defaultConverterResourceRecipeRows;
    this.alternateRecipeRows = this.views.alternateRecipeRows;
    this.defaultAlternateRecipeRows = this.views.defaultAlternateRecipeRows;
    this.graph = this.views.graph;
    this.planLocked = this.views.planLocked;
    this.nodeLayoutLocked = this.views.nodeLayoutLocked;
    this.completedGraphNodeIds = this.views.completedGraphNodeIds;
    this.graphNodeNotes = this.views.graphNodeNotes;
    this.graphDisplaySettings = this.views.graphDisplaySettings;
    this.defaultGraphDisplaySettings = this.views.defaultGraphDisplaySettings;
    this.selectedGraphNode = this.views.selectedGraphNode;
    this.selectedGraphNodeState = this.views.selectedGraphNodeState;
    this.inspectorViewModel = this.views.inspectorViewModel;

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
    this.graphBuild.flushGraphNodePositions();
    const dataset = this.dataset();
    const project = this.workspace.activeProject();
    if (!dataset || !project) {
      return { ok: false, message: 'There is no active plan to export yet.' };
    }

    const exportFile = encodeBeltwisePlanExport(project, { dataset });
    return {
      ok: true,
      filename: createBeltwisePlanExportFilename(project.name),
      json: stringifyBeltwisePlanExport(exportFile),
    };
  }

  public importPlanJson(json: string): PlannerPlanImportResult {
    const dataset = this.dataset();
    if (!dataset) {
      return { ok: false, message: 'Planner data is still loading. Try importing again shortly.' };
    }

    const decoded = parseBeltwisePlanExportJson(json, dataset);
    if (!decoded.ok) {
      return { ok: false, message: decoded.error.message };
    }

    return this.importDecodedPlan(decoded.project, decoded.warnings, dataset);
  }

  public exportActivePlanSharePayload(): PlannerPlanShareExportResult {
    this.graphBuild.flushGraphNodePositions();
    const dataset = this.dataset();
    const project = this.workspace.activeProject();
    if (!dataset || !project) {
      return { ok: false, message: 'There is no active plan to share yet.' };
    }

    return {
      ok: true,
      payload: encodeBeltwisePlanShare(project, dataset),
    };
  }

  public importPlanSharePayload(payload: unknown): PlannerPlanImportResult {
    const dataset = this.dataset();
    if (!dataset) {
      return { ok: false, message: 'Planner data is still loading. Try importing again shortly.' };
    }

    const decoded = decodeBeltwisePlanShare(payload, dataset);
    if (!decoded.ok) {
      return { ok: false, message: decoded.error.message };
    }

    return this.importDecodedPlan(decoded.project, decoded.warnings, dataset);
  }

  private importDecodedPlan(
    decodedProject: PlannerProject,
    warnings: BeltwisePlanImportWarning[],
    dataset: GameDataset,
  ): PlannerPlanImportResult {
    const name = createUniqueImportedPlannerProjectName(
      decodedProject.name,
      this.workspace.activeSessionProjects().map((project) => project.name),
    );
    const project = prepareImportedPlannerProject(decodedProject, { dataset, name });
    this.workspace.importProject(project);
    return {
      ok: true,
      project,
      warnings,
    };
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
