import '@angular/compiler';
import { inject, Injector, runInInjectionContext, signal, type Signal } from '@angular/core';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createPlannerProject,
  createPlannerSession,
  PLANNER_STORAGE_SCHEMA_VERSION,
  type PlannerProject,
  type PlannerSession,
  type PlannerUserDefaults,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetService } from '../dataset.service';
import type { PlannerPersistenceCoordinatorBinding } from '../persistence/planner-persistence-coordinator.service';
import { PlannerPersistenceCoordinatorService } from '../persistence/planner-persistence-coordinator.service';
import { type PlannerSolveInput } from '../solving/planner-solve-input';
import { PlannerSolverService, type SolveStatus } from '../solving/planner-solver.service';
import { PlannerWorkbenchSlice } from '../workbench/planner-workbench-state';
import {
  GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS,
  PLANNER_GRAPH_STORE_PORT,
  PlannerGraphStore,
  type PlannerGraphStorePort,
} from './planner-graph.store';
import {
  PLANNER_PLAN_CONFIG_STORE_PORT,
  PlannerPlanConfigStore,
  type PlannerPlanConfigStorePort,
} from './planner-plan-config.store';
import { PlannerStoreService } from './planner-store.service';
import { PlannerWorkspaceSlice } from './planner-store.workspace';

const NOW = '2026-05-12T00:00:00.000Z';

afterEach(() => {
  vi.useRealTimers();
});

describe('PlannerStoreService', () => {
  it('starts persistence coordination and wires solver input to workspace state', () => {
    const { connectedSolveInput, store, workbench } = createStoreHarness((binding) => {
      binding.initializeStarterProject(tinySatisfactoryDataset);
    });

    const activeProject = requiredProject(store);
    const solveInput = requiredSolveInput(connectedSolveInput);

    expect(store.projects()).toHaveLength(1);
    expect(activeProject.name).toBe('Starter factory');
    expect(store.activeProjectId()).toBe(activeProject.id);
    expect(workbench.focusRequest()).toMatchObject({
      projectId: activeProject.id,
      mode: 'open-plan',
    });
    expect(solveInput.project.id).toBe(activeProject.id);
    expect(solveInput.dataset).toBe(tinySatisfactoryDataset);
  });

  it('connects focused capability stores to the same workspace state', () => {
    const { graph, planConfig } = createInitializedStore();
    const recipeRowCount = planConfig.recipeRows().length;

    planConfig.recipeSearch.set('plate');
    graph.selectionCommands.select('recipe:Recipe_IronPlate_C');
    graph.lockCommands.setPlanLocked(true);

    expect(planConfig.recipeSearch()).toBe('plate');
    expect(planConfig.recipeRows().length).toBeLessThanOrEqual(recipeRowCount);
    expect(graph.readModel.selectedNodeId()).toBe('recipe:Recipe_IronPlate_C');
    expect(graph.readModel.planLocked()).toBe(true);
    expect(planConfig.editingLocked()).toBe(true);
  });

  it('composes workspace activation hooks with graph selection and workbench focus', () => {
    const graphProject = createProject('project-graph', 'Graph factory');
    const draftProject = createProject('project-draft', 'Draft factory', false);
    const { graph, store, workbench } = createInitializedStore(
      [graphProject, draftProject],
      graphProject.id,
    );
    const initialFocusSequence = workbench.focusRequest()?.sequence ?? 0;

    workbench.setActivePanel('recipes');
    graph.selectionCommands.select('recipe:Recipe_IronPlate_C');
    store.selectProject(draftProject.id);

    expect(store.activeProjectId()).toBe(draftProject.id);
    expect(graph.readModel.selectedNodeId()).toBeNull();
    expect(workbench.activePanelId()).toBe('plan');
    expect(workbench.focusRequest()).toMatchObject({
      projectId: draftProject.id,
      mode: 'open-plan',
      sequence: initialFocusSequence + 1,
    });

    workbench.setActivePanel('resources');
    graph.selectionCommands.select('recipe:Recipe_IronRod_C');
    store.selectProject(graphProject.id);

    expect(store.activeProjectId()).toBe(graphProject.id);
    expect(graph.readModel.selectedNodeId()).toBeNull();
    expect(workbench.activePanelId()).toBe('resources');
    expect(workbench.focusRequest()).toMatchObject({
      projectId: graphProject.id,
      mode: 'focus-graph',
      sequence: initialFocusSequence + 2,
    });
  });

  it('flushes pending graph positions on destroy', () => {
    vi.useFakeTimers();
    const { graph, runtime, store } = createInitializedStore();

    graph.layoutCommands.setNodePosition('recipe:Recipe_IronPlate_C', { x: 19, y: 29 });
    runtime.ngOnDestroy();

    expect(requiredProject(store).graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 19, y: 29 },
    });

    vi.advanceTimersByTime(GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS);
    expect(requiredProject(store).graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 19, y: 29 },
    });
  });
});

