import type { GameDataset, ItemId, MachineId, RecipeId } from '@beltwise/game-data';
import type { Point } from './model';

export interface PlannerWorkspace {
  schemaVersion: number;
  activeSessionId?: string;
  activeProjectId?: string;
  sessions: PlannerSession[];
  projects: PlannerProjectSummary[];
}

export interface PlannerSession {
  id: string;
  name: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  projectIds: string[];
  activeProjectId?: string;
}

export interface PlannerProjectSummary {
  id: string;
  name: string;
  datasetId: string;
  updatedAt: string;
}

export interface PlannerProject {
  id: string;
  name: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  targets: ProductTarget[];
  recipeOverrides: Record<RecipeId, RecipeOverride>;
  machineOverrides: Record<MachineId, MachineOverride>;
  resourceOverrides: Record<ItemId, ResourceOverride>;
  itemInputs: Record<ItemId, ItemInputOverride>;
  objectiveProfile: ObjectiveProfile;
  graphLayout: GraphLayoutState;
  graphDisplay: GraphDisplaySettings;
  buildState: PlanBuildState;
}

export interface PlannerUserDefaults {
  recipeOverrides: Record<RecipeId, RecipeOverride>;
  machineOverrides: Record<MachineId, MachineOverride>;
  resourceOverrides: Record<ItemId, ResourceOverride>;
  objectiveProfile: ObjectiveProfile;
  graphDisplay: GraphDisplaySettings;
}

export interface ProductTarget {
  id: string;
  /** Empty string represents a draft target row before the user selects an item. */
  itemId: ItemId;
  mode: 'fixed' | 'maximize';
  amountPerMinute?: number;
  sortOrder: number;
}

export interface RecipeOverride {
  enabled: boolean;
}

export interface MachineOverride {
  enabled: boolean;
}

export interface ResourceOverride {
  enabled?: boolean;
  maxPerMinute?: number;
}

export interface ItemInputOverride {
  amountPerMinute: number;
}

export interface ObjectiveProfile {
  resourceScarcityWeight: number;
  powerWeight: number;
  machineCountWeight: number;
  surplusWeight: number;
  rawResourceMultipliers: Record<ItemId, number>;
}

export interface GraphLayoutState {
  nodePositions: Record<string, Point>;
}

export type ConveyorBeltTier = 1 | 2 | 3 | 4 | 5 | 6;
export type PipelineTier = 1 | 2;
export type RateDecimalPlaces = 1 | 2 | 3 | 4;
export type GraphEdgeStyle = 'straight' | 'curved';

export interface GraphDisplaySettings {
  maxBeltTier: ConveyorBeltTier;
  maxPipeTier: PipelineTier;
  rateDecimalPlaces: RateDecimalPlaces;
  edgeStyle: GraphEdgeStyle;
  showTransportLabels: boolean;
  animateFlowLines: boolean;
}

export interface PlanBuildState {
  planLocked: boolean;
  nodeLayoutLocked: boolean;
  nodeStates: Record<string, GraphNodeBuildState>;
}

export interface GraphNodeBuildState {
  done?: boolean;
  note?: string;
}

export interface PlannerProjectCreateOptions {
  id?: string;
  name: string;
  dataset: GameDataset;
  targets?: ProductTarget[];
  userDefaults?: PlannerUserDefaults;
  now?: string;
}

export interface PlannerSessionCreateOptions {
  id?: string;
  name: string;
  datasetId: string;
  projectIds?: readonly string[];
  activeProjectId?: string;
  createdAt?: string;
  updatedAt?: string;
  now?: string;
}

export const PLANNER_STORAGE_SCHEMA_VERSION = 3;
const CONVERTER_MACHINE_ID: MachineId = 'Build_Converter_C';

export function createDefaultGraphDisplaySettings(): GraphDisplaySettings {
  return {
    maxBeltTier: 6,
    maxPipeTier: 2,
    rateDecimalPlaces: 3,
    edgeStyle: 'straight',
    showTransportLabels: true,
    animateFlowLines: true,
  };
}

export function createDefaultObjectiveProfile(): ObjectiveProfile {
  return {
    resourceScarcityWeight: 1,
    powerWeight: 0.15,
    machineCountWeight: 0.25,
    surplusWeight: 0.5,
    rawResourceMultipliers: {},
  };
}

