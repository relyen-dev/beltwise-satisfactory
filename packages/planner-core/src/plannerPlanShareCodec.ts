import type { GameDataset, ItemId } from '@beltwise/game-data';
import {
  createDefaultGraphDisplaySettings,
  createDefaultObjectiveProfile,
  createObjectiveProfileFromPreset,
  createStableId,
  normalizePlannerName,
  type GraphDisplaySettings,
  type GraphEdgeStyle,
  type GraphNodeBuildState,
  type ObjectiveProfile,
  type ObjectivePresetId,
  type ObjectiveStageId,
  type ObjectiveStrategy,
  type PlanBuildState,
  type PlannerProject,
  type ProductTarget,
  resolveObjectivePresetId,
} from './plan';
import {
  datasetImportWarnings,
  type BeltwisePlanImportWarning,
} from './plannerDatasetTransferWarnings';
import {
  isPlanTransferRecord,
  isSafePlanTransferRecordKey,
  normalizePlanTransferNote,
  objectiveStageOrdersEqual,
  readTransferConveyorBeltTier,
  readTransferFiniteNumber,
  readTransferGraphEdgeStyle,
  readTransferNonNegativeFiniteNumber,
  readTransferObjectivePresetId,
  readTransferPipelineTier,
  readTransferRateDecimalPlaces,
  readSafePlanTransferRecordKey,
  readTransferString,
} from './planTransferFieldCodecs';
import {
  applyPlannerProjectIntentToCanonicalDefaults,
  canonicalGraphNodePositionEntries,
  canonicalItemInputEntries,
  canonicalMachineOverrideEntries,
  canonicalRawResourceMultiplierEntries,
  canonicalRecipeOverrideEntries,
  canonicalResourceOverrideEntries,
  graphDisplayDiffersFromCanonicalDefault,
  objectiveProfileDiffersFromCanonicalDefault,
} from './internal/plannerIntentTransfer';

export const BELTWISE_PLAN_SHARE_KIND = 'bw.p';
export const BELTWISE_PLAN_SHARE_FORMAT_VERSION = 1;

export type BeltwisePlanShareKind = typeof BELTWISE_PLAN_SHARE_KIND;
export type BeltwisePlanShareFormatVersion = typeof BELTWISE_PLAN_SHARE_FORMAT_VERSION;

export interface BeltwisePlanShareDatasetMetadataV1 {
  id: string;
  gameVersionLabel: string;
  fingerprint?: string;
}

export interface BeltwisePlanShareV1 {
  k: BeltwisePlanShareKind;
  v: BeltwisePlanShareFormatVersion;
  d: BeltwisePlanShareDatasetMetadataV1;
  p: CompactPlannerProjectV1;
}

export type BeltwisePlanSharePayload = BeltwisePlanShareV1;

export interface CompactPlannerProjectV1 {
  n: string;
  no?: string;
  t?: CompactProductTargetV1[];
  r?: CompactBooleanOverrideV1[];
  m?: CompactBooleanOverrideV1[];
  rc?: CompactResourceOverrideV1[];
  i?: CompactAmountOverrideV1[];
  o?: CompactObjectiveProfileV1;
  g?: CompactGraphDisplaySettingsV1;
  l?: CompactGraphNodePositionV1[];
  b?: CompactPlanBuildStateV1;
}

export interface CompactProductTargetV1 {
  id: string;
  i: ItemId;
  m: 'f' | 'x';
  a?: number;
  s: number;
}

export type CompactBooleanOverrideV1 = [id: string, enabled: boolean];
export type CompactAmountOverrideV1 = [id: string, amountPerMinute: number];
export type CompactGraphNodePositionV1 = [nodeId: string, x: number, y: number];

export interface CompactResourceOverrideV1 {
  i: ItemId;
  e?: boolean;
  m?: number;
}

export interface CompactObjectiveProfileV1 {
  id?: ObjectivePresetId;
  y?: CompactObjectiveStrategyV1;
  g?: CompactObjectiveStageIdV1[];
  rs?: number;
  p?: number;
  m?: number;
  s?: number;
  r?: CompactAmountOverrideV1[];
}

