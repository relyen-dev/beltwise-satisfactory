import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createObjectiveProfileFromPreset,
  createPlannerProject,
  decodePlannerPersistenceState,
  encodePlannerPersistenceState,
  PLANNER_STORAGE_SCHEMA_VERSION,
  type PlannerProject,
  type PlannerUserDefaults,
  type StoredPlannerProjectV1,
} from '@beltwise/planner-core';

describe('encodePlannerPersistenceState', () => {
  it('encodes the stable v3 planner storage shape with sessions', () => {
    const project = createDomainPlannerProject();
    const userDefaults = createDomainUserDefaults();

    const state = encodePlannerPersistenceState([project], project.id, userDefaults);

    expect(state).toEqual({
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeSessionId: 'session-default',
      activeProjectId: 'project-a',
      sessions: [
        {
          id: 'session-default',
          name: 'Default session',
          datasetId: tinySatisfactoryDataset.id,
          createdAt: '2026-05-12T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          projectIds: ['project-a'],
          activeProjectId: 'project-a',
        },
      ],
      projects: [
        {
          id: 'project-a',
          name: 'Project A',
          notes: 'Check belts\nBring power shards',
          datasetId: tinySatisfactoryDataset.id,
          createdAt: '2026-05-12T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
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
            presetId: 'custom',
            strategy: 'lexicographic',
            stageOrder: ['raw-resources', 'surplus', 'recipe-activity', 'power'],
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
        },
      ],
      userDefaults: {
        recipeOverrides: {
          Recipe_IronWire_C: { enabled: true },
        },
        machineOverrides: {
          Build_ConstructorMk1_C: { enabled: false },
        },
        resourceOverrides: {
          Desc_OreIron_C: { maxPerMinute: 180 },
        },
        objectiveProfile: {
          presetId: 'custom',
          strategy: 'lexicographic',
          stageOrder: ['raw-resources', 'surplus', 'recipe-activity', 'power'],
          resourceScarcityWeight: 1,
          powerWeight: 0.2,
          machineCountWeight: 0.25,
          surplusWeight: 0.5,
          rawResourceMultipliers: {},
        },
        graphDisplay: {
          maxBeltTier: 5,
          maxPipeTier: 2,
          rateDecimalPlaces: 2,
          edgeStyle: 'curved',
          showTransportLabels: false,
          animateFlowLines: true,
        },
      },
    });
  });

  it('excludes derived solver state from persisted project records', () => {
    const project = createDomainPlannerProject();
    const projectWithDerivedState = {
      ...project,
      solverResult: { status: 'optimal' },
      targets: project.targets.map((target) => ({
        ...target,
        solvedAmountPerMinute: 999,
      })),
    };

    const state = encodePlannerPersistenceState(
      [projectWithDerivedState],
      project.id,
      createDefaultUserDefaults(tinySatisfactoryDataset),
    );

    const storedProject = firstStoredProject(state.projects);
    const storedTarget = firstStoredTarget(storedProject);
    expect('solverResult' in storedProject).toBe(false);
    expect('solvedAmountPerMinute' in storedTarget).toBe(false);
  });
});