function createInitializedStore(
  projects: PlannerProject[] = [createProject('project-a', 'Factory')],
  activeProjectId = projects[0]?.id,
  userDefaults: PlannerUserDefaults = createDefaultUserDefaults(tinySatisfactoryDataset),
  sessions: PlannerSession[] = [createSession(projects, activeProjectId)],
  activeSessionId = sessions[0]?.id,
): {
  connectedSolveInput: Signal<PlannerSolveInput | null> | undefined;
  graph: PlannerGraphStore;
  planConfig: PlannerPlanConfigStore;
  runtime: PlannerStoreService;
  store: PlannerWorkspaceSlice;
  workbench: PlannerWorkbenchSlice;
} {
  return createStoreHarness((binding) => {
    binding.initializeFromStoredState({
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeSessionId,
      activeProjectId,
      sessions,
      projects,
      userDefaults,
    });
  });
}

function createStoreHarness(initialize: (binding: PlannerPersistenceCoordinatorBinding) => void): {
  connectedSolveInput: Signal<PlannerSolveInput | null> | undefined;
  graph: PlannerGraphStore;
  planConfig: PlannerPlanConfigStore;
  runtime: PlannerStoreService;
  store: PlannerWorkspaceSlice;
  workbench: PlannerWorkbenchSlice;
} {
  let connectedSolveInput: Signal<PlannerSolveInput | null> | undefined;
  const datasetService: Pick<DatasetService, 'dataset' | 'loadError'> = {
    dataset: signal<GameDataset | null>(tinySatisfactoryDataset),
    loadError: signal<string | null>(null),
  };
  const persistenceCoordinator: Pick<PlannerPersistenceCoordinatorService, 'connect'> = {
    connect: initialize,
  };
  const solver: Pick<
    PlannerSolverService,
    'connect' | 'solveError' | 'solveResult' | 'solveStatus'
  > = {
    connect: (solveInput) => {
      connectedSolveInput = solveInput;
    },
    solveError: signal<string | null>(null),
    solveResult: signal<ProductionPlanResult | null>(null),
    solveStatus: signal<SolveStatus>('idle'),
  };
  const injector = Injector.create({
    providers: [
      { provide: DatasetService, useValue: datasetService },
      { provide: PlannerPersistenceCoordinatorService, useValue: persistenceCoordinator },
      { provide: PlannerSolverService, useValue: solver },
      PlannerWorkspaceSlice,
      {
        provide: PLANNER_GRAPH_STORE_PORT,
        useFactory: (): PlannerGraphStorePort => {
          const injectedDatasetService = inject(DatasetService);
          const workspace = inject(PlannerWorkspaceSlice);
          const injectedSolver = inject(PlannerSolverService);
          return {
            dataset: injectedDatasetService.dataset,
            activeProject: workspace.activeProject,
            solveResult: injectedSolver.solveResult,
            updateActiveProject: (mapper) => workspace.updateActiveProject(mapper),
            updateProjectById: (projectId, mapper) =>
              workspace.updateProjectById(projectId, mapper),
          };
        },
      },
      PlannerGraphStore,
      {
        provide: PLANNER_PLAN_CONFIG_STORE_PORT,
        useFactory: (): PlannerPlanConfigStorePort => {
          const injectedDatasetService = inject(DatasetService);
          const workspace = inject(PlannerWorkspaceSlice);
          const injectedSolver = inject(PlannerSolverService);
          return {
            dataset: injectedDatasetService.dataset,
            activeProject: workspace.activeProject,
            solveResult: injectedSolver.solveResult,
            updateActiveProject: (mapper) => workspace.updateActiveProject(mapper),
          };
        },
      },
      PlannerPlanConfigStore,
      PlannerWorkbenchSlice,
    ],
  });
  const runtime = runInInjectionContext(injector, () => new PlannerStoreService());
  const graph = injector.get(PlannerGraphStore);
  const planConfig = injector.get(PlannerPlanConfigStore);
  const store = injector.get(PlannerWorkspaceSlice);
  const workbench = injector.get(PlannerWorkbenchSlice);

  return { connectedSolveInput, graph, planConfig, runtime, store, workbench };
}

function createProject(id: string, name: string, configured = true): PlannerProject {
  return createPlannerProject({
    id,
    name,
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: configured
      ? [
          {
            id: `${id}-target`,
            itemId: 'Desc_IronPlate_C',
            mode: 'fixed',
            amountPerMinute: 10,
            sortOrder: 0,
          },
        ]
      : [],
  });
}

function createSession(
  projects: readonly PlannerProject[],
  activeProjectId = projects[0]?.id,
  id = 'session-a',
): PlannerSession {
  return createPlannerSession({
    id,
    name: id,
    datasetId: tinySatisfactoryDataset.id,
    projectIds: projects.map((project) => project.id),
    activeProjectId,
    now: NOW,
  });
}

function requiredProject(store: PlannerWorkspaceSlice): PlannerProject {
  const project = store.activeProject();
  if (!project) {
    throw new Error('Expected an active project');
  }
  return project;
}

function requiredSolveInput(
  connectedSolveInput: Signal<PlannerSolveInput | null> | undefined,
): PlannerSolveInput {
  const solveInput = connectedSolveInput?.();
  if (!solveInput) {
    throw new Error('Expected a connected solve input');
  }
  return solveInput;
}
