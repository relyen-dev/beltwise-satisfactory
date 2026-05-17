import type { GameDataset, ItemId, MachineId, RecipeId } from '@beltwise/game-data';
import {
  createPlannerSession,
  hydratePlannerProject,
  hydratePlannerUserDefaults,
  PLANNER_STORAGE_SCHEMA_VERSION,
  uniqueStrings,
  type ConveyorBeltTier,
  type GraphEdgeStyle,
  type GraphNodeBuildState,
  type ItemInputOverride,
  type MachineOverride,
  type PipelineTier,
  type PlanBuildState,
  type PlannerProject,
  type PlannerSession,
  type PlannerUserDefaults,
  type ProductTarget,
  type RateDecimalPlaces,
  type RecipeOverride,
  type ResourceOverride,
} from './plan';

export type PlannerStorageSchemaVersion = typeof PLANNER_STORAGE_SCHEMA_VERSION;

export interface LoadedPlannerState {
  schemaVersion: PlannerStorageSchemaVersion;
  activeSessionId?: string;
  activeProjectId?: string;
  sessions: PlannerSession[];
  projects: PlannerProject[];
  userDefaults: PlannerUserDefaults;
}

export interface StoredPlannerStateV1<Project = StoredPlannerProjectV1> {
  schemaVersion: 1;
  activeProjectId?: string;
  projects: Project[];
}

export interface StoredPlannerStateV2<
  Project = StoredPlannerProjectV1,
  Defaults = StoredPlannerUserDefaultsV2,
> {
  schemaVersion: 2;
  activeProjectId?: string;
  projects: Project[];
  userDefaults?: Defaults;
}

export interface StoredPlannerStateV3<
  Project = StoredPlannerProjectV1,
  Defaults = StoredPlannerUserDefaultsV2,
  Session = StoredPlannerSessionV3,
> {
  schemaVersion: 3;
  activeSessionId?: string;
  activeProjectId?: string;
  sessions: Session[];
  projects: Project[];
  userDefaults?: Defaults;
}

export type StoredPlannerState = StoredPlannerStateV3;

export interface StoredPlannerSessionV3 {
  id: string;
  name: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  projectIds: string[];
  activeProjectId?: string;
}

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

export interface StoredPlannerUserDefaultsV2 {
  recipeOverrides: Record<RecipeId, StoredRecipeOverrideV1>;
  machineOverrides: Record<MachineId, StoredMachineOverrideV1>;
  resourceOverrides: Record<ItemId, StoredResourceOverrideV1>;
  objectiveProfile: StoredObjectiveProfileV1;
  graphDisplay: StoredGraphDisplaySettingsV1;
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
  activeSessionId?: string;
  activeProjectId?: string;
  projects: unknown[];
  sessions?: unknown[];
  userDefaults?: unknown;
}

interface HydratableStoredPlannerState {
  schemaVersion: PlannerStorageSchemaVersion;
  activeSessionId?: string;
  activeProjectId?: string;
  sessions?: unknown[] | undefined;
  projects: unknown[];
  userDefaults?: unknown;
}

type PlannerStorageMigration = (
  state: RawVersionedStoredPlannerState,
) => HydratableStoredPlannerState | null;

const PLANNER_STORAGE_MIGRATIONS: Readonly<Record<number, PlannerStorageMigration>> = {
  1: migrateStoredPlannerStateV1ToCurrent,
  2: migrateStoredPlannerStateV2ToCurrent,
  3: migrateStoredPlannerStateV3ToCurrent,
};
const DEFAULT_SESSION_ID = 'session-default';
const DEFAULT_SESSION_NAME = 'Default session';

