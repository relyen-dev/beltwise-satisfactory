import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { type ItemId, type RecipeId } from '@beltwise/game-data';
import {
  createStableId,
  PLANNER_STORAGE_SCHEMA_VERSION,
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type GraphLayoutState,
  type GraphNodeBuildState,
  type PipelineTier,
  type PlannerProject,
  type ProductTarget,
  type ProductionGraph,
  type ProductionGraphNode,
  type ProductionPlanResult,
  type RateDecimalPlaces,
} from '@beltwise/planner-core';
import {
  createEmptyProductionPlanResult,
  HighsProductionSolverAdapter,
  solveProductionPlan,
  type ProductionSolverAdapter,
} from '@beltwise/solver';
import { DatasetService } from './dataset.service';
import { createStarterProject, defaultResourceCapPerMinute } from './planner-domain.helpers';
import { PlannerPersistenceService } from './planner-persistence.service';
import * as projectMutations from './planner-project-mutations';
import {
  equalPlannerSolveInputs,
  selectPlannerSolveInput as selectPlannerSolveInputForStore,
  type PlannerSolveInput,
} from './planner-solve-input';
import {
  selectCompletedGraphNodeIds,
  selectExternalInputRows,
  selectGraphNode,
  selectGraphNodeNotes,
  selectGraphNodeState,
  selectItemOptions,
  selectMachineRows,
  selectProductionGraph,
  selectRecipeRows,
  selectResourceRows,
} from './planner-store.selectors';

export { plannerRelevantMachineIds } from './planner-domain.helpers';
export {
  createGameDatasetSolveKey,
  createPlannerSolveKey,
  selectPlannerSolveInput,
} from './planner-solve-input';
export type { PlannerSolveInput, PlannerSolveKey } from './planner-solve-input';

export type ConfigurationTab = 'plan' | 'recipes' | 'inputs' | 'resources' | 'machines' | 'display';
export type SolveStatus = 'idle' | 'solving' | 'solved' | 'error';
export type WorkbenchFocusMode = 'open-plan' | 'focus-graph';

export interface WorkbenchFocusRequest {
  projectId: string;
  mode: WorkbenchFocusMode;
  sequence: number;
}

interface ScheduledPlannerSolve {
  solveInput: PlannerSolveInput;
  serial: number;
}

export const PLANNER_SOLVE_DEBOUNCE_MS = 150;

export class PlannerSolveScheduler<TInput> {
  private pendingTimeout: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly delayMs: number) {}

  public schedule(input: TInput, callback: (input: TInput) => void): void {
    this.cancel();
    this.pendingTimeout = setTimeout(() => {
      this.pendingTimeout = undefined;
      callback(input);
    }, this.delayMs);
  }

  public cancel(): void {
    if (this.pendingTimeout === undefined) {
      return;
    }
    clearTimeout(this.pendingTimeout);
    this.pendingTimeout = undefined;
  }
}

@Injectable({ providedIn: 'root' })
export class PlannerStoreService {
  private readonly datasetService = inject(DatasetService);
  private readonly persistence = inject(PlannerPersistenceService);
  private initialized = false;
  private solveSerial = 0;
  private focusRequestSequence = 0;
  private solverAdapter: ProductionSolverAdapter | undefined;
  private readonly solveScheduler = new PlannerSolveScheduler<ScheduledPlannerSolve>(
    PLANNER_SOLVE_DEBOUNCE_MS,
  );

  public readonly dataset = this.datasetService.dataset;
  public readonly datasetError = this.datasetService.loadError;
  public readonly projects = signal<PlannerProject[]>([]);
  public readonly activeProjectId = signal<string | undefined>(undefined);
  public readonly activeConfigTab = signal<ConfigurationTab>('plan');
  public readonly workbenchFocusRequest = signal<WorkbenchFocusRequest | null>(null);
  public readonly selectedGraphNodeId = signal<string | null>(null);
  public readonly recipeSearch = signal('');
  public readonly solveStatus = signal<SolveStatus>('idle');
  public readonly solveError = signal<string | null>(null);
  public readonly solveResult = signal<ProductionPlanResult | null>(null);

  public readonly activeProject = computed(() => {
    const activeId = this.activeProjectId();
    return this.projects().find((project) => project.id === activeId) ?? this.projects()[0] ?? null;
  });

  private readonly solveInput = computed(
    () => selectPlannerSolveInputForStore(this.activeProject(), this.dataset()),
    { equal: equalPlannerSolveInputs },
  );

  public readonly itemOptions = computed(() => {
    return selectItemOptions(this.dataset());
  });

  public readonly resourceRows = computed(() => {
    const dataset = this.dataset();
    const project = this.activeProject();
    if (!dataset || !project) {
      return [];
    }
    return selectResourceRows(dataset, project);
  });