export type CompactObjectiveStrategyV1 = 'l' | 'w';
export type CompactObjectiveStageIdV1 = 'r' | 's' | 'm' | 'p';

export interface CompactGraphDisplaySettingsV1 {
  b?: GraphDisplaySettings['maxBeltTier'];
  p?: GraphDisplaySettings['maxPipeTier'];
  d?: GraphDisplaySettings['rateDecimalPlaces'];
  e?: GraphEdgeStyle;
  l?: boolean;
  a?: boolean;
}

export interface CompactPlanBuildStateV1 {
  p?: true;
  l?: true;
  n?: CompactGraphNodeBuildStateV1[];
}

export interface CompactGraphNodeBuildStateV1 {
  id: string;
  d?: true;
  n?: string;
}

export interface DecodeBeltwisePlanShareOptions {
  id?: string;
  now?: string;
}

export interface DecodeBeltwisePlanShareSuccess {
  ok: true;
  payload: BeltwisePlanSharePayload;
  project: PlannerProject;
  warnings: BeltwisePlanImportWarning[];
}

export interface DecodeBeltwisePlanShareFailure {
  ok: false;
  error: BeltwisePlanShareError;
}

export type DecodeBeltwisePlanShareResult =
  | DecodeBeltwisePlanShareSuccess
  | DecodeBeltwisePlanShareFailure;

export type BeltwisePlanShareErrorCode =
  | 'invalid-envelope'
  | 'wrong-kind'
  | 'unsupported-version'
  | 'invalid-project';

export interface BeltwisePlanShareError {
  code: BeltwisePlanShareErrorCode;
  message: string;
}

export function encodeBeltwisePlanShare(
  project: PlannerProject,
  dataset: GameDataset,
): BeltwisePlanSharePayload {
  return {
    k: BELTWISE_PLAN_SHARE_KIND,
    v: BELTWISE_PLAN_SHARE_FORMAT_VERSION,
    d: encodeDatasetMetadata(dataset),
    p: encodeCompactPlannerProject(project, dataset),
  };
}

export function decodeBeltwisePlanShare(
  value: unknown,
  dataset: GameDataset,
  options: DecodeBeltwisePlanShareOptions = {},
): DecodeBeltwisePlanShareResult {
  if (!isPlanTransferRecord(value)) {
    return fail('invalid-envelope', 'That Beltwise plan link has an invalid payload.');
  }

  if (value['k'] !== BELTWISE_PLAN_SHARE_KIND) {
    return fail('wrong-kind', 'That is not a Beltwise plan link.');
  }

  if (value['v'] !== BELTWISE_PLAN_SHARE_FORMAT_VERSION) {
    if (typeof value['v'] === 'number' && value['v'] > BELTWISE_PLAN_SHARE_FORMAT_VERSION) {
      return fail('unsupported-version', 'This plan link uses a newer Beltwise format.');
    }
    return fail('invalid-envelope', 'That Beltwise plan link has an invalid version.');
  }

  const datasetMetadata = readDatasetMetadata(value['d']);
  const projectPayload = readCompactPlannerProject(value['p']);
  if (!datasetMetadata || !projectPayload) {
    return fail('invalid-project', 'That Beltwise plan link has an invalid plan payload.');
  }

  const now = options.now ?? new Date().toISOString();
  const project = applyCompactProjectToCanonicalDefaults(projectPayload, dataset, {
    id: options.id ?? createStableId('project'),
    now,
  });

  return {
    ok: true,
    payload: {
      k: BELTWISE_PLAN_SHARE_KIND,
      v: BELTWISE_PLAN_SHARE_FORMAT_VERSION,
      d: datasetMetadata,
      p: projectPayload,
    },
    project,
    warnings: datasetImportWarnings(datasetMetadata, dataset, 'shared'),
  };
}

