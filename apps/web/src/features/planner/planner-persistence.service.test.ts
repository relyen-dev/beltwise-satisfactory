import { Injector } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset, type GameDataset } from '@beltwise/game-data';
import {
  createPlannerProject,
  PLANNER_STORAGE_SCHEMA_VERSION,
  type PlannerProject,
} from '@beltwise/planner-core';
import {
  PLANNER_PERSISTENCE_STORAGE,
  PlannerPersistenceService,
  createBrowserPlannerPersistenceStorage,
  createStoredPlannerState,
  type PlannerPersistenceStorage,
} from './planner-persistence.service';
import { plannerRelevantMachineIds } from './planner-domain.helpers';

const STORAGE_KEY = 'beltwise.workspace.v1';

class MemoryStorage implements PlannerPersistenceStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingStorage implements PlannerPersistenceStorage {
  public constructor(
    private readonly options: {
      readonly getFailure?: Error;
      readonly setFailure?: Error;
    },
  ) {}

  public getItem(_key: string): string | null {
    if (this.options.getFailure) {
      throw this.options.getFailure;
    }
    return null;
  }

  public setItem(_key: string, _value: string): void {
    if (this.options.setFailure) {
      throw this.options.setFailure;
    }
  }
}

describe('PlannerPersistenceService', () => {
  let storage: MemoryStorage;
  let service: PlannerPersistenceService;

  beforeEach(() => {
    storage = new MemoryStorage();
    service = createPersistenceService(storage);
  });

  it('returns null when saved planner state is not valid JSON', () => {
    storage.setItem(STORAGE_KEY, '{not-json');

    const state = service.load(tinySatisfactoryDataset);

    expect(state).toBeNull();
  });

  it('returns null when saved planner state has the wrong shape', () => {
    const rawState: unknown = {
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      projects: {},
    };

    storage.setItem(STORAGE_KEY, JSON.stringify(rawState));

    const state = service.load(tinySatisfactoryDataset);

    expect(state).toBeNull();
  });

  it('returns null when saved planner state uses an unknown future schema version', () => {
    const rawState: unknown = {
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION + 1,
      projects: [rawPlannerProject()],
    };

    storage.setItem(STORAGE_KEY, JSON.stringify(rawState));

    const state = service.load(tinySatisfactoryDataset);

    expect(state).toBeNull();
  });

  it('returns null when browser storage is unavailable or cannot be read', () => {
    expect(createPersistenceService(null).load(tinySatisfactoryDataset)).toBeNull();

    expect(
      createPersistenceService(
        new ThrowingStorage({ getFailure: new Error('Blocked storage read') }),
      ).load(tinySatisfactoryDataset),
    ).toBeNull();
  });

  it('uses the default browser storage factory safely when localStorage access throws', () => {
    const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('Storage unavailable');
      },
    });

    try {
      const defaultStorage = createBrowserPlannerPersistenceStorage();
      const defaultService = createPersistenceService(defaultStorage);

      expect(defaultStorage).toBeNull();
      expect(defaultService.load(tinySatisfactoryDataset)).toBeNull();
      expect(() => defaultService.saveProjects([], undefined)).not.toThrow();
    } finally {
      if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });

  it('does not throw when browser storage rejects writes', () => {
    const failingService = createPersistenceService(
      new ThrowingStorage({ setFailure: new Error('Quota exceeded') }),
    );

    expect(() => failingService.saveProjects([], undefined)).not.toThrow();
    expect(() => createPersistenceService(null).saveProjects([], undefined)).not.toThrow();
  });

  it('writes saved planner state JSON to storage', () => {
    const project = createDomainPlannerProject();
    const state = createStoredPlannerState([project], project.id);

    service.saveProjects([project], project.id);

    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(state));
  });

  it('writes only the explicit stored project DTO fields', () => {
    const project = createDomainPlannerProject();
    const projectWithDerivedState = {
      ...project,
      solverResult: { status: 'optimal' },
      targets: project.targets.map((target) => ({
        ...target,
        solvedAmountPerMinute: 999,
      })),
    };

    service.saveProjects([projectWithDerivedState], project.id);

    const savedProject = firstSavedProject(storage);
    expect(savedProject['solverResult']).toBeUndefined();
    expect(firstSavedTarget(savedProject)['solvedAmountPerMinute']).toBeUndefined();
  });

  it('loads valid projects when other saved project records are malformed', () => {
    const rawState: unknown = {
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeProjectId: 'valid-project',
      projects: [null, 'not-a-project', rawPlannerProject({ id: 'valid-project' })],
    };

    storage.setItem(STORAGE_KEY, JSON.stringify(rawState));

    const state = service.load(tinySatisfactoryDataset);

    expect(state?.activeProjectId).toBe('valid-project');
    expect(state?.projects.map((project) => project.id)).toEqual(['valid-project']);
  });

  it('migrates v1 planner state to the current loaded shape', () => {
    const rawState: unknown = {
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
    };

    storage.setItem(STORAGE_KEY, JSON.stringify(rawState));

    const state = service.load(tinySatisfactoryDataset);

    expect(state?.schemaVersion).toBe(PLANNER_STORAGE_SCHEMA_VERSION);
    expect(state?.activeProjectId).toBe('project-from-v1');
    const project = loadedProject(state?.projects, 'project-from-v1');
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

  it('loads current-version project configuration independently', () => {
    const rawState: unknown = {
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
              id: 'target-a',
              itemId: 'Desc_IronPlate_C',
              mode: 'fixed',
              amountPerMinute: 20,
              sortOrder: 0,
            },
          ],
          recipeOverrides: {
            Recipe_IronWire_C: { enabled: false },
          },
          resourceOverrides: {
            Desc_OreIron_C: { maxPerMinute: 120 },
          },
          itemInputs: {
            Desc_IngotIron_C: { amountPerMinute: 15 },
          },
          machineOverrides: {
            Build_ConstructorMk1_C: { enabled: false },
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
        {
          id: 'project-b',
          name: 'Project B',
          datasetId: tinySatisfactoryDataset.id,
          createdAt: '2026-05-12T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          targets: [
            {
              id: 'target-b',
              itemId: 'Desc_Wire_C',
              mode: 'fixed',
              amountPerMinute: 30,
              sortOrder: 0,
            },
          ],
          recipeOverrides: {
            Recipe_IronWire_C: { enabled: true },
          },
          resourceOverrides: {
            Desc_OreIron_C: { maxPerMinute: 480 },
          },
        },
      ],
    };

    storage.setItem(STORAGE_KEY, JSON.stringify(rawState));

    const state = service.load(tinySatisfactoryDataset);

    expect(state?.schemaVersion).toBe(PLANNER_STORAGE_SCHEMA_VERSION);
    expect(state?.activeProjectId).toBe('project-a');
    const projectA = loadedProject(state?.projects, 'project-a');
    const projectB = loadedProject(state?.projects, 'project-b');

    expect(projectA.recipeOverrides['Recipe_IronWire_C']).toEqual({ enabled: false });
    expect(projectB.recipeOverrides['Recipe_IronWire_C']).toEqual({ enabled: true });
    expect(projectA.resourceOverrides['Desc_OreIron_C']).toEqual({ maxPerMinute: 120 });
    expect(projectB.resourceOverrides['Desc_OreIron_C']).toEqual({ maxPerMinute: 480 });
    expect(projectA.itemInputs['Desc_IngotIron_C']).toEqual({ amountPerMinute: 15 });
    expect(projectB.itemInputs).toEqual({});
    expect(projectA.machineOverrides['Build_ConstructorMk1_C']).toEqual({ enabled: false });
    expect(projectB.machineOverrides).toEqual({});
    expect(projectA.graphLayout.nodePositions['recipe:Recipe_IronPlate_C']).toEqual({
      x: 25,
      y: 50,
    });
    expect(projectB.graphLayout).toEqual({ nodePositions: {} });
    expect(projectA.graphDisplay).toEqual({
      maxBeltTier: 4,
      maxPipeTier: 1,
      rateDecimalPlaces: 4,
      edgeStyle: 'curved',
      showTransportLabels: false,
      animateFlowLines: false,
    });
    expect(projectB.graphDisplay).toEqual({
      maxBeltTier: 6,
      maxPipeTier: 2,
      rateDecimalPlaces: 3,
      edgeStyle: 'straight',
      showTransportLabels: true,
      animateFlowLines: true,
    });
    expect(projectA.buildState).toEqual({
      planLocked: true,
      nodeLayoutLocked: true,
      nodeStates: {
        'recipe:Recipe_IronPlate_C': {
          done: true,
          note: 'Floor 2',
        },
      },
    });
    expect(projectB.buildState).toEqual({
      planLocked: false,
      nodeLayoutLocked: false,
      nodeStates: {},
    });
  });

  it('hydrates planner locks independently for each saved project', () => {
    const rawState: unknown = {
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeProjectId: 'project-a',
      projects: [
        {
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
          buildState: {
            planLocked: true,
            nodeLayoutLocked: false,
            nodeStates: {},
          },
        },
        {
          id: 'project-b',
          name: 'Project B',
          datasetId: tinySatisfactoryDataset.id,
          createdAt: '2026-05-12T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          targets: [],
          recipeOverrides: {},
          resourceOverrides: {},
          itemInputs: {},
          machineOverrides: {},
          graphLayout: { nodePositions: {} },
          buildState: {
            planLocked: false,
            nodeLayoutLocked: true,
            nodeStates: {},
          },
        },
        {
          id: 'project-c',
          name: 'Project C',
          datasetId: tinySatisfactoryDataset.id,
          createdAt: '2026-05-12T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          targets: [],
          recipeOverrides: {},
          resourceOverrides: {},
          itemInputs: {},
          machineOverrides: {},
          graphLayout: { nodePositions: {} },
        },
      ],
    };

    storage.setItem(STORAGE_KEY, JSON.stringify(rawState));

    const state = service.load(tinySatisfactoryDataset);

    expect(loadedProject(state?.projects, 'project-a').buildState).toEqual({
      planLocked: true,
      nodeLayoutLocked: false,
      nodeStates: {},
    });
    expect(loadedProject(state?.projects, 'project-b').buildState).toEqual({
      planLocked: false,
      nodeLayoutLocked: true,
      nodeStates: {},
    });
    expect(loadedProject(state?.projects, 'project-c').buildState).toEqual({
      planLocked: false,
      nodeLayoutLocked: false,
      nodeStates: {},
    });
  });
});