export function decodePlannerPersistenceState(
  value: unknown,
  dataset: GameDataset,
): LoadedPlannerState | null {
  const stored = migrateStoredPlannerState(value);
  if (!stored) {
    return null;
  }

  const projects = hydrateStoredProjects(stored.projects, dataset);
  const userDefaults = hydratePlannerUserDefaults(stored.userDefaults, dataset);
  const sessions = hydrateStoredSessions(
    stored.sessions,
    projects,
    dataset,
    stored.activeProjectId,
  );
  const activeSessionId = selectActiveSessionId(
    sessions,
    stored.activeSessionId,
    stored.activeProjectId,
  );
  const activeSession = sessions.find((session) => session.id === activeSessionId);

  const activeProjectId = selectActiveProjectId(activeSession, projects, stored.activeProjectId);

  return {
    schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
    ...(activeSessionId !== undefined ? { activeSessionId } : {}),
    ...(activeProjectId !== undefined ? { activeProjectId } : {}),
    sessions,
    projects,
    userDefaults,
  };
}

export function encodePlannerPersistenceState(
  projects: readonly PlannerProject[],
  activeProjectId: string | undefined,
  userDefaults: PlannerUserDefaults,
  sessions?: readonly PlannerSession[],
  activeSessionId?: string,
): StoredPlannerState {
  const storedProjects = projects.map(encodeStoredPlannerProject);
  const storedUserDefaults = toStoredPlannerUserDefaultsV2(userDefaults);
  const normalizedSessions = normalizeSessionsForStorage(projects, sessions, activeProjectId);
  const storedSessions = normalizedSessions.map(toStoredPlannerSessionV3);
  const normalizedActiveSessionId = selectActiveSessionId(
    normalizedSessions,
    activeSessionId,
    activeProjectId,
  );
  const normalizedActiveSession = normalizedSessions.find(
    (session) => session.id === normalizedActiveSessionId,
  );
  const normalizedActiveProjectId = selectActiveProjectId(
    normalizedActiveSession,
    projects,
    activeProjectId,
  );

  return {
    schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
    ...(normalizedActiveSessionId !== undefined
      ? { activeSessionId: normalizedActiveSessionId }
      : {}),
    ...(normalizedActiveProjectId !== undefined
      ? { activeProjectId: normalizedActiveProjectId }
      : {}),
    sessions: storedSessions,
    projects: storedProjects,
    userDefaults: storedUserDefaults,
  };
}

export function createStoredPlannerState(
  projects: readonly PlannerProject[],
  activeProjectId: string | undefined,
  userDefaults: PlannerUserDefaults,
  sessions?: readonly PlannerSession[],
  activeSessionId?: string,
): StoredPlannerState {
  return encodePlannerPersistenceState(
    projects,
    activeProjectId,
    userDefaults,
    sessions,
    activeSessionId,
  );
}

export function decodeStoredPlannerProject(
  project: unknown,
  dataset: GameDataset,
): PlannerProject | null {
  try {
    return hydratePlannerProject(project, dataset);
  } catch {
    return null;
  }
}

export function encodeStoredPlannerProject(project: PlannerProject): StoredPlannerProjectV1 {
  return toStoredPlannerProjectV1(project);
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
        userDefaults: undefined,
      }
    : {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: state.activeProjectId,
        projects: state.projects,
        userDefaults: undefined,
      };
}

function migrateStoredPlannerStateV2ToCurrent(
  state: RawVersionedStoredPlannerState,
): HydratableStoredPlannerState | null {
  if (state.schemaVersion !== 2) {
    return null;
  }

  return state.activeProjectId === undefined
    ? {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        projects: state.projects,
        userDefaults: state.userDefaults,
      }
    : {
        schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
        activeProjectId: state.activeProjectId,
        projects: state.projects,
        userDefaults: state.userDefaults,
      };
}

function migrateStoredPlannerStateV3ToCurrent(
  state: RawVersionedStoredPlannerState,
): HydratableStoredPlannerState | null {
  if (state.schemaVersion !== 3) {
    return null;
  }

  return {
    schemaVersion: PLANNER_STORAGE_SCHEMA_VERSION,
    ...(state.activeSessionId !== undefined ? { activeSessionId: state.activeSessionId } : {}),
    ...(state.activeProjectId !== undefined ? { activeProjectId: state.activeProjectId } : {}),
    projects: state.projects,
    ...(state.sessions !== undefined ? { sessions: state.sessions } : {}),
    userDefaults: state.userDefaults,
  };
}

