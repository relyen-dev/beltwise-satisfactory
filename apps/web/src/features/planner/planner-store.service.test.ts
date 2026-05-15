import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type Signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  PLANNER_STORAGE_SCHEMA_VERSION,
  type PlannerProject,
  type ProductionPlanResult,
  type ProductTarget,
} from '@beltwise/planner-core';
import { DatasetService } from './dataset.service';
import type { PlannerPersistenceCoordinatorBinding } from './planner-persistence-coordinator.service';
import { PlannerPersistenceCoordinatorService } from './planner-persistence-coordinator.service';
import { selectPlannerSolveInput, type PlannerSolveInput } from './planner-solve-input';
import { PlannerSolverService, type SolveStatus } from './planner-solver.service';
import {
  GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS,
  PlannerStoreService,
} from './planner-store.service';

const NOW = '2026-05-12T00:00:00.000Z';

afterEach(() => {
  vi.useRealTimers();
});

describe('selectPlannerSolveInput', () => {
  it('keeps the solve key stable for display, layout, build state, and rename changes', () => {
    const project = createProject();
    const changedProject: PlannerProject = {
      ...project,
      name: 'Renamed factory',
      updatedAt: '2026-05-13T00:00:00.000Z',
      graphLayout: {
        nodePositions: {
          'recipe:Recipe_IronPlate_C': { x: 120, y: 240 },
        },
      },
      graphDisplay: {
        maxBeltTier: 3,
        maxPipeTier: 1,
        rateDecimalPlaces: 1,
        edgeStyle: 'curved',
        showTransportLabels: false,
        animateFlowLines: false,
      },
      buildState: {
        planLocked: true,
        nodeLayoutLocked: true,
        nodeStates: {
          'recipe:Recipe_IronPlate_C': {
            done: true,
            note: 'Floor 2',
          },
        },
      },
    };

    expect(solveKey(changedProject)).toBe(solveKey(project));
  });

  it('changes the solve key when solve-relevant project inputs change', () => {
    const project = createProject();
    const baseSolveKey = solveKey(project);
    const target = firstTarget(project);
    const changes: ReadonlyArray<{ name: string; project: PlannerProject }> = [
      {
        name: 'targets',
        project: {
          ...project,
          targets: [{ ...target, amountPerMinute: 20 }],
        },
      },
      {
        name: 'recipeOverrides',
        project: {
          ...project,
          recipeOverrides: {
            ...project.recipeOverrides,
            Recipe_IronWire_C: { enabled: true },
          },
        },
      },
      {
        name: 'machineOverrides',
        project: {
          ...project,
          machineOverrides: {
            ...project.machineOverrides,
            Build_ConstructorMk1_C: { enabled: false },
          },
        },
      },
      {
        name: 'resourceOverrides',
        project: {
          ...project,
          resourceOverrides: {
            ...project.resourceOverrides,
            Desc_OreIron_C: { maxPerMinute: 120 },
          },
        },
      },
      {
        name: 'itemInputs',
        project: {
          ...project,
          itemInputs: {
            ...project.itemInputs,
            Desc_IngotIron_C: { amountPerMinute: 15 },
          },
        },
      },
      {
        name: 'objectiveProfile',
        project: {
          ...project,
          objectiveProfile: {
            ...project.objectiveProfile,
            powerWeight: 0.5,
          },
        },
      },
    ];

    for (const change of changes) {
      expect(solveKey(change.project), change.name).not.toBe(baseSolveKey);
    }
  });

  it('filters draft and zero fixed targets before building the solve key', () => {
    const project = createProject();
    const withDraftTargets: PlannerProject = {
      ...project,
      targets: [
        ...project.targets,
        {
          id: 'target-draft',
          itemId: '',
          mode: 'fixed',
          amountPerMinute: 10,
          sortOrder: 1,
        },
        {
          id: 'target-zero',
          itemId: 'Desc_IronRod_C',
          mode: 'fixed',
          amountPerMinute: 0,
          sortOrder: 2,
        },
      ],
    };

    const input = selectPlannerSolveInput(withDraftTargets, tinySatisfactoryDataset);
    expect(input?.project.targets).toEqual(project.targets);
    expect(input?.key).toBe(solveKey(project));

    const draftOnlyProject = createPlannerProject({
      id: 'project-draft',
      name: 'Draft factory',
      dataset: tinySatisfactoryDataset,
      now: NOW,
      targets: [
        {
          id: 'target-draft',
          itemId: '',
          mode: 'fixed',
          amountPerMinute: 10,
          sortOrder: 0,
        },
      ],
    });

    expect(
      selectPlannerSolveInput(draftOnlyProject, tinySatisfactoryDataset)?.project.targets,
    ).toEqual([]);
  });

  it('uses a stable JSON solve key instead of a short hash', () => {
    const key = solveKey(createProject());

    expect(key).toContain('"datasetKey":');
    expect(key).toContain('"recipeOverrides":');
    expect(key).not.toMatch(/^fnv1a32-[0-9a-f]{8}$/);
    expect(key.length).toBeGreaterThan(1_000);
  });

  it('changes the solve key when the dataset changes', () => {
    const project = createProject();
    const changedDataset: GameDataset = {
      ...tinySatisfactoryDataset,
      generatedAt: '2026-05-13T00:00:00.000Z',
      source: {
        ...tinySatisfactoryDataset.source,
        fingerprint: 'changed-fixture',
      },
    };

    expect(solveKey(project, changedDataset)).not.toBe(solveKey(project));
  });
});