describe('plannerRelevantMachineIds', () => {
  it('keeps only automated recipe machines that can affect solving', () => {
    const dataset: GameDataset = {
      ...tinySatisfactoryDataset,
      recipes: {
        ...tinySatisfactoryDataset.recipes,
        Recipe_TestPower_C: {
          id: 'Recipe_TestPower_C',
          className: 'Recipe_TestPower_C',
          displayName: 'Test Power',
          ingredients: [{ itemId: 'Desc_OreIron_C', amount: 1 }],
          products: [{ itemId: 'Desc_IngotIron_C', amount: 1 }],
          durationSeconds: 4,
          producedIn: ['Build_GeneratorCoal_C'],
          isAlternate: false,
          isHandCraftOnly: false,
          tags: [],
        },
        Recipe_MysteryProduction_C: {
          id: 'Recipe_MysteryProduction_C',
          className: 'Recipe_MysteryProduction_C',
          displayName: 'Mystery Production',
          ingredients: [{ itemId: 'Desc_OreCopper_C', amount: 1 }],
          products: [{ itemId: 'Desc_CopperIngot_C', amount: 1 }],
          durationSeconds: 4,
          producedIn: ['Build_MysteryCrafter_C'],
          isAlternate: false,
          isHandCraftOnly: false,
          tags: [],
        },
      },
      machines: {
        ...tinySatisfactoryDataset.machines,
        Build_GeneratorCoal_C: {
          id: 'Build_GeneratorCoal_C',
          className: 'Build_GeneratorCoal_C',
          displayName: 'Coal-Powered Generator',
          type: 'generator',
          powerMw: 0,
        },
        Build_MysteryCrafter_C: {
          id: 'Build_MysteryCrafter_C',
          className: 'Build_MysteryCrafter_C',
          displayName: 'Mystery Crafter',
          type: 'unknown',
          powerMw: 6,
          manufacturingSpeed: 1,
        },
      },
    };

    const machineIds = plannerRelevantMachineIds(dataset);

    expect(machineIds.has('Build_AssemblerMk1_C')).toBe(true);
    expect(machineIds.has('Build_ConstructorMk1_C')).toBe(true);
    expect(machineIds.has('Build_SmelterMk1_C')).toBe(true);
    expect(machineIds.has('Build_MinerMk1_C')).toBe(false);
    expect(machineIds.has('Build_GeneratorCoal_C')).toBe(false);
    expect(machineIds.has('Build_MysteryCrafter_C')).toBe(true);
  });
});

