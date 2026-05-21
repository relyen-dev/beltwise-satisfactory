import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  addPlannerProjectToWorkspaceSession,
  createDefaultStarterPlannerWorkspace,
  createNextPlannerPlanName,
  createPlannerProject,
  createPlannerProjectInActiveSession,
  createPlannerSession,
  createPlannerSessionInWorkspace,
  createUniquePlannerSessionName,
  deletePlannerProjectFromActiveSession,
  deletePlannerSessionFromWorkspace,
  duplicatePlannerProjectInWorkspace,
  initializePlannerWorkspace,
  listPlannerSessionProjects,
  MAX_PLANNER_NAME_LENGTH,
  renamePlannerProjectInWorkspace,
  renamePlannerSessionInWorkspace,
  selectPlannerSessionInWorkspace,
  type PlannerProject,
  type PlannerSession,
  type PlannerWorkspaceLifecycleState,
} from '@beltwise/planner-core';

const NOW = '2026-05-12T00:00:00.000Z';
const LATER = '2026-05-13T00:00:00.000Z';

describe('workspace lifecycle', () => {
  it('selects the stored active project for a session and falls back locally', () => {
    const draft = createProject('project-draft', 'Draft factory');
    const configured = createProject('project-configured', 'Configured factory', true);
    const session = createSession('session-a', [draft, configured], 'missing-project');

    const result = initializePlannerWorkspace({
      sessions: [session],
      projects: [draft, configured],
      activeSessionId: session.id,
      activeProjectId: 'missing-project',
    });

    expect(result.activeSessionId).toBe(session.id);
    expect(result.activeProjectId).toBe(draft.id);
    expect(result.activation?.project.id).toBe(draft.id);
    expect(result.sessions[0]?.activeProjectId).toBe(draft.id);
  });

  it('creates session and plan names without colliding with existing names', () => {
    expect(createNextPlannerPlanName([{ name: 'Plan 1' }, { name: 'plan 2 ' }])).toBe('Plan 3');
    expect(createUniquePlannerSessionName(['Session', 'Session 2', 'Rocky Desert'])).toBe(
      'Session 3',
    );

    const project = createProject('project-new', 'Plan 1');
    const result = createPlannerSessionInWorkspace(
      {
        sessions: [
          createSession('session-a', [createProject('project-a', 'Factory A')]),
          { ...createSession('session-b', []), name: 'Session 1' },
        ],
        projects: [],
      },
      project,
    );

    expect(result.sessions.at(-1)).toMatchObject({
      name: 'Session 2',
      projectIds: [project.id],
      activeProjectId: project.id,
    });
    expect(result.activeProjectId).toBe(project.id);
  });

  it('adds, duplicates, imports, and renames within the active session', () => {
    const projectA = createProject('project-a', 'Factory A');
    const projectB = createProject('project-b', 'Factory B');
    const sessionA = createSession('session-a', [projectA], projectA.id);
    const sessionB = createSession('session-b', [projectB], projectB.id);
    const state: PlannerWorkspaceLifecycleState = {
      sessions: [sessionA, sessionB],
      projects: [projectA, projectB],
      activeSessionId: sessionB.id,
      activeProjectId: projectB.id,
    };

    const created = createPlannerProjectInActiveSession(state, {
      now: LATER,
      createProject: ({ name }) => createProject('project-created', name),
    });
    const duplicated = duplicatePlannerProjectInWorkspace(created, {
      id: 'project-duplicate',
      now: LATER,
    });
    const importedProject = createProject('project-imported', 'Imported');
    const imported = addPlannerProjectToWorkspaceSession(duplicated, importedProject, LATER);
    const renamed = renamePlannerSessionInWorkspace(imported, ' Dune Desert ', LATER);

    expect(
      listPlannerSessionProjects(renamed.projects, renamed.sessions[0]).map(
        (project) => project.id,
      ),
    ).toEqual([projectA.id]);
    expect(renamed.sessions[1]).toMatchObject({
      name: 'Dune Desert',
      projectIds: [projectB.id, 'project-created', 'project-duplicate', importedProject.id],
      activeProjectId: importedProject.id,
      updatedAt: LATER,
    });
    expect(duplicated.projects.find((project) => project.id === 'project-duplicate')).toMatchObject(
      {
        name: 'Plan 1 copy',
        createdAt: LATER,
        targets: projectB.targets,
      },
    );
  });

  it('keeps duplicate plan name suffixes within the name cap', () => {
    const project = createProject('project-a', 'A'.repeat(MAX_PLANNER_NAME_LENGTH));
    const session = createSession('session-a', [project], project.id);

    const duplicated = duplicatePlannerProjectInWorkspace(
      {
        sessions: [session],
        projects: [project],
        activeSessionId: session.id,
        activeProjectId: project.id,
      },
      {
        id: 'project-duplicate',
        now: LATER,
      },
    );

    const duplicate = duplicated.projects.find((candidate) => candidate.id === 'project-duplicate');
    expect(duplicate?.name).toHaveLength(MAX_PLANNER_NAME_LENGTH);
    expect(duplicate?.name.endsWith(' copy')).toBe(true);
  });

  it('normalizes plan and session names at the workspace boundary', () => {
    const longName = 'A'.repeat(MAX_PLANNER_NAME_LENGTH + 12);
    const project = createProject('project-a', 'Factory A');
    const session = createSession('session-a', [project], project.id);
    const state: PlannerWorkspaceLifecycleState = {
      sessions: [session],
      projects: [project],
      activeSessionId: session.id,
      activeProjectId: project.id,
    };

    const renamedProject = renamePlannerProjectInWorkspace(
      state,
      `\n ${longName} \t extra words `,
      LATER,
    );
    const renamedSession = renamePlannerSessionInWorkspace(
      renamedProject,
      `\n ${longName} \t extra words `,
      LATER,
    );

    expect(renamedSession.projects[0]?.name).toBe('A'.repeat(MAX_PLANNER_NAME_LENGTH));
    expect(renamedSession.sessions[0]?.name).toBe('A'.repeat(MAX_PLANNER_NAME_LENGTH));
    expect(renamedSession.projects[0]?.updatedAt).toBe(LATER);
    expect(renamedSession.sessions[0]?.updatedAt).toBe(LATER);
  });

  it('repairs stale selected sessions with a replacement project', () => {
    const project = createProject('project-a', 'Factory A');
    const staleSession: PlannerSession = {
      id: 'session-stale',
      name: 'Stale',
      datasetId: tinySatisfactoryDataset.id,
      createdAt: NOW,
      updatedAt: NOW,
      projectIds: ['missing-project'],
      activeProjectId: 'missing-project',
    };

    const result = selectPlannerSessionInWorkspace(
      {
        sessions: [createSession('session-a', [project]), staleSession],
        projects: [project],
        activeSessionId: 'session-a',
        activeProjectId: project.id,
      },
      {
        sessionId: staleSession.id,
        now: LATER,
        createProject: ({ name }) => createProject('project-repaired', name),
      },
    );

    expect(result.activeSessionId).toBe(staleSession.id);
    expect(result.activeProjectId).toBe('project-repaired');
    expect(result.sessions[1]).toMatchObject({
      projectIds: ['project-repaired'],
      activeProjectId: 'project-repaired',
      updatedAt: LATER,
    });
  });

  it('deletes sessions by selecting neighbors and removing only orphaned projects', () => {
    const shared = createProject('project-shared', 'Shared');
    const projectB = createProject('project-b', 'Factory B');
    const projectC = createProject('project-c', 'Factory C');
    const sessionA = createSession('session-a', [shared], shared.id);
    const sessionB = createSession('session-b', [shared, projectB], projectB.id);
    const sessionC = createSession('session-c', [projectC], projectC.id);

    const result = deletePlannerSessionFromWorkspace(
      {
        sessions: [sessionA, sessionB, sessionC],
        projects: [shared, projectB, projectC],
        activeSessionId: sessionB.id,
        activeProjectId: projectB.id,
      },
      { sessionId: sessionB.id, now: LATER },
    );

    expect(result.sessions.map((session) => session.id)).toEqual([sessionA.id, sessionC.id]);
    expect(result.projects.map((project) => project.id)).toEqual([shared.id, projectC.id]);
    expect(result.activeSessionId).toBe(sessionA.id);
    expect(result.activeProjectId).toBe(shared.id);
  });

  it('replaces the last deleted session with a default starter workspace', () => {
    const project = createProject('project-a', 'Factory A');
    const replacement = createDefaultStarterPlannerWorkspace(tinySatisfactoryDataset);

    const result = deletePlannerSessionFromWorkspace(
      {
        sessions: [createSession('session-a', [project])],
        projects: [project],
        activeSessionId: 'session-a',
        activeProjectId: project.id,
      },
      {
        now: LATER,
        createReplacementWorkspace: () => replacement,
      },
    );

    expect(result.sessions).toEqual([replacement.session]);
    expect(result.projects).toEqual([replacement.project]);
    expect(result.activeProjectId).toBe(replacement.project.id);
  });

  it('deletes active projects by selecting neighbors or creating a replacement plan', () => {
    const projectA = createProject('project-a', 'Factory A');
    const projectB = createProject('project-b', 'Factory B');
    const projectC = createProject('project-c', 'Factory C');
    const session = createSession('session-a', [projectA, projectB, projectC], projectB.id);

    const deletedMiddle = deletePlannerProjectFromActiveSession(
      {
        sessions: [session],
        projects: [projectA, projectB, projectC],
        activeSessionId: session.id,
        activeProjectId: projectB.id,
      },
      { now: LATER },
    );

    expect(deletedMiddle.projects.map((project) => project.id)).toEqual([projectA.id, projectC.id]);
    expect(deletedMiddle.sessions[0]).toMatchObject({
      projectIds: [projectA.id, projectC.id],
      activeProjectId: projectA.id,
      updatedAt: LATER,
    });
    expect(deletedMiddle.activeProjectId).toBe(projectA.id);

    const replacedLast = deletePlannerProjectFromActiveSession(deletedMiddle, {
      now: LATER,
      createReplacementProject: ({ name }) => createProject('project-replacement', name),
    });
    const replacedAgain = deletePlannerProjectFromActiveSession(replacedLast, {
      now: LATER,
      createReplacementProject: ({ name }) => createProject('project-replacement-2', name),
    });

    expect(replacedAgain.projects.map((project) => project.id)).toEqual(['project-replacement-2']);
    expect(replacedAgain.sessions[0]?.projectIds).toEqual(['project-replacement-2']);
    expect(replacedAgain.projects[0]?.name).toBe('Plan 1');
  });
});

function createProject(id: string, name: string, configured = false): PlannerProject {
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
  id: string,
  projects: readonly PlannerProject[],
  activeProjectId = projects[0]?.id,
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
