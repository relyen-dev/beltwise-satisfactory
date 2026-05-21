import '@angular/compiler';
import {
  computed,
  Injector,
  runInInjectionContext,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  type PlannerProject,
  type ProductionPlanResult,
} from '@beltwise/planner-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS,
  PLANNER_GRAPH_STORE_PORT,
  PlannerGraphStore,
  type PlannerGraphStorePort,
} from './planner-graph.store';

const NOW = '2026-05-12T00:00:00.000Z';
const NODE_ID = 'recipe:Recipe_IronPlate_C';

afterEach(() => {
  vi.useRealTimers();
});

describe('PlannerGraphStore', () => {
  it('owns renderer-neutral selection and lock state', () => {
    const { activeProject, graph } = createGraphHarness();

    expect(graph.readModel.selectedNodeId()).toBeNull();
    expect(graph.readModel.planLocked()).toBe(false);

    graph.selectionCommands.select(NODE_ID);
    graph.lockCommands.setPlanLocked(true);
    graph.lockCommands.setNodeLayoutLocked(true);

    expect(graph.readModel.selectedNodeId()).toBe(NODE_ID);
    expect(graph.readModel.planLocked()).toBe(true);
    expect(graph.readModel.nodeLayoutLocked()).toBe(true);
    expect(requiredProject(activeProject).buildState).toMatchObject({
      planLocked: true,
      nodeLayoutLocked: true,
    });

    graph.selectionCommands.toggle(NODE_ID);
    expect(graph.readModel.selectedNodeId()).toBeNull();

    graph.selectionCommands.set(NODE_ID);
    graph.selectionCommands.clear();
    expect(graph.readModel.selectedNodeId()).toBeNull();
  });

  it('clears selection when the selected node leaves the current graph', () => {
    const { graph, solveResult } = createGraphHarness({
      solveResult: solvedPlateResult(),
    });

    graph.selectionCommands.select(NODE_ID);
    expect(graph.readModel.selectedNodeId()).toBe(NODE_ID);

    solveResult.set(infeasibleResult());

    expect(graph.readModel.selectedNodeId()).toBeNull();
  });

  it('owns selected-node done and note state', () => {
    const { activeProject, graph } = createGraphHarness();

    graph.selectionCommands.select(NODE_ID);
    graph.nodeStateCommands.setSelectedDone(true);
    graph.nodeStateCommands.setSelectedNote('Floor 2');

    expect(graph.readModel.completedNodeIds().has(NODE_ID)).toBe(true);
    expect(graph.readModel.nodeNotes()).toEqual({ [NODE_ID]: 'Floor 2' });
    expect(graph.readModel.selectedNodeState()).toEqual({ done: true, note: 'Floor 2' });
    expect(requiredProject(activeProject).buildState.nodeStates[NODE_ID]).toEqual({
      done: true,
      note: 'Floor 2',
    });

    graph.nodeStateCommands.toggleDone(NODE_ID);
    expect(graph.readModel.completedNodeIds().has(NODE_ID)).toBe(false);
    expect(graph.readModel.nodeNotes()).toEqual({ [NODE_ID]: 'Floor 2' });

    graph.nodeStateCommands.setSelectedNote('   ');
    expect(requiredProject(activeProject).buildState.nodeStates[NODE_ID]).toBeUndefined();
    expect(graph.readModel.selectedNodeState()).toEqual({});
  });

  it('owns layout reset and respects node layout locks', () => {
    const { activeProject, graph } = createGraphHarness();

    graph.layoutCommands.setNodePosition(NODE_ID, { x: 10, y: 20 });
    graph.layoutCommands.flushNodePositions();
    expect(graph.readModel.layout().nodePositions).toEqual({
      [NODE_ID]: { x: 10, y: 20 },
    });

    graph.lockCommands.setNodeLayoutLocked(true);
    graph.layoutCommands.setNodePosition(NODE_ID, { x: 30, y: 40 });
    graph.layoutCommands.flushNodePositions();
    graph.layoutCommands.resetLayout();
    expect(requiredProject(activeProject).graphLayout.nodePositions).toEqual({
      [NODE_ID]: { x: 10, y: 20 },
    });

    graph.lockCommands.setNodeLayoutLocked(false);
    graph.layoutCommands.resetLayout();
    expect(graph.readModel.layout().nodePositions).toEqual({});
  });

  it('coalesces pending position commits behind the graph interface', () => {
    vi.useFakeTimers();
    const { activeProject, graph } = createGraphHarness();

    graph.layoutCommands.setNodePosition(NODE_ID, { x: 10, y: 20 });
    graph.layoutCommands.setNodePosition(NODE_ID, { x: 30, y: 40 });

    expect(requiredProject(activeProject).graphLayout.nodePositions).toEqual({});

    vi.advanceTimersByTime(GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS - 1);
    expect(requiredProject(activeProject).graphLayout.nodePositions).toEqual({});

    vi.advanceTimersByTime(1);
    expect(requiredProject(activeProject).graphLayout.nodePositions).toEqual({
      [NODE_ID]: { x: 30, y: 40 },
    });
  });

  it('flushes drag-end position commits idempotently', () => {
    vi.useFakeTimers();
    const { activeProject, graph } = createGraphHarness();

    graph.layoutCommands.setNodePosition(NODE_ID, { x: 10, y: 20 });
    graph.layoutCommands.flushNodePositions();
    graph.layoutCommands.flushNodePositions();

    expect(requiredProject(activeProject).graphLayout.nodePositions).toEqual({
      [NODE_ID]: { x: 10, y: 20 },
    });

    vi.advanceTimersByTime(GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS);
    expect(requiredProject(activeProject).graphLayout.nodePositions).toEqual({
      [NODE_ID]: { x: 10, y: 20 },
    });
  });

  it('flushes and clears pending layout state for workspace lifecycle hooks', () => {
    vi.useFakeTimers();
    const { activeProject, graph } = createGraphHarness();

    graph.layoutCommands.setNodePosition(NODE_ID, { x: 15, y: 25 });
    graph.lifecycle.clearPendingState();
    vi.advanceTimersByTime(GRAPH_NODE_POSITION_COMMIT_DEBOUNCE_MS);
    expect(requiredProject(activeProject).graphLayout.nodePositions).toEqual({});

    graph.layoutCommands.setNodePosition(NODE_ID, { x: 20, y: 35 });
    graph.lifecycle.flushPendingState();
    expect(requiredProject(activeProject).graphLayout.nodePositions).toEqual({
      [NODE_ID]: { x: 20, y: 35 },
    });
  });
});