export function createDefaultRecipeOverrides(
  dataset: GameDataset,
): Record<RecipeId, RecipeOverride> {
  return Object.values(dataset.recipes).reduce<Record<RecipeId, RecipeOverride>>(
    (overrides, recipe) => {
      if (recipe.isAlternate || isConverterResourceRecipe(dataset, recipe)) {
        overrides[recipe.id] = { enabled: false };
      }
      return overrides;
    },
    {},
  );
}

export function createDefaultUserDefaults(dataset: GameDataset): PlannerUserDefaults {
  return {
    recipeOverrides: createDefaultRecipeOverrides(dataset),
    machineOverrides: {},
    resourceOverrides: {},
    objectiveProfile: createDefaultObjectiveProfile(),
    graphDisplay: createDefaultGraphDisplaySettings(),
  };
}

export function createUserDefaultsFromProject(project: PlannerProject): PlannerUserDefaults {
  return {
    recipeOverrides: copyRecipeOverrides(project.recipeOverrides),
    machineOverrides: copyMachineOverrides(project.machineOverrides),
    resourceOverrides: copyResourceOverrides(project.resourceOverrides),
    objectiveProfile: copyObjectiveProfile(project.objectiveProfile),
    graphDisplay: { ...project.graphDisplay },
  };
}

export function createPlannerProject(options: PlannerProjectCreateOptions): PlannerProject {
  const now = options.now ?? new Date().toISOString();
  const userDefaults = mergeUserDefaults(
    createDefaultUserDefaults(options.dataset),
    options.userDefaults,
  );

  return {
    id: options.id ?? createStableId('project'),
    name: options.name,
    datasetId: options.dataset.id,
    createdAt: now,
    updatedAt: now,
    targets: options.targets ?? [],
    recipeOverrides: copyRecipeOverrides(userDefaults.recipeOverrides),
    machineOverrides: copyMachineOverrides(userDefaults.machineOverrides),
    resourceOverrides: copyResourceOverrides(userDefaults.resourceOverrides),
    itemInputs: {},
    objectiveProfile: copyObjectiveProfile(userDefaults.objectiveProfile),
    graphLayout: { nodePositions: {} },
    graphDisplay: { ...userDefaults.graphDisplay },
    buildState: { planLocked: false, nodeLayoutLocked: false, nodeStates: {} },
  };
}

export function createPlannerSession(options: PlannerSessionCreateOptions): PlannerSession {
  const createdAt = options.createdAt ?? options.now ?? new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  const projectIds = uniqueStrings(options.projectIds ?? []);
  const activeProjectId =
    options.activeProjectId !== undefined && projectIds.includes(options.activeProjectId)
      ? options.activeProjectId
      : projectIds[0];

  return {
    id: options.id ?? createStableId('session'),
    name: options.name,
    datasetId: options.datasetId,
    createdAt,
    updatedAt,
    projectIds,
    ...(activeProjectId !== undefined ? { activeProjectId } : {}),
  };
}

export function hydratePlannerProject(value: unknown, dataset: GameDataset): PlannerProject | null {
  if (!isRecord(value)) {
    return null;
  }

  const now = new Date().toISOString();
  const id = readString(value['id']) ?? createStableId('project');
  const name = readString(value['name']) ?? 'Restored factory';
  const createdAt = readString(value['createdAt']) ?? now;
  const updatedAt = readString(value['updatedAt']) ?? createdAt;
  const defaults = createPlannerProject({
    id,
    name,
    dataset,
    now: createdAt,
  });

  return {
    ...defaults,
    datasetId: readString(value['datasetId']) ?? dataset.id,
    createdAt,
    updatedAt,
    targets: readProductTargets(value['targets']),
    recipeOverrides: {
      ...createLegacyProjectHydrationRecipeOverrides(dataset),
      ...readRecipeOverrides(value['recipeOverrides']),
    },
    machineOverrides: readMachineOverrides(value['machineOverrides']),
    resourceOverrides: readResourceOverrides(value['resourceOverrides']),
    itemInputs: readItemInputs(value['itemInputs']),
    objectiveProfile: hydrateObjectiveProfile(value['objectiveProfile']),
    graphLayout: hydrateGraphLayout(value['graphLayout']),
    graphDisplay: hydrateGraphDisplaySettings(value['graphDisplay']),
    buildState: hydrateBuildState(value['buildState']),
  };
}

