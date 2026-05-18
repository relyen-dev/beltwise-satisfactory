import type { GameDataset, ItemId, MachineId, RecipeId } from '@beltwise/game-data';
import { uniqueStrings } from './internal/uniqueStrings';
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
  notes: string;
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

export type ObjectivePresetId =
  | 'resource-efficient'
  | 'low-power'
  | 'few-machines'
  | 'low-surplus'
  | 'balanced'
  | 'custom';

export type ObjectiveStrategy = 'lexicographic' | 'weighted';

export type ObjectiveStageId = 'raw-resources' | 'surplus' | 'recipe-activity' | 'power';

export interface ObjectiveProfile {
  presetId: ObjectivePresetId;
  strategy: ObjectiveStrategy;
  stageOrder: ObjectiveStageId[];
  resourceScarcityWeight: number;
  powerWeight: number;
  machineCountWeight: number;
  surplusWeight: number;
  rawResourceMultipliers: Record<ItemId, number>;
}

export interface ObjectivePresetProfileValues {
  strategy: ObjectiveStrategy;
  stageOrder: readonly ObjectiveStageId[];
  resourceScarcityWeight: number;
  powerWeight: number;
  machineCountWeight: number;
  surplusWeight: number;
}

export interface ObjectivePresetDefinition {
  id: ObjectivePresetId;
  label: string;
  description: string;
  profile: ObjectivePresetProfileValues;
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
  notes?: string;
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
const RESOURCE_EFFICIENT_RESOURCE_SCARCITY_WEIGHT = 1;
const RESOURCE_EFFICIENT_POWER_WEIGHT = 0.15;
const RESOURCE_EFFICIENT_MACHINE_COUNT_WEIGHT = 0.25;
const RESOURCE_EFFICIENT_SURPLUS_WEIGHT = 0.5;
const LOW_POWER_RESOURCE_SCARCITY_WEIGHT = 0.75;
const LOW_POWER_POWER_WEIGHT = 1;
const LOW_POWER_MACHINE_COUNT_WEIGHT = 0.2;
const LOW_POWER_SURPLUS_WEIGHT = 0.5;
const FEW_MACHINES_RESOURCE_SCARCITY_WEIGHT = 0.75;
const FEW_MACHINES_POWER_WEIGHT = 0.15;
const FEW_MACHINES_MACHINE_COUNT_WEIGHT = 1;
const FEW_MACHINES_SURPLUS_WEIGHT = 0.4;
const LOW_SURPLUS_RESOURCE_SCARCITY_WEIGHT = 0.8;
const LOW_SURPLUS_POWER_WEIGHT = 0.15;
const LOW_SURPLUS_MACHINE_COUNT_WEIGHT = 0.2;
const LOW_SURPLUS_SURPLUS_WEIGHT = 1.5;
const BALANCED_RESOURCE_SCARCITY_WEIGHT = 1;
const BALANCED_POWER_WEIGHT = 0.45;
const BALANCED_MACHINE_COUNT_WEIGHT = 0.6;
const BALANCED_SURPLUS_WEIGHT = 0.9;
const RAW_RESOURCE_FIRST_STAGE_ORDER = [
  'raw-resources',
  'surplus',
  'recipe-activity',
  'power',
] as const satisfies readonly ObjectiveStageId[];
const POWER_FIRST_STAGE_ORDER = [
  'power',
  'raw-resources',
  'surplus',
  'recipe-activity',
] as const satisfies readonly ObjectiveStageId[];
const MACHINES_FIRST_STAGE_ORDER = [
  'recipe-activity',
  'raw-resources',
  'surplus',
  'power',
] as const satisfies readonly ObjectiveStageId[];
const SURPLUS_FIRST_STAGE_ORDER = [
  'surplus',
  'raw-resources',
  'recipe-activity',
  'power',
] as const satisfies readonly ObjectiveStageId[];

export const OBJECTIVE_PRESET_DEFINITIONS: readonly ObjectivePresetDefinition[] = [
  {
    id: 'resource-efficient',
    label: 'Resource Efficient',
    description: 'Prefer routes that consume the least scarce raw material before other tradeoffs.',
    profile: {
      strategy: 'lexicographic',
      stageOrder: RAW_RESOURCE_FIRST_STAGE_ORDER,
      resourceScarcityWeight: RESOURCE_EFFICIENT_RESOURCE_SCARCITY_WEIGHT,
      powerWeight: RESOURCE_EFFICIENT_POWER_WEIGHT,
      machineCountWeight: RESOURCE_EFFICIENT_MACHINE_COUNT_WEIGHT,
      surplusWeight: RESOURCE_EFFICIENT_SURPLUS_WEIGHT,
    },
  },
  {
    id: 'low-power',
    label: 'Low Power',
    description: 'Prefer lower-power routes, then resolve ties with raw resources and surplus.',
    profile: {
      strategy: 'lexicographic',
      stageOrder: POWER_FIRST_STAGE_ORDER,
      resourceScarcityWeight: LOW_POWER_RESOURCE_SCARCITY_WEIGHT,
      powerWeight: LOW_POWER_POWER_WEIGHT,
      machineCountWeight: LOW_POWER_MACHINE_COUNT_WEIGHT,
      surplusWeight: LOW_POWER_SURPLUS_WEIGHT,
    },
  },
  {
    id: 'few-machines',
    label: 'Few Machines',
    description: 'Prefer plans with fewer active machines before raw-resource tie breakers.',
    profile: {
      strategy: 'lexicographic',
      stageOrder: MACHINES_FIRST_STAGE_ORDER,
      resourceScarcityWeight: FEW_MACHINES_RESOURCE_SCARCITY_WEIGHT,
      powerWeight: FEW_MACHINES_POWER_WEIGHT,
      machineCountWeight: FEW_MACHINES_MACHINE_COUNT_WEIGHT,
      surplusWeight: FEW_MACHINES_SURPLUS_WEIGHT,
    },
  },
  {
    id: 'low-surplus',
    label: 'Low Surplus',
    description: 'Prefer routes that leave fewer unused byproducts before resource tie breakers.',
    profile: {
      strategy: 'lexicographic',
      stageOrder: SURPLUS_FIRST_STAGE_ORDER,
      resourceScarcityWeight: LOW_SURPLUS_RESOURCE_SCARCITY_WEIGHT,
      powerWeight: LOW_SURPLUS_POWER_WEIGHT,
      machineCountWeight: LOW_SURPLUS_MACHINE_COUNT_WEIGHT,
      surplusWeight: LOW_SURPLUS_SURPLUS_WEIGHT,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Use one blended score so resources, power, machines, and surplus can trade off.',
    profile: {
      strategy: 'weighted',
      stageOrder: RAW_RESOURCE_FIRST_STAGE_ORDER,
      resourceScarcityWeight: BALANCED_RESOURCE_SCARCITY_WEIGHT,
      powerWeight: BALANCED_POWER_WEIGHT,
      machineCountWeight: BALANCED_MACHINE_COUNT_WEIGHT,
      surplusWeight: BALANCED_SURPLUS_WEIGHT,
    },
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Use manually edited objective weights while keeping the current priority order.',
    profile: {
      strategy: 'lexicographic',
      stageOrder: RAW_RESOURCE_FIRST_STAGE_ORDER,
      resourceScarcityWeight: RESOURCE_EFFICIENT_RESOURCE_SCARCITY_WEIGHT,
      powerWeight: RESOURCE_EFFICIENT_POWER_WEIGHT,
      machineCountWeight: RESOURCE_EFFICIENT_MACHINE_COUNT_WEIGHT,
      surplusWeight: RESOURCE_EFFICIENT_SURPLUS_WEIGHT,
    },
  },
];

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
  return createObjectiveProfileFromPreset('resource-efficient');
}

export function createObjectiveProfileFromPreset(
  presetId: ObjectivePresetId,
  options: {
    readonly rawResourceMultipliers?: Readonly<Record<ItemId, number>>;
  } = {},
): ObjectiveProfile {
  const definition = objectivePresetDefinition(presetId);
  return {
    presetId,
    strategy: definition.profile.strategy,
    stageOrder: [...definition.profile.stageOrder],
    resourceScarcityWeight: definition.profile.resourceScarcityWeight,
    powerWeight: definition.profile.powerWeight,
    machineCountWeight: definition.profile.machineCountWeight,
    surplusWeight: definition.profile.surplusWeight,
    rawResourceMultipliers: copyNumberRecord(options.rawResourceMultipliers ?? {}),
  };
}

export function createCustomObjectiveProfile(
  profile: ObjectiveProfile,
  overrides: Partial<
    Pick<
      ObjectiveProfile,
      'resourceScarcityWeight' | 'powerWeight' | 'machineCountWeight' | 'surplusWeight'
    >
  > = {},
): ObjectiveProfile {
  return {
    ...copyObjectiveProfile(profile),
    ...sanitizeObjectiveWeightOverrides(overrides),
    presetId: 'custom',
  };
}

export function resolveObjectivePresetId(profile: ObjectiveProfile): ObjectivePresetId {
  if (profile.presetId === 'custom') {
    return 'custom';
  }
  if (objectiveProfileMatchesPreset(profile, profile.presetId)) {
    return profile.presetId;
  }
  return findMatchingObjectivePresetId(profile) ?? 'custom';
}

export function isCustomObjectiveProfile(profile: ObjectiveProfile): boolean {
  return resolveObjectivePresetId(profile) === 'custom';
}

export function objectivePresetDefinition(presetId: ObjectivePresetId): ObjectivePresetDefinition {
  const definition = OBJECTIVE_PRESET_DEFINITIONS.find((candidate) => candidate.id === presetId);
  if (!definition) {
    throw new Error(`Unknown objective preset ${presetId}`);
  }
  return definition;
}

export function sanitizeObjectiveWeight(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
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
    notes: normalizePlainTextNote(options.notes ?? ''),
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
    notes: readPlainTextNote(value['notes']),
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

export function normalizePlainTextNote(note: string): string {
  return note.trim().length > 0 ? note : '';
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readPlainTextNote(value: unknown): string {
  return typeof value === 'string' ? normalizePlainTextNote(value) : '';
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
    presetId: resolveObjectivePresetId(objectiveProfile),
    strategy: objectiveProfile.strategy,
    stageOrder: [...objectiveProfile.stageOrder],
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

  const explicitPresetId = readObjectivePresetId(value['presetId']);
  const presetDefaults =
    explicitPresetId === undefined ? defaults : createObjectiveProfileFromPreset(explicitPresetId);
  const strategy = readObjectiveStrategy(value['strategy']) ?? presetDefaults.strategy;
  const stageOrder = readObjectiveStageOrder(value['stageOrder']) ?? presetDefaults.stageOrder;
  const profile: ObjectiveProfile = {
    presetId: explicitPresetId ?? defaults.presetId,
    strategy,
    stageOrder,
    resourceScarcityWeight:
      readNonNegativeFiniteNumber(value['resourceScarcityWeight']) ??
      presetDefaults.resourceScarcityWeight,
    powerWeight: readNonNegativeFiniteNumber(value['powerWeight']) ?? presetDefaults.powerWeight,
    machineCountWeight:
      readNonNegativeFiniteNumber(value['machineCountWeight']) ?? presetDefaults.machineCountWeight,
    surplusWeight:
      readNonNegativeFiniteNumber(value['surplusWeight']) ?? presetDefaults.surplusWeight,
    rawResourceMultipliers: readNumberRecord(value['rawResourceMultipliers']),
  };

  if (explicitPresetId === 'custom') {
    return { ...profile, presetId: 'custom' };
  }
  if (explicitPresetId !== undefined) {
    return {
      ...profile,
      presetId: objectiveProfileMatchesPreset(profile, explicitPresetId)
        ? explicitPresetId
        : 'custom',
    };
  }
  return {
    ...profile,
    presetId: findMatchingObjectivePresetId(profile) ?? 'custom',
  };
}

function readNumberRecord(value: unknown): Record<ItemId, number> {
  const record: Record<ItemId, number> = {};
  if (!isRecord(value)) {
    return record;
  }

  for (const [itemId, multiplier] of Object.entries(value)) {
    const numericMultiplier = readNonNegativeFiniteNumber(multiplier);
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

function readNonNegativeFiniteNumber(value: unknown): number | undefined {
  const number = readFiniteNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function readObjectivePresetId(value: unknown): ObjectivePresetId | undefined {
  return value === 'resource-efficient' ||
    value === 'low-power' ||
    value === 'few-machines' ||
    value === 'low-surplus' ||
    value === 'balanced' ||
    value === 'custom'
    ? value
    : undefined;
}

function readObjectiveStrategy(value: unknown): ObjectiveStrategy | undefined {
  return value === 'lexicographic' || value === 'weighted' ? value : undefined;
}

function readObjectiveStageId(value: unknown): ObjectiveStageId | undefined {
  return value === 'raw-resources' ||
    value === 'surplus' ||
    value === 'recipe-activity' ||
    value === 'power'
    ? value
    : undefined;
}

function readObjectiveStageOrder(value: unknown): ObjectiveStageId[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const stageOrder: ObjectiveStageId[] = [];
  for (const item of value) {
    const stageId = readObjectiveStageId(item);
    if (stageId === undefined) {
      return undefined;
    }
    if (!stageOrder.includes(stageId)) {
      stageOrder.push(stageId);
    }
  }
  return stageOrder.length > 0 ? stageOrder : undefined;
}

function findMatchingObjectivePresetId(profile: ObjectiveProfile): ObjectivePresetId | undefined {
  return OBJECTIVE_PRESET_DEFINITIONS.find(
    (definition) =>
      definition.id !== 'custom' && objectiveProfileMatchesPreset(profile, definition.id),
  )?.id;
}

function objectiveProfileMatchesPreset(
  profile: ObjectiveProfile,
  presetId: ObjectivePresetId,
): boolean {
  if (presetId === 'custom') {
    return profile.presetId === 'custom';
  }
  const definition = objectivePresetDefinition(presetId);
  return (
    profile.strategy === definition.profile.strategy &&
    objectiveStageOrdersEqual(profile.stageOrder, definition.profile.stageOrder) &&
    profile.resourceScarcityWeight === definition.profile.resourceScarcityWeight &&
    profile.powerWeight === definition.profile.powerWeight &&
    profile.machineCountWeight === definition.profile.machineCountWeight &&
    profile.surplusWeight === definition.profile.surplusWeight
  );
}

function objectiveStageOrdersEqual(
  left: readonly ObjectiveStageId[],
  right: readonly ObjectiveStageId[],
): boolean {
  return left.length === right.length && left.every((stageId, index) => stageId === right[index]);
}

function sanitizeObjectiveWeightOverrides(
  overrides: Partial<
    Pick<
      ObjectiveProfile,
      'resourceScarcityWeight' | 'powerWeight' | 'machineCountWeight' | 'surplusWeight'
    >
  >,
): Partial<
  Pick<
    ObjectiveProfile,
    'resourceScarcityWeight' | 'powerWeight' | 'machineCountWeight' | 'surplusWeight'
  >
> {
  const sanitized: Partial<
    Pick<
      ObjectiveProfile,
      'resourceScarcityWeight' | 'powerWeight' | 'machineCountWeight' | 'surplusWeight'
    >
  > = {};
  if (overrides.resourceScarcityWeight !== undefined) {
    sanitized.resourceScarcityWeight = sanitizeObjectiveWeight(overrides.resourceScarcityWeight);
  }
  if (overrides.powerWeight !== undefined) {
    sanitized.powerWeight = sanitizeObjectiveWeight(overrides.powerWeight);
  }
  if (overrides.machineCountWeight !== undefined) {
    sanitized.machineCountWeight = sanitizeObjectiveWeight(overrides.machineCountWeight);
  }
  if (overrides.surplusWeight !== undefined) {
    sanitized.surplusWeight = sanitizeObjectiveWeight(overrides.surplusWeight);
  }
  return sanitized;
}

function copyNumberRecord(value: Readonly<Record<ItemId, number>>): Record<ItemId, number> {
  const copy: Record<ItemId, number> = {};
  for (const [itemId, number] of Object.entries(value)) {
    copy[itemId] = sanitizeObjectiveWeight(number);
  }
  return copy;
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
    const normalizedNote =
      typeof nodeState['note'] === 'string' ? normalizePlainTextNote(nodeState['note']) : '';
    const note = normalizedNote.length > 0 ? normalizedNote : undefined;
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