function encodeCompactPlannerProject(
  project: PlannerProject,
  dataset: GameDataset,
): CompactPlannerProjectV1 {
  const compact: CompactPlannerProjectV1 = {
    n: normalizePlannerName(project.name),
  };
  const notes = normalizePlanTransferNote(project.notes);
  if (notes.length > 0) {
    compact.no = notes;
  }
  if (project.targets.length > 0) {
    compact.t = project.targets.map(encodeTarget);
  }

  const recipeOverrides = encodeBooleanOverrides(canonicalRecipeOverrideEntries(project, dataset));
  if (recipeOverrides.length > 0) {
    compact.r = recipeOverrides;
  }

  const machineOverrides = encodeBooleanOverrides(canonicalMachineOverrideEntries(project));
  if (machineOverrides.length > 0) {
    compact.m = machineOverrides;
  }

  const resourceOverrides = encodeResourceOverrides(project);
  if (resourceOverrides.length > 0) {
    compact.rc = resourceOverrides;
  }

  const itemInputs = encodeAmountOverrides(canonicalItemInputEntries(project));
  if (itemInputs.length > 0) {
    compact.i = itemInputs;
  }

  const objectiveProfile = encodeObjectiveProfile(project.objectiveProfile);
  if (objectiveProfile) {
    compact.o = objectiveProfile;
  }

  const graphDisplay = encodeGraphDisplay(project.graphDisplay);
  if (graphDisplay) {
    compact.g = graphDisplay;
  }

  const graphLayout = encodeGraphLayout(project);
  if (graphLayout.length > 0) {
    compact.l = graphLayout;
  }

  const buildState = encodeBuildState(project.buildState);
  if (buildState) {
    compact.b = buildState;
  }

  return compact;
}

function applyCompactProjectToCanonicalDefaults(
  compact: CompactPlannerProjectV1,
  dataset: GameDataset,
  options: { id: string; now: string },
): PlannerProject {
  return applyPlannerProjectIntentToCanonicalDefaults(
    {
      notes: normalizePlanTransferNote(compact.no ?? ''),
      targets: decodeTargets(compact.t),
      recipeOverrides: decodeBooleanOverrides(compact.r),
      machineOverrides: decodeBooleanOverrides(compact.m),
      resourceOverrides: decodeResourceOverrides(compact.rc),
      itemInputs: decodeAmountOverrides(compact.i),
      objectiveProfile: decodeObjectiveProfile(compact.o),
      graphDisplay: decodeGraphDisplay(compact.g),
      graphLayout: { nodePositions: decodeGraphLayout(compact.l) },
      buildState: decodeBuildState(compact.b),
    },
    {
      id: options.id,
      name: compact.n,
      dataset,
      now: options.now,
    },
  );
}

function encodeTarget(target: ProductTarget): CompactProductTargetV1 {
  return {
    id: target.id,
    i: target.itemId,
    m: target.mode === 'fixed' ? 'f' : 'x',
    ...(target.mode === 'fixed' ? { a: target.amountPerMinute ?? 0 } : {}),
    s: target.sortOrder,
  };
}

function decodeTargets(value: CompactProductTargetV1[] | undefined): ProductTarget[] {
  if (!value) {
    return [];
  }

  return value.map((target) =>
    target.m === 'f'
      ? {
          id: target.id,
          itemId: target.i,
          mode: 'fixed',
          amountPerMinute: target.a ?? 0,
          sortOrder: target.s,
        }
      : {
          id: target.id,
          itemId: target.i,
          mode: 'maximize',
          sortOrder: target.s,
        },
  );
}

function encodeBooleanOverrides(
  overrides: readonly { id: string; enabled: boolean }[],
): CompactBooleanOverrideV1[] {
  return overrides.map((override) => [override.id, override.enabled]);
}

function decodeBooleanOverrides(
  value: CompactBooleanOverrideV1[] | undefined,
): Record<string, { enabled: boolean }> {
  const overrides: Record<string, { enabled: boolean }> = {};
  for (const [id, enabled] of value ?? []) {
    if (!isSafePlanTransferRecordKey(id)) {
      continue;
    }
    overrides[id] = { enabled };
  }
  return overrides;
}

function encodeResourceOverrides(project: PlannerProject): CompactResourceOverrideV1[] {
  return canonicalResourceOverrideEntries(project).map((override) => ({
    i: override.id,
    ...(override.enabled !== undefined ? { e: override.enabled } : {}),
    ...(override.maxPerMinute !== undefined ? { m: override.maxPerMinute } : {}),
  }));
}

