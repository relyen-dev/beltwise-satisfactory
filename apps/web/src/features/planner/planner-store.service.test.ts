import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type Signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createPlannerProject,
  encodeBeltwisePlanExport,
  encodeBeltwisePlanShare,
  PLANNER_STORAGE_SCHEMA_VERSION,
  stringifyBeltwisePlanExport,
  type PlannerProject,
  type PlannerUserDefaults,
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

  it('initializes a starter project with current user defaults', () => {
    const userDefaults = createCustomUserDefaults();
    const { store } = createStoreHarness((binding) => {
      binding.initializeStarterProject(tinySatisfactoryDataset, userDefaults);
    });

    const project = requiredProject(store);

    expect(project.recipeOverrides['Recipe_IronPlate_C']).toEqual({ enabled: false });
    expect(project.recipeOverrides['Recipe_IronWire_C']).toEqual({ enabled: true });
    expect(project.machineOverrides['Build_ConstructorMk1_C']).toEqual({ enabled: false });
    expect(project.resourceOverrides['Desc_OreIron_C']).toEqual({ maxPerMinute: 180 });
    expect(project.graphDisplay.maxBeltTier).toBe(5);
  });

  it('keeps graph focus when a stored active project already has targets', () => {
    const project = createProject();
    const { store } = createStoreHarness((binding) => {
      binding.initializeFromStoredState({
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: project.id,
        projects: [project],
        userDefaults: createDefaultUserDefaults(tinySatisfactoryDataset),
      });
    });

    expect(store.activeProjectId()).toBe(project.id);
    expect(store.workbenchFocusRequest()).toMatchObject({
      projectId: project.id,
      mode: 'focus-graph',
    });
  });

  it('falls back to the first stored project when the stored active id is missing', () => {
    const draftProject = createEmptyProject('project-draft', 'Draft factory');
    const targetProject: PlannerProject = {
      ...createProject(),
      id: 'project-target',
      name: 'Target factory',
    };
    const { store } = createStoreHarness((binding) => {
      binding.initializeFromStoredState({
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: 'missing-project',
        projects: [draftProject, targetProject],
        userDefaults: createDefaultUserDefaults(tinySatisfactoryDataset),
      });
    });

    expect(store.activeProjectId()).toBe(draftProject.id);
    expect(store.activeConfigTab()).toBe('plan');
    expect(store.workbenchFocusRequest()).toMatchObject({
      projectId: draftProject.id,
      mode: 'open-plan',
    });
  });

  it('requests the matching focus mode when selecting projects and clears graph selection', () => {
    const graphProject = createProject();
    const draftProject = createEmptyProject('project-draft', 'Draft factory');
    const { store } = createInitializedStore([graphProject, draftProject], graphProject.id);
    const initialFocusSequence = store.workbenchFocusRequest()?.sequence ?? 0;

    store.activeConfigTab.set('recipes');
    store.selectGraphNode('recipe:Recipe_IronPlate_C');
    store.selectProject(draftProject.id);

    expect(store.activeProjectId()).toBe(draftProject.id);
    expect(store.activeConfigTab()).toBe('plan');
    expect(store.selectedGraphNodeId()).toBeNull();
    expect(store.workbenchFocusRequest()).toMatchObject({
      projectId: draftProject.id,
      mode: 'open-plan',
      sequence: initialFocusSequence + 1,
    });

    store.activeConfigTab.set('resources');
    store.selectGraphNode('recipe:Recipe_IronRod_C');
    store.selectProject(graphProject.id);

    expect(store.activeProjectId()).toBe(graphProject.id);
    expect(store.activeConfigTab()).toBe('resources');
    expect(store.selectedGraphNodeId()).toBeNull();
    expect(store.workbenchFocusRequest()).toMatchObject({
      projectId: graphProject.id,
      mode: 'focus-graph',
      sequence: initialFocusSequence + 2,
    });
  });

  it('creates new projects from user defaults without mutating existing projects', () => {
    const userDefaults = createCustomUserDefaults();
    const originalProject = createProject();
    const { store } = createInitializedStore([originalProject], originalProject.id, userDefaults);

    store.createProject();

    const newProject = requiredProject(store);
    const storedOriginal = store.projects().find((project) => project.id === originalProject.id);
    expect(newProject.id).not.toBe(originalProject.id);
    expect(newProject.recipeOverrides['Recipe_IronPlate_C']).toEqual({ enabled: false });
    expect(newProject.recipeOverrides['Recipe_IronWire_C']).toEqual({ enabled: true });
    expect(newProject.machineOverrides['Build_ConstructorMk1_C']).toEqual({ enabled: false });
    expect(newProject.resourceOverrides['Desc_OreIron_C']).toEqual({ maxPerMinute: 180 });
    expect(newProject.graphDisplay.maxBeltTier).toBe(5);
    expect(storedOriginal).toEqual(originalProject);
  });

  it('duplicates the active project exactly without reapplying user defaults', () => {
    const userDefaults = createCustomUserDefaults();
    const project: PlannerProject = {
      ...createProject(),
      recipeOverrides: { Recipe_IronWire_C: { enabled: false } },
      machineOverrides: {},
      resourceOverrides: {},
      graphDisplay: {
        maxBeltTier: 1,
        maxPipeTier: 1,
        rateDecimalPlaces: 1,
        edgeStyle: 'straight',
        showTransportLabels: true,
        animateFlowLines: false,
      },
    };
    const { store } = createInitializedStore([project], project.id, userDefaults);

    store.duplicateProject();

    const clone = requiredProject(store);
    expect(clone.id).not.toBe(project.id);
    expect(clone.name).toBe(`${project.name} copy`);
    expect(clone.recipeOverrides).toEqual(project.recipeOverrides);
    expect(clone.machineOverrides).toEqual(project.machineOverrides);
    expect(clone.resourceOverrides).toEqual(project.resourceOverrides);
    expect(clone.graphDisplay).toEqual(project.graphDisplay);
  });

  it('keeps defaults commands separate from the active project', () => {
    const { store } = createInitializedStore();
    const beforeProject = requiredProject(store);

    store.setDefaultRecipeEnabled('Recipe_IronPlate_C', false);
    store.setDefaultMachineEnabled('Build_ConstructorMk1_C', false);
    store.setDefaultResourceCap('Desc_OreIron_C', 120);
    store.setDefaultGraphEdgeStyle('curved');

    expect(requiredProject(store)).toEqual(beforeProject);
    expect(store.userDefaults()?.recipeOverrides['Recipe_IronPlate_C']).toEqual({
      enabled: false,
    });
    expect(store.userDefaults()?.machineOverrides['Build_ConstructorMk1_C']).toEqual({
      enabled: false,
    });
    expect(store.userDefaults()?.resourceOverrides['Desc_OreIron_C']).toEqual({
      maxPerMinute: 120,
    });
    expect(store.userDefaults()?.graphDisplay.edgeStyle).toBe('curved');
  });

  it('saves only default-eligible active plan settings as user defaults', () => {
    const project: PlannerProject = {
      ...createProject(),
      targets: [
        {
          id: 'target-a',
          itemId: 'Desc_IronPlate_C',
          mode: 'fixed',
          amountPerMinute: 20,
          sortOrder: 0,
        },
      ],
      recipeOverrides: { Recipe_IronWire_C: { enabled: true } },
      machineOverrides: { Build_ConstructorMk1_C: { enabled: false } },
      resourceOverrides: { Desc_OreIron_C: { enabled: false, maxPerMinute: 90 } },
      itemInputs: { Desc_IngotIron_C: { amountPerMinute: 15 } },
      graphLayout: { nodePositions: { node: { x: 1, y: 2 } } },
      graphDisplay: {
        maxBeltTier: 4,
        maxPipeTier: 1,
        rateDecimalPlaces: 2,
        edgeStyle: 'curved',
        showTransportLabels: false,
        animateFlowLines: false,
      },
      buildState: {
        planLocked: true,
        nodeLayoutLocked: true,
        nodeStates: { node: { done: true, note: 'Build next' } },
      },
    };
    const { store } = createInitializedStore([project], project.id);

    store.saveActivePlanAsDefaults();

    expect(requiredProject(store)).toEqual(project);
    expect(store.userDefaults()).toEqual({
      recipeOverrides: project.recipeOverrides,
      machineOverrides: project.machineOverrides,
      resourceOverrides: project.resourceOverrides,
      objectiveProfile: project.objectiveProfile,
      graphDisplay: project.graphDisplay,
    });
  });

  it('resets user defaults to built-in behavior for future new projects', () => {
    const { store } = createInitializedStore([createProject()], 'project-a', createCustomUserDefaults());

    store.resetUserDefaults();
    store.createProject();

    const newProject = requiredProject(store);
    expect(store.userDefaults()).toEqual(createDefaultUserDefaults(tinySatisfactoryDataset));
    expect(newProject.recipeOverrides['Recipe_IronPlate_C']).toBeUndefined();
    expect(newProject.recipeOverrides['Recipe_IronWire_C']).toEqual({ enabled: false });
    expect(newProject.machineOverrides).toEqual({});
    expect(newProject.resourceOverrides).toEqual({});
    expect(newProject.graphDisplay).toEqual({
      maxBeltTier: 6,
      maxPipeTier: 2,
      rateDecimalPlaces: 3,
      edgeStyle: 'straight',
      showTransportLabels: true,
      animateFlowLines: true,
    });
  });

  it('ignores solve-relevant plan commands while the plan is locked', () => {
    const { store, connectedSolveInput } = createInitializedStore();
    const target = firstTarget(requiredProject(store));

    store.setPlanLocked(true);
    const lockedProject = requiredProject(store);
    const lockedSolveInput = requiredSolveInput(connectedSolveInput);

    store.addTarget();
    store.updateTargetAmount(target.id, 999);
    store.setRecipeEnabled('Recipe_IronPlate_C', false);
    store.setItemInput('Desc_IngotIron_C', 25);
    store.removeTarget(target.id);

    expect(requiredProject(store).targets).toEqual(lockedProject.targets);
    expect(requiredProject(store).recipeOverrides).toEqual(lockedProject.recipeOverrides);
    expect(requiredProject(store).itemInputs).toEqual(lockedProject.itemInputs);
    expect(requiredSolveInput(connectedSolveInput)).toBe(lockedSolveInput);
  });

  it('keeps graph build-state commands scoped to build state and respects layout locks', () => {
    const { store } = createInitializedStore();
    const nodeId = 'recipe:Recipe_IronPlate_C';

    store.selectGraphNode(nodeId);
    store.setSelectedGraphNodeDone(true);
    store.setSelectedGraphNodeNote('Floor 2');

    expect(store.completedGraphNodeIds().has(nodeId)).toBe(true);
    expect(store.graphNodeNotes()).toEqual({ [nodeId]: 'Floor 2' });
    expect(store.selectedGraphNodeState()).toEqual({ done: true, note: 'Floor 2' });

    store.toggleGraphNodeDone(nodeId);
    expect(store.completedGraphNodeIds().has(nodeId)).toBe(false);
    expect(store.graphNodeNotes()).toEqual({ [nodeId]: 'Floor 2' });

    store.setSelectedGraphNodeNote('   ');
    expect(requiredProject(store).buildState.nodeStates[nodeId]).toBeUndefined();

    store.setGraphNodePosition(nodeId, { x: 10, y: 20 });
    store.flushGraphNodePositions();
    expect(requiredProject(store).graphLayout.nodePositions).toEqual({
      [nodeId]: { x: 10, y: 20 },
    });

    store.setNodeLayoutLocked(true);
    store.setGraphNodePosition(nodeId, { x: 30, y: 40 });
    store.flushGraphNodePositions();
    store.resetGraphLayout();

    expect(requiredProject(store).graphLayout.nodePositions).toEqual({
      [nodeId]: { x: 10, y: 20 },
    });
  });

  it('keeps the connected solve input stable for solve-irrelevant store commands', () => {
    const { store, connectedSolveInput } = createInitializedStore();
    const target = firstTarget(requiredProject(store));
    const originalSolveInput = requiredSolveInput(connectedSolveInput);

    store.renameProject('Renamed factory');
    expect(requiredSolveInput(connectedSolveInput)).toBe(originalSolveInput);

    store.setGraphEdgeStyle('curved');
    expect(requiredSolveInput(connectedSolveInput)).toBe(originalSolveInput);

    store.setPlanLocked(true);
    store.selectGraphNode('recipe:Recipe_IronPlate_C');
    store.setSelectedGraphNodeDone(true);
    expect(requiredSolveInput(connectedSolveInput)).toBe(originalSolveInput);

    store.setPlanLocked(false);
    const beforeTargetChange = requiredSolveInput(connectedSolveInput);
    store.updateTargetAmount(target.id, 25);

    expect(requiredSolveInput(connectedSolveInput)).not.toBe(beforeTargetChange);
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

  it('exports the active plan without changing timestamps when no layout flush is pending', () => {
    const { store } = createInitializedStore();
    const beforeProject = requiredProject(store);

    const result = store.exportActivePlan();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.filename).toBe('beltwise-factory.json');
    expect(requiredProject(store).updatedAt).toBe(beforeProject.updatedAt);
    const parsed = JSON.parse(result.json) as {
      project: Record<string, unknown>;
      userDefaults?: unknown;
    };
    expect(parsed.project['updatedAt']).toBe(beforeProject.updatedAt);
    expect('userDefaults' in parsed).toBe(false);
  });

  it('flushes pending graph node positions before exporting the active plan', () => {
    vi.useFakeTimers();
    const { store } = createInitializedStore();

    store.setGraphNodePosition('recipe:Recipe_IronPlate_C', { x: 41, y: 82 });
    const result = store.exportActivePlan();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    const parsed = JSON.parse(result.json) as {
      project: { graphLayout?: { nodePositions?: Record<string, { x: number; y: number }> } };
    };
    expect(parsed.project.graphLayout?.nodePositions).toEqual({
      'recipe:Recipe_IronPlate_C': { x: 41, y: 82 },
    });
  });

  it('imports a plan as a new selected project with fresh local identity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00.000Z'));
    const existingProject = createProject();
    const userDefaults = createCustomUserDefaults();
    const importSource = createImportSourceProject('project-source', 'Factory');
    const { store } = createInitializedStore([existingProject], existingProject.id, userDefaults);

    const result = store.importPlanJson(createPlanExportJson(importSource));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(store.projects()).toHaveLength(2);
    expect(store.activeProjectId()).toBe(result.project.id);
    expect(result.project.id).not.toBe(importSource.id);
    expect(result.project.id).not.toBe(existingProject.id);
    expect(result.project).toMatchObject({
      name: 'Factory import',
      datasetId: tinySatisfactoryDataset.id,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
      targets: importSource.targets,
      recipeOverrides: importSource.recipeOverrides,
      machineOverrides: importSource.machineOverrides,
      resourceOverrides: importSource.resourceOverrides,
      itemInputs: importSource.itemInputs,
      objectiveProfile: importSource.objectiveProfile,
      graphDisplay: importSource.graphDisplay,
      graphLayout: importSource.graphLayout,
      buildState: importSource.buildState,
    });
    expect(loadedStoreProject(store, existingProject.id)).toEqual(existingProject);
    expect(store.userDefaults()).toEqual(userDefaults);
  });

  it('leaves projects and user defaults unchanged when plan import JSON is invalid', () => {
    const existingProject = createProject();
    const userDefaults = createCustomUserDefaults();
    const { store } = createInitializedStore([existingProject], existingProject.id, userDefaults);

    const result = store.importPlanJson('{');

    expect(result).toMatchObject({
      ok: false,
      message: 'That file is not valid JSON.',
    });
    expect(store.projects()).toEqual([existingProject]);
    expect(store.activeProjectId()).toBe(existingProject.id);
    expect(store.userDefaults()).toEqual(userDefaults);
  });

  it('imports with a non-blocking warning when exported dataset metadata differs', () => {
    const exportedDataset: GameDataset = {
      ...tinySatisfactoryDataset,
      id: 'older-dataset',
      gameVersionLabel: 'older',
      source: {
        ...tinySatisfactoryDataset.source,
        fingerprint: 'older-fingerprint',
      },
    };
    const importSource = createImportSourceProject('project-source', 'Imported factory');
    const { store } = createInitializedStore();

    const result = store.importPlanJson(createPlanExportJson(importSource, exportedDataset));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'dataset-mismatch',
      exportedDatasetId: 'older-dataset',
      currentDatasetId: tinySatisfactoryDataset.id,
    });
    expect(store.activeProjectId()).toBe(result.project.id);
  });

  it('exports the active plan as a compact share payload without user defaults', () => {
    const userDefaults = createCustomUserDefaults();
    const { store } = createInitializedStore([createProject()], 'project-a', userDefaults);

    const result = store.exportActivePlanSharePayload();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.payload).toMatchObject({
      k: 'bw.p',
      v: 1,
      p: {
        n: 'Factory',
        t: [
          {
            id: 'target-a',
            i: 'Desc_IronPlate_C',
            m: 'f',
            a: 10,
            s: 0,
          },
        ],
      },
    });
    expect('userDefaults' in result.payload).toBe(false);
  });

  it('imports compact share payloads as new projects without changing user defaults', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00.000Z'));
    const existingProject = createProject();
    const userDefaults = createCustomUserDefaults();
    const importSource = createImportSourceProject('project-source', 'Factory');
    const { store } = createInitializedStore([existingProject], existingProject.id, userDefaults);

    const result = store.importPlanSharePayload(
      encodeBeltwisePlanShare(importSource, tinySatisfactoryDataset),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(store.projects()).toHaveLength(2);
    expect(store.activeProjectId()).toBe(result.project.id);
    expect(result.project.id).not.toBe(importSource.id);
    expect(result.project).toMatchObject({
      name: 'Factory import',
      datasetId: tinySatisfactoryDataset.id,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
      targets: importSource.targets,
      recipeOverrides: importSource.recipeOverrides,
      machineOverrides: importSource.machineOverrides,
      resourceOverrides: {
        Desc_OreIron_C: { maxPerMinute: 120 },
      },
      itemInputs: importSource.itemInputs,
      objectiveProfile: importSource.objectiveProfile,
      graphDisplay: importSource.graphDisplay,
      graphLayout: importSource.graphLayout,
      buildState: importSource.buildState,
    });
    expect(loadedStoreProject(store, existingProject.id)).toEqual(existingProject);
    expect(store.userDefaults()).toEqual(userDefaults);
  });

  it('leaves projects unchanged when compact share payloads are invalid', () => {
    const existingProject = createProject();
    const userDefaults = createCustomUserDefaults();
    const { store } = createInitializedStore([existingProject], existingProject.id, userDefaults);

    const result = store.importPlanSharePayload({ k: 'bw.p', v: 99, d: {}, p: {} });

    expect(result).toMatchObject({
      ok: false,
      message: 'This plan link uses a newer Beltwise format.',
    });
    expect(store.projects()).toEqual([existingProject]);
    expect(store.activeProjectId()).toBe(existingProject.id);
    expect(store.userDefaults()).toEqual(userDefaults);
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

function createEmptyProject(id: string, name: string): PlannerProject {
  return createPlannerProject({
    id,
    name,
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [],
  });
}

function createCustomUserDefaults(): PlannerUserDefaults {
  return {
    ...createDefaultUserDefaults(tinySatisfactoryDataset),
    recipeOverrides: {
      Recipe_IronPlate_C: { enabled: false },
      Recipe_IronWire_C: { enabled: true },
    },
    machineOverrides: {
      Build_ConstructorMk1_C: { enabled: false },
    },
    resourceOverrides: {
      Desc_OreIron_C: { maxPerMinute: 180 },
    },
    graphDisplay: {
      maxBeltTier: 5,
      maxPipeTier: 2,
      rateDecimalPlaces: 2,
      edgeStyle: 'curved',
      showTransportLabels: false,
      animateFlowLines: true,
    },
  };
}

function createImportSourceProject(id: string, name: string): PlannerProject {
  return {
    ...createProject(),
    id,
    name,
    targets: [
      {
        id: 'target-fixed',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 0,
      },
      {
        id: 'target-maximize',
        itemId: 'Desc_Wire_C',
        mode: 'maximize',
        sortOrder: 1,
      },
    ],
    recipeOverrides: {
      Recipe_IronWire_C: { enabled: true },
    },
    machineOverrides: {
      Build_ConstructorMk1_C: { enabled: false },
    },
    resourceOverrides: {
      Desc_OreIron_C: { enabled: true, maxPerMinute: 120 },
    },
    itemInputs: {
      Desc_IngotIron_C: { amountPerMinute: 15 },
    },
    objectiveProfile: {
      resourceScarcityWeight: 2,
      powerWeight: 0.3,
      machineCountWeight: 0.4,
      surplusWeight: 0.1,
      rawResourceMultipliers: {
        Desc_OreIron_C: 1.5,
      },
    },
    graphLayout: {
      nodePositions: {
        'recipe:Recipe_IronPlate_C': { x: 25, y: 50 },
      },
    },
    graphDisplay: {
      maxBeltTier: 4,
      maxPipeTier: 1,
      rateDecimalPlaces: 4,
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
}

function createPlanExportJson(
  project: PlannerProject,
  dataset: GameDataset = tinySatisfactoryDataset,
): string {
  return stringifyBeltwisePlanExport(
    encodeBeltwisePlanExport(project, {
      dataset,
      exportedAt: '2026-05-13T00:00:00.000Z',
    }),
  );
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

function requiredProject(store: PlannerStoreService): PlannerProject {
  const project = store.activeProject();
  if (!project) {
    throw new Error('Expected an active project');
  }
  return project;
}

function loadedStoreProject(store: PlannerStoreService, projectId: string): PlannerProject {
  const project = store.projects().find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Expected project ${projectId}`);
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

function createInitializedStore(
  projects: PlannerProject[] = [createProject()],
  activeProjectId = projects[0]?.id,
  userDefaults: PlannerUserDefaults = createDefaultUserDefaults(tinySatisfactoryDataset),
): {
  connectedSolveInput: Signal<PlannerSolveInput | null> | undefined;
  store: PlannerStoreService;
} {
  return createStoreHarness((binding) => {
    binding.initializeFromStoredState({
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeProjectId,
      projects,
      userDefaults,
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
