import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
  createDefaultUserDefaults,
  createPlannerProject,
  PLANNER_STORAGE_SCHEMA_VERSION,
  type PlannerProject,
} from '@beltwise/planner-core';
import {
  PLANNER_PERSISTENCE_STORAGE,
  PlannerPersistenceService,
  type PlannerPersistenceStorage,
} from './planner-persistence.service';
import {
  createStoredPlannerState,
  PlannerPersistenceCoordinatorService,
} from './planner-persistence-coordinator.service';

const STORAGE_KEY = 'beltwise.workspace.v1';
const NOW = '2026-05-12T00:00:00.000Z';

class MemoryStorage implements PlannerPersistenceStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('PlannerPersistenceCoordinatorService', () => {
  it('builds stored planner state with a default session fallback', () => {
    const projects = [createProject('project-a')];
    const userDefaults = createDefaultUserDefaults(tinySatisfactoryDataset);

    expect(createStoredPlannerState(projects, undefined, userDefaults)).toEqual({
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      activeSessionId: 'session-default',
      activeProjectId: 'project-a',
      sessions: [
        {
          id: 'session-default',
          name: 'Default session',
          datasetId: tinySatisfactoryDataset.id,
          createdAt: NOW,
          updatedAt: NOW,
          projectIds: ['project-a'],
          activeProjectId: 'project-a',
        },
      ],
      projects,
      userDefaults,
    });
  });

  it('saves active project state through the persistence service', () => {
    const { coordinator, storage } = createCoordinatorHarness();
    const projects = [createProject('project-a'), createProject('project-b')];
    const userDefaults = createDefaultUserDefaults(tinySatisfactoryDataset);

    coordinator.saveState(projects, 'project-b', userDefaults);

    expect(storage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeSessionId: 'session-default',
        activeProjectId: 'project-b',
        sessions: [
          {
            id: 'session-default',
            name: 'Default session',
            datasetId: tinySatisfactoryDataset.id,
            createdAt: NOW,
            updatedAt: NOW,
            projectIds: ['project-a', 'project-b'],
            activeProjectId: 'project-b',
          },
        ],
        projects,
        userDefaults,
      }),
    );
  });

  it('does not write empty project lists', () => {
    const { coordinator, storage } = createCoordinatorHarness();

    coordinator.saveState([], undefined, createDefaultUserDefaults(tinySatisfactoryDataset));

    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});

function createCoordinatorHarness(): {
  coordinator: PlannerPersistenceCoordinatorService;
  storage: MemoryStorage;
} {
  const storage = new MemoryStorage();
  const injector = Injector.create({
    providers: [
      PlannerPersistenceCoordinatorService,
      { provide: PlannerPersistenceService, useFactory: () => new PlannerPersistenceService() },
      { provide: PLANNER_PERSISTENCE_STORAGE, useValue: storage },
    ],
  });

  return {
    coordinator: injector.get(PlannerPersistenceCoordinatorService),
    storage,
  };
}

function createProject(id: string): PlannerProject {
  return createPlannerProject({
    id,
    name: id,
    dataset: tinySatisfactoryDataset,
    now: NOW,
    targets: [],
  });
}