function decodeResourceOverrides(
  value: CompactResourceOverrideV1[] | undefined,
): PlannerProject['resourceOverrides'] {
  const overrides: PlannerProject['resourceOverrides'] = {};
  for (const override of value ?? []) {
    if (!isSafePlanTransferRecordKey(override.i)) {
      continue;
    }
    overrides[override.i] = {
      ...(override.e !== undefined ? { enabled: override.e } : {}),
      ...(override.m !== undefined ? { maxPerMinute: override.m } : {}),
    };
  }
  return overrides;
}

function encodeAmountOverrides(
  overrides: readonly { id: string; amountPerMinute: number }[],
): CompactAmountOverrideV1[] {
  return overrides.map((override) => [override.id, override.amountPerMinute]);
}

function decodeAmountOverrides(
  value: CompactAmountOverrideV1[] | undefined,
): Record<ItemId, { amountPerMinute: number }> {
  const overrides: Record<ItemId, { amountPerMinute: number }> = {};
  for (const [itemId, amountPerMinute] of value ?? []) {
    if (!isSafePlanTransferRecordKey(itemId)) {
      continue;
    }
    overrides[itemId] = { amountPerMinute };
  }
  return overrides;
}

function encodeObjectiveProfile(profile: ObjectiveProfile): CompactObjectiveProfileV1 | null {
  const defaults = createDefaultObjectiveProfile();
  const compact: CompactObjectiveProfileV1 = {};
  if (profile.presetId !== defaults.presetId) {
    compact.id = profile.presetId;
  }
  if (profile.strategy !== defaults.strategy) {
    compact.y = encodeObjectiveStrategy(profile.strategy);
  }
  if (!objectiveStageOrdersEqual(profile.stageOrder, defaults.stageOrder)) {
    compact.g = profile.stageOrder.map(encodeObjectiveStageId);
  }
  if (profile.resourceScarcityWeight !== defaults.resourceScarcityWeight) {
    compact.rs = profile.resourceScarcityWeight;
  }
  if (profile.powerWeight !== defaults.powerWeight) {
    compact.p = profile.powerWeight;
  }
  if (profile.machineCountWeight !== defaults.machineCountWeight) {
    compact.m = profile.machineCountWeight;
  }
  if (profile.surplusWeight !== defaults.surplusWeight) {
    compact.s = profile.surplusWeight;
  }
  const rawResourceMultipliers = encodeAmountOverrides(
    canonicalRawResourceMultiplierEntries(profile),
  );
  if (rawResourceMultipliers.length > 0) {
    compact.r = rawResourceMultipliers;
  }
  return objectiveProfileDiffersFromCanonicalDefault(profile) ? compact : null;
}

function decodeObjectiveProfile(value: CompactObjectiveProfileV1 | undefined): ObjectiveProfile {
  const defaults =
    value?.id === undefined
      ? createDefaultObjectiveProfile()
      : createObjectiveProfileFromPreset(value.id);
  const profile: ObjectiveProfile = {
    presetId: value?.id ?? defaults.presetId,
    strategy: decodeObjectiveStrategy(value?.y) ?? defaults.strategy,
    stageOrder: decodeObjectiveStageOrder(value?.g) ?? defaults.stageOrder,
    resourceScarcityWeight: value?.rs ?? defaults.resourceScarcityWeight,
    powerWeight: value?.p ?? defaults.powerWeight,
    machineCountWeight: value?.m ?? defaults.machineCountWeight,
    surplusWeight: value?.s ?? defaults.surplusWeight,
    rawResourceMultipliers: Object.fromEntries(
      (value?.r ?? []).filter(([itemId]) => isSafePlanTransferRecordKey(itemId)),
    ),
  };
  return {
    ...profile,
    presetId: value?.id === 'custom' ? 'custom' : resolveObjectivePresetId(profile),
  };
}

