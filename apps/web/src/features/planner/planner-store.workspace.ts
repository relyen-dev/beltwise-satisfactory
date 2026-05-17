import { computed, signal, type Signal } from '@angular/core';
import { type GameDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createPlannerSession,
  createStableId,
  type PlannerProject,
  type PlannerSession,
  type PlannerUserDefaults,
} from '@beltwise/planner-core';
import { createStarterProject } from './planner-domain.helpers';
import { type LoadedPlannerState } from './planner-persistence.service';
import * as projectMutations from './planner-project-mutations';
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
const DEFAULT_SESSION_NAME = 'Default session';

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
    const activeId = this.activeSessionId();
    return this.sessions().find((session) => session.id === activeId) ?? this.sessions()[0] ?? null;
  });

  public readonly activeSessionProjects = computed(() => {
    const session = this.activeSession();
    const projects = this.projects();
    if (!session) {
      return projects;
    }

    const projectsById = new Map(projects.map((project) => [project.id, project]));
    return session.projectIds.flatMap((projectId) => {
      const project = projectsById.get(projectId);
      return project ? [project] : [];
    });
  });

  public readonly activeProject = computed(() => {
    const activeId = this.activeProjectId();
    const sessionProjects = this.activeSessionProjects();
    return (
      sessionProjects.find((project) => project.id === activeId) ??
      sessionProjects[0] ??
      this.projects().find((project) => project.id === activeId) ??
      this.projects()[0] ??
      null
    );
  });

  public constructor(private readonly options: PlannerWorkspaceSliceOptions) {}

  public connectGraphHooks(hooks: PlannerWorkspaceGraphHooks): void {
    this.graphHooks = hooks;
  }

  public selectProject(projectId: string): void {
    this.graphHooks.flushPendingGraphState();
    const project = this.activeSessionProjects().find((candidate) => candidate.id === projectId);
    if (!project) {
      return;
    }
    this.activateProject(project, projectFocusMode(project), this.activeSession()?.id);
  }

  public selectSession(sessionId: string): void {
    this.graphHooks.flushPendingGraphState();
    const session = this.sessions().find((candidate) => candidate.id === sessionId);
    if (!session) {
      return;
    }

    let project = this.selectProjectForSession(session);
    if (!project) {
      project = this.createStarterProjectInSession(session, []);
      if (!project) {
        return;
      }
    }
    this.activeSessionId.set(session.id);
    this.activateProject(project, projectFocusMode(project), session.id);
  }

  public createSession(): void {
    this.graphHooks.flushPendingGraphState();
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }

    const project = createStarterProject(
      dataset,
      createNextPlanName([]),
      this.requireUserDefaults(dataset),
    );
    const session = createPlannerSession({
      name: createUniqueSessionName(this.sessions().map((candidate) => candidate.name)),
      datasetId: dataset.id,
      projectIds: [project.id],
      activeProjectId: project.id,
      now: project.createdAt,
    });
    this.projects.update((projects) => [...projects, project]);
    this.sessions.update((sessions) => [...sessions, session]);
    this.activeSessionId.set(session.id);
    this.activateProject(project, 'open-plan', session.id);
  }

  public createProject(): void {
    this.graphHooks.flushPendingGraphState();
    const dataset = this.options.dataset();
    if (!dataset) {
      return;
    }
    const project = createStarterProject(
      dataset,
      createNextPlanName(this.activeSessionProjects()),
      this.requireUserDefaults(dataset),
    );
    this.projects.update((projects) => [...projects, project]);
    this.addProjectToActiveSession(project);
    this.activateProject(project, 'open-plan');
  }

  public duplicateProject(): void {
    this.graphHooks.flushPendingGraphState();
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
    this.addProjectToActiveSession(clone);
    this.activateProject(clone, projectFocusMode(clone));
  }

  public importProject(project: PlannerProject): void {
    this.graphHooks.flushPendingGraphState();
    this.projects.update((projects) => [...projects, project]);
    this.addProjectToActiveSession(project);
    this.activateProject(project, projectFocusMode(project));
  }

  public deleteProject(): void {
    this.graphHooks.flushPendingGraphState();
    const activeId = this.activeProjectId();
    const activeSession = this.activeSession();
    const sessionProjects = this.activeSessionProjects();
    if (
      !activeId ||
      !activeSession ||
      !sessionProjects.some((project) => project.id === activeId)
    ) {
      return;
    }
    if (sessionProjects.length <= 1) {
      const dataset = this.options.dataset();
      if (!dataset) {
        return;
      }
      const remainingSessionProjects = sessionProjects.filter((project) => project.id !== activeId);
      const replacement = createStarterProject(
        dataset,
        createNextPlanName(remainingSessionProjects),
        this.requireUserDefaults(dataset),
      );
      this.projects.update((projects) => [
        ...projects.filter((project) => project.id !== activeId),
        replacement,
      ]);
      this.replaceProjectInActiveSession(activeId, replacement, activeSession.id);
      this.activateProject(replacement, 'open-plan', activeSession.id);
      return;
    }
    const remainingProjects = this.projects().filter((project) => project.id !== activeId);
    const nextProject =
      sessionProjects.find((project) => project.id !== activeId) ?? remainingProjects[0];
    this.projects.set(remainingProjects);
    this.removeProjectFromSessions(activeId, activeSession.id, nextProject?.id);
    if (nextProject) {
      this.activateProject(nextProject, projectFocusMode(nextProject), activeSession.id);
    }
  }

  public renameProject(name: string): void {
    this.updateActiveProject((project) => ({ ...project, name }));
  }

  public renameSession(name: string): void {
    const activeSessionId = this.activeSessionId();
    const trimmedName = name.trim();
    if (!activeSessionId || trimmedName.length === 0) {
      return;
    }
    this.touchSession(activeSessionId, (session, now) =>
      session.name === trimmedName
        ? session
        : {
            ...session,
            name: trimmedName,
            updatedAt: now,
          },
    );
  }

  public initializeFromStoredState(state: LoadedPlannerState): void {
    this.graphHooks.clearPendingGraphState();
    this.userDefaults.set(state.userDefaults);
    this.projects.set(state.projects);
    this.sessions.set(state.sessions);
    const activeSession =
      state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0];
    this.activeSessionId.set(activeSession?.id);
    const activeProject =
      (activeSession
        ? this.selectProjectForSession(activeSession, state.activeProjectId)
        : undefined) ?? state.projects[0];
    if (activeProject) {
      this.activateProject(activeProject, projectFocusMode(activeProject), activeSession?.id);
      return;
    }
    this.activeProjectId.set(undefined);
    this.activeSessionId.set(undefined);
  }

  public initializeStarterProject(dataset: GameDataset, userDefaults?: PlannerUserDefaults): void {
    this.graphHooks.clearPendingGraphState();
    const defaults = userDefaults ?? this.requireUserDefaults(dataset);
    this.userDefaults.set(defaults);
    const starter = createStarterProject(dataset, 'Starter factory', defaults);
    const session = createPlannerSession({
      name: DEFAULT_SESSION_NAME,
      datasetId: dataset.id,
      projectIds: [starter.id],
      activeProjectId: starter.id,
      now: starter.createdAt,
    });
    this.projects.set([starter]);
    this.sessions.set([session]);
    this.activeSessionId.set(session.id);
    this.activateProject(starter, 'open-plan', session.id);
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
    this.projects.update((projects) =>
      projectMutations.updateProjectInList(projects, activeId, now, mapper),
    );
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

  private activateProject(
    project: PlannerProject,
    focusMode: WorkbenchFocusMode,
    sessionId = this.activeSessionId(),
  ): void {
    this.activeProjectId.set(project.id);
    if (sessionId !== undefined) {
      this.setSessionActiveProject(sessionId, project.id);
    }
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

  private selectProjectForSession(
    session: PlannerSession,
    preferredProjectId = session.activeProjectId,
  ): PlannerProject | undefined {
    const projectsById = new Map(this.projects().map((project) => [project.id, project]));
    if (preferredProjectId !== undefined && session.projectIds.includes(preferredProjectId)) {
      return projectsById.get(preferredProjectId);
    }

    for (const projectId of session.projectIds) {
      const project = projectsById.get(projectId);
      if (project) {
        return project;
      }
    }
    return undefined;
  }

  private addProjectToActiveSession(project: PlannerProject): void {
    const activeSession = this.activeSession();
    if (!activeSession) {
      const session = createPlannerSession({
        name: DEFAULT_SESSION_NAME,
        datasetId: project.datasetId,
        projectIds: [project.id],
        activeProjectId: project.id,
        now: project.createdAt,
      });
      this.sessions.update((sessions) => [...sessions, session]);
      this.activeSessionId.set(session.id);
      return;
    }

    this.activeSessionId.set(activeSession.id);
    this.touchSession(activeSession.id, (session, now) => ({
      ...session,
      projectIds: uniqueProjectIds([...session.projectIds, project.id]),
      updatedAt: now,
    }));
  }

  private createStarterProjectInSession(
    session: PlannerSession,
    existingProjects: readonly PlannerProject[],
  ): PlannerProject | undefined {
    const dataset = this.options.dataset();
    if (!dataset) {
      return undefined;
    }
    const project = createStarterProject(
      dataset,
      createNextPlanName(existingProjects),
      this.requireUserDefaults(dataset),
    );
    this.projects.update((projects) => [...projects, project]);
    this.touchSession(session.id, (currentSession, now) => ({
      ...currentSession,
      projectIds: [project.id],
      activeProjectId: project.id,
      updatedAt: now,
    }));
    return project;
  }

  private replaceProjectInActiveSession(
    projectId: string,
    replacementProject: PlannerProject,
    activeSessionId: string,
  ): void {
    const now = new Date().toISOString();
    this.sessions.update((sessions) =>
      sessions.map((session) => {
        if (session.id !== activeSessionId) {
          return session;
        }

        const replacedProjectIds = uniqueProjectIds(
          session.projectIds.map((candidate) =>
            candidate === projectId ? replacementProject.id : candidate,
          ),
        );
        const projectIds = replacedProjectIds.includes(replacementProject.id)
          ? replacedProjectIds
          : [...replacedProjectIds, replacementProject.id];
        return {
          ...session,
          projectIds,
          activeProjectId: replacementProject.id,
          updatedAt: now,
        };
      }),
    );
  }

  private removeProjectFromSessions(
    projectId: string,
    activeSessionId: string,
    nextActiveProjectId: string | undefined,
  ): void {
    const now = new Date().toISOString();
    this.sessions.update((sessions) =>
      sessions.map((session) => {
        if (session.id !== activeSessionId) {
          return session;
        }
        const projectIds = session.projectIds.filter((candidate) => candidate !== projectId);
        if (projectIds.length === 0) {
          return session;
        }
        const activeProjectId = nextActiveProjectId ?? projectIds[0];
        if (activeProjectId === undefined) {
          return session;
        }
        return {
          ...session,
          projectIds,
          activeProjectId,
          updatedAt: session.projectIds.length === projectIds.length ? session.updatedAt : now,
        };
      }),
    );
  }

  private setSessionActiveProject(sessionId: string, projectId: string): void {
    this.sessions.update((sessions) => {
      let changed = false;
      const nextSessions = sessions.map((session) => {
        if (session.id !== sessionId || !session.projectIds.includes(projectId)) {
          return session;
        }
        if (session.activeProjectId === projectId) {
          return session;
        }
        changed = true;
        return {
          ...session,
          activeProjectId: projectId,
        };
      });
      return changed ? nextSessions : sessions;
    });
  }

  private touchSession(
    sessionId: string,
    mapper: (session: PlannerSession, now: string) => PlannerSession,
  ): void {
    const now = new Date().toISOString();
    this.sessions.update((sessions) => {
      let changed = false;
      const nextSessions = sessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }
        const nextSession = mapper(session, now);
        if (nextSession !== session) {
          changed = true;
        }
        return nextSession;
      });
      return changed ? nextSessions : sessions;
    });
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

