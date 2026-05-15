import { Injectable, InjectionToken, inject } from '@angular/core';
import type { GameDataset } from '@beltwise/game-data';
import type { PlannerProject } from '@beltwise/planner-core';
import { hydratePlannerProject, PLANNER_STORAGE_SCHEMA_VERSION } from '@beltwise/planner-core';

export interface StoredPlannerState {
  schemaVersion: number;
  activeProjectId?: string;
  projects: PlannerProject[];
}

interface RawStoredPlannerState {
  schemaVersion: number;
  activeProjectId?: string;
  projects: unknown[];
}

const STORAGE_KEY = 'beltwise.workspace.v1';

export interface PlannerPersistenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PLANNER_PERSISTENCE_STORAGE =
  new InjectionToken<PlannerPersistenceStorage | null>('Beltwise planner persistence storage', {
    providedIn: 'root',
    factory: createBrowserPlannerPersistenceStorage,
  });

@Injectable({ providedIn: 'root' })
export class PlannerPersistenceService {
  private readonly storage: PlannerPersistenceStorage | null = inject(PLANNER_PERSISTENCE_STORAGE);

  public load(dataset: GameDataset): StoredPlannerState | null {
    const rawValue = readStoredValue(this.storage);
    if (!rawValue) {
      return null;
    }

    const parsed = parseStoredValue(rawValue);
    if (!isStoredPlannerState(parsed) || parsed.schemaVersion !== PLANNER_STORAGE_SCHEMA_VERSION) {
      return null;
    }

    const projects = hydrateStoredProjects(parsed.projects, dataset);
    if (projects.length === 0) {
      return null;
    }

    const activeProjectId = projects.some((project) => project.id === parsed.activeProjectId)
      ? parsed.activeProjectId
      : projects[0]?.id;

    return {
      schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
      ...(activeProjectId !== undefined ? { activeProjectId } : {}),
      projects,
    };
  }

  public save(state: StoredPlannerState): void {
    if (!this.storage) {
      return;
    }

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      return;
    }
  }
}

export function createBrowserPlannerPersistenceStorage(): PlannerPersistenceStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredValue(storage: PlannerPersistenceStorage | null): string | null {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseStoredValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return null;
  }
}

function hydrateStoredProjects(projects: unknown[], dataset: GameDataset): PlannerProject[] {
  const hydratedProjects: PlannerProject[] = [];
  for (const project of projects) {
    const hydratedProject = hydrateStoredProject(project, dataset);
    if (hydratedProject) {
      hydratedProjects.push(hydratedProject);
    }
  }
  return hydratedProjects;
}

function hydrateStoredProject(project: unknown, dataset: GameDataset): PlannerProject | null {
  try {
    return hydratePlannerProject(project, dataset);
  } catch {
    return null;
  }
}

function isStoredPlannerState(value: unknown): value is RawStoredPlannerState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['schemaVersion'] === 'number' &&
    Number.isFinite(record['schemaVersion']) &&
    (record['activeProjectId'] === undefined || typeof record['activeProjectId'] === 'string') &&
    Array.isArray(record['projects'])
  );
}