describe('decodePlannerPersistenceState', () => {
  it('returns null for unknown or invalid state envelopes', () => {
    expect(decodePlannerPersistenceState(null, tinySatisfactoryDataset)).toBeNull();
    expect(
      decodePlannerPersistenceState(
        { schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION, projects: {} },
        tinySatisfactoryDataset,
      ),
    ).toBeNull();
    expect(
      decodePlannerPersistenceState(
        {
          schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION + 1,
          projects: [rawPlannerProject()],
        },
        tinySatisfactoryDataset,
      ),
    ).toBeNull();
  });

  it('skips malformed project records and falls back to the first loaded project', () => {
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: 'missing-project',
        projects: [null, 'not-a-project', rawPlannerProject({ id: 'valid-project' })],
      },
      tinySatisfactoryDataset,
    );

    expect(state?.activeProjectId).toBe('valid-project');
    expect(state?.activeSessionId).toBe('session-default');
    expect(state?.sessions).toMatchObject([
      {
        id: 'session-default',
        projectIds: ['valid-project'],
        activeProjectId: 'valid-project',
      },
    ]);
    expect(state?.projects.map((project) => project.id)).toEqual(['valid-project']);
  });

  it('migrates v1 state into one default session and drops non-authoritative solver output', () => {
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: 1,
        activeProjectId: 'missing-project',
        projects: [
          rawPlannerProject({
            id: 'project-from-v1',
            solverResult: { status: 'optimal' },
            buildState: {
              locked: true,
              nodeStates: {
                'recipe:Recipe_IronPlate_C': {
                  done: true,
                },
              },
            },
          }),
        ],
      },
      tinySatisfactoryDataset,
    );

    expect(state?.schemaVersion).toBe(PLANNER_STORAGE_SCHEMA_VERSION);
    expect(state?.activeSessionId).toBe('session-default');
    expect(state?.activeProjectId).toBe('project-from-v1');
    expect(state?.sessions).toMatchObject([
      {
        id: 'session-default',
        name: 'Default session',
        datasetId: tinySatisfactoryDataset.id,
        projectIds: ['project-from-v1'],
        activeProjectId: 'project-from-v1',
      },
    ]);
    expect(state?.userDefaults).toEqual(createDefaultUserDefaults(tinySatisfactoryDataset));
    const project = loadedProject(state?.projects, 'project-from-v1');
    expect(project.graphDisplay).toEqual({
      maxBeltTier: 6,
      maxPipeTier: 2,
      rateDecimalPlaces: 3,
      edgeStyle: 'straight',
      showTransportLabels: true,
      animateFlowLines: true,
    });
    expect(project.buildState).toEqual({
      planLocked: true,
      nodeLayoutLocked: false,
      nodeStates: {
        'recipe:Recipe_IronPlate_C': {
          done: true,
        },
      },
    });
    expect('solverResult' in project).toBe(false);
  });

  it('migrates v2 state into one default session and preserves workspace defaults', () => {
    const userDefaults = createDomainUserDefaults();
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: 2,
        activeProjectId: 'project-b',
        projects: [
          rawPlannerProject({ id: 'project-a' }),
          rawPlannerProject({ id: 'project-b', name: 'Project B' }),
        ],
        userDefaults,
      },
      tinySatisfactoryDataset,
    );

    expect(state?.schemaVersion).toBe(PLANNER_STORAGE_SCHEMA_VERSION);
    expect(state?.activeSessionId).toBe('session-default');
    expect(state?.activeProjectId).toBe('project-b');
    expect(state?.sessions).toMatchObject([
      {
        id: 'session-default',
        projectIds: ['project-a', 'project-b'],
        activeProjectId: 'project-b',
      },
    ]);
    expect(state?.userDefaults.resourceOverrides).toEqual(userDefaults.resourceOverrides);
  });

  it('encodes and decodes v3 sessions and active session ids', () => {
    const projectA = createDomainPlannerProject();
    const projectB = { ...createDomainPlannerProject(), id: 'project-b', name: 'Project B' };
    const userDefaults = createDomainUserDefaults();
    const encoded = encodePlannerPersistenceState(
      [projectA, projectB],
      projectB.id,
      userDefaults,
      [
        {
          id: 'session-a',
          name: 'Rocky Desert',
          datasetId: tinySatisfactoryDataset.id,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          projectIds: [projectA.id],
          activeProjectId: projectA.id,
        },
        {
          id: 'session-b',
          name: 'Dune Desert',
          datasetId: tinySatisfactoryDataset.id,
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          projectIds: [projectB.id],
          activeProjectId: projectB.id,
        },
      ],
      'session-b',
    );

    const decoded = decodePlannerPersistenceState(encoded, tinySatisfactoryDataset);

    expect(encoded.activeSessionId).toBe('session-b');
    expect(encoded.sessions.map((session) => session.id)).toEqual(['session-a', 'session-b']);
    expect(decoded?.activeSessionId).toBe('session-b');
    expect(decoded?.activeProjectId).toBe(projectB.id);
    expect(decoded?.sessions.map((session) => session.projectIds)).toEqual([
      [projectA.id],
      [projectB.id],
    ]);
  });

  it('round-trips objective preset strategy and stage order through persistence', () => {
    const project = {
      ...createDomainPlannerProject(),
      objectiveProfile: createObjectiveProfileFromPreset('low-power', {
        rawResourceMultipliers: {
          Desc_OreIron_C: 1.25,
        },
      }),
    };
    const userDefaults = {
      ...createDomainUserDefaults(),
      objectiveProfile: createObjectiveProfileFromPreset('balanced'),
    };

    const encoded = encodePlannerPersistenceState([project], project.id, userDefaults);
    const decoded = decodePlannerPersistenceState(encoded, tinySatisfactoryDataset);

    expect(decoded?.projects[0]?.objectiveProfile).toEqual(project.objectiveProfile);
    expect(decoded?.userDefaults.objectiveProfile).toEqual(userDefaults.objectiveProfile);
  });

  it('round-trips plan notes and node notes through persistence', () => {
    const project = createDomainPlannerProject();
    const encoded = encodePlannerPersistenceState(
      [project],
      project.id,
      createDefaultUserDefaults(tinySatisfactoryDataset),
    );
    const decoded = decodePlannerPersistenceState(encoded, tinySatisfactoryDataset);

    expect(decoded?.projects[0]?.notes).toBe(project.notes);
    expect(decoded?.projects[0]?.buildState.nodeStates).toEqual(project.buildState.nodeStates);
  });

  it('hydrates old objective profiles without preset fields on the Resource Efficient order', () => {
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        projects: [
          rawPlannerProject({
            objectiveProfile: {
              resourceScarcityWeight: 2,
              powerWeight: 0.3,
              machineCountWeight: 0.4,
              surplusWeight: 0.1,
              rawResourceMultipliers: {
                Desc_OreIron_C: 1.5,
              },
            },
          }),
        ],
      },
      tinySatisfactoryDataset,
    );

    expect(state?.projects[0]?.objectiveProfile).toEqual({
      presetId: 'custom',
      strategy: 'lexicographic',
      stageOrder: ['raw-resources', 'surplus', 'recipe-activity', 'power'],
      resourceScarcityWeight: 2,
      powerWeight: 0.3,
      machineCountWeight: 0.4,
      surplusWeight: 0.1,
      rawResourceMultipliers: {
        Desc_OreIron_C: 1.5,
      },
    });
  });

  it('filters stale session project ids and chooses a valid active project', () => {
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeSessionId: 'session-a',
        activeProjectId: 'missing-project',
        sessions: [
          {
            id: 'session-a',
            name: 'Session A',
            datasetId: tinySatisfactoryDataset.id,
            createdAt: '2026-05-12T00:00:00.000Z',
            updatedAt: '2026-05-12T00:00:00.000Z',
            projectIds: ['missing-project', 'project-a'],
            activeProjectId: 'missing-project',
          },
        ],
        projects: [rawPlannerProject({ id: 'project-a' })],
        userDefaults: createDomainUserDefaults(),
      },
      tinySatisfactoryDataset,
    );

    expect(state?.activeSessionId).toBe('session-a');
    expect(state?.activeProjectId).toBe('project-a');
    expect(state?.sessions[0]?.projectIds).toEqual(['project-a']);
    expect(state?.sessions[0]?.activeProjectId).toBe('project-a');
  });

  it('ignores v3 sessions without stable ids before selecting the active session', () => {
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeSessionId: 'missing-session',
        activeProjectId: 'project-a',
        sessions: [
          {
            name: 'Missing id session',
            datasetId: tinySatisfactoryDataset.id,
            createdAt: '2026-05-12T00:00:00.000Z',
            updatedAt: '2026-05-12T00:00:00.000Z',
            projectIds: ['project-a'],
            activeProjectId: 'project-a',
          },
        ],
        projects: [rawPlannerProject({ id: 'project-a' })],
        userDefaults: createDomainUserDefaults(),
      },
      tinySatisfactoryDataset,
    );

    expect(state?.activeSessionId).toBe('session-default');
    expect(state?.activeProjectId).toBe('project-a');
    expect(state?.sessions).toMatchObject([
      {
        id: 'session-default',
        projectIds: ['project-a'],
        activeProjectId: 'project-a',
      },
    ]);
  });

  it('uses session ids to disambiguate missing stored session names', () => {
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeSessionId: 'session-a',
        activeProjectId: 'project-a',
        sessions: [
          {
            id: 'session-a',
            datasetId: tinySatisfactoryDataset.id,
            createdAt: '2026-05-12T00:00:00.000Z',
            updatedAt: '2026-05-12T00:00:00.000Z',
            projectIds: ['project-a'],
            activeProjectId: 'project-a',
          },
          {
            id: 'session-b',
            datasetId: tinySatisfactoryDataset.id,
            createdAt: '2026-05-12T00:00:00.000Z',
            updatedAt: '2026-05-12T00:00:00.000Z',
            projectIds: ['project-b'],
            activeProjectId: 'project-b',
          },
        ],
        projects: [rawPlannerProject({ id: 'project-a' }), rawPlannerProject({ id: 'project-b' })],
        userDefaults: createDomainUserDefaults(),
      },
      tinySatisfactoryDataset,
    );

    expect(state?.sessions.map((session) => session.name)).toEqual([
      'Restored session session-a',
      'Restored session session-b',
    ]);
  });

  it('saves and loads workspace defaults separately from projects', () => {
    const userDefaults = createDomainUserDefaults();
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: 'project-a',
        projects: [rawPlannerProject({ id: 'project-a' })],
        userDefaults: {
          recipeOverrides: {
            Recipe_IronPlate_C: { enabled: false },
            Recipe_IronWire_C: { enabled: true },
          },
          machineOverrides: userDefaults.machineOverrides,
          resourceOverrides: userDefaults.resourceOverrides,
          objectiveProfile: userDefaults.objectiveProfile,
          graphDisplay: userDefaults.graphDisplay,
        },
      },
      tinySatisfactoryDataset,
    );

    expect(state?.userDefaults.recipeOverrides['Recipe_IronPlate_C']).toEqual({
      enabled: false,
    });
    expect(state?.userDefaults.recipeOverrides['Recipe_IronWire_C']).toEqual({
      enabled: true,
    });
    expect(state?.userDefaults.machineOverrides).toEqual(userDefaults.machineOverrides);
    expect(state?.userDefaults.resourceOverrides).toEqual(userDefaults.resourceOverrides);
    expect(state?.userDefaults.graphDisplay).toEqual(userDefaults.graphDisplay);
  });

  it('falls back to built-in defaults when stored defaults are missing or malformed', () => {
    const state = decodePlannerPersistenceState(
      {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        projects: [rawPlannerProject()],
        userDefaults: {
          recipeOverrides: 'bad',
          machineOverrides: null,
          resourceOverrides: {
            Desc_OreIron_C: { maxPerMinute: 'fast' },
          },
          graphDisplay: {
            maxBeltTier: 99,
          },
        },
      },
      tinySatisfactoryDataset,
    );

    expect(state?.userDefaults).toEqual(createDefaultUserDefaults(tinySatisfactoryDataset));
  });
});