function loadedProject(projects: PlannerProject[] | undefined, projectId: string): PlannerProject {
  const project = projects?.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Expected project ${projectId} to be loaded`);
  }
  return project;
}

function createPersistenceService(
  storage: PlannerPersistenceStorage | null,
): PlannerPersistenceService {
  const injector = Injector.create({
    providers: [
      { provide: PlannerPersistenceService, useFactory: () => new PlannerPersistenceService() },
      { provide: PLANNER_PERSISTENCE_STORAGE, useValue: storage },
    ],
  });
  return injector.get(PlannerPersistenceService);
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

function createDomainPlannerProject(): PlannerProject {
  return createPlannerProject({
    id: 'project-a',
    name: 'Project A',
    dataset: tinySatisfactoryDataset,
    now: '2026-05-12T00:00:00.000Z',
    targets: [
      {
        id: 'target-a',
        itemId: 'Desc_IronPlate_C',
        mode: 'fixed',
        amountPerMinute: 20,
        sortOrder: 0,
      },
    ],
  });
}

function firstSavedProject(storage: MemoryStorage): Record<string, unknown> {
  const rawValue = storage.getItem(STORAGE_KEY);
  if (!rawValue) {
    throw new Error('Expected saved planner state');
  }

  const state = JSON.parse(rawValue) as Record<string, unknown>;
  const projects = state['projects'];
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error('Expected at least one saved project');
  }

  return projects[0] as Record<string, unknown>;
}

function firstSavedTarget(project: Record<string, unknown>): Record<string, unknown> {
  const targets = project['targets'];
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('Expected at least one saved target');
  }

  return targets[0] as Record<string, unknown>;
}