function hydrateStoredProjects(projects: unknown[], dataset: GameDataset): PlannerProject[] {
  const hydratedProjects: PlannerProject[] = [];
  for (const project of projects) {
    const hydratedProject = decodeStoredPlannerProject(project, dataset);
    if (hydratedProject) {
      hydratedProjects.push(hydratedProject);
    }
  }
  return hydratedProjects;
}

function hydrateStoredSessions(
  storedSessions: unknown[] | undefined,
  projects: readonly PlannerProject[],
  dataset: GameDataset,
  storedActiveProjectId: string | undefined,
): PlannerSession[] {
  if (projects.length === 0) {
    return [];
  }

  const projectIds = new Set(projects.map((project) => project.id));
  const hydratedSessions = (storedSessions ?? [])
    .map((session) => decodeStoredPlannerSession(session, dataset, projectIds))
    .filter((session): session is PlannerSession => session !== null);

  return ensureAllProjectsBelongToSessions(
    hydratedSessions,
    projects,
    dataset,
    storedActiveProjectId,
  );
}

function decodeStoredPlannerSession(
  session: unknown,
  dataset: GameDataset,
  validProjectIds: ReadonlySet<string>,
): PlannerSession | null {
  if (!isRecord(session)) {
    return null;
  }

  const projectIds = readStringArray(session['projectIds']).filter((projectId) =>
    validProjectIds.has(projectId),
  );
  if (projectIds.length === 0) {
    return null;
  }

  const now = new Date().toISOString();
  const id = readString(session['id']);
  if (id === undefined) {
    return null;
  }
  const createdAt = readString(session['createdAt']) ?? now;
  const activeProjectId = readString(session['activeProjectId']) ?? projectIds[0];
  return createPlannerSession({
    id,
    name: readString(session['name']) ?? 'Restored session',
    datasetId: readString(session['datasetId']) ?? dataset.id,
    createdAt,
    updatedAt: readString(session['updatedAt']) ?? createdAt,
    projectIds,
    ...(activeProjectId !== undefined ? { activeProjectId } : {}),
  });
}

function ensureAllProjectsBelongToSessions(
  sessions: readonly PlannerSession[],
  projects: readonly PlannerProject[],
  dataset: GameDataset,
  storedActiveProjectId: string | undefined,
): PlannerSession[] {
  if (sessions.length === 0) {
    return createDefaultSessionForProjects(projects, dataset.id, storedActiveProjectId);
  }

  const assignedProjectIds = new Set(sessions.flatMap((session) => session.projectIds));
  const orphanProjectIds = projects
    .map((project) => project.id)
    .filter((projectId) => !assignedProjectIds.has(projectId));
  if (orphanProjectIds.length === 0) {
    return sessions.map(copyPlannerSession);
  }

  const targetSessionIndex = Math.max(
    0,
    sessions.findIndex(
      (session) =>
        storedActiveProjectId !== undefined && session.projectIds.includes(storedActiveProjectId),
    ),
  );
  const orphanUpdatedAt = latestProjectUpdatedAt(projects, orphanProjectIds);
  return sessions.map((session, index) => {
    if (index !== targetSessionIndex) {
      return copyPlannerSession(session);
    }
    const projectIds = uniqueStrings([...session.projectIds, ...orphanProjectIds]);
    const activeProjectId =
      storedActiveProjectId !== undefined && projectIds.includes(storedActiveProjectId)
        ? storedActiveProjectId
        : session.activeProjectId;
    return {
      ...session,
      projectIds,
      ...(activeProjectId !== undefined ? { activeProjectId } : {}),
      updatedAt: laterIsoTimestamp(session.updatedAt, orphanUpdatedAt),
    };
  });
}