  public readonly externalInputRows = computed(() => {
    const dataset = this.dataset();
    const project = this.activeProject();
    if (!dataset || !project) {
      return [];
    }

    return selectExternalInputRows(dataset, project);
  });

  public readonly machineRows = computed(() => {
    const dataset = this.dataset();
    const project = this.activeProject();
    if (!dataset || !project) {
      return [];
    }
    return selectMachineRows(dataset, project);
  });

  public readonly recipeRows = computed(() => {
    const dataset = this.dataset();
    const project = this.activeProject();
    if (!dataset || !project) {
      return [];
    }

    return selectRecipeRows(dataset, project, this.recipeSearch());
  });

  public readonly baseRecipeRows = computed(() =>
    this.recipeRows().filter((row) => !row.recipe.isAlternate),
  );
  public readonly alternateRecipeRows = computed(() =>
    this.recipeRows().filter((row) => row.recipe.isAlternate),
  );

  public readonly graph = computed<ProductionGraph | null>(() => {
    const dataset = this.dataset();
    const project = this.activeProject();
    const result = this.solveResult();
    return selectProductionGraph(dataset, project, result);
  });

  public readonly planLocked = computed(() => this.activeProject()?.buildState.planLocked ?? false);
  public readonly nodeLayoutLocked = computed(
    () => this.activeProject()?.buildState.nodeLayoutLocked ?? false,
  );

  public readonly completedGraphNodeIds = computed<ReadonlySet<string>>(() => {
    return selectCompletedGraphNodeIds(this.activeProject());
  });

  public readonly graphNodeNotes = computed<Readonly<Record<string, string>>>(() => {
    return selectGraphNodeNotes(this.activeProject());
  });

  public readonly graphDisplaySettings = computed(() => this.activeProject()?.graphDisplay ?? null);

  public readonly selectedGraphNode = computed<ProductionGraphNode | null>(() => {
    return selectGraphNode(this.graph(), this.selectedGraphNodeId());
  });

  public readonly selectedGraphNodeState = computed<GraphNodeBuildState>(() => {
    return selectGraphNodeState(this.activeProject(), this.selectedGraphNodeId());
  });

  public constructor() {
    effect(() => {
      const dataset = this.dataset();
      if (dataset && !this.initialized) {
        this.initialized = true;
        const stored = this.persistence.load(dataset);
        if (stored && stored.projects.length > 0) {
          this.projects.set(stored.projects);
          const activeProject =
            stored.projects.find((project) => project.id === stored.activeProjectId) ??
            stored.projects[0];
          if (activeProject) {
            this.activateProject(activeProject, projectFocusMode(activeProject));
          }
        } else {
          const starter = createStarterProject(dataset);
          this.projects.set([starter]);
          this.activateProject(starter, 'open-plan');
        }
      }
    });

    effect(() => {
      const solveInput = this.solveInput();
      if (!solveInput) {
        this.cancelPendingSolve();
        return;
      }

      const serial = ++this.solveSerial;
      this.solveError.set(null);

      if (solveInput.project.targets.length === 0) {
        this.solveScheduler.cancel();
        this.solveResult.set(createEmptyProductionPlanResult());
        this.solveStatus.set('solved');
        return;
      }

      this.solveStatus.set('solving');
      this.solveScheduler.schedule({ solveInput, serial }, (scheduledSolve) =>
        this.runScheduledSolve(scheduledSolve),
      );
    });

    effect(() => {
      const projects = this.projects();
      const activeProjectId = this.activeProjectId();
      if (!this.initialized || projects.length === 0) {
        return;
      }
      const storedState =
        activeProjectId === undefined
          ? {
              schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
              projects,
            }
          : {
              schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
              activeProjectId,
              projects,
            };
      untracked(() => this.persistence.save(storedState));
    });
  }

  public selectProject(projectId: string): void {
    const project = this.projects().find((candidate) => candidate.id === projectId);
    if (!project) {
      return;
    }
    this.activateProject(project, projectFocusMode(project));
  }

  public createProject(): void {
    const dataset = this.dataset();
    if (!dataset) {
      return;
    }
    const project = createStarterProject(dataset, `Plan ${this.projects().length + 1}`);
    this.projects.update((projects) => [...projects, project]);
    this.activateProject(project, 'open-plan');
  }

  public duplicateProject(): void {
    const project = this.activeProject();
    if (!project) {
      return;
    }
    const now = new Date().toISOString();
    const clone = projectMutations.duplicatePlannerProject(project, {
      id: createStableId('project'),
      now,
    });
    this.projects.update((projects) => [...projects, clone]);
    this.activateProject(clone, projectFocusMode(clone));
  }

