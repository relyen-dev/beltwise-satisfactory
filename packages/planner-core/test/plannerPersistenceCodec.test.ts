import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  decodePlannerPersistenceState,
  encodePlannerPersistenceState,
  PLANNER_STORAGE_SCHEMA_VERSION,
  type PlannerProject,
  type StoredPlannerProjectV1,
} from '@beltwise/planner-core';

describe('encodePlannerPersistenceState', () => {
  it('encodes the stable v1 planner storage shape', () => {
    const project = createDomainPlannerProject();

    const state = encodePlannerPersistenceState([project], project.id);

    expect(state).toEqual({
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeProjectId: 'project-a',
      projects: [
        {
          id: 'project-a',
          name: 'Project A',
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

    const state = encodePlannerPersistenceState([projectWithDerivedState], project.id);

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
    expect(state?.projects.map((project) => project.id)).toEqual(['valid-project']);
  });

  it('migrates v1 state, hydrates defaults, and drops non-authoritative solver output', () => {
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
    expect(state?.activeProjectId).toBe('project-from-v1');
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
});

function createDomainPlannerProject(): PlannerProject {
  return {
    ...createPlannerProject({
      id: 'project-a',
      name: 'Project A',
      dataset: tinySatisfactoryDataset,
      now: '2026-05-12T00:00:00.000Z',
    }),
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