function encodeGraphDisplay(settings: GraphDisplaySettings): CompactGraphDisplaySettingsV1 | null {
  const defaults = createDefaultGraphDisplaySettings();
  const compact: CompactGraphDisplaySettingsV1 = {};
  if (settings.maxBeltTier !== defaults.maxBeltTier) {
    compact.b = settings.maxBeltTier;
  }
  if (settings.maxPipeTier !== defaults.maxPipeTier) {
    compact.p = settings.maxPipeTier;
  }
  if (settings.rateDecimalPlaces !== defaults.rateDecimalPlaces) {
    compact.d = settings.rateDecimalPlaces;
  }
  if (settings.edgeStyle !== defaults.edgeStyle) {
    compact.e = settings.edgeStyle;
  }
  if (settings.showTransportLabels !== defaults.showTransportLabels) {
    compact.l = settings.showTransportLabels;
  }
  if (settings.animateFlowLines !== defaults.animateFlowLines) {
    compact.a = settings.animateFlowLines;
  }
  return graphDisplayDiffersFromCanonicalDefault(settings) ? compact : null;
}

function decodeGraphDisplay(
  value: CompactGraphDisplaySettingsV1 | undefined,
): GraphDisplaySettings {
  const defaults = createDefaultGraphDisplaySettings();
  return {
    maxBeltTier: value?.b ?? defaults.maxBeltTier,
    maxPipeTier: value?.p ?? defaults.maxPipeTier,
    rateDecimalPlaces: value?.d ?? defaults.rateDecimalPlaces,
    edgeStyle: value?.e ?? defaults.edgeStyle,
    showTransportLabels: value?.l ?? defaults.showTransportLabels,
    animateFlowLines: value?.a ?? defaults.animateFlowLines,
  };
}

function encodeGraphLayout(project: PlannerProject): CompactGraphNodePositionV1[] {
  return canonicalGraphNodePositionEntries(project).map((position) => [
    position.nodeId,
    position.x,
    position.y,
  ]);
}

function decodeGraphLayout(
  value: CompactGraphNodePositionV1[] | undefined,
): PlannerProject['graphLayout']['nodePositions'] {
  return Object.fromEntries(
    (value ?? [])
      .filter(([nodeId]) => isSafePlanTransferRecordKey(nodeId))
      .map(([nodeId, x, y]) => [nodeId, { x, y }]),
  );
}

function encodeBuildState(buildState: PlanBuildState): CompactPlanBuildStateV1 | null {
  const compact: CompactPlanBuildStateV1 = {};
  if (buildState.planLocked) {
    compact.p = true;
  }
  if (buildState.nodeLayoutLocked) {
    compact.l = true;
  }
  const nodeStates = Object.entries(buildState.nodeStates)
    .map(([nodeId, nodeState]) => encodeNodeBuildState(nodeId, nodeState))
    .filter((nodeState): nodeState is CompactGraphNodeBuildStateV1 => nodeState !== null);
  if (nodeStates.length > 0) {
    compact.n = nodeStates;
  }
  return Object.keys(compact).length > 0 ? compact : null;
}

function encodeNodeBuildState(
  nodeId: string,
  nodeState: GraphNodeBuildState,
): CompactGraphNodeBuildStateV1 | null {
  const compact: CompactGraphNodeBuildStateV1 = { id: nodeId };
  if (nodeState.done) {
    compact.d = true;
  }
  if (nodeState.note && nodeState.note.trim().length > 0) {
    compact.n = normalizePlanTransferNote(nodeState.note);
  }
  return compact.d || compact.n ? compact : null;
}

function decodeBuildState(value: CompactPlanBuildStateV1 | undefined): PlanBuildState {
  const nodeStates: Record<string, GraphNodeBuildState> = {};
  for (const compact of value?.n ?? []) {
    if (!isSafePlanTransferRecordKey(compact.id)) {
      continue;
    }
    const note = compact.n === undefined ? '' : normalizePlanTransferNote(compact.n);
    nodeStates[compact.id] = {
      ...(compact.d ? { done: true } : {}),
      ...(note.length > 0 ? { note } : {}),
    };
  }
  return {
    planLocked: value?.p === true,
    nodeLayoutLocked: value?.l === true,
    nodeStates,
  };
}