  public deleteProject(): void {
    const activeId = this.activeProjectId();
    if (!activeId || this.projects().length <= 1) {
      return;
    }
    const remainingProjects = this.projects().filter((project) => project.id !== activeId);
    this.projects.set(remainingProjects);
    const nextProject = remainingProjects[0];
    if (nextProject) {
      this.activateProject(nextProject, projectFocusMode(nextProject));
    }
  }

  public renameProject(name: string): void {
    this.updateActiveProject((project) => ({ ...project, name }));
  }

  public addTarget(): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) =>
      projectMutations.addDraftTarget(project, createStableId('target')),
    );
  }

  public duplicateTarget(target: ProductTarget): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) =>
      projectMutations.duplicateTarget(project, target, createStableId('target')),
    );
  }

  public removeTarget(targetId: string): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) => projectMutations.removeTarget(project, targetId));
  }

  public updateTargetItem(targetId: string, itemId: ItemId): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) => projectMutations.setTargetItem(project, targetId, itemId));
  }

  public updateTargetMode(targetId: string, mode: ProductTarget['mode']): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) => projectMutations.setTargetMode(project, targetId, mode));
  }

  public updateTargetAmount(targetId: string, amountPerMinute: number): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) =>
      projectMutations.setTargetAmount(project, targetId, amountPerMinute),
    );
  }

  public setRecipeEnabled(recipeId: RecipeId, enabled: boolean): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) =>
      projectMutations.setRecipeEnabled(project, recipeId, enabled),
    );
  }

  public setRecipeGroupEnabled(isAlternate: boolean, enabled: boolean): void {
    if (this.planLocked()) {
      return;
    }
    const dataset = this.dataset();
    if (!dataset) {
      return;
    }

    const recipeIds = Object.values(dataset.recipes)
      .filter((recipe) => recipe.isAlternate === isAlternate)
      .map((recipe) => recipe.id);

    this.updateActiveProject((project) =>
      projectMutations.setRecipeGroupEnabled(project, recipeIds, enabled),
    );
  }

  public setItemInput(itemId: ItemId, amountPerMinute: number): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) =>
      projectMutations.setItemInput(project, itemId, amountPerMinute),
    );
  }

  public addExternalInput(): void {
    if (this.planLocked()) {
      return;
    }
    const project = this.activeProject();
    const item = this.itemOptions().find((candidate) => !project?.itemInputs[candidate.id]);
    if (!item) {
      return;
    }
    this.setItemInput(item.id, 10);
  }

  public updateExternalInputItem(previousItemId: ItemId, nextItemId: ItemId): void {
    if (this.planLocked()) {
      return;
    }
    if (previousItemId === nextItemId) {
      return;
    }

    this.updateActiveProject((project) =>
      projectMutations.moveItemInput(project, previousItemId, nextItemId),
    );
  }

  public removeExternalInput(itemId: ItemId): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) => projectMutations.removeItemInput(project, itemId));
  }

  public setResourceCap(itemId: ItemId, maxPerMinute: number): void {
    if (this.planLocked()) {
      return;
    }
    const dataset = this.dataset();
    const baselineCapPerMinute = dataset?.resources[itemId]
      ? defaultResourceCapPerMinute(dataset.resources[itemId])
      : undefined;
    this.updateActiveProject((project) =>
      projectMutations.setResourceCap(project, itemId, maxPerMinute, baselineCapPerMinute),
    );
  }

  public setResourceEnabled(itemId: ItemId, enabled: boolean): void {
    if (this.planLocked()) {
      return;
    }
    const dataset = this.dataset();
    const baselineCapPerMinute = dataset?.resources[itemId]
      ? defaultResourceCapPerMinute(dataset.resources[itemId])
      : undefined;

    this.updateActiveProject((project) =>
      projectMutations.setResourceEnabled(project, itemId, enabled, baselineCapPerMinute),
    );
  }

  public resetResource(itemId: ItemId): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) => projectMutations.resetResource(project, itemId));
  }

  public resetAllResources(): void {
    if (this.planLocked()) {
      return;
    }
    const dataset = this.dataset();
    if (!dataset) {
      return;
    }
    const resourceIds = Object.keys(dataset.resources);
    this.updateActiveProject((project) => projectMutations.resetResources(project, resourceIds));
  }

  public setAllResourcesEnabled(enabled: boolean): void {
    if (this.planLocked()) {
      return;
    }
    const dataset = this.dataset();
    if (!dataset) {
      return;
    }

    this.updateActiveProject((project) =>
      projectMutations.setAllResourcesEnabled(project, Object.values(dataset.resources), enabled),
    );
  }

  public setMachineEnabled(machineId: string, enabled: boolean): void {
    if (this.planLocked()) {
      return;
    }
    this.updateActiveProject((project) =>
      projectMutations.setMachineEnabled(project, machineId, enabled),
    );
  }

  public setGraphNodePosition(nodeId: string, position: { x: number; y: number }): void {
    if (this.nodeLayoutLocked()) {
      return;
    }
    this.updateActiveProject((project) =>
      projectMutations.setGraphNodePosition(project, nodeId, position),
    );
  }

  public resetGraphLayout(): void {
    if (this.nodeLayoutLocked()) {
      return;
    }
    this.updateActiveProject(projectMutations.resetGraphLayout);
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
    this.updateActiveProject((project) => projectMutations.setPlanLocked(project, locked));
  }

  public setNodeLayoutLocked(locked: boolean): void {
    this.updateActiveProject((project) => projectMutations.setNodeLayoutLocked(project, locked));
  }

  public setMaxBeltTier(maxBeltTier: ConveyorBeltTier): void {
    this.updateActiveProject((project) => projectMutations.setMaxBeltTier(project, maxBeltTier));
  }

  public setMaxPipeTier(maxPipeTier: PipelineTier): void {
    this.updateActiveProject((project) => projectMutations.setMaxPipeTier(project, maxPipeTier));
  }

  public setRateDecimalPlaces(rateDecimalPlaces: RateDecimalPlaces): void {
    this.updateActiveProject((project) =>
      projectMutations.setRateDecimalPlaces(project, rateDecimalPlaces),
    );
  }

  public setGraphEdgeStyle(edgeStyle: GraphEdgeStyle): void {
    this.updateActiveProject((project) => projectMutations.setGraphEdgeStyle(project, edgeStyle));
  }

  public setShowTransportLabels(showTransportLabels: boolean): void {
    this.updateActiveProject((project) =>
      projectMutations.setShowTransportLabels(project, showTransportLabels),
    );
  }

  public setAnimateFlowLines(animateFlowLines: boolean): void {
    this.updateActiveProject((project) =>
      projectMutations.setAnimateFlowLines(project, animateFlowLines),
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
    const currentDone = this.activeProject()?.buildState.nodeStates[nodeId]?.done === true;
    this.setGraphNodeDone(nodeId, !currentDone);
  }

  public setSelectedGraphNodeNote(note: string): void {
    const selectedNodeId = this.selectedGraphNodeId();
    if (!selectedNodeId) {
      return;
    }
    this.updateActiveProject((project) =>
      projectMutations.setGraphNodeNote(project, selectedNodeId, note),
    );
  }

  public activeLayout(): GraphLayoutState {
    return this.activeProject()?.graphLayout ?? projectMutations.defaultGraphLayout();
  }

  private updateActiveProject(mapper: (project: PlannerProject) => PlannerProject): void {
    const activeId = this.activeProjectId();
    if (!activeId) {
      return;
    }
    const now = new Date().toISOString();
    this.projects.update((projects) =>
      projectMutations.updateProjectInList(projects, activeId, now, mapper),
    );
  }

  private activateProject(project: PlannerProject, focusMode: WorkbenchFocusMode): void {
    this.activeProjectId.set(project.id);
    this.selectedGraphNodeId.set(null);
    if (focusMode === 'open-plan') {
      this.activeConfigTab.set('plan');
    }
    this.workbenchFocusRequest.set({
      projectId: project.id,
      mode: focusMode,
      sequence: ++this.focusRequestSequence,
    });
  }

  private runScheduledSolve({ solveInput, serial }: ScheduledPlannerSolve): void {
    void solveProductionPlan(
      { dataset: solveInput.dataset, project: solveInput.project },
      this.getSolverAdapter(),
    )
      .then((result) => {
        if (serial !== this.solveSerial) {
          return;
        }
        this.solveResult.set(result);
        this.solveStatus.set('solved');
      })
      .catch((error: unknown) => {
        if (serial !== this.solveSerial) {
          return;
        }
        this.solveResult.set(null);
        this.solveError.set(error instanceof Error ? error.message : 'Solving failed');
        this.solveStatus.set('error');
      });
  }

  private cancelPendingSolve(): void {
    this.solveSerial += 1;
    this.solveScheduler.cancel();
  }

  private getSolverAdapter(): ProductionSolverAdapter {
    this.solverAdapter ??= new HighsProductionSolverAdapter();
    return this.solverAdapter;
  }

  private setGraphNodeDone(nodeId: string, done: boolean): void {
    this.updateActiveProject((project) =>
      projectMutations.setGraphNodeDone(project, nodeId, done),
    );
  }
}

function projectFocusMode(project: PlannerProject): WorkbenchFocusMode {
  return project.targets.some((target) => target.itemId.trim().length > 0)
    ? 'focus-graph'
    : 'open-plan';
}