function uniqueProjectIds(projectIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  for (const projectId of projectIds) {
    if (seen.has(projectId)) {
      continue;
    }
    seen.add(projectId);
    uniqueIds.push(projectId);
  }
  return uniqueIds;
}

function createNextPlanName(existingProjects: readonly PlannerProject[]): string {
  const baseName = 'Plan';
  const existingNames = new Set(
    existingProjects.map((project) => project.name.trim().toLowerCase()),
  );
  let nextIndex = 1;

  while (true) {
    const candidate = `${baseName} ${nextIndex}`;
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    nextIndex += 1;
  }
}

function createUniqueSessionName(existingNames: readonly string[]): string {
  const baseName = 'Session';
  const normalizedNames = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  let nextIndex = 1;

  for (const name of existingNames) {
    const trimmedName = name.trim();
    if (trimmedName.toLowerCase() === baseName.toLowerCase()) {
      nextIndex = Math.max(nextIndex, 2);
      continue;
    }

    const match = /^Session (\d+)$/i.exec(trimmedName);
    if (!match) {
      continue;
    }
    const index = Number.parseInt(match[1] ?? '', 10);
    if (Number.isInteger(index)) {
      nextIndex = Math.max(nextIndex, index + 1);
    }
  }

  while (true) {
    const candidate = `${baseName} ${nextIndex}`;
    if (!normalizedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    nextIndex += 1;
  }
}

function projectFocusMode(project: PlannerProject): WorkbenchFocusMode {
  return project.targets.some((target) => target.itemId.trim().length > 0)
    ? 'focus-graph'
    : 'open-plan';
}
