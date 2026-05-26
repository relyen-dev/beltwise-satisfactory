import type { GameDataset } from '@beltwise/game-data';
import { uniqueStrings } from './internal/uniqueStrings';
import {
  appendPlannerNameSuffix,
  createPlannerProject,
  createPlannerSession,
  normalizePlannerName,
  type PlannerProject,
  type PlannerSession,
  type PlannerUserDefaults,
} from './plan';

export interface PlannerWorkspaceLifecycleState {
  readonly sessions: readonly PlannerSession[];
  readonly projects: readonly PlannerProject[];
  readonly activeSessionId?: string;
  readonly activeProjectId?: string;
}

export interface PlannerStarterWorkspace {
  readonly project: PlannerProject;
  readonly session: PlannerSession;
}

export interface PlannerWorkspaceActivation {
  readonly project: PlannerProject;
  readonly sessionId?: string;
}

export interface PlannerWorkspaceLifecycleResult {
  readonly sessions: PlannerSession[];
  readonly projects: PlannerProject[];
  readonly activeSessionId?: string;
  readonly activeProjectId?: string;
  readonly activation?: PlannerWorkspaceActivation;
}

export interface CreatePlannerWorkspaceProjectOptions {
  readonly name: string;
  readonly existingProjects: readonly PlannerProject[];
}

export type CreatePlannerWorkspaceProject = (
  options: CreatePlannerWorkspaceProjectOptions,
) => PlannerProject | undefined;

export const DEFAULT_PLANNER_SESSION_NAME = 'Default session';
export const STARTER_PLANNER_PROJECT_NAME = 'Starter factory';

export function createStarterPlannerProject(
  dataset: GameDataset,
  options: {
    readonly name?: string;
    readonly userDefaults?: PlannerUserDefaults;
  } = {},
): PlannerProject {
  return createPlannerProject({
    name: options.name ?? STARTER_PLANNER_PROJECT_NAME,
    dataset,
    targets: [],
    ...(options.userDefaults !== undefined ? { userDefaults: options.userDefaults } : {}),
  });
}

export function createDefaultStarterPlannerWorkspace(
  dataset: GameDataset,
  userDefaults?: PlannerUserDefaults,
): PlannerStarterWorkspace {
  const project = createStarterPlannerProject(
    dataset,
    userDefaults !== undefined ? { userDefaults } : {},
  );
  return {
    project,
    session: createPlannerSession({
      name: DEFAULT_PLANNER_SESSION_NAME,
      datasetId: dataset.id,
      projectIds: [project.id],
      activeProjectId: project.id,
      now: project.createdAt,
    }),
  };
}

export function selectActivePlannerSession(
  state: PlannerWorkspaceLifecycleState,
): PlannerSession | undefined {
  return (
    state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0]
  );
}

export function listPlannerSessionProjects(
  projects: readonly PlannerProject[],
  session: PlannerSession | undefined,
): PlannerProject[] {
  if (!session) {
    return [...projects];
  }

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  return session.projectIds.flatMap((projectId) => {
    const project = projectsById.get(projectId);
    return project ? [project] : [];
  });
}

export function selectPlannerProjectForSession(
  projects: readonly PlannerProject[],
  session: PlannerSession,
  preferredProjectId = session.activeProjectId,
): PlannerProject | undefined {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
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

export function selectActivePlannerProject(
  state: PlannerWorkspaceLifecycleState,
): PlannerProject | undefined {
  const activeSession = selectActivePlannerSession(state);
  const sessionProjects = listPlannerSessionProjects(state.projects, activeSession);
  return (
    sessionProjects.find((project) => project.id === state.activeProjectId) ??
    sessionProjects[0] ??
    state.projects.find((project) => project.id === state.activeProjectId) ??
    state.projects[0]
  );
}

export function initializePlannerWorkspace(
  state: PlannerWorkspaceLifecycleState,
): PlannerWorkspaceLifecycleResult {
  const activeSession =
    state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0];
  const activeProject =
    (activeSession
      ? selectPlannerProjectForSession(state.projects, activeSession, state.activeProjectId)
      : undefined) ?? state.projects[0];

  if (!activeProject) {
    return workspaceResult({
      sessions: [...state.sessions],
      projects: [...state.projects],
    });
  }

  return activatePlannerWorkspaceProject(
    {
      sessions: [...state.sessions],
      projects: [...state.projects],
      activeProjectId: activeProject.id,
      ...(activeSession !== undefined ? { activeSessionId: activeSession.id } : {}),
    },
    activeProject,
    activeSession?.id,
  );
}