export function hydratePlannerUserDefaults(
  value: unknown,
  dataset: GameDataset,
): PlannerUserDefaults {
  const defaults = createDefaultUserDefaults(dataset);
  if (!isRecord(value)) {
    return defaults;
  }

  return mergeUserDefaults(defaults, {
    recipeOverrides: readRecipeOverrides(value['recipeOverrides']),
    machineOverrides: readMachineOverrides(value['machineOverrides']),
    resourceOverrides: readResourceOverrides(value['resourceOverrides']),
    objectiveProfile: hydrateObjectiveProfile(value['objectiveProfile']),
    graphDisplay: hydrateGraphDisplaySettings(value['graphDisplay']),
  });
}

export function summarizeProject(project: PlannerProject): PlannerProjectSummary {
  return {
    id: project.id,
    name: project.name,
    datasetId: project.datasetId,
    updatedAt: project.updatedAt,
  };
}

export function createStableId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readProductTargets(value: unknown): ProductTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const targets: ProductTarget[] = [];
  for (const [index, target] of value.entries()) {
    if (!isRecord(target)) {
      continue;
    }

    const itemId = readTargetItemId(target['itemId']);
    const mode = target['mode'];
    if (itemId === undefined || (mode !== 'fixed' && mode !== 'maximize')) {
      continue;
    }

    const baseTarget = {
      id: readString(target['id']) ?? createStableId('target'),
      itemId,
      mode,
      sortOrder: readFiniteNumber(target['sortOrder']) ?? index,
    };

    if (mode === 'fixed') {
      targets.push({
        ...baseTarget,
        mode,
        amountPerMinute: Math.max(0, readFiniteNumber(target['amountPerMinute']) ?? 0),
      });
      continue;
    }

    targets.push({
      ...baseTarget,
      mode,
    });
  }
  return targets;
}

function readTargetItemId(value: unknown): ItemId | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readRecipeOverrides(value: unknown): Record<RecipeId, RecipeOverride> {
  const overrides: Record<RecipeId, RecipeOverride> = {};
  if (!isRecord(value)) {
    return overrides;
  }

  for (const [recipeId, override] of Object.entries(value)) {
    if (!isRecord(override) || typeof override['enabled'] !== 'boolean') {
      continue;
    }
    overrides[recipeId] = { enabled: override['enabled'] };
  }
  return overrides;
}

function createLegacyProjectHydrationRecipeOverrides(
  dataset: GameDataset,
): Record<RecipeId, RecipeOverride> {
  return Object.values(dataset.recipes).reduce<Record<RecipeId, RecipeOverride>>(
    (overrides, recipe) => {
      if (recipe.isAlternate) {
        overrides[recipe.id] = { enabled: false };
      }
      return overrides;
    },
    {},
  );
}

function isConverterResourceRecipe(
  dataset: GameDataset,
  recipe: GameDataset['recipes'][string],
): boolean {
  return (
    !recipe.isAlternate &&
    recipe.producedIn.includes(CONVERTER_MACHINE_ID) &&
    recipe.products.length > 0 &&
    recipe.products.every((product) => dataset.resources[product.itemId] !== undefined)
  );
}

function mergeUserDefaults(
  defaults: PlannerUserDefaults,
  overrides: PlannerUserDefaults | undefined,
): PlannerUserDefaults {
  if (!overrides) {
    return {
      recipeOverrides: copyRecipeOverrides(defaults.recipeOverrides),
      machineOverrides: copyMachineOverrides(defaults.machineOverrides),
      resourceOverrides: copyResourceOverrides(defaults.resourceOverrides),
      objectiveProfile: copyObjectiveProfile(defaults.objectiveProfile),
      graphDisplay: { ...defaults.graphDisplay },
    };
  }

  return {
    recipeOverrides: {
      ...copyRecipeOverrides(defaults.recipeOverrides),
      ...copyRecipeOverrides(overrides.recipeOverrides),
    },
    machineOverrides: {
      ...copyMachineOverrides(defaults.machineOverrides),
      ...copyMachineOverrides(overrides.machineOverrides),
    },
    resourceOverrides: {
      ...copyResourceOverrides(defaults.resourceOverrides),
      ...copyResourceOverrides(overrides.resourceOverrides),
    },
    objectiveProfile: copyObjectiveProfile(overrides.objectiveProfile),
    graphDisplay: { ...defaults.graphDisplay, ...overrides.graphDisplay },
  };
}