function encodeDatasetMetadata(dataset: GameDataset): BeltwisePlanShareDatasetMetadataV1 {
  return {
    id: dataset.id,
    gameVersionLabel: dataset.gameVersionLabel,
    ...(dataset.source.fingerprint !== undefined
      ? { fingerprint: dataset.source.fingerprint }
      : {}),
  };
}

function readDatasetMetadata(value: unknown): BeltwisePlanShareDatasetMetadataV1 | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const id = readTransferString(value['id']);
  const gameVersionLabel = readTransferString(value['gameVersionLabel']);
  if (id === undefined || gameVersionLabel === undefined) {
    return null;
  }
  const fingerprint = readTransferString(value['fingerprint']);
  return {
    id,
    gameVersionLabel,
    ...(fingerprint !== undefined ? { fingerprint } : {}),
  };
}

function readCompactPlannerProject(value: unknown): CompactPlannerProjectV1 | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const name = readTransferString(value['n']);
  if (name === undefined) {
    return null;
  }
  const compact: CompactPlannerProjectV1 = { n: normalizePlannerName(name) };
  const notes = readTransferString(value['no']);
  if (notes !== undefined && normalizePlanTransferNote(notes).length > 0) {
    compact.no = notes;
  }

  const targets = readArray(value['t'], readCompactProductTarget);
  if (targets === null) {
    return null;
  }
  if (targets.length > 0) {
    compact.t = targets;
  }

  const recipeOverrides = readArray(value['r'], readCompactBooleanOverride);
  const machineOverrides = readArray(value['m'], readCompactBooleanOverride);
  const resourceOverrides = readArray(value['rc'], readCompactResourceOverride);
  const itemInputs = readArray(value['i'], readCompactNonNegativeAmountOverride);
  const graphLayout = readArray(value['l'], readCompactGraphNodePosition);
  if (
    recipeOverrides === null ||
    machineOverrides === null ||
    resourceOverrides === null ||
    itemInputs === null ||
    graphLayout === null
  ) {
    return null;
  }

  if (recipeOverrides.length > 0) {
    compact.r = recipeOverrides;
  }
  if (machineOverrides.length > 0) {
    compact.m = machineOverrides;
  }
  if (resourceOverrides.length > 0) {
    compact.rc = resourceOverrides;
  }
  if (itemInputs.length > 0) {
    compact.i = itemInputs;
  }
  if (graphLayout.length > 0) {
    compact.l = graphLayout;
  }

  const objectiveProfile = readCompactObjectiveProfile(value['o']);
  const graphDisplay = readCompactGraphDisplay(value['g']);
  const buildState = readCompactBuildState(value['b']);
  if (objectiveProfile === null || graphDisplay === null || buildState === null) {
    return null;
  }
  if (objectiveProfile !== undefined) {
    compact.o = objectiveProfile;
  }
  if (graphDisplay !== undefined) {
    compact.g = graphDisplay;
  }
  if (buildState !== undefined) {
    compact.b = buildState;
  }

  return compact;
}

function readCompactProductTarget(value: unknown): CompactProductTargetV1 | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const id = readSafePlanTransferRecordKey(value['id']);
  const itemId = readSafePlanTransferRecordKey(value['i']);
  const mode = value['m'];
  const sortOrder = readTransferFiniteNumber(value['s']);
  if (
    id === undefined ||
    itemId === undefined ||
    (mode !== 'f' && mode !== 'x') ||
    sortOrder === undefined
  ) {
    return null;
  }
  const amountPerMinute = readTransferNonNegativeFiniteNumber(value['a']);
  if (mode === 'f' && value['a'] !== undefined && amountPerMinute === undefined) {
    return null;
  }
  return {
    id,
    i: itemId,
    m: mode,
    ...(mode === 'f' ? { a: amountPerMinute ?? 0 } : {}),
    s: sortOrder,
  };
}

function readCompactBooleanOverride(value: unknown): CompactBooleanOverrideV1 | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const id = readTransferString(value[0]);
  const enabled = value[1];
  return id !== undefined && typeof enabled === 'boolean' ? [id, enabled] : null;
}