function readVersionedStoredPlannerState(value: unknown): RawVersionedStoredPlannerState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const schemaVersion = record['schemaVersion'];
  const activeSessionId = record['activeSessionId'];
  const activeProjectId = record['activeProjectId'];
  const projects = record['projects'];
  const sessions = record['sessions'];
  const userDefaults = record['userDefaults'];
  if (
    typeof schemaVersion !== 'number' ||
    !Number.isInteger(schemaVersion) ||
    (activeSessionId !== undefined && typeof activeSessionId !== 'string') ||
    (activeProjectId !== undefined && typeof activeProjectId !== 'string') ||
    !Array.isArray(projects) ||
    (sessions !== undefined && !Array.isArray(sessions))
  ) {
    return null;
  }

  return {
    schemaVersion,
    ...(activeSessionId !== undefined ? { activeSessionId } : {}),
    ...(activeProjectId !== undefined ? { activeProjectId } : {}),
    projects,
    ...(sessions !== undefined ? { sessions } : {}),
    userDefaults,
  };
}

function normalizeSessionsForStorage(
  projects: readonly PlannerProject[],
  sessions: readonly PlannerSession[] | undefined,
  activeProjectId: string | undefined,
): PlannerSession[] {
  if (projects.length === 0) {
    return [];
  }

  const validProjectIds = new Set(projects.map((project) => project.id));
  const normalizedSessions = (sessions ?? [])
    .map((session) => normalizeSessionForStorage(session, validProjectIds))
    .filter((session): session is PlannerSession => session !== null);

  if (normalizedSessions.length === 0) {
    const firstProject = projects[0];
    if (firstProject === undefined) {
      return [];
    }
    return createDefaultSessionForProjects(projects, firstProject.datasetId, activeProjectId);
  }

  const assignedProjectIds = new Set(normalizedSessions.flatMap((session) => session.projectIds));
  const orphanProjectIds = projects
    .map((project) => project.id)
    .filter((projectId) => !assignedProjectIds.has(projectId));
  if (orphanProjectIds.length === 0) {
    return normalizedSessions;
  }

  const targetSessionIndex = Math.max(
    0,
    normalizedSessions.findIndex(
      (session) => activeProjectId !== undefined && session.projectIds.includes(activeProjectId),
    ),
  );
  const orphanUpdatedAt = latestProjectUpdatedAt(projects, orphanProjectIds);
  return normalizedSessions.map((session, index) =>
    index === targetSessionIndex
      ? {
          ...session,
          projectIds: uniqueStrings([...session.projectIds, ...orphanProjectIds]),
          updatedAt: laterIsoTimestamp(session.updatedAt, orphanUpdatedAt),
        }
      : session,
  );
}

function normalizeSessionForStorage(
  session: PlannerSession,
  validProjectIds: ReadonlySet<string>,
): PlannerSession | null {
  const projectIds = uniqueStrings(session.projectIds).filter((projectId) =>
    validProjectIds.has(projectId),
  );
  if (projectIds.length === 0) {
    return null;
  }
  const activeProjectId =
    session.activeProjectId !== undefined && projectIds.includes(session.activeProjectId)
      ? session.activeProjectId
      : projectIds[0];

  return {
    id: session.id,
    name: session.name,
    datasetId: session.datasetId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    projectIds,
    ...(activeProjectId !== undefined ? { activeProjectId } : {}),
  };
}

function createDefaultSessionForProjects(
  projects: readonly PlannerProject[],
  datasetId: string,
  activeProjectId: string | undefined,
): PlannerSession[] {
  if (projects.length === 0) {
    return [];
  }

  const projectIds = projects.map((project) => project.id);
  const activeId =
    activeProjectId !== undefined && projectIds.includes(activeProjectId)
      ? activeProjectId
      : projectIds[0];
  const createdAt = earliestProjectCreatedAt(projects);
  const session = createPlannerSession({
    id: DEFAULT_SESSION_ID,
    name: DEFAULT_SESSION_NAME,
    datasetId,
    projectIds,
    ...(activeId !== undefined ? { activeProjectId: activeId } : {}),
    now: createdAt,
  });
  return [
    {
      ...session,
      updatedAt: latestProjectUpdatedAt(projects, projectIds),
    },
  ];
}