export function selectPlannerProjectInWorkspace(
  state: PlannerWorkspaceLifecycleState,
  projectId: string,
): PlannerWorkspaceLifecycleResult {
  const activeSession = selectActivePlannerSession(state);
  const project = listPlannerSessionProjects(state.projects, activeSession).find(
    (candidate) => candidate.id === projectId,
  );
  if (!project) {
    return workspaceResult(state);
  }
  return activatePlannerWorkspaceProject(state, project, activeSession?.id);
}

export function selectPlannerSessionInWorkspace(
  state: PlannerWorkspaceLifecycleState,
  options: {
    readonly sessionId: string;
    readonly now: string;
    readonly createProject?: CreatePlannerWorkspaceProject;
  },
): PlannerWorkspaceLifecycleResult {
  const session = state.sessions.find((candidate) => candidate.id === options.sessionId);
  if (!session) {
    return workspaceResult(state);
  }

  const project = selectPlannerProjectForSession(state.projects, session);
  if (project) {
    return activatePlannerWorkspaceProject(
      {
        ...state,
        activeSessionId: session.id,
        activeProjectId: project.id,
      },
      project,
      session.id,
    );
  }

  const replacementProject = options.createProject?.({
    name: createNextPlannerPlanName([]),
    existingProjects: [],
  });
  if (!replacementProject) {
    return workspaceResult(state);
  }

  const projects = [...state.projects, replacementProject];
  const sessions = replacePlannerSession(state.sessions, {
    ...session,
    projectIds: [replacementProject.id],
    activeProjectId: replacementProject.id,
    links: [],
    updatedAt: options.now,
  });
  return workspaceResult({
    sessions,
    projects,
    activeSessionId: session.id,
    activeProjectId: replacementProject.id,
    activation: { project: replacementProject, sessionId: session.id },
  });
}

export function createPlannerSessionInWorkspace(
  state: PlannerWorkspaceLifecycleState,
  project: PlannerProject,
): PlannerWorkspaceLifecycleResult {
  const session = createPlannerSession({
    name: createUniquePlannerSessionName(state.sessions.map((candidate) => candidate.name)),
    datasetId: project.datasetId,
    projectIds: [project.id],
    activeProjectId: project.id,
    now: project.createdAt,
  });

  return workspaceResult({
    sessions: [...state.sessions, session],
    projects: [...state.projects, project],
    activeSessionId: session.id,
    activeProjectId: project.id,
    activation: { project, sessionId: session.id },
  });
}

export function addPlannerProjectToWorkspaceSession(
  state: PlannerWorkspaceLifecycleState,
  project: PlannerProject,
  now: string,
): PlannerWorkspaceLifecycleResult {
  const activeSession = selectActivePlannerSession(state);
  if (!activeSession) {
    const session = createPlannerSession({
      name: DEFAULT_PLANNER_SESSION_NAME,
      datasetId: project.datasetId,
      projectIds: [project.id],
      activeProjectId: project.id,
      now: project.createdAt,
    });
    return workspaceResult({
      sessions: [...state.sessions, session],
      projects: [...state.projects, project],
      activeSessionId: session.id,
      activeProjectId: project.id,
      activation: { project, sessionId: session.id },
    });
  }

  const sessions = replacePlannerSession(state.sessions, {
    ...activeSession,
    projectIds: uniqueStrings([...activeSession.projectIds, project.id]),
    activeProjectId: project.id,
    updatedAt: now,
  });

  return workspaceResult({
    sessions,
    projects: [...state.projects, project],
    activeSessionId: activeSession.id,
    activeProjectId: project.id,
    activation: { project, sessionId: activeSession.id },
  });
}

