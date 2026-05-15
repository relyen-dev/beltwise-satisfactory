import type { GameDataset, ItemId, MachineId, RecipeId } from '@beltwise/game-data';
import type { Point } from './model';

export interface PlannerWorkspace {
  schemaVersion: number;
  activeProjectId?: string;
  projects: PlannerProjectSummary[];
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
  now?: string;
}

export const PLANNER_STORAGE_SCHEMA_VERSION = 1;

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
      if (recipe.isAlternate) {
        overrides[recipe.id] = { enabled: false };
      }
      return overrides;
    },
    {},
  );
}

export function createPlannerProject(options: PlannerProjectCreateOptions): PlannerProject {
  const now = options.now ?? new Date().toISOString();

  return {
    id: options.id ?? createStableId('project'),
    name: options.name,
    datasetId: options.dataset.id,
    createdAt: now,
    updatedAt: now,
    targets: options.targets ?? [],
    recipeOverrides: createDefaultRecipeOverrides(options.dataset),
    machineOverrides: {},
    resourceOverrides: {},
    itemInputs: {},
    objectiveProfile: createDefaultObjectiveProfile(),
    graphLayout: { nodePositions: {} },
    graphDisplay: createDefaultGraphDisplaySettings(),
    buildState: { planLocked: false, nodeLayoutLocked: false, nodeStates: {} },
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
      ...defaults.recipeOverrides,
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