function readCompactAmountOverride(value: unknown): CompactAmountOverrideV1 | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const id = readTransferString(value[0]);
  const amountPerMinute = readTransferFiniteNumber(value[1]);
  return id !== undefined && amountPerMinute !== undefined ? [id, amountPerMinute] : null;
}

function readCompactNonNegativeAmountOverride(value: unknown): CompactAmountOverrideV1 | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const id = readTransferString(value[0]);
  const amountPerMinute = readTransferNonNegativeFiniteNumber(value[1]);
  return id !== undefined && amountPerMinute !== undefined ? [id, amountPerMinute] : null;
}

function readCompactResourceOverride(value: unknown): CompactResourceOverrideV1 | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const itemId = readTransferString(value['i']);
  if (itemId === undefined) {
    return null;
  }
  const enabled = typeof value['e'] === 'boolean' ? value['e'] : undefined;
  const maxPerMinute = readTransferNonNegativeFiniteNumber(value['m']);
  if (value['m'] !== undefined && maxPerMinute === undefined) {
    return null;
  }
  if (enabled === undefined && maxPerMinute === undefined) {
    return null;
  }
  return {
    i: itemId,
    ...(enabled !== undefined ? { e: enabled } : {}),
    ...(maxPerMinute !== undefined ? { m: maxPerMinute } : {}),
  };
}

function readCompactGraphNodePosition(value: unknown): CompactGraphNodePositionV1 | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const nodeId = readTransferString(value[0]);
  const x = readTransferFiniteNumber(value[1]);
  const y = readTransferFiniteNumber(value[2]);
  return nodeId !== undefined && x !== undefined && y !== undefined ? [nodeId, x, y] : null;
}

function readCompactObjectiveProfile(value: unknown): CompactObjectiveProfileV1 | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const rawResourceMultipliers = readArray(value['r'], readCompactNonNegativeAmountOverride);
  if (rawResourceMultipliers === null) {
    return null;
  }
  const presetId = readTransferObjectivePresetId(value['id']);
  const strategy = readCompactObjectiveStrategy(value['y']);
  const stageOrder = readCompactObjectiveStageOrder(value['g']);
  if (
    (value['id'] !== undefined && presetId === undefined) ||
    (value['y'] !== undefined && strategy === undefined) ||
    stageOrder === null
  ) {
    return null;
  }
  const resourceScarcityWeight = readTransferNonNegativeFiniteNumber(value['rs']);
  const powerWeight = readTransferNonNegativeFiniteNumber(value['p']);
  const machineCountWeight = readTransferNonNegativeFiniteNumber(value['m']);
  const surplusWeight = readTransferNonNegativeFiniteNumber(value['s']);
  return {
    ...(presetId !== undefined ? { id: presetId } : {}),
    ...(strategy !== undefined ? { y: strategy } : {}),
    ...(stageOrder !== undefined ? { g: stageOrder } : {}),
    ...(resourceScarcityWeight !== undefined ? { rs: resourceScarcityWeight } : {}),
    ...(powerWeight !== undefined ? { p: powerWeight } : {}),
    ...(machineCountWeight !== undefined ? { m: machineCountWeight } : {}),
    ...(surplusWeight !== undefined ? { s: surplusWeight } : {}),
    ...(rawResourceMultipliers.length > 0 ? { r: rawResourceMultipliers } : {}),
  };
}

function readCompactGraphDisplay(value: unknown): CompactGraphDisplaySettingsV1 | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const maxBeltTier = readTransferConveyorBeltTier(value['b']);
  const maxPipeTier = readTransferPipelineTier(value['p']);
  const rateDecimalPlaces = readTransferRateDecimalPlaces(value['d']);
  const edgeStyle = readTransferGraphEdgeStyle(value['e']);
  return {
    ...(maxBeltTier !== undefined ? { b: maxBeltTier } : {}),
    ...(maxPipeTier !== undefined ? { p: maxPipeTier } : {}),
    ...(rateDecimalPlaces !== undefined ? { d: rateDecimalPlaces } : {}),
    ...(edgeStyle !== undefined ? { e: edgeStyle } : {}),
    ...(typeof value['l'] === 'boolean' ? { l: value['l'] } : {}),
    ...(typeof value['a'] === 'boolean' ? { a: value['a'] } : {}),
  };
}