export function duplicatePlannerProjectInWorkspace(
  state: PlannerWorkspaceLifecycleState,
  options: {
    readonly id: string;
    readonly now: string;
  },
): PlannerWorkspaceLifecycleResult {
  const project = selectActivePlannerProject(state);
  if (!project) {
    return workspaceResult(state);
  }
  const clone = duplicatePlannerProject(project, options);
  return addPlannerProjectToWorkspaceSession(state, clone, options.now);
}

export function deletePlannerSessionFromWorkspace(
  state: PlannerWorkspaceLifecycleState,
  options: {
    readonly sessionId?: string;
    readonly now: string;
    readonly createReplacementWorkspace?: () => PlannerStarterWorkspace | undefined;
    readonly createProject?: CreatePlannerWorkspaceProject;
  },
): PlannerWorkspaceLifecycleResult {
  const sessionId = options.sessionId ?? state.activeSessionId;
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    return workspaceResult(state);
  }

  const nextSession = selectNeighborBeforeRemoval(state.sessions, session.id);
  const remainingSessions = state.sessions.filter((candidate) => candidate.id !== session.id);
  const projectIdsToRemove = projectIdsOwnedByDeletedSession(session, remainingSessions);
  const remainingProjects = state.projects.filter((project) => !projectIdsToRemove.has(project.id));

  if (remainingSessions.length === 0) {
    const replacementWorkspace = options.createReplacementWorkspace?.();
    if (!replacementWorkspace) {
      return workspaceResult({
        sessions: [],
        projects: remainingProjects,
      });
    }
    const { project, session: replacementSession } = replacementWorkspace;
    return workspaceResult({
      sessions: [replacementSession],
      projects: [...remainingProjects, project],
      activeSessionId: replacementSession.id,
      activeProjectId: project.id,
      activation: { project, sessionId: replacementSession.id },
    });
  }

  if (state.activeSessionId !== session.id) {
    return workspaceResult({
      sessions: remainingSessions,
      projects: remainingProjects,
      ...(state.activeSessionId !== undefined ? { activeSessionId: state.activeSessionId } : {}),
      ...(state.activeProjectId !== undefined ? { activeProjectId: state.activeProjectId } : {}),
    });
  }

  if (!nextSession) {
    return workspaceResult({
      sessions: remainingSessions,
      projects: remainingProjects,
    });
  }

  const nextProject = selectPlannerProjectForSession(remainingProjects, nextSession);
  if (nextProject) {
    return activatePlannerWorkspaceProject(
      {
        sessions: remainingSessions,
        projects: remainingProjects,
        activeSessionId: nextSession.id,
        activeProjectId: nextProject.id,
      },
      nextProject,
      nextSession.id,
    );
  }

  const replacementProject = options.createProject?.({
    name: createNextPlannerPlanName([]),
    existingProjects: [],
  });
  if (!replacementProject) {
    return workspaceResult({
      sessions: remainingSessions,
      projects: remainingProjects,
    });
  }

  const repairedSessions = replacePlannerSession(remainingSessions, {
    ...nextSession,
    projectIds: [replacementProject.id],
    activeProjectId: replacementProject.id,
    links: [],
    updatedAt: options.now,
  });
  return workspaceResult({
    sessions: repairedSessions,
    projects: [...remainingProjects, replacementProject],
    activeSessionId: nextSession.id,
    activeProjectId: replacementProject.id,
    activation: { project: replacementProject, sessionId: nextSession.id },
  });
}

export function createPlannerProjectInActiveSession(
  state: PlannerWorkspaceLifecycleState,
  options: {
    readonly now: string;
    readonly createProject: CreatePlannerWorkspaceProject;
  },
): PlannerWorkspaceLifecycleResult {
  const activeSession = selectActivePlannerSession(state);
  const existingProjects = listPlannerSessionProjects(state.projects, activeSession);
  const project = options.createProject({
    name: createNextPlannerPlanName(existingProjects),
    existingProjects,
  });
  if (!project) {
    return workspaceResult(state);
  }
  return addPlannerProjectToWorkspaceSession(state, project, options.now);
}