describe('PlannerStoreService', () => {
  it('initializes a starter project through the persistence coordinator facade', () => {
    const { store, connectedSolveInput } = createStoreHarness((binding) => {
      binding.initializeStarterProject(tinySatisfactoryDataset);
    });

    const activeProject = store.activeProject();
    const solveInput = connectedSolveInput?.();

    expect(store.projects()).toHaveLength(1);
    expect(activeProject?.name).toBe('Starter factory');
    expect(store.activeProjectId()).toBe(activeProject?.id);
    expect(store.workbenchFocusRequest()).toMatchObject({
      projectId: activeProject?.id,
      mode: 'open-plan',
    });
    expect(solveInput?.project.id).toBe(activeProject?.id);
  });

  it('keeps graph focus when a stored active project already has targets', () => {
    const project = createProject();
    const { store } = createStoreHarness((binding) => {
      binding.initializeFromStoredState({
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: project.id,
        projects: [project],
      });
    });

    expect(store.activeProjectId()).toBe(project.id);
    expect(store.workbenchFocusRequest()).toMatchObject({
      projectId: project.id,
      mode: 'focus-graph',
    });
  });

  it('coalesces graph node position commits without changing solve-relevant state', () => {
    vi.useFakeTimers();
    const { store, connectedSolveInput } = createInitializedStore();
    const originalSolveKey = connectedSolveInput?.()?.key;
    expect(originalSolveKey).toBeDefined();

    store.setGraphNodePosition('recipe:Recipe_IronPlate_C', { x: 10, y: 20 });
    store.setGraphNodePosition('recipe:Recipe_IronPlate_C', { x: 30, y: 40 });

    expect(store.activeProject()?.graphLayout.nodePositions).toEqual({});

    vi.advanceTimersByTime(GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS - 1);
    expect(store.activeProject()?.graphLayout.nodePositions).toEqual({});

    vi.advanceTimersByTime(1);

    expect(store.activeProject()?.graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 30, y: 40 },
    });
    expect(connectedSolveInput?.()?.key).toBe(originalSolveKey);
  });

  it('flushes pending graph node positions on drag-end commits', () => {
    vi.useFakeTimers();
    const { store } = createInitializedStore();

    store.setGraphNodePosition('recipe:Recipe_IronPlate_C', { x: 10, y: 20 });
    store.flushGraphNodePositions();

    expect(store.activeProject()?.graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 10, y: 20 },
    });

    vi.advanceTimersByTime(GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS);
    expect(store.activeProject()?.graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 10, y: 20 },
    });
  });

  it('flushes pending graph node positions before switching projects', () => {
    vi.useFakeTimers();
    const projectA = createProject();
    const projectB: PlannerProject = { ...createProject(), id: 'project-b', name: 'Factory B' };
    const { store } = createInitializedStore([projectA, projectB], projectA.id);

    store.setGraphNodePosition('recipe:Recipe_IronPlate_C', { x: 11, y: 22 });
    store.selectProject(projectB.id);

    expect(store.activeProjectId()).toBe(projectB.id);
    expect(
      store.projects().find((project) => project.id === projectA.id)?.graphLayout.nodePositions,
    ).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 11, y: 22 },
    });
  });

  it('clears pending graph node positions when resetting layout', () => {
    vi.useFakeTimers();
    const { store } = createInitializedStore();

    store.setGraphNodePosition('recipe:Recipe_IronPlate_C', { x: 15, y: 25 });
    store.resetGraphLayout();
    vi.advanceTimersByTime(GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS);

    expect(store.activeProject()?.graphLayout.nodePositions).toEqual({});
  });

  it('flushes pending graph node positions before other project mutations', () => {
    vi.useFakeTimers();
    const { store } = createInitializedStore();

    store.setGraphNodePosition('recipe:Recipe_IronPlate_C', { x: 17, y: 27 });
    store.renameProject('Renamed factory');

    expect(store.activeProject()).toMatchObject({
      name: 'Renamed factory',
      graphLayout: {
        nodePositions: {
          'recipe:Recipe_IronPlate_C': { x: 17, y: 27 },
        },
      },
    });
  });

  it('flushes pending graph node positions on destroy', () => {
    vi.useFakeTimers();
    const { store } = createInitializedStore();

    store.setGraphNodePosition('recipe:Recipe_IronPlate_C', { x: 19, y: 29 });
    store.ngOnDestroy();

    expect(store.activeProject()?.graphLayout.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 19, y: 29 },
    });
  });
});

function createProject(): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Factory',
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [
      {
        id: 'target-a',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 10,
        sortOrder: 0,
      },
    ],
  });
}

function solveKey(project: PlannerProject, dataset: GameDataset = tinySatisfactoryDataset): string {
  const input = selectPlannerSolveInput(project, dataset);
  if (!input) {
    throw new Error('Expected planner solve input');
  }
  return input.key;
}

function firstTarget(project: PlannerProject): ProductTarget {
  const target = project.targets[0];
  if (!target) {
    throw new Error('Expected a target');
  }
  return target;
}

function createInitializedStore(
  projects: PlannerProject[] = [createProject()],
  activeProjectId = projects[0]?.id,
): {
  connectedSolveInput: Signal<PlannerSolveInput | null> | undefined;
  store: PlannerStoreService;
} {
  return createStoreHarness((binding) => {
    binding.initializeFromStoredState({
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeProjectId,
      projects,
    });
  });
}

function createStoreHarness(initialize: (binding: PlannerPersistenceCoordinatorBinding) => void): {
  connectedSolveInput: Signal<PlannerSolveInput | null> | undefined;
  store: PlannerStoreService;
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
    ],
  });
  const store = runInInjectionContext(injector, () => new PlannerStoreService());

  return { connectedSolveInput, store };
}