function readCompactBuildState(value: unknown): CompactPlanBuildStateV1 | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const nodeStates = readArray(value['n'], readCompactNodeBuildState);
  if (nodeStates === null) {
    return null;
  }
  return {
    ...(value['p'] === true ? { p: true } : {}),
    ...(value['l'] === true ? { l: true } : {}),
    ...(nodeStates.length > 0 ? { n: nodeStates } : {}),
  };
}

function readCompactNodeBuildState(value: unknown): CompactGraphNodeBuildStateV1 | null {
  if (!isPlanTransferRecord(value)) {
    return null;
  }
  const id = readTransferString(value['id']);
  if (id === undefined) {
    return null;
  }
  const done = value['d'] === true;
  const note = readTransferString(value['n']);
  const normalizedNote = note === undefined ? '' : normalizePlanTransferNote(note);
  if (!done && normalizedNote.length === 0) {
    return null;
  }
  return {
    id,
    ...(done ? { d: true } : {}),
    ...(normalizedNote.length > 0 ? { n: normalizedNote } : {}),
  };
}

function readArray<T>(value: unknown, readItem: (item: unknown) => T | null): T[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const items: T[] = [];
  for (const item of value) {
    const parsedItem = readItem(item);
    if (parsedItem === null) {
      return null;
    }
    items.push(parsedItem);
  }
  return items;
}

function fail(code: BeltwisePlanShareErrorCode, message: string): DecodeBeltwisePlanShareFailure {
  return { ok: false, error: { code, message } };
}

function encodeObjectiveStrategy(strategy: ObjectiveStrategy): CompactObjectiveStrategyV1 {
  return strategy === 'weighted' ? 'w' : 'l';
}

function decodeObjectiveStrategy(
  strategy: CompactObjectiveStrategyV1 | undefined,
): ObjectiveStrategy | undefined {
  if (strategy === 'w') {
    return 'weighted';
  }
  if (strategy === 'l') {
    return 'lexicographic';
  }
  return undefined;
}

function encodeObjectiveStageId(stageId: ObjectiveStageId): CompactObjectiveStageIdV1 {
  switch (stageId) {
    case 'raw-resources':
      return 'r';
    case 'surplus':
      return 's';
    case 'recipe-activity':
      return 'm';
    case 'power':
      return 'p';
  }
}

function decodeObjectiveStageId(stageId: CompactObjectiveStageIdV1): ObjectiveStageId | undefined {
  switch (stageId) {
    case 'r':
      return 'raw-resources';
    case 's':
      return 'surplus';
    case 'm':
      return 'recipe-activity';
    case 'p':
      return 'power';
  }
}

function decodeObjectiveStageOrder(
  stageOrder: readonly CompactObjectiveStageIdV1[] | undefined,
): ObjectiveStageId[] | undefined {
  if (stageOrder === undefined) {
    return undefined;
  }
  const decoded = stageOrder
    .map(decodeObjectiveStageId)
    .filter((stageId): stageId is ObjectiveStageId => stageId !== undefined);
  return decoded.length > 0 ? decoded : undefined;
}

function readCompactObjectiveStrategy(value: unknown): CompactObjectiveStrategyV1 | undefined {
  return value === 'l' || value === 'w' ? value : undefined;
}

function readCompactObjectiveStageId(value: unknown): CompactObjectiveStageIdV1 | undefined {
  return value === 'r' || value === 's' || value === 'm' || value === 'p' ? value : undefined;
}

function readCompactObjectiveStageOrder(
  value: unknown,
): CompactObjectiveStageIdV1[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const stageOrder: CompactObjectiveStageIdV1[] = [];
  for (const item of value) {
    const stageId = readCompactObjectiveStageId(item);
    if (stageId === undefined) {
      return null;
    }
    if (!stageOrder.includes(stageId)) {
      stageOrder.push(stageId);
    }
  }
  return stageOrder.length > 0 ? stageOrder : null;
}