export function deletePlannerProjectFromActiveSession(
  state: PlannerWorkspaceLifecycleState,
  options: {
    readonly now: string;
    readonly createReplacementProject?: CreatePlannerWorkspaceProject;
  },
): PlannerWorkspaceLifecycleResult {
  const activeProjectId = state.activeProjectId;
  const activeSession = selectActivePlannerSession(state);
  const sessionProjects = listPlannerSessionProjects(state.projects, activeSession);
  if (
    !activeProjectId ||
    !activeSession ||
    !sessionProjects.some((project) => project.id === activeProjectId)
  ) {
    return workspaceResult(state);
  }

  if (sessionProjects.length <= 1) {
    const remainingSessionProjects = sessionProjects.filter(
      (project) => project.id !== activeProjectId,
    );
    const replacementProject = options.createReplacementProject?.({
      name: createNextPlannerPlanName(remainingSessionProjects),
      existingProjects: remainingSessionProjects,
    });
    if (!replacementProject) {
      return workspaceResult(state);
    }
    const projects = [
      ...state.projects.filter((project) => project.id !== activeProjectId),
      replacementProject,
    ];
    const sessions = replacePlannerSession(
      state.sessions,
      replaceProjectInSession(activeSession, activeProjectId, replacementProject, options.now),
    );
    return workspaceResult({
      sessions,
      projects,
      activeSessionId: activeSession.id,
      activeProjectId: replacementProject.id,
      activation: { project: replacementProject, sessionId: activeSession.id },
    });
  }

  const projects = state.projects.filter((project) => project.id !== activeProjectId);
  const nextProject = selectNeighborBeforeRemoval(sessionProjects, activeProjectId);
  const sessions = replacePlannerSession(
    state.sessions,
    removeProjectFromSession(activeSession, activeProjectId, nextProject?.id, options.now),
  );

  if (!nextProject) {
    return workspaceResult({
      sessions,
      projects,
      activeSessionId: activeSession.id,
    });
  }

  return workspaceResult({
    sessions,
    projects,
    activeSessionId: activeSession.id,
    activeProjectId: nextProject.id,
    activation: { project: nextProject, sessionId: activeSession.id },
  });
}

export function renamePlannerSessionInWorkspace(
  state: PlannerWorkspaceLifecycleState,
  name: string,
  now: string,
): PlannerWorkspaceLifecycleResult {
  const activeSessionId = state.activeSessionId;
  const normalizedName = normalizePlannerName(name);
  if (!activeSessionId || normalizedName.length === 0) {
    return workspaceResult(state);
  }

  let changed = false;
  const sessions = state.sessions.map((session) => {
    if (session.id !== activeSessionId || session.name === normalizedName) {
      return session;
    }
    changed = true;
    return {
      ...session,
      name: normalizedName,
      updatedAt: now,
    };
  });

  return changed ? workspaceResult({ ...state, sessions }) : workspaceResult(state);
}

export function renamePlannerProjectInWorkspace(
  state: PlannerWorkspaceLifecycleState,
  name: string,
  now: string,
): PlannerWorkspaceLifecycleResult {
  const activeProjectId = state.activeProjectId;
  const normalizedName = normalizePlannerName(name);
  if (!activeProjectId || normalizedName.length === 0) {
    return workspaceResult(state);
  }

  let changed = false;
  const projects = state.projects.map((project) => {
    if (project.id !== activeProjectId || project.name === normalizedName) {
      return project;
    }
    changed = true;
    return {
      ...project,
      name: normalizedName,
      updatedAt: now,
    };
  });

  return changed ? workspaceResult({ ...state, projects }) : workspaceResult(state);
}

export function setPlannerSessionActiveProject(
  sessions: readonly PlannerSession[],
  sessionId: string,
  projectId: string,
): PlannerSession[] {
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
  return changed ? nextSessions : [...sessions];
}