function createDomainPlannerProject(): PlannerProject {
  return {
    ...createPlannerProject({
      id: 'project-a',
      name: 'Project A',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    }),
    notes: 'Check belts\nBring power shards',
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
      presetId: 'custom',
      strategy: 'lexicographic',
      stageOrder: ['raw-resources', 'surplus', 'recipe-activity', 'power'],
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

function createDomainUserDefaults(): PlannerUserDefaults {
  return {
    ...createDefaultUserDefaults(tinySatisfactoryDataset),
    recipeOverrides: {
      Recipe_IronWire_C: { enabled: true },
    },
    machineOverrides: {
      Build_ConstructorMk1_C: { enabled: false },
    },
    resourceOverrides: {
      Desc_OreIron_C: { maxPerMinute: 180 },
    },
    objectiveProfile: {
      presetId: 'custom',
      strategy: 'lexicographic',
      stageOrder: ['raw-resources', 'surplus', 'recipe-activity', 'power'],
      resourceScarcityWeight: 1,
      powerWeight: 0.2,
      machineCountWeight: 0.25,
      surplusWeight: 0.5,
      rawResourceMultipliers: {},
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

function rawPlannerProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'project-a',
    name: 'Project A',
    datasetId: tinySatisfactoryDataset.id,
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    targets: [],
    recipeOverrides: {},
    resourceOverrides: {},
    itemInputs: {},
    machineOverrides: {},
    graphLayout: { nodePositions: {} },
    ...overrides,
  };
}

function loadedProject(projects: PlannerProject[] | undefined, projectId: string): PlannerProject {
  const project = projects?.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Expected project ${projectId} to be loaded`);
  }
  return project;
}

function firstStoredProject(projects: StoredPlannerProjectV1[]): StoredPlannerProjectV1 {
  const project = projects[0];
  if (!project) {
    throw new Error('Expected stored project');
  }
  return project;
}

function firstStoredTarget(
  project: StoredPlannerProjectV1,
): StoredPlannerProjectV1['targets'][number] {
  const target = project.targets[0];
  if (!target) {
    throw new Error('Expected stored target');
  }
  return target;
}