function createGraphHarness(
  options: {
    readonly project?: PlannerProject;
    readonly dataset?: GameDataset | null;
    readonly solveResult?: ProductionPlanResult | null;
  } = {},
): {
  activeProject: Signal<PlannerProject | null>;
  graph: PlannerGraphStore;
  solveResult: WritableSignal<ProductionPlanResult | null>;
} {
  const projects = signal<PlannerProject[]>([options.project ?? createProject()]);
  const activeProjectId = signal<string | undefined>(projects()[0]?.id);
  const activeProject = computed(
    () => projects().find((project) => project.id === activeProjectId()) ?? null,
  );
  const solveResult = signal<ProductionPlanResult | null>(options.solveResult ?? null);
  const port: PlannerGraphStorePort = {
    dataset: signal<GameDataset | null>(options.dataset ?? tinySatisfactoryDataset),
    activeProject,
    solveResult,
    updateActiveProject: (mapper) => {
      const projectId = activeProjectId();
      if (!projectId) {
        return;
      }
      updateProjectById(projects, projectId, mapper);
    },
    updateProjectById: (projectId, mapper) => updateProjectById(projects, projectId, mapper),
  };
  const injector = Injector.create({
    providers: [{ provide: PLANNER_GRAPH_STORE_PORT, useValue: port }],
  });
  const graph = runInInjectionContext(injector, () => new PlannerGraphStore());

  return { activeProject, graph, solveResult };
}

function updateProjectById(
  projects: WritableSignal<PlannerProject[]>,
  projectId: string,
  mapper: (project: PlannerProject) => PlannerProject,
): void {
  projects.update((currentProjects) =>
    currentProjects.map((project) => (project.id === projectId ? mapper(project) : project)),
  );
}

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

function requiredProject(project: Signal<PlannerProject | null>): PlannerProject {
  const value = project();
  if (!value) {
    throw new Error('Expected an active project');
  }
  return value;
}

function solvedPlateResult(): ProductionPlanResult {
  return {
    status: 'optimal',
    recipeRates: { Recipe_IronPlate_C: 10 },
    rawInputs: {},
    externalInputs: {},
    itemFlows: [],
    outputs: { Desc_IronPlate_C: 10 },
    surplus: {},
    machineUsage: [
      {
        recipeId: 'Recipe_IronPlate_C',
        machineId: 'Build_ConstructorMk1_C',
        machineDisplayName: 'Constructor',
        recipeDisplayName: 'Iron Plate',
        recipeRatePerMinute: 10,
        machineCount: 1,
        powerMw: 4,
      },
    ],
    powerMw: 4,
    warnings: [],
  };
}

function infeasibleResult(): ProductionPlanResult {
  return {
    status: 'infeasible',
    recipeRates: {},
    rawInputs: {},
    externalInputs: {},
    itemFlows: [],
    outputs: {},
    surplus: {},
    machineUsage: [],
    powerMw: 0,
    warnings: [{ code: 'solver-infeasible', message: 'raw-resources: HiGHS returned Infeasible.' }],
  };
}
