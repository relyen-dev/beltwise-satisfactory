import { computed, signal, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import {
  addPlannerProjectToWorkspaceSession,
  createDefaultStarterPlannerWorkspace,
  createDefaultUserDefaults,
  createNextPlannerPlanName,
  createPlannerProjectInActiveSession,
  createPlannerSessionInWorkspace,
  createStableId,
  createStarterPlannerProject,
  deletePlannerProjectFromActiveSession,
  deletePlannerSessionFromWorkspace,
  duplicatePlannerProjectInWorkspace,
  initializePlannerWorkspace,
  listPlannerSessionProjects,
  renamePlannerSessionInWorkspace,
  selectActivePlannerProject,
  selectActivePlannerSession,
  selectPlannerProjectInWorkspace,
  selectPlannerSessionInWorkspace,
  updateProjectInList,
  type CreatePlannerWorkspaceProject,
  type PlannerWorkspaceLifecycleResult,
  type PlannerProject,
  type PlannerSession,
  type PlannerUserDefaults,
} from '@beltwise/planner-core';
import { type LoadedPlannerState } from '../persistence/planner-persistence.service';
import {
  type ConfigurationTab,
  type WorkbenchFocusMode,
  type WorkbenchFocusRequest,
} from './planner-store.models';

interface PlannerWorkspaceSliceOptions {
  readonly dataset: Signal<GameDataset | null>;
}

interface PlannerWorkspaceGraphHooks {
  readonly flushPendingGraphState: () => void;
  readonly clearPendingGraphState: () => void;
  readonly clearGraphSelection: () => void;
}

const noopGraphHooks: PlannerWorkspaceGraphHooks = {
  flushPendingGraphState: () => undefined,
  clearPendingGraphState: () => undefined,
  clearGraphSelection: () => undefined,
};

export class PlannerWorkspaceSlice {
  private graphHooks = noopGraphHooks;
  private focusRequestSequence = 0;

  public readonly sessions = signal<PlannerSession[]>([]);
  public readonly activeSessionId = signal<string | undefined>(undefined);
  public readonly projects = signal<PlannerProject[]>([]);
  public readonly activeProjectId = signal<string | undefined>(undefined);
  public readonly userDefaults = signal<PlannerUserDefaults | null>(null);
  public readonly activeConfigTab = signal<ConfigurationTab>('plan');
  public readonly workbenchFocusRequest = signal<WorkbenchFocusRequest | null>(null);

  public readonly activeSession = computed(() => {
    return selectActivePlannerSession(this.workspaceState()) ?? null;
  });

  public readonly activeSessionProjects = computed(() => {
    return listPlannerSessionProjects(this.projects(), this.activeSession() ?? undefined);
  });

  public readonly activeProject = computed(() => {
    return selectActivePlannerProject(this.workspaceState()) ?? null;
  });

  public constructor(private readonly options: PlannerWorkspaceSliceOptions) {}

  public connectGraphHooks(hooks: PlannerWorkspaceGraphHooks): void {
    this.graphHooks = hooks;
  }

  public selectProject(projectId: string): void {
    this.graphHooks.flushPendingGraphState();
    this.applyLifecycleResult(selectPlannerProjectInWorkspace(this.workspaceState(), projectId));
  }

  public selectSession(sessionId: string): void {
    this.graphHooks.flushPendingGraphState();
    const dataset = this.options.dataset();
    const result = selectPlannerSessionInWorkspace(this.workspaceState(), {
      sessionId,
      now: this.now(),
      ...(dataset ? { createProject: this.createProjectFactory(dataset) } : {}),
    });
    this.applyLifecycleResult(result);
  }

  public createSession(): void {
    this.graphHooks.flushPendingGraphState();
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }

    const project = createStarterPlannerProject(dataset, {
      name: createNextPlannerPlanName([]),
      userDefaults: this.requireUserDefaults(dataset),
    });
    this.applyLifecycleResult(createPlannerSessionInWorkspace(this.workspaceState(), project));
  }

  public deleteSession(sessionId = this.activeSessionId()): void {
    this.graphHooks.flushPendingGraphState();
    const dataset = this.options.dataset();
    const result = deletePlannerSessionFromWorkspace(this.workspaceState(), {
      now: this.now(),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(dataset
        ? {
            createReplacementWorkspace: () =>
              createDefaultStarterPlannerWorkspace(dataset, this.requireUserDefaults(dataset)),
            createProject: this.createProjectFactory(dataset),
          }
        : {}),
    });
    this.applyLifecycleResult(result);
  }

  public createProject(): void {
    this.graphHooks.flushPendingGraphState();
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }
    const result = createPlannerProjectInActiveSession(this.workspaceState(), {
      now: this.now(),
      createProject: this.createProjectFactory(dataset),
    });
    this.applyLifecycleResult(result);
  }

  public duplicateProject(): void {
    this.graphHooks.flushPendingGraphState();
    const result = duplicatePlannerProjectInWorkspace(this.workspaceState(), {
      id: createStableId('project'),
      now: this.now(),
    });
    this.applyLifecycleResult(result);
  }

  public importProject(project: PlannerProject): void {
    this.graphHooks.flushPendingGraphState();
    this.applyLifecycleResult(
      addPlannerProjectToWorkspaceSession(this.workspaceState(), project, this.now()),
    );
  }

  public deleteProject(): void {
    this.graphHooks.flushPendingGraphState();
    const dataset = this.options.dataset();
    const result = deletePlannerProjectFromActiveSession(this.workspaceState(), {
      now: this.now(),
      ...(dataset ? { createReplacementProject: this.createProjectFactory(dataset) } : {}),
    });
    this.applyLifecycleResult(result);
  }

  public renameProject(name: string): void {
    this.updateActiveProject((project) => ({ ...project, name }));
  }

  public renameSession(name: string): void {
    this.applyLifecycleResult(
      renamePlannerSessionInWorkspace(this.workspaceState(), name, this.now()),
    );
  }

  public initializeFromStoredState(state: LoadedPlannerState): void {
    this.graphHooks.clearPendingGraphState();
    this.userDefaults.set(state.userDefaults);
    this.applyLifecycleResult(initializePlannerWorkspace(state));
  }

  public initializeStarterProject(dataset: GameDataset, userDefaults?: PlannerUserDefaults): void {
    this.graphHooks.clearPendingGraphState();
    const defaults = userDefaults ?? this.requireUserDefaults(dataset);
    this.userDefaults.set(defaults);
    const { project, session } = createDefaultStarterPlannerWorkspace(dataset, defaults);
    this.applyLifecycleResult({
      projects: [project],
      sessions: [session],
      activeSessionId: session.id,
      activeProjectId: project.id,
      activation: { project, sessionId: session.id },
    });
  }

  public updateUserDefaults(
    mapper: (userDefaults: PlannerUserDefaults, dataset: GameDataset) => PlannerUserDefaults,
  ): void {
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }
    this.userDefaults.update((currentDefaults) =>
      mapper(currentDefaults ?? createDefaultUserDefaults(dataset), dataset),
    );
  }

  public updateActiveProject(mapper: (project: PlannerProject) => PlannerProject): void {
    this.graphHooks.flushPendingGraphState();
    const activeId = this.activeProjectId();
    if (!activeId) {
      return;
    }
    const now = new Date().toISOString();
    this.projects.update((projects) => updateProjectInList(projects, activeId, now, mapper));
  }

  public updateProjectById(
    projectId: string,
    mapper: (project: PlannerProject) => PlannerProject,
  ): void {
    const now = new Date().toISOString();
    this.projects.update((projects) => {
      let changed = false;
      const nextProjects = projects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }
        const nextProject = mapper(project);
        if (nextProject === project) {
          return project;
        }
        changed = true;
        return {
          ...nextProject,
          updatedAt: now,
        };
      });
      return changed ? nextProjects : projects;
    });
  }

  private activateProject(project: PlannerProject, focusMode: WorkbenchFocusMode): void {
    this.activeProjectId.set(project.id);
    this.graphHooks.clearGraphSelection();
    if (focusMode === 'open-plan') {
      this.activeConfigTab.set('plan');
    }
    this.workbenchFocusRequest.set({
      projectId: project.id,
      mode: focusMode,
      sequence: ++this.focusRequestSequence,
    });
  }

  private applyLifecycleResult(result: PlannerWorkspaceLifecycleResult): void {
    this.projects.set(result.projects);
    this.sessions.set(result.sessions);
    this.activeSessionId.set(result.activeSessionId);
    this.activeProjectId.set(result.activeProjectId);
    if (result.activation) {
      this.activateProject(result.activation.project, projectFocusMode(result.activation.project));
    }
  }

  private createProjectFactory(dataset: GameDataset): CreatePlannerWorkspaceProject {
    return ({ name }) =>
      createStarterPlannerProject(dataset, {
        name,
        userDefaults: this.requireUserDefaults(dataset),
      });
  }

  private workspaceState(): {
    readonly sessions: readonly PlannerSession[];
    readonly projects: readonly PlannerProject[];
    readonly activeSessionId?: string;
    readonly activeProjectId?: string;
  } {
    const activeSessionId = this.activeSessionId();
    const activeProjectId = this.activeProjectId();
    return {
      sessions: this.sessions(),
      projects: this.projects(),
      ...(activeSessionId !== undefined ? { activeSessionId } : {}),
      ...(activeProjectId !== undefined ? { activeProjectId } : {}),
    };
  }

  private now(): string {
    return new Date().toISOString();
  }

  private requireUserDefaults(dataset: GameDataset): PlannerUserDefaults {
    const defaults = this.userDefaults();
    if (defaults) {
      return defaults;
    }
    const createdDefaults = createDefaultUserDefaults(dataset);
    this.userDefaults.set(createdDefaults);
    return createdDefaults;
  }
}

function projectFocusMode(project: PlannerProject): WorkbenchFocusMode {
  return project.targets.some((target) => target.itemId.trim().length > 0)
    ? 'focus-graph'
    : 'open-plan';
}
