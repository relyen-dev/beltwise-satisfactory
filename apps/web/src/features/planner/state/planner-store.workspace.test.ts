import '@angular/compiler';
import { Injector, runInInjectionContext, signal, type WritableSignal } from '@angular/core';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createPlannerProject,
  createPlannerSession,
  MAX_PLANNER_NAME_LENGTH,
  PLANNER_STORAGE_SCHEMA_VERSION,
  type PlannerProject,
  type PlannerSession,
  type PlannerUserDefaults,
} from '@beltwise/planner-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetService } from '../dataset.service';
import { PlannerWorkspaceSlice } from './planner-store.workspace';

const NOW = '2026-05-12T00:00:00.000Z';

afterEach(() => {
  vi.useRealTimers();
});

describe('PlannerWorkspaceSlice', () => {
  it('initializes a starter workspace with dataset defaults', () => {
    const { store } = createWorkspaceHarness();

    store.initializeStarterProject(tinySatisfactoryDataset);

    const project = requiredProject(store);
    expect(store.sessions()).toHaveLength(1);
    expect(store.projects()).toEqual([project]);
    expect(store.activeProjectId()).toBe(project.id);
    expect(store.activeSession()?.activeProjectId).toBe(project.id);
    expect(project.name).toBe('Starter factory');
    expect(store.userDefaults()).toEqual(createDefaultUserDefaults(tinySatisfactoryDataset));
  });

  it('falls back from stale stored active ids and repairs stale selected sessions', () => {
    const draftProject = createEmptyProject('project-draft', 'Draft factory');
    const targetProject = createProject('project-target', 'Target factory');
    const validSession = createSession([draftProject, targetProject], 'missing-project');
    const staleSession: PlannerSession = {
      id: 'session-stale',
      name: 'Stale session',
      datasetId: tinySatisfactoryDataset.id,
      createdAt: NOW,
      updatedAt: NOW,
      projectIds: ['missing-project'],
      activeProjectId: 'missing-project',
    };
    const { store } = createWorkspaceHarness();

    store.initializeFromStoredState({
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeSessionId: validSession.id,
      activeProjectId: 'missing-project',
      sessions: [validSession, staleSession],
      projects: [draftProject, targetProject],
      userDefaults: createDefaultUserDefaults(tinySatisfactoryDataset),
    });
    expect(store.activeProjectId()).toBe(draftProject.id);
    expect(store.activeSession()?.activeProjectId).toBe(draftProject.id);

    store.selectSession(staleSession.id);

    const repairedProject = requiredProject(store);
    expect(store.activeSessionId()).toBe(staleSession.id);
    expect(repairedProject.id).not.toBe(draftProject.id);
    expect(repairedProject.name).toBe('Plan 1');
    expect(store.activeSessionProjects().map((project) => project.id)).toEqual([
      repairedProject.id,
    ]);
  });

  it('creates, selects, renames, duplicates, and deletes projects at the adapter level', () => {
    const projectA = createEmptyProject('project-a', 'Factory A');
    const projectB = createProject('project-b', 'Factory B');
    const { store } = createInitializedWorkspace([projectA, projectB], projectA.id);

    store.selectProject(projectB.id);
    store.renameProject(' Factory B Prime ');
    expect(requiredProject(store).name).toBe('Factory B Prime');

    store.createProject();
    const createdProject = requiredProject(store);
    expect(createdProject.name).toBe('Plan 1');
    expect(store.activeSessionProjects().map((project) => project.id)).toEqual([
      projectA.id,
      projectB.id,
      createdProject.id,
    ]);

    store.duplicateProject();
    const duplicatedProject = requiredProject(store);
    expect(duplicatedProject.id).not.toBe(createdProject.id);
    expect(duplicatedProject.targets).toEqual(createdProject.targets);
    expect(duplicatedProject.name).toBe('Plan 1 copy');

    store.deleteProject();
    expect(store.activeProjectId()).toBe(createdProject.id);
    expect(store.activeSessionProjects().map((project) => project.id)).toEqual([
      projectA.id,
      projectB.id,
      createdProject.id,
    ]);
  });

  it('caps active plan and session renames', () => {
    const project = createProject('project-a', 'Factory A');
    const { store } = createInitializedWorkspace([project], project.id);
    const longName = 'A'.repeat(MAX_PLANNER_NAME_LENGTH + 1);

    store.renameProject(longName);
    store.renameSession(` ${longName} `);

    expect(requiredProject(store).name).toBe('A'.repeat(MAX_PLANNER_NAME_LENGTH));
    expect(store.activeSession()?.name).toBe('A'.repeat(MAX_PLANNER_NAME_LENGTH));
  });

  it('creates, selects, renames, and deletes sessions while exposing active-session projects', () => {
    const projectA = createEmptyProject('project-a', 'Factory A');
    const projectB = createProject('project-b', 'Factory B');
    const sessionA = createSession([projectA], projectA.id, 'session-a');
    const sessionB = createSession([projectB], projectB.id, 'session-b');
    const { store } = createInitializedWorkspace(
      [projectA, projectB],
      projectA.id,
      createDefaultUserDefaults(tinySatisfactoryDataset),
      [sessionA, sessionB],
      sessionA.id,
    );

    expect(store.activeSessionProjects().map((project) => project.id)).toEqual([projectA.id]);

    store.selectSession(sessionB.id);
    store.renameSession(' Rocky Desert ');
    expect(store.activeSessionId()).toBe(sessionB.id);
    expect(store.activeProjectId()).toBe(projectB.id);
    expect(store.activeSession()?.name).toBe('Rocky Desert');
    expect(store.activeSessionProjects().map((project) => project.id)).toEqual([projectB.id]);

    store.createSession();
    const createdSessionId = store.activeSessionId();
    expect(store.activeSession()?.name).toBe('Session 1');
    expect(store.activeSessionProjects()).toHaveLength(1);

    store.deleteSession(createdSessionId);
    expect(store.sessions().map((session) => session.id)).toEqual([sessionA.id, sessionB.id]);
    expect(store.activeSessionId()).toBe(sessionB.id);
    expect(store.projects().map((project) => project.id)).toEqual([projectA.id, projectB.id]);
  });

  it('applies user defaults only to newly created plans', () => {
    const existingProject = createProject('project-a', 'Factory A');
    const userDefaults = createCustomUserDefaults();
    const { store } = createInitializedWorkspace(
      [existingProject],
      existingProject.id,
      userDefaults,
    );

    store.createProject();

    expect(loadedProject(store, existingProject.id)).toEqual(existingProject);
    expect(requiredProject(store)).toMatchObject({
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
      },
    });
  });

  it('runs graph and activation hooks around workspace lifecycle changes', () => {
    const projectA = createProject('project-a', 'Factory A');
    const projectB = createEmptyProject('project-b', 'Factory B');
    const flushPendingGraphState = vi.fn();
    const clearPendingGraphState = vi.fn();
    const clearGraphSelection = vi.fn();
    const projectActivated = vi.fn();
    const { store } = createInitializedWorkspace([projectA, projectB], projectA.id);

    store.connectGraphHooks({
      flushPendingGraphState,
      clearPendingGraphState,
      clearGraphSelection,
    });
    store.connectActivationHooks({ projectActivated });

    store.selectProject(projectB.id);
    expect(flushPendingGraphState).toHaveBeenCalledTimes(1);
    expect(clearGraphSelection).toHaveBeenCalledTimes(1);
    expect(projectActivated).toHaveBeenLastCalledWith(projectB);

    store.initializeStarterProject(tinySatisfactoryDataset);
    expect(clearPendingGraphState).toHaveBeenCalledTimes(1);
    expect(clearGraphSelection).toHaveBeenCalledTimes(2);
    expect(projectActivated).toHaveBeenCalledTimes(2);
  });
});

