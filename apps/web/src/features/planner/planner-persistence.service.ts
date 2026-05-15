import { Injectable, InjectionToken, inject } from '@angular/core';
import type { GameDataset, ItemId, MachineId, RecipeId } from '@beltwise/game-data';
import type {
  ConveyorBeltTier,
  GraphEdgeStyle,
  GraphNodeBuildState,
  ItemInputOverride,
  MachineOverride,
  PipelineTier,
  PlanBuildState,
  PlannerProject,
  ProductTarget,
  RateDecimalPlaces,
  RecipeOverride,
  ResourceOverride,
} from '@beltwise/planner-core';
import { hydratePlannerProject, PLANNER_STORAGE_SCHEMA_VERSION } from '@beltwise/planner-core';

export type PlannerStorageSchemaVersion = typeof PLANNER_STORAGE_SCHEMA_VERSION;

export interface LoadedPlannerState {
  schemaVersion: PlannerStorageSchemaVersion;
  activeProjectId?: string;
  projects: PlannerProject[];
}

export interface StoredPlannerStateV1<Project = StoredPlannerProjectV1> {
  schemaVersion: 1;
  activeProjectId?: string;
  projects: Project[];
}

export type StoredPlannerState = StoredPlannerStateV1;

export interface StoredPlannerProjectV1 {
  id: string;
  name: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  targets: StoredProductTargetV1[];
  recipeOverrides: Record<RecipeId, StoredRecipeOverrideV1>;
  machineOverrides: Record<MachineId, StoredMachineOverrideV1>;
  resourceOverrides: Record<ItemId, StoredResourceOverrideV1>;
  itemInputs: Record<ItemId, StoredItemInputOverrideV1>;
  objectiveProfile: StoredObjectiveProfileV1;
  graphLayout: StoredGraphLayoutStateV1;
  graphDisplay: StoredGraphDisplaySettingsV1;
  buildState: StoredPlanBuildStateV1;
}

export interface StoredProductTargetV1 {
  id: string;
  itemId: ItemId;
  mode: ProductTarget['mode'];
  amountPerMinute?: number;
  sortOrder: number;
}

export interface StoredRecipeOverrideV1 {
  enabled: boolean;
}

export interface StoredMachineOverrideV1 {
  enabled: boolean;
}

export interface StoredResourceOverrideV1 {
  enabled?: boolean;
  maxPerMinute?: number;
}

export interface StoredItemInputOverrideV1 {
  amountPerMinute: number;
}

export interface StoredObjectiveProfileV1 {
  resourceScarcityWeight: number;
  powerWeight: number;
  machineCountWeight: number;
  surplusWeight: number;
  rawResourceMultipliers: Record<ItemId, number>;
}

export interface StoredGraphLayoutStateV1 {
  nodePositions: Record<string, StoredPointV1>;
}

export interface StoredPointV1 {
  x: number;
  y: number;
}

export interface StoredGraphDisplaySettingsV1 {
  maxBeltTier: ConveyorBeltTier;
  maxPipeTier: PipelineTier;
  rateDecimalPlaces: RateDecimalPlaces;
  edgeStyle: GraphEdgeStyle;
  showTransportLabels: boolean;
  animateFlowLines: boolean;
}

export interface StoredPlanBuildStateV1 {
  planLocked: boolean;
  nodeLayoutLocked: boolean;
  nodeStates: Record<string, StoredGraphNodeBuildStateV1>;
}

export interface StoredGraphNodeBuildStateV1 {
  done?: boolean;
  note?: string;
}

interface RawVersionedStoredPlannerState {
  schemaVersion: number;
  activeProjectId?: string;
  projects: unknown[];
}

type HydratableStoredPlannerState = StoredPlannerStateV1<unknown>;
type PlannerStorageMigration = (
  state: RawVersionedStoredPlannerState,
) => HydratableStoredPlannerState | null;