function copyRecipeOverrides(
  recipeOverrides: Record<RecipeId, RecipeOverride>,
): Record<RecipeId, RecipeOverride> {
  const copy: Record<RecipeId, RecipeOverride> = {};
  for (const [recipeId, override] of Object.entries(recipeOverrides)) {
    copy[recipeId] = { enabled: override.enabled };
  }
  return copy;
}

function copyMachineOverrides(
  machineOverrides: Record<MachineId, MachineOverride>,
): Record<MachineId, MachineOverride> {
  const copy: Record<MachineId, MachineOverride> = {};
  for (const [machineId, override] of Object.entries(machineOverrides)) {
    copy[machineId] = { enabled: override.enabled };
  }
  return copy;
}

function copyResourceOverrides(
  resourceOverrides: Record<ItemId, ResourceOverride>,
): Record<ItemId, ResourceOverride> {
  const copy: Record<ItemId, ResourceOverride> = {};
  for (const [itemId, override] of Object.entries(resourceOverrides)) {
    copy[itemId] = {
      ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
      ...(override.maxPerMinute !== undefined ? { maxPerMinute: override.maxPerMinute } : {}),
    };
  }
  return copy;
}

function copyObjectiveProfile(objectiveProfile: ObjectiveProfile): ObjectiveProfile {
  return {
    resourceScarcityWeight: objectiveProfile.resourceScarcityWeight,
    powerWeight: objectiveProfile.powerWeight,
    machineCountWeight: objectiveProfile.machineCountWeight,
    surplusWeight: objectiveProfile.surplusWeight,
    rawResourceMultipliers: { ...objectiveProfile.rawResourceMultipliers },
  };
}

function readMachineOverrides(value: unknown): Record<MachineId, MachineOverride> {
  const overrides: Record<MachineId, MachineOverride> = {};
  if (!isRecord(value)) {
    return overrides;
  }

  for (const [machineId, override] of Object.entries(value)) {
    if (!isRecord(override) || typeof override['enabled'] !== 'boolean') {
      continue;
    }
    overrides[machineId] = { enabled: override['enabled'] };
  }
  return overrides;
}

function readResourceOverrides(value: unknown): Record<ItemId, ResourceOverride> {
  const overrides: Record<ItemId, ResourceOverride> = {};
  if (!isRecord(value)) {
    return overrides;
  }

  for (const [itemId, override] of Object.entries(value)) {
    if (!isRecord(override)) {
      continue;
    }
    const enabled = typeof override['enabled'] === 'boolean' ? override['enabled'] : undefined;
    const maxPerMinute = readFiniteNumber(override['maxPerMinute']);
    if (enabled === undefined && maxPerMinute === undefined) {
      continue;
    }
    overrides[itemId] = {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(maxPerMinute !== undefined ? { maxPerMinute: Math.max(0, maxPerMinute) } : {}),
    };
  }
  return overrides;
}

function readItemInputs(value: unknown): Record<ItemId, ItemInputOverride> {
  const inputs: Record<ItemId, ItemInputOverride> = {};
  if (!isRecord(value)) {
    return inputs;
  }

  for (const [itemId, input] of Object.entries(value)) {
    if (!isRecord(input)) {
      continue;
    }
    const amountPerMinute = readFiniteNumber(input['amountPerMinute']);
    if (amountPerMinute === undefined) {
      continue;
    }
    inputs[itemId] = { amountPerMinute: Math.max(0, amountPerMinute) };
  }
  return inputs;
}

function hydrateObjectiveProfile(value: unknown): ObjectiveProfile {
  const defaults = createDefaultObjectiveProfile();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    resourceScarcityWeight:
      readFiniteNumber(value['resourceScarcityWeight']) ?? defaults.resourceScarcityWeight,
    powerWeight: readFiniteNumber(value['powerWeight']) ?? defaults.powerWeight,
    machineCountWeight:
      readFiniteNumber(value['machineCountWeight']) ?? defaults.machineCountWeight,
    surplusWeight: readFiniteNumber(value['surplusWeight']) ?? defaults.surplusWeight,
    rawResourceMultipliers: readNumberRecord(value['rawResourceMultipliers']),
  };
}