export function duplicatePlannerProject(
  project: PlannerProject,
  options: {
    readonly id: string;
    readonly now: string;
  },
): PlannerProject {
  return {
    ...structuredClone(project),
    id: options.id,
    name: appendPlannerNameSuffix(project.name, 'copy'),
    createdAt: options.now,
    updatedAt: options.now,
  };
}

export function createNextPlannerPlanName(
  existingProjects: readonly Pick<PlannerProject, 'name'>[],
): string {
  const baseName = 'Plan';
  const existingNames = new Set(
    existingProjects.map((project) => normalizePlannerName(project.name).toLowerCase()),
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

export function createUniquePlannerSessionName(existingNames: readonly string[]): string {
  const baseName = 'Session';
  const normalizedNames = new Set(
    existingNames.map((name) => normalizePlannerName(name).toLowerCase()),
  );
  let nextIndex = 1;

  for (const name of existingNames) {
    const trimmedName = normalizePlannerName(name);
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

function activatePlannerWorkspaceProject(
  state: PlannerWorkspaceLifecycleState,
  project: PlannerProject,
  sessionId: string | undefined,
): PlannerWorkspaceLifecycleResult {
  const sessions =
    sessionId === undefined
      ? [...state.sessions]
      : setPlannerSessionActiveProject(state.sessions, sessionId, project.id);
  return workspaceResult({
    sessions,
    projects: [...state.projects],
    activeProjectId: project.id,
    ...(state.activeSessionId !== undefined ? { activeSessionId: state.activeSessionId } : {}),
    activation: {
      project,
      ...(sessionId !== undefined ? { sessionId } : {}),
    },
  });
}

function workspaceResult(
  state: PlannerWorkspaceLifecycleState & {
    readonly activation?: PlannerWorkspaceActivation;
  },
): PlannerWorkspaceLifecycleResult {
  return {
    sessions: [...state.sessions],
    projects: [...state.projects],
    ...(state.activeSessionId !== undefined ? { activeSessionId: state.activeSessionId } : {}),
    ...(state.activeProjectId !== undefined ? { activeProjectId: state.activeProjectId } : {}),
    ...(state.activation !== undefined ? { activation: state.activation } : {}),
  };
}

function replacePlannerSession(
  sessions: readonly PlannerSession[],
  replacement: PlannerSession,
): PlannerSession[] {
  return sessions.map((session) => (session.id === replacement.id ? replacement : session));
}

function selectNeighborBeforeRemoval<TItem extends { id: string }>(
  items: readonly TItem[],
  removedId: string,
): TItem | undefined {
  const removedIndex = items.findIndex((item) => item.id === removedId);
  if (removedIndex < 0) {
    return undefined;
  }
  return items[removedIndex - 1] ?? items[removedIndex + 1];
}

function projectIdsOwnedByDeletedSession(
  deletedSession: PlannerSession,
  remainingSessions: readonly PlannerSession[],
): ReadonlySet<string> {
  const remainingProjectIds = new Set(remainingSessions.flatMap((session) => session.projectIds));
  return new Set(
    deletedSession.projectIds.filter((projectId) => !remainingProjectIds.has(projectId)),
  );
}

function replaceProjectInSession(
  session: PlannerSession,
  projectId: string,
  replacementProject: PlannerProject,
  now: string,
): PlannerSession {
  const replacedProjectIds = uniqueStrings(
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
    links: filterPlannerSessionLinksForProjects(session, projectIds),
    updatedAt: now,
  };
}

function removeProjectFromSession(
  session: PlannerSession,
  projectId: string,
  nextActiveProjectId: string | undefined,
  now: string,
): PlannerSession {
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
    links: filterPlannerSessionLinksForProjects(session, projectIds),
    updatedAt: session.projectIds.length === projectIds.length ? session.updatedAt : now,
  };
}

function filterPlannerSessionLinksForProjects(
  session: PlannerSession,
  projectIds: readonly string[],
): PlannerSession['links'] {
  const projectIdSet = new Set(projectIds);
  return (session.links ?? []).filter(
    (link) =>
      projectIdSet.has(link.source.projectId) && projectIdSet.has(link.destination.projectId),
  );
}
