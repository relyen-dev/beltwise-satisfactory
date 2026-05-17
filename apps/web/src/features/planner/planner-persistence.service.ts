import { Injectable, InjectionToken, inject } from '@angular/core';
import type { GameDataset } from '@beltwise/game-data';
import {
  decodePlannerPersistenceState,
  encodePlannerPersistenceState,
  type LoadedPlannerState as CoreLoadedPlannerState,
  type PlannerProject,
  type PlannerUserDefaults,
  type StoredPlannerState as CoreStoredPlannerState,
} from '@beltwise/planner-core';

const STORAGE_KEY = 'beltwise.workspace.v1';

export {
  createStoredPlannerState,
  type LoadedPlannerState,
  type PlannerStorageSchemaVersion,
  type StoredGraphDisplaySettingsV1,
  type StoredGraphLayoutStateV1,
  type StoredGraphNodeBuildStateV1,
  type StoredItemInputOverrideV1,
  type StoredMachineOverrideV1,
  type StoredObjectiveProfileV1,
  type StoredPlanBuildStateV1,
  type StoredPlannerProjectV1,
  type StoredPlannerState,
  type StoredPlannerStateV1,
  type StoredPlannerStateV2,
  type StoredPlannerUserDefaultsV2,
  type StoredPointV1,
  type StoredProductTargetV1,
  type StoredRecipeOverrideV1,
  type StoredResourceOverrideV1,
} from '@beltwise/planner-core';

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

  public load(dataset: GameDataset): CoreLoadedPlannerState | null {
    const rawValue = readStoredValue(this.storage);
    if (!rawValue) {
      return null;
    }

    const parsed = parseStoredValue(rawValue);
    return decodePlannerPersistenceState(parsed, dataset);
  }

  public saveProjects(
    projects: readonly PlannerProject[],
    activeProjectId: string | undefined,
    userDefaults: PlannerUserDefaults,
  ): void {
    this.saveStoredState(encodePlannerPersistenceState(projects, activeProjectId, userDefaults));
  }

  private saveStoredState(state: CoreStoredPlannerState): void {
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