function readNumberRecord(value: unknown): Record<ItemId, number> {
  const record: Record<ItemId, number> = {};
  if (!isRecord(value)) {
    return record;
  }

  for (const [itemId, multiplier] of Object.entries(value)) {
    const numericMultiplier = readFiniteNumber(multiplier);
    if (numericMultiplier !== undefined) {
      record[itemId] = numericMultiplier;
    }
  }
  return record;
}

function hydrateGraphLayout(value: unknown): GraphLayoutState {
  if (!isRecord(value) || !isRecord(value['nodePositions'])) {
    return { nodePositions: {} };
  }

  const nodePositions: GraphLayoutState['nodePositions'] = {};
  for (const [nodeId, position] of Object.entries(value['nodePositions'])) {
    if (!isRecord(position)) {
      continue;
    }
    const x = readFiniteNumber(position['x']);
    const y = readFiniteNumber(position['y']);
    if (x === undefined || y === undefined) {
      continue;
    }
    nodePositions[nodeId] = { x, y };
  }
  return { nodePositions };
}

function hydrateGraphDisplaySettings(value: unknown): GraphDisplaySettings {
  const defaults = createDefaultGraphDisplaySettings();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    maxBeltTier: readConveyorBeltTier(value['maxBeltTier']) ?? defaults.maxBeltTier,
    maxPipeTier: readPipelineTier(value['maxPipeTier']) ?? defaults.maxPipeTier,
    rateDecimalPlaces:
      readRateDecimalPlaces(value['rateDecimalPlaces']) ?? defaults.rateDecimalPlaces,
    edgeStyle: readGraphEdgeStyle(value['edgeStyle']) ?? defaults.edgeStyle,
    showTransportLabels:
      typeof value['showTransportLabels'] === 'boolean'
        ? value['showTransportLabels']
        : defaults.showTransportLabels,
    animateFlowLines:
      typeof value['animateFlowLines'] === 'boolean'
        ? value['animateFlowLines']
        : defaults.animateFlowLines,
  };
}

function readConveyorBeltTier(value: unknown): ConveyorBeltTier | undefined {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6
    ? value
    : undefined;
}

function readPipelineTier(value: unknown): PipelineTier | undefined {
  return value === 1 || value === 2 ? value : undefined;
}

function readRateDecimalPlaces(value: unknown): RateDecimalPlaces | undefined {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : undefined;
}

function readGraphEdgeStyle(value: unknown): GraphEdgeStyle | undefined {
  return value === 'straight' || value === 'curved' ? value : undefined;
}

function hydrateBuildState(value: unknown): PlanBuildState {
  if (!isRecord(value)) {
    return { planLocked: false, nodeLayoutLocked: false, nodeStates: {} };
  }

  return {
    planLocked: value['planLocked'] === true || value['locked'] === true,
    nodeLayoutLocked: value['nodeLayoutLocked'] === true,
    nodeStates: readGraphNodeStates(value['nodeStates']),
  };
}

function readGraphNodeStates(value: unknown): Record<string, GraphNodeBuildState> {
  const nodeStates: Record<string, GraphNodeBuildState> = {};
  if (!isRecord(value)) {
    return nodeStates;
  }

  for (const [nodeId, nodeState] of Object.entries(value)) {
    if (!isRecord(nodeState)) {
      continue;
    }
    const done = typeof nodeState['done'] === 'boolean' ? nodeState['done'] : undefined;
    const note = typeof nodeState['note'] === 'string' ? nodeState['note'] : undefined;
    if (done === undefined && note === undefined) {
      continue;
    }
    nodeStates[nodeId] = {
      ...(done !== undefined ? { done } : {}),
      ...(note !== undefined ? { note } : {}),
    };
  }
  return nodeStates;
}

export function uniqueStrings(values: readonly string[]): string[] {
  const uniqueValues: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    uniqueValues.push(value);
  }
  return uniqueValues;
}