const STORAGE_KEY = 'beltwise.workspace.v1';
const PLANNER_STORAGE_MIGRATIONS: Readonly<Record<number, PlannerStorageMigration>> = {
  1: migrateStoredPlannerStateV1ToCurrent,
};

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

  public load(dataset: GameDataset): LoadedPlannerState | null {
    const rawValue = readStoredValue(this.storage);
    if (!rawValue) {
      return null;
    }

    const parsed = parseStoredValue(rawValue);
    const stored = migrateStoredPlannerState(parsed);
    if (!stored) {
      return null;
    }

    const projects = hydrateStoredProjects(stored.projects, dataset);
    if (projects.length === 0) {
      return null;
    }

    const activeProjectId = projects.some((project) => project.id === stored.activeProjectId)
      ? stored.activeProjectId
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

export function createStoredPlannerState(
  projects: readonly PlannerProject[],
  activeProjectId: string | undefined,
): StoredPlannerState {
  const storedProjects = projects.map(toStoredPlannerProjectV1);
  return activeProjectId === undefined
    ? {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        projects: storedProjects,
      }
    : {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId,
        projects: storedProjects,
      };
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

function migrateStoredPlannerState(value: unknown): HydratableStoredPlannerState | null {
  const versionedState = readVersionedStoredPlannerState(value);
  if (!versionedState || versionedState.schemaVersion > PLANNER_STORAGE_SCHEMA_VERSION) {
    return null;
  }

  const migrate = PLANNER_STORAGE_MIGRATIONS[versionedState.schemaVersion];
  return migrate ? migrate(versionedState) : null;
}

function migrateStoredPlannerStateV1ToCurrent(
  state: RawVersionedStoredPlannerState,
): HydratableStoredPlannerState | null {
  if (state.schemaVersion !== 1) {
    return null;
  }

  return state.activeProjectId === undefined
    ? {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        projects: state.projects,
      }
    : {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: state.activeProjectId,
        projects: state.projects,
      };
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

function readVersionedStoredPlannerState(value: unknown): RawVersionedStoredPlannerState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const schemaVersion = record['schemaVersion'];
  const activeProjectId = record['activeProjectId'];
  const projects = record['projects'];
  if (
    typeof schemaVersion !== 'number' ||
    !Number.isInteger(schemaVersion) ||
    (activeProjectId !== undefined && typeof activeProjectId !== 'string') ||
    !Array.isArray(projects)
  ) {
    return null;
  }

  return activeProjectId === undefined
    ? { schemaVersion, projects }
    : { schemaVersion, activeProjectId, projects };
}

function toStoredPlannerProjectV1(project: PlannerProject): StoredPlannerProjectV1 {
  return {
    id: project.id,
    name: project.name,
    datasetId: project.datasetId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    targets: project.targets.map(toStoredProductTargetV1),
    recipeOverrides: toStoredRecipeOverridesV1(project.recipeOverrides),
    machineOverrides: toStoredMachineOverridesV1(project.machineOverrides),
    resourceOverrides: toStoredResourceOverridesV1(project.resourceOverrides),
    itemInputs: toStoredItemInputsV1(project.itemInputs),
    objectiveProfile: toStoredObjectiveProfileV1(project.objectiveProfile),
    graphLayout: toStoredGraphLayoutStateV1(project.graphLayout),
    graphDisplay: {
      maxBeltTier: project.graphDisplay.maxBeltTier,
      maxPipeTier: project.graphDisplay.maxPipeTier,
      rateDecimalPlaces: project.graphDisplay.rateDecimalPlaces,
      edgeStyle: project.graphDisplay.edgeStyle,
      showTransportLabels: project.graphDisplay.showTransportLabels,
      animateFlowLines: project.graphDisplay.animateFlowLines,
    },
    buildState: toStoredPlanBuildStateV1(project.buildState),
  };
}

function toStoredProductTargetV1(target: ProductTarget): StoredProductTargetV1 {
  return target.amountPerMinute === undefined
    ? {
        id: target.id,
        itemId: target.itemId,
        mode: target.mode,
        sortOrder: target.sortOrder,
      }
    : {
        id: target.id,
        itemId: target.itemId,
        mode: target.mode,
        amountPerMinute: target.amountPerMinute,
        sortOrder: target.sortOrder,
      };
}

function toStoredRecipeOverridesV1(
  recipeOverrides: Record<RecipeId, RecipeOverride>,
): Record<RecipeId, StoredRecipeOverrideV1> {
  const stored: Record<RecipeId, StoredRecipeOverrideV1> = {};
  for (const [recipeId, override] of Object.entries(recipeOverrides)) {
    stored[recipeId] = { enabled: override.enabled };
  }
  return stored;
}

function toStoredMachineOverridesV1(
  machineOverrides: Record<MachineId, MachineOverride>,
): Record<MachineId, StoredMachineOverrideV1> {
  const stored: Record<MachineId, StoredMachineOverrideV1> = {};
  for (const [machineId, override] of Object.entries(machineOverrides)) {
    stored[machineId] = { enabled: override.enabled };
  }
  return stored;
}

function toStoredResourceOverridesV1(
  resourceOverrides: Record<ItemId, ResourceOverride>,
): Record<ItemId, StoredResourceOverrideV1> {
  const stored: Record<ItemId, StoredResourceOverrideV1> = {};
  for (const [itemId, override] of Object.entries(resourceOverrides)) {
    const storedOverride: StoredResourceOverrideV1 = {};
    if (override.enabled !== undefined) {
      storedOverride.enabled = override.enabled;
    }
    if (override.maxPerMinute !== undefined) {
      storedOverride.maxPerMinute = override.maxPerMinute;
    }
    stored[itemId] = storedOverride;
  }
  return stored;
}

function toStoredItemInputsV1(
  itemInputs: Record<ItemId, ItemInputOverride>,
): Record<ItemId, StoredItemInputOverrideV1> {
  const stored: Record<ItemId, StoredItemInputOverrideV1> = {};
  for (const [itemId, input] of Object.entries(itemInputs)) {
    stored[itemId] = { amountPerMinute: input.amountPerMinute };
  }
  return stored;
}

function toStoredObjectiveProfileV1(
  objectiveProfile: PlannerProject['objectiveProfile'],
): StoredObjectiveProfileV1 {
  const rawResourceMultipliers: Record<ItemId, number> = {};
  for (const [itemId, multiplier] of Object.entries(objectiveProfile.rawResourceMultipliers)) {
    rawResourceMultipliers[itemId] = multiplier;
  }

  return {
    resourceScarcityWeight: objectiveProfile.resourceScarcityWeight,
    powerWeight: objectiveProfile.powerWeight,
    machineCountWeight: objectiveProfile.machineCountWeight,
    surplusWeight: objectiveProfile.surplusWeight,
    rawResourceMultipliers,
  };
}

function toStoredGraphLayoutStateV1(
  graphLayout: PlannerProject['graphLayout'],
): StoredGraphLayoutStateV1 {
  const nodePositions: Record<string, StoredPointV1> = {};
  for (const [nodeId, position] of Object.entries(graphLayout.nodePositions)) {
    nodePositions[nodeId] = { x: position.x, y: position.y };
  }
  return { nodePositions };
}

function toStoredPlanBuildStateV1(buildState: PlanBuildState): StoredPlanBuildStateV1 {
  return {
    planLocked: buildState.planLocked,
    nodeLayoutLocked: buildState.nodeLayoutLocked,
    nodeStates: toStoredGraphNodeBuildStatesV1(buildState.nodeStates),
  };
}

function toStoredGraphNodeBuildStatesV1(
  nodeStates: Record<string, GraphNodeBuildState>,
): Record<string, StoredGraphNodeBuildStateV1> {
  const stored: Record<string, StoredGraphNodeBuildStateV1> = {};
  for (const [nodeId, nodeState] of Object.entries(nodeStates)) {
    const storedNodeState: StoredGraphNodeBuildStateV1 = {};
    if (nodeState.done !== undefined) {
      storedNodeState.done = nodeState.done;
    }
    if (nodeState.note !== undefined) {
      storedNodeState.note = nodeState.note;
    }
    stored[nodeId] = storedNodeState;
  }
  return stored;
}
