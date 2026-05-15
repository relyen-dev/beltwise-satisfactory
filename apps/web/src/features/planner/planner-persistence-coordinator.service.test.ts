import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { tinySatisfactoryDataset } from '@beltwise/game-data';
import {
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
  it('builds stored planner state without an undefined active project id field', () => {
    const projects = [createProject('project-a')];

    expect(createStoredPlannerState(projects, undefined)).toEqual({
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      projects,
    });
  });

  it('saves active project state through the persistence service', () => {
    const { coordinator, storage } = createCoordinatorHarness();
    const projects = [createProject('project-a'), createProject('project-b')];

    coordinator.saveState(projects, 'project-b');

    expect(storage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: 'project-b',
        projects,
      }),
    );
  });

  it('does not write empty project lists', () => {
    const { coordinator, storage } = createCoordinatorHarness();

    coordinator.saveState([], undefined);

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