function createInitializedWorkspace(
  projects: PlannerProject[] = [createProject('project-a', 'Factory')],
  activeProjectId = projects[0]?.id,
  userDefaults: PlannerUserDefaults = createDefaultUserDefaults(tinySatisfactoryDataset),
  sessions: PlannerSession[] = [createSession(projects, activeProjectId)],
  activeSessionId = sessions[0]?.id,
): { dataset: WritableSignal<GameDataset | null>; store: PlannerWorkspaceSlice } {
  const harness = createWorkspaceHarness();
  harness.store.initializeFromStoredState({
    schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
    activeSessionId,
    activeProjectId,
    sessions,
    projects,
    userDefaults,
  });
  return harness;
}

function createWorkspaceHarness(): {
  dataset: WritableSignal<GameDataset | null>;
  store: PlannerWorkspaceSlice;
} {
  const dataset = signal<GameDataset | null>(tinySatisfactoryDataset);
  const datasetService: Pick<DatasetService, 'dataset'> = { dataset };
  const injector = Injector.create({
    providers: [{ provide: DatasetService, useValue: datasetService }, PlannerWorkspaceSlice],
  });
  const store = runInInjectionContext(injector, () => injector.get(PlannerWorkspaceSlice));
  return { dataset, store };
}

function createProject(id: string, name: string): PlannerProject {
  return createPlannerProject({
    id,
    name,
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [
      {
        id: `${id}-target`,
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

function requiredProject(store: PlannerWorkspaceSlice): PlannerProject {
  const project = store.activeProject();
  if (!project) {
    throw new Error('Expected an active project');
  }
  return project;
}

function loadedProject(store: PlannerWorkspaceSlice, projectId: string): PlannerProject {
  const project = store.projects().find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Expected project ${projectId}`);
  }
  return project;
}