function selectActiveSessionId(
  sessions: readonly PlannerSession[],
  activeSessionId: string | undefined,
  activeProjectId: string | undefined,
): string | undefined {
  if (sessions.some((session) => session.id === activeSessionId)) {
    return activeSessionId;
  }
  const sessionForActiveProject = sessions.find(
    (session) => activeProjectId !== undefined && session.projectIds.includes(activeProjectId),
  );
  return sessionForActiveProject?.id ?? sessions[0]?.id;
}

function selectActiveProjectId(
  activeSession: PlannerSession | undefined,
  projects: readonly PlannerProject[],
  activeProjectId: string | undefined,
): string | undefined {
  if (!activeSession) {
    return projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : projects[0]?.id;
  }

  if (activeProjectId !== undefined && activeSession.projectIds.includes(activeProjectId)) {
    return activeProjectId;
  }
  if (
    activeSession.activeProjectId !== undefined &&
    activeSession.projectIds.includes(activeSession.activeProjectId)
  ) {
    return activeSession.activeProjectId;
  }
  return activeSession.projectIds[0];
}

function copyPlannerSession(session: PlannerSession): PlannerSession {
  return {
    ...session,
    projectIds: [...session.projectIds],
  };
}

function toStoredPlannerSessionV3(session: PlannerSession): StoredPlannerSessionV3 {
  return {
    id: session.id,
    name: session.name,
    datasetId: session.datasetId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    projectIds: [...session.projectIds],
    ...(session.activeProjectId !== undefined ? { activeProjectId: session.activeProjectId } : {}),
  };
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

function toStoredPlannerUserDefaultsV2(
  userDefaults: PlannerUserDefaults,
): StoredPlannerUserDefaultsV2 {
  return {
    recipeOverrides: toStoredRecipeOverridesV1(userDefaults.recipeOverrides),
    machineOverrides: toStoredMachineOverridesV1(userDefaults.machineOverrides),
    resourceOverrides: toStoredResourceOverridesV1(userDefaults.resourceOverrides),
    objectiveProfile: toStoredObjectiveProfileV1(userDefaults.objectiveProfile),
    graphDisplay: {
      maxBeltTier: userDefaults.graphDisplay.maxBeltTier,
      maxPipeTier: userDefaults.graphDisplay.maxPipeTier,
      rateDecimalPlaces: userDefaults.graphDisplay.rateDecimalPlaces,
      edgeStyle: userDefaults.graphDisplay.edgeStyle,
      showTransportLabels: userDefaults.graphDisplay.showTransportLabels,
      animateFlowLines: userDefaults.graphDisplay.animateFlowLines,
    },
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

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(
    value.filter((item): item is string => typeof item === 'string' && item.length > 0),
  );
}

function earliestProjectCreatedAt(projects: readonly PlannerProject[]): string {
  return projects.reduce(
    (earliest, project) => (project.createdAt < earliest ? project.createdAt : earliest),
    projects[0]?.createdAt ?? new Date().toISOString(),
  );
}

function latestProjectUpdatedAt(
  projects: readonly PlannerProject[],
  projectIds: readonly string[],
): string {
  const targetProjectIds = new Set(projectIds);
  return projects
    .filter((project) => targetProjectIds.has(project.id))
    .reduce(
      (latest, project) => laterIsoTimestamp(latest, project.updatedAt),
      projects[0]?.updatedAt ?? new Date().toISOString(),
    );
}

function laterIsoTimestamp(left: string, right: string): string {
  return left >= right ? left : right;
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
