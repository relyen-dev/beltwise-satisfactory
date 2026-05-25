import {
  recipeAvailabilityCategoryForDataset,
  type GameDataset,
  type ItemId,
  type MachineId,
  type RecipeId,
} from '@beltwise/game-data';
import { uniqueStrings } from './internal/uniqueStrings';
import { normalizeResourceOverrides } from './resourceOverrideMutations';
import type { Point } from './model';
import {
  copyGraphDisplaySettingsForTransfer,
  copyMachineOverridesForTransfer,
  copyNumberRecordForTransfer,
  copyRecipeOverridesForTransfer,
  copyResourceOverridesForTransfer,
  copySinkRulesForTransfer,
  isPlanTransferRecord,
  normalizePlanTransferNote,
  objectiveStageOrdersEqual,
  readBuildStateForTransfer,
  readGraphDisplaySettingsForTransfer,
  readGraphLayoutForTransfer,
  readItemInputsForTransfer,
  readMachineOverridesForTransfer,
  readNumberRecordForTransfer,
  readPlanTransferNote,
  readPowerTargetsForTransfer,
  readProductTargetsForTransfer,
  readRecipeOverridesForTransfer,
  readResourceOverridesForTransfer,
  readSinkRulesForTransfer,
  readTransferNonNegativeFiniteNumber,
  readTransferObjectivePresetId,
  readTransferObjectiveStageOrder,
  readTransferObjectiveStrategy,
  readTransferString,
  sanitizeTransferWeight,
} from './planTransferFieldCodecs';

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
  powerTargets: PowerTarget[];
  sinkRules: SinkRule[];
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

export interface PowerTarget {
  id: string;
  mode: 'generator-count' | 'power';
  generatorId?: MachineId;
  fuelItemId?: ItemId;
  generatorCount?: number;
  powerMw?: number;
  sortOrder: number;
}

export interface SinkRule {
  id: string;
  itemId: ItemId;
  mode: 'surplus';
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
  powerTargets?: PowerTarget[];
  sinkRules?: SinkRule[];
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
export const MAX_PLANNER_NAME_LENGTH = 80;
export const NEUTRAL_RAW_RESOURCE_MULTIPLIER = 1;
export const DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS: Readonly<Partial<Record<ItemId, number>>> = {
  Desc_OreIron_C: 1,
  Desc_Stone_C: 1,
  Desc_OreCopper_C: 1,
  Desc_Coal_C: 1,
  Desc_LiquidOil_C: 1,
  Desc_NitrogenGas_C: 1,
  Desc_OreGold_C: 1,
  Desc_RawQuartz_C: 1,
  Desc_Sulfur_C: 1,
  Desc_OreBauxite_C: 1,
  Desc_OreUranium_C: 1,
  Desc_SAM_C: 1,
  Desc_Water_C: 0,
};
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

export function setObjectiveProfileRawResourceMultiplier(
  profile: ObjectiveProfile,
  itemId: ItemId,
  value: number,
): ObjectiveProfile {
  const rawResourceMultipliers = { ...profile.rawResourceMultipliers };
  const multiplier = sanitizeRawResourceMultiplier(value);
  if (multiplier === NEUTRAL_RAW_RESOURCE_MULTIPLIER) {
    delete rawResourceMultipliers[itemId];
  } else {
    rawResourceMultipliers[itemId] = multiplier;
  }

  return {
    ...createCustomObjectiveProfile(profile),
    rawResourceMultipliers,
  };
}

export function resetObjectiveProfileRawResourceMultiplier(
  profile: ObjectiveProfile,
  itemId: ItemId,
): ObjectiveProfile {
  const rawResourceMultipliers = { ...profile.rawResourceMultipliers };
  delete rawResourceMultipliers[itemId];
  return {
    ...createCustomObjectiveProfile(profile),
    rawResourceMultipliers,
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
  return sanitizeTransferWeight(value);
}

export function sanitizeRawResourceMultiplier(value: number): number {
  return sanitizeTransferWeight(value);
}

export function defaultRawResourceOpinionMultiplier(itemId: ItemId): number {
  return DEFAULT_RAW_RESOURCE_OPINION_MULTIPLIERS[itemId] ?? NEUTRAL_RAW_RESOURCE_MULTIPLIER;
}

export function rawResourceMultiplierCanAffectRouteCost(itemId: ItemId): boolean {
  return defaultRawResourceOpinionMultiplier(itemId) > 0;
}

export function createDefaultRecipeOverrides(
  dataset: GameDataset,
): Record<RecipeId, RecipeOverride> {
  return Object.values(dataset.recipes).reduce<Record<RecipeId, RecipeOverride>>(
    (overrides, recipe) => {
      const category = recipeAvailabilityCategoryForDataset(dataset, recipe);
      if (category === 'alternate' || category === 'converter') {
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
    graphDisplay: copyGraphDisplaySettingsForTransfer(project.graphDisplay),
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
    name: normalizePlannerName(options.name),
    notes: normalizePlainTextNote(options.notes ?? ''),
    datasetId: options.dataset.id,
    createdAt: now,
    updatedAt: now,
    targets: options.targets ?? [],
    powerTargets: readPowerTargetsForTransfer(options.powerTargets, () =>
      createStableId('power-target'),
    ),
    sinkRules: copySinkRulesForTransfer(options.sinkRules ?? []),
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
    name: normalizePlannerName(options.name),
    datasetId: options.datasetId,
    createdAt,
    updatedAt,
    projectIds,
    ...(activeProjectId !== undefined ? { activeProjectId } : {}),
  };
}

export function hydratePlannerProject(value: unknown, dataset: GameDataset): PlannerProject | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }

  const now = new Date().toISOString();
  const id = readTransferString(value['id']) ?? createStableId('project');
  const name = readTransferString(value['name']) ?? 'Restored factory';
  const createdAt = readTransferString(value['createdAt']) ?? now;
  const updatedAt = readTransferString(value['updatedAt']) ?? createdAt;
  const defaults = createPlannerProject({
    id,
    name,
    dataset,
    now: createdAt,
  });

  return {
    ...defaults,
    datasetId: readTransferString(value['datasetId']) ?? dataset.id,
    createdAt,
    updatedAt,
    notes: readPlanTransferNote(value['notes']),
    targets: readProductTargetsForTransfer(value['targets'], () => createStableId('target')),
    powerTargets: readPowerTargetsForTransfer(value['powerTargets'], () =>
      createStableId('power-target'),
    ),
    sinkRules: readSinkRulesForTransfer(value['sinkRules'], () => createStableId('sink')),
    recipeOverrides: {
      ...createLegacyProjectHydrationRecipeOverrides(dataset),
      ...readRecipeOverridesForTransfer(value['recipeOverrides']),
    },
    machineOverrides: readMachineOverridesForTransfer(value['machineOverrides']),
    resourceOverrides: normalizeResourceOverrides(
      readResourceOverridesForTransfer(value['resourceOverrides']),
      dataset.resources,
    ),
    itemInputs: readItemInputsForTransfer(value['itemInputs']),
    objectiveProfile: hydrateObjectiveProfile(value['objectiveProfile']),
    graphLayout: readGraphLayoutForTransfer(value['graphLayout']),
    graphDisplay: readGraphDisplaySettingsForTransfer(
      value['graphDisplay'],
      createDefaultGraphDisplaySettings(),
    ),
    buildState: readBuildStateForTransfer(value['buildState']),
  };
}

export function hydratePlannerUserDefaults(
  value: unknown,
  dataset: GameDataset,
): PlannerUserDefaults {
  const defaults = createDefaultUserDefaults(dataset);
  if (!isPlanTransferRecord(value)) {
    return defaults;
  }

  return mergeUserDefaults(defaults, {
    recipeOverrides: readRecipeOverridesForTransfer(value['recipeOverrides']),
    machineOverrides: readMachineOverridesForTransfer(value['machineOverrides']),
    resourceOverrides: normalizeResourceOverrides(
      readResourceOverridesForTransfer(value['resourceOverrides']),
      dataset.resources,
    ),
    objectiveProfile: hydrateObjectiveProfile(value['objectiveProfile']),
    graphDisplay: readGraphDisplaySettingsForTransfer(
      value['graphDisplay'],
      createDefaultGraphDisplaySettings(),
    ),
  });
}

export function summarizeProject(project: PlannerProject): PlannerProjectSummary {
  return {
    id: project.id,
    name: normalizePlannerName(project.name),
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
  return normalizePlanTransferNote(note);
}

export function normalizePlannerName(name: string): string {
  return takePlannerNameCharacters(name.trim().replace(/\s+/g, ' '), MAX_PLANNER_NAME_LENGTH);
}

export function appendPlannerNameSuffix(name: string, suffix: string): string {
  const normalizedSuffix = normalizePlannerName(suffix);
  if (normalizedSuffix.length === 0) {
    return normalizePlannerName(name);
  }

  const suffixText = ` ${normalizedSuffix}`;
  const baseLength = Math.max(0, MAX_PLANNER_NAME_LENGTH - plannerNameLength(suffixText));
  const normalizedName = normalizePlannerName(name);
  const base = takePlannerNameCharacters(normalizedName, baseLength).trimEnd();
  return normalizePlannerName(base.length > 0 ? `${base}${suffixText}` : normalizedSuffix);
}

function createLegacyProjectHydrationRecipeOverrides(
  dataset: GameDataset,
): Record<RecipeId, RecipeOverride> {
  return Object.values(dataset.recipes).reduce<Record<RecipeId, RecipeOverride>>(
    (overrides, recipe) => {
      if (recipeAvailabilityCategoryForDataset(dataset, recipe) === 'alternate') {
        overrides[recipe.id] = { enabled: false };
      }
      return overrides;
    },
    {},
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
      graphDisplay: copyGraphDisplaySettingsForTransfer(defaults.graphDisplay),
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
  return copyRecipeOverridesForTransfer(recipeOverrides);
}

function copyMachineOverrides(
  machineOverrides: Record<MachineId, MachineOverride>,
): Record<MachineId, MachineOverride> {
  return copyMachineOverridesForTransfer(machineOverrides);
}

function copyResourceOverrides(
  resourceOverrides: Record<ItemId, ResourceOverride>,
): Record<ItemId, ResourceOverride> {
  return copyResourceOverridesForTransfer(resourceOverrides);
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

function hydrateObjectiveProfile(value: unknown): ObjectiveProfile {
  const defaults = createDefaultObjectiveProfile();
  if (!isPlanTransferRecord(value)) {
    return defaults;
  }

  const explicitPresetId = readTransferObjectivePresetId(value['presetId']);
  const presetDefaults =
    explicitPresetId === undefined ? defaults : createObjectiveProfileFromPreset(explicitPresetId);
  const strategy = readTransferObjectiveStrategy(value['strategy']) ?? presetDefaults.strategy;
  const stageOrder =
    readTransferObjectiveStageOrder(value['stageOrder']) ?? presetDefaults.stageOrder;
  const profile: ObjectiveProfile = {
    presetId: explicitPresetId ?? defaults.presetId,
    strategy,
    stageOrder,
    resourceScarcityWeight:
      readTransferNonNegativeFiniteNumber(value['resourceScarcityWeight']) ??
      presetDefaults.resourceScarcityWeight,
    powerWeight:
      readTransferNonNegativeFiniteNumber(value['powerWeight']) ?? presetDefaults.powerWeight,
    machineCountWeight:
      readTransferNonNegativeFiniteNumber(value['machineCountWeight']) ??
      presetDefaults.machineCountWeight,
    surplusWeight:
      readTransferNonNegativeFiniteNumber(value['surplusWeight']) ?? presetDefaults.surplusWeight,
    rawResourceMultipliers: readNumberRecordForTransfer(value['rawResourceMultipliers']),
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
  return copyNumberRecordForTransfer(value);
}

function takePlannerNameCharacters(name: string, maxLength: number): string {
  return Array.from(name).slice(0, maxLength).join('').trimEnd();
}

function plannerNameLength(name: string): number {
  return Array.from(name).length;
}
